"""
构建支持服务 - 运行在打包机上
监听 0.0.0.0:1234 的HTTP端口，接收触发请求并执行构建任务
"""
import logging
import os
import subprocess
import threading
import uuid
from datetime import datetime
from queue import Queue
from pathlib import Path
from typing import Optional, Dict, Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from config import (
    BUILD_SERVICE_HOST,
    BUILD_SERVICE_PORT,
    BASE_REPO_PATH,
    PROJECT_PATH,
    ARTIFACTS_DIR,
    BUILD_TIMEOUT,
    GIT_TIMEOUT,
    NPM_INSTALL_CMD,
    NPM_BUILD_CMD,
    NPM_PACKAGE_CMD,
)

# ==================== 日志配置 ====================

LOGS_DIR = Path(__file__).parent / "build_logs"
LOGS_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(LOGS_DIR / "build_service.log", encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)

# ==================== 数据模型 ====================

class FetchBranchRequest(BaseModel):
    branch: str


class BuildRequest(BaseModel):
    branch: str


class BuildTask:
    """构建任务模型"""

    def __init__(self, task_id: str, branch: str):
        self.task_id = task_id
        self.branch = branch
        self.status = "queued"
        self.worker_started = False
        self.created_time = datetime.now()
        self.start_time: Optional[datetime] = None
        self.end_time: Optional[datetime] = None
        self.logs = ""
        self.error_message = ""
        self.result_file = ""
        self.log_file = LOGS_DIR / f"task_{task_id}.log"


class BuildState:
    """全局构建状态管理（单 Worker，序列处理）"""

    def __init__(self):
        self.current_task: Optional[BuildTask] = None
        self.queue: Queue = Queue()
        self.lock = threading.Lock()
        self.task_history: Dict[str, BuildTask] = {}

    def add_task(self, task: BuildTask) -> None:
        with self.lock:
            self.queue.put(task)
            self.task_history[task.task_id] = task

    def get_current_task(self) -> Optional[BuildTask]:
        with self.lock:
            return self.current_task

    def set_current_task(self, task: Optional[BuildTask]) -> None:
        with self.lock:
            self.current_task = task

    def get_queue_position(self, task_id: str) -> int:
        with self.lock:
            queue_list = list(self.queue.queue)
            for idx, task in enumerate(queue_list, 1):
                if task.task_id == task_id:
                    return idx
            return 0

    def get_task(self, task_id: str) -> Optional[BuildTask]:
        with self.lock:
            return self.task_history.get(task_id)


# ==================== 全局状态 ====================

app = FastAPI()
build_state = BuildState()


# ==================== Git 操作 ====================

def git_cmd(cmd: str, timeout: int = GIT_TIMEOUT) -> tuple[bool, str]:
    """
    执行 git 命令（纯 subprocess，无 GitPython 依赖）

    Args:
        cmd: git 命令，例如 'fetch origin', 'checkout main'
        timeout: 超时时间（秒）

    Returns:
        (成功, 输出或错误消息)
    """
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            cwd=BASE_REPO_PATH,
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding="utf-8",
            errors="replace",
        )

        output = (result.stderr or result.stdout or "").strip()

        if result.returncode != 0:
            msg = output if output else f"git 命令失败 (exit code {result.returncode})"
            return False, msg

        return True, output
    except subprocess.TimeoutExpired:
        return False, f"命令超时 (>{timeout}s)"
    except Exception as e:
        return False, f"异常: {str(e)}"


def fetch_branch(branch: str, timeout: int = GIT_TIMEOUT) -> tuple[bool, str]:
    """
    拉取远程分支到本地（纯 subprocess 实现）
    如果本地分支不存在则创建，否则强制更新
    """
    logger.info(f"开始拉取分支: {branch} (超时: {timeout}s)")

    try:
        # 1. 清理本地改动
        logger.info("步骤1: 清理本地改动 (git reset --hard)")
        success, msg = git_cmd("git reset --hard", timeout)
        if not success:
            logger.warning(f"  清理失败但继续: {msg}")

        # 2. 获取远程更新
        logger.info("步骤2: 获取远程更新 (git fetch origin)")
        success, msg = git_cmd("git fetch origin", timeout)
        if not success:
            return False, f"fetch 失败: {msg}"

        # 3. 检查分支是否存在
        logger.info(f"步骤3: 检查分支 '{branch}'")
        success, output = git_cmd("git branch -a", timeout)
        if not success:
            return False, f"检查分支失败: {output}"

        branches = output.split("\n")
        local_exists = any(f"  {branch}" in line or f"* {branch}" in line for line in branches)
        remote_exists = any(f"origin/{branch}" in line for line in branches)

        logger.info(f"  本地: {local_exists}, 远程: {remote_exists}")

        if not remote_exists:
            return False, f"远程分支 'origin/{branch}' 不存在"

        if local_exists:
            # 切换到分支
            logger.info(f"步骤4a: 切换到分支 '{branch}'")
            success, msg = git_cmd(f"git checkout {branch}", timeout)
            if not success:
                return False, f"切换失败: {msg}"

            # 强制更新
            logger.info(f"步骤4b: 强制更新到 origin/{branch}")
            success, msg = git_cmd(f"git reset --hard origin/{branch}", timeout)
            if not success:
                return False, f"更新失败: {msg}"

            result = f"分支 '{branch}' 已强制更新"
        else:
            # 创建分支
            logger.info(f"步骤4: 创建分支 '{branch}'")
            success, msg = git_cmd(f"git checkout -b {branch} origin/{branch}", timeout)
            if not success:
                return False, f"创建失败: {msg}"

            result = f"分支 '{branch}' 已创建"

        logger.info(f"✓ {result}")
        return True, result

    except Exception as e:
        error_msg = f"拉取分支异常: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return False, error_msg


# ==================== npm 构建 ====================

def execute_npm_commands(task: BuildTask) -> tuple[bool, str]:
    """
    执行npm构建命令: npm i && npm run build && npm run package
    使用 subprocess，不阻塞主线程，流式输出
    返回：(成功, 日志/错误信息)
    """
    def append_task_log(content: str) -> None:
        """同时追加到内存和文件"""
        task.logs += content
        with open(task.log_file, "a", encoding="utf-8") as f:
            f.write(content)

        lines = content.strip().split('\n')
        for line in reversed(lines):
            stripped = line.strip()
            if stripped and not all(c in '=-*' for c in stripped):
                task.error_message = stripped
                break

    original_dir = os.getcwd()
    try:
        os.chdir(PROJECT_PATH)
        task.start_time = datetime.now()
        task.status = "building"

        with open(task.log_file, "w", encoding="utf-8") as f:
            f.write(f"任务ID: {task.task_id}\n")
            f.write(f"分支: {task.branch}\n")
            f.write(f"开始时间: {task.start_time}\n")
            f.write("=" * 60 + "\n\n")

        logger.info(f"开始构建任务 {task.task_id}，分支: {task.branch}")

        commands = [
            ("npm i", NPM_INSTALL_CMD),
            ("npm run build", NPM_BUILD_CMD),
            ("npm run package", NPM_PACKAGE_CMD),
        ]

        for cmd_name, cmd in commands:
            log_header = f"\n{'='*60}\n执行: {cmd_name}\n" + "=" * 60 + "\n"
            append_task_log(log_header)
            logger.info(f"执行命令: {cmd_name}")

            try:
                # 使用 subprocess 执行，不阻塞主线程
                result = subprocess.run(
                    cmd,
                    shell=True,
                    capture_output=True,
                    text=True,
                    timeout=BUILD_TIMEOUT,
                    encoding="utf-8",
                    errors="replace",
                    cwd=PROJECT_PATH,
                )

                # 逐行输出，便于实时监控
                if result.stdout:
                    stdout_lines = result.stdout.split('\n')
                    for line in stdout_lines:
                        append_task_log(line + "\n")

                if result.stderr:
                    stderr_lines = result.stderr.split('\n')
                    for line in stderr_lines:
                        if line.strip():
                            append_task_log(f"[stderr] {line}\n")

                if result.returncode != 0:
                    error_msg = f"{cmd_name} 执行失败 (exit code: {result.returncode})"
                    task.error_message = error_msg
                    task.end_time = datetime.now()
                    task.status = "failed"
                    append_task_log(f"\n[失败] {error_msg}\n")
                    logger.error(f"任务 {task.task_id} {cmd_name} 失败: {error_msg}")
                    return False, error_msg

            except subprocess.TimeoutExpired:
                error_msg = f"{cmd_name} 执行超时 (>{BUILD_TIMEOUT}s)"
                task.error_message = error_msg
                task.end_time = datetime.now()
                task.status = "failed"
                append_task_log(f"\n[超时] {error_msg}\n")
                logger.error(f"任务 {task.task_id} 超时: {error_msg}")
                return False, error_msg
            except Exception as e:
                error_msg = f"{cmd_name} 异常: {str(e)}"
                task.error_message = error_msg
                task.end_time = datetime.now()
                task.status = "failed"
                append_task_log(f"\n[异常] {error_msg}\n")
                logger.error(f"任务 {task.task_id} 异常: {error_msg}")
                return False, error_msg

        # 检查产物
        result_file = find_latest_vsix()
        if result_file:
            task.result_file = result_file
            task.end_time = datetime.now()
            task.status = "completed"
            success_msg = f"构建成功，产物: {result_file}"
            append_task_log(f"\n[成功] {success_msg}\n")
            append_task_log(f"结束时间: {task.end_time}\n")
            logger.info(f"任务 {task.task_id} 完成: {success_msg}")
            return True, success_msg
        else:
            error_msg = "构建完成但未找到.vsix文件"
            task.error_message = error_msg
            task.end_time = datetime.now()
            task.status = "failed"
            append_task_log(f"\n[失败] {error_msg}\n")
            append_task_log(f"结束时间: {task.end_time}\n")
            logger.error(f"任务 {task.task_id}: {error_msg}")
            return False, error_msg

    except Exception as e:
        task.error_message = str(e)
        task.end_time = datetime.now()
        task.status = "failed"
        append_task_log(f"\n[异常] {str(e)}\n")
        append_task_log(f"结束时间: {task.end_time}\n")
        logger.exception(f"任务 {task.task_id} 异常")
        return False, f"构建异常: {str(e)}"
    finally:
        os.chdir(original_dir)


def find_latest_vsix() -> Optional[str]:
    """查找 ARTIFACTS_DIR 下最新的.vsix文件"""
    try:
        vsix_files = list(Path(ARTIFACTS_DIR).glob("*.vsix"))
        if not vsix_files:
            return None

        latest_file = max(vsix_files, key=lambda p: p.stat().st_mtime)
        return latest_file.name
    except Exception:
        return None


# ==================== 后台Worker ====================

def build_worker():
    """后台工作线程，序列处理队列中的任务"""
    logger.info("Worker 线程启动，开始处理任务队列")
    while True:
        try:
            task = build_state.queue.get()
            build_state.set_current_task(task)
            task.worker_started = True
            logger.info(f"取出任务 {task.task_id}，分支: {task.branch}，类型: {task.status}")

            if task.status == "fetch_queued":
                task.status = "fetching"
                logger.info(f"任务 {task.task_id} 开始拉取分支...")
                success, message = fetch_branch(task.branch)
                if not success:
                    task.status = "failed"
                    task.error_message = f"分支拉取失败: {message}"
                    task.end_time = datetime.now()
                    logger.error(f"任务 {task.task_id} 拉取失败: {message}")
                else:
                    task.status = "fetch_completed"
                    task.end_time = datetime.now()
                    logger.info(f"任务 {task.task_id} 拉取成功")

            elif task.status == "build_queued":
                task.status = "fetching"
                logger.info(f"任务 {task.task_id} 开始拉取分支...")
                success, message = fetch_branch(task.branch)
                if not success:
                    task.status = "failed"
                    task.error_message = f"分支拉取失败: {message}"
                    task.end_time = datetime.now()
                    logger.error(f"任务 {task.task_id} 拉取失败: {message}")
                    build_state.set_current_task(None)
                    continue

                logger.info(f"任务 {task.task_id} 开始构建...")
                success, message = execute_npm_commands(task)

            build_state.set_current_task(None)

        except Exception as e:
            logger.exception(f"Worker 处理异常: {str(e)}")
            build_state.set_current_task(None)


worker_thread = threading.Thread(target=build_worker, daemon=True, name="BuildWorker")
worker_thread.start()
logger.info("启动单个 Worker 线程（序列处理）")


# ==================== API 端点 ====================

@app.post("/api/fetch-branch")
async def api_fetch_branch(request: FetchBranchRequest) -> Dict[str, Any]:
    """拉取分支接口"""
    try:
        task_id = str(uuid.uuid4())
        task = BuildTask(task_id, request.branch)
        task.status = "fetch_queued"

        build_state.add_task(task)
        queue_position = build_state.get_queue_position(task_id)

        logger.info(f"新分支拉取任务: task_id={task_id}, branch={request.branch}, queue_position={queue_position}")

        return {
            "success": True,
            "message": f"分支拉取任务已加入队列，排在第{queue_position}位",
            "task_id": task_id,
            "branch": request.branch,
            "queue_position": queue_position,
        }
    except Exception as e:
        logger.exception(f"提交分支拉取任务失败: branch={request.branch}, error={str(e)}")
        raise HTTPException(status_code=500, detail=f"提交任务失败: {str(e)}")


@app.post("/api/build")
async def api_build(request: BuildRequest) -> Dict[str, Any]:
    """构建接口"""
    try:
        task_id = str(uuid.uuid4())
        task = BuildTask(task_id, request.branch)
        task.status = "build_queued"

        build_state.add_task(task)
        queue_position = build_state.get_queue_position(task_id)

        logger.info(f"新构建任务: task_id={task_id}, branch={request.branch}, queue_position={queue_position}")

        return {
            "success": True,
            "message": f"构建任务已加入队列，排在第{queue_position}位",
            "task_id": task_id,
            "branch": request.branch,
            "queue_position": queue_position,
        }
    except Exception as e:
        logger.exception(f"提交构建任务失败: branch={request.branch}, error={str(e)}")
        raise HTTPException(status_code=500, detail=f"提交任务失败: {str(e)}")


@app.get("/api/build-status")
async def api_build_status(task_id: str) -> Dict[str, Any]:
    """构建状态查询接口"""
    try:
        task = build_state.get_task(task_id)
        if not task:
            raise HTTPException(status_code=404, detail=f"任务 {task_id} 不存在")

        response = {
            "success": True,
            "status": task.status,
            "message": "",
            "worker_started": task.worker_started,
        }

        if task.status in ("fetch_queued", "build_queued"):
            queue_pos = build_state.get_queue_position(task_id)
            response["queue_position"] = queue_pos
            task_type = "拉取分支" if task.status == "fetch_queued" else "构建"
            response["message"] = f"{task_type}排队中，当前排在第{queue_pos}位"
            logger.info(f"状态查询: 任务 {task_id} 状态={task.status}，队列位置={queue_pos}")

        elif task.status == "fetching":
            response["message"] = "正在拉取分支..."
            logger.info(f"状态查询: 任务 {task_id} 正在拉取分支")

        elif task.status == "fetch_completed":
            response["message"] = "分支拉取成功，等待用户提交构建任务"
            logger.info(f"状态查询: 任务 {task_id} 分支拉取已完成")

        elif task.status == "building":
            response["message"] = task.error_message if task.error_message else "构建进行中..."
            response["build_logs"] = task.logs
            logger.info(f"状态查询: 任务 {task_id} 构建中")

        elif task.status == "completed":
            response["message"] = "构建成功"
            response["build_logs"] = task.logs
            response["result_file"] = task.result_file
            logger.info(f"状态查询: 任务 {task_id} 已完成")

        elif task.status == "failed":
            response["message"] = "构建失败"
            response["error_message"] = task.error_message
            response["build_logs"] = task.logs
            logger.warning(f"状态查询: 任务 {task_id} 失败 - {task.error_message}")

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"状态查询异常: task_id={task_id}, error={str(e)}")
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@app.get("/api/system-status")
async def api_system_status() -> Dict[str, Any]:
    """系统状态查询接口"""
    try:
        current_task = build_state.get_current_task()
        queue_size = build_state.queue.qsize()

        task_stats = {
            "total": len(build_state.task_history),
            "queued": sum(1 for t in build_state.task_history.values() if t.status in ("fetch_queued", "build_queued")),
            "processing": sum(1 for t in build_state.task_history.values() if t.status in ("fetching", "building")),
            "completed": sum(1 for t in build_state.task_history.values() if t.status == "completed"),
            "failed": sum(1 for t in build_state.task_history.values() if t.status == "failed"),
        }

        worker_status = {}
        if current_task:
            worker_status = {
                "status": "busy",
                "task_id": current_task.task_id,
                "branch": current_task.branch,
                "task_status": current_task.status,
            }
        else:
            worker_status = {"status": "idle"}

        return {
            "success": True,
            "queue_size": queue_size,
            "worker": worker_status,
            "task_stats": task_stats,
        }
    except Exception as e:
        logger.exception(f"系统状态查询异常: {str(e)}")
        raise HTTPException(status_code=500, detail=f"查询失败: {str(e)}")


@app.get("/api/get-artifact")
async def api_get_artifact(branch: str) -> Dict[str, Any]:
    """构建产物获取接口"""
    try:
        vsix_file = find_latest_vsix()
        if not vsix_file:
            raise HTTPException(status_code=404, detail="未找到.vsix文件")

        url = f"http://{{BUILD_SERVER_IP}}:1234/artifacts/{vsix_file}"

        logger.info(f"获取产物: branch={branch}, file={vsix_file}")
        return {
            "success": True,
            "url": url,
            "filename": vsix_file,
            "message": f"产物: {vsix_file}",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"获取产物失败: branch={branch}, error={str(e)}")
        raise HTTPException(status_code=500, detail=f"获取失败: {str(e)}")


@app.get("/artifacts/{file_name}")
async def download_artifact(file_name: str):
    """提供vsix文件下载"""
    try:
        file_path = Path(ARTIFACTS_DIR) / file_name
        if not file_path.exists():
            logger.warning(f"下载产物失败: 文件不存在 - {file_name}")
            raise HTTPException(status_code=404, detail=f"文件不存在: {file_name}")

        logger.info(f"下载产物: {file_name}")
        return FileResponse(
            path=file_path,
            media_type="application/octet-stream",
            filename=file_name,
            headers={"Content-Disposition": f"attachment; filename={file_name}"},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"下载产物异常: file_name={file_name}, error={str(e)}")
        raise HTTPException(status_code=500, detail=f"下载失败: {str(e)}")


@app.get("/health")
async def health_check() -> Dict[str, Any]:
    """健康检查端点"""
    return {"status": "ok", "service": "build-service"}


# ==================== 启动 ====================

if __name__ == "__main__":
    import uvicorn

    logger.info("="*60)
    logger.info("构建服务启动")
    logger.info(f"监听地址: {BUILD_SERVICE_HOST}:{BUILD_SERVICE_PORT}")
    logger.info(f"仓库路径: {BASE_REPO_PATH}")
    logger.info(f"项目路径: {PROJECT_PATH}")
    logger.info(f"日志目录: {LOGS_DIR}")
    logger.info(f"构建超时: {BUILD_TIMEOUT}秒")
    logger.info(f"Git超时: {GIT_TIMEOUT}秒")
    logger.info("="*60)

    uvicorn.run(
        app,
        host=BUILD_SERVICE_HOST,
        port=BUILD_SERVICE_PORT,
        log_level="info",
    )