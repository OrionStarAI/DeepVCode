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

# 日志写在py脚本自己的目录里
LOGS_DIR = Path(__file__).parent / "build_logs"
LOGS_DIR.mkdir(exist_ok=True)

# 配置日志记录
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

class BuildRequest(BaseModel):
    branch: str


class BuildTask:
    """构建任务模型"""

    def __init__(self, task_id: str, branch: str):
        self.task_id = task_id
        self.branch = branch
        # 统一状态：queued -> fetching -> building -> completed/failed
        self.status = "queued"
        self.created_time = datetime.now()
        self.start_time: Optional[datetime] = None
        self.end_time: Optional[datetime] = None
        self.logs = ""
        self.error_message = ""
        self.result_file = ""

        # 为任务创建独立的日志文件
        self.log_file = LOGS_DIR / f"task_{task_id}.log"


class BuildState:
    """全局构建状态管理"""

    def __init__(self):
        self.current_task: Optional[BuildTask] = None
        self.queue: Queue = Queue()
        self.lock = threading.Lock()
        self.task_history: Dict[str, BuildTask] = {}  # task_id -> BuildTask

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
        """获取任务在队列中的位置（1-based），0表示不在队列中"""
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
    执行git命令（在BASE_REPO_PATH目录）
    返回：(成功, 输出或错误信息)
    """
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            cwd=BASE_REPO_PATH,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )

        if result.returncode == 0:
            return True, result.stdout.strip()
        else:
            error_msg = result.stderr.strip() or result.stdout.strip() or f"命令失败 (exit code: {result.returncode})"
            return False, error_msg
    except subprocess.TimeoutExpired:
        return False, f"命令执行超时（{timeout}s）"
    except Exception as e:
        return False, f"执行异常: {str(e)}"


def get_current_commit_info(timeout: int = GIT_TIMEOUT) -> tuple[str, str]:
    """
    获取当前HEAD的commit信息
    返回：(短hash, commit消息)
    例如：("a1b2c3d", "fix: resolve login issue")
    """
    try:
        # 获取短hash (7位)
        success, short_hash = git_cmd("git rev-parse --short=7 HEAD", timeout)
        if not success:
            return "unknown", "unknown"

        # 获取commit消息（仅第一行）
        success, commit_msg = git_cmd("git log -1 --pretty=%B HEAD", timeout)
        if not success:
            return short_hash, "unknown"

        # 取第一行（有些commit消息可能多行）
        first_line = commit_msg.split('\n')[0] if commit_msg else "unknown"
        return short_hash, first_line
    except Exception:
        return "unknown", "unknown"


def fetch_branch(branch: str, timeout: int = GIT_TIMEOUT) -> tuple[bool, str]:
    """
    拉取远程分支到本地
    确保本地分支与远程完全同步（如果本地存在则强制更新，否则创建）
    """
    logger.info(f"开始拉取分支: {branch} (超时: {timeout}s)")

    try:
        # 0. 清理当前分支的本地改动（防止切分支失败）
        logger.info("步骤0: 清理当前分支的本地改动 (git reset --hard)")
        success, msg = git_cmd("git reset --hard", timeout)
        if not success:
            logger.warning(f"  清理当前分支改动失败，继续: {msg}")

        # 1. 获取远程更新
        logger.info("步骤1: 获取远程更新 (git fetch origin)")
        success, msg = git_cmd("git fetch origin", timeout)
        if not success:
            return False, f"fetch 失败: {msg}"

        # 2. 检查远程分支是否存在
        logger.info(f"步骤2: 检查远程分支 'origin/{branch}'")
        remote_exists, _ = git_cmd(f"git show-ref --verify --quiet refs/remotes/origin/{branch}", timeout)
        if not remote_exists:
            return False, f"远程分支 'origin/{branch}' 不存在"

        # 3. 检查本地分支是否存在
        logger.info(f"步骤3: 检查本地分支 '{branch}'")
        local_exists, _ = git_cmd(f"git show-ref --verify --quiet refs/heads/{branch}", timeout)

        logger.info(f"  本地分支存在: {local_exists}, 远程分支存在: {remote_exists}")

        if local_exists:
            # 本地分支存在：切换 + 强制更新到远程
            logger.info(f"步骤4a: 切换到分支 '{branch}' (git checkout {branch})")
            success, msg = git_cmd(f"git checkout {branch}", timeout)
            if not success:
                return False, f"切换失败: {msg}"

            logger.info(f"步骤4b: 强制更新到远程 (git reset --hard origin/{branch})")
            success, msg = git_cmd(f"git reset --hard origin/{branch}", timeout)
            if not success:
                return False, f"更新失败: {msg}"

            result = f"分支 '{branch}' 已强制更新到远程最新版本"
        else:
            # 本地分支不存在：从远程创建
            logger.info(f"步骤4: 从远程创建本地分支 (git checkout -b {branch} origin/{branch})")
            success, msg = git_cmd(f"git checkout -b {branch} origin/{branch}", timeout)
            if not success:
                return False, f"创建分支失败: {msg}"

            result = f"分支 '{branch}' 已从远程创建"

        # 获取当前HEAD的commit信息
        short_hash, commit_msg = get_current_commit_info(timeout)
        result_with_commit = f"{result} | Latest: {short_hash} - {commit_msg}"

        logger.info(f"✓ {result_with_commit}")
        return True, result_with_commit

    except Exception as e:
        error_msg = f"拉取分支异常: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return False, error_msg


# ==================== npm 构建 ====================

def execute_npm_commands(task: BuildTask) -> tuple[bool, str]:
    """
    执行npm构建命令: npm i && npm run build && npm run package
    返回：(成功, 日志/错误信息)
    """
    def append_task_log(content: str) -> None:
        """同时追加到内存和文件"""
        task.logs += content
        with open(task.log_file, "a", encoding="utf-8") as f:
            f.write(content)

        # 提取最后一条有实际内容的行（跳过空行和纯分隔线）
        lines = content.strip().split('\n')
        for line in reversed(lines):
            stripped = line.strip()
            # 跳过空行和纯分隔线
            if stripped and not all(c in '=-*' for c in stripped):
                task.error_message = stripped
                break

    try:
        # 切换到项目目录
        original_dir = os.getcwd()
        os.chdir(PROJECT_PATH)

        task.start_time = datetime.now()
        task.status = "building"

        # 初始化任务日志文件
        with open(task.log_file, "w", encoding="utf-8") as f:
            f.write(f"任务ID: {task.task_id}\n")
            f.write(f"分支: {task.branch}\n")
            f.write(f"开始时间: {task.start_time}\n")
            f.write("=" * 60 + "\n\n")

        logger.info(f"开始构建任务 {task.task_id}，分支: {task.branch}，日志文件: {task.log_file}")

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
                # 使用 shell=True 以支持 Windows CMD 命令
                # encoding='utf-8', errors='replace' 处理 Windows 编码问题
                result = subprocess.run(
                    cmd,
                    shell=True,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=BUILD_TIMEOUT,
                )

                if result.stdout:
                    append_task_log(result.stdout)
                if result.stderr:
                    append_task_log(result.stderr)

                if result.returncode != 0:
                    os.chdir(original_dir)
                    error_msg = f"{cmd_name} 执行失败 (exit code: {result.returncode})"
                    task.error_message = error_msg
                    task.end_time = datetime.now()
                    task.status = "failed"
                    append_task_log(f"\n[错误] {error_msg}\n")
                    logger.error(f"任务 {task.task_id} 失败: {error_msg}")
                    return False, error_msg

            except subprocess.TimeoutExpired:
                os.chdir(original_dir)
                error_msg = f"{cmd_name} 执行超时（超过{BUILD_TIMEOUT}秒）"
                task.error_message = error_msg
                task.end_time = datetime.now()
                task.status = "failed"
                append_task_log(f"\n[错误] {error_msg}\n")
                logger.error(f"任务 {task.task_id} 超时: {error_msg}")
                return False, error_msg

        # 所有命令执行成功，查找vsix文件
        result_file = find_latest_vsix()

        if result_file:
            task.result_file = result_file
            task.end_time = datetime.now()
            task.status = "completed"
            os.chdir(original_dir)
            success_msg = f"构建成功，产物: {result_file}"
            append_task_log(f"\n[成功] {success_msg}\n")
            append_task_log(f"结束时间: {task.end_time}\n")
            logger.info(f"任务 {task.task_id} 完成: {success_msg}")
            return True, success_msg
        else:
            os.chdir(original_dir)
            error_msg = "构建完成但未找到.vsix文件"
            task.error_message = error_msg
            task.end_time = datetime.now()
            task.status = "failed"
            append_task_log(f"\n[错误] {error_msg}\n")
            append_task_log(f"结束时间: {task.end_time}\n")
            logger.error(f"任务 {task.task_id} 失败: {error_msg}")
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
    """
    查找 ARTIFACTS_DIR 下最新的.vsix文件
    返回文件名（不包含路径）
    """
    try:
        vsix_files = list(Path(ARTIFACTS_DIR).glob("*.vsix"))
        if not vsix_files:
            return None

        # 按修改时间排序，返回最新的
        latest_file = max(vsix_files, key=lambda p: p.stat().st_mtime)
        return latest_file.name
    except Exception:
        return None


# ==================== 后台Worker ====================

def build_worker():
    """后台工作线程，处理构建队列（全程排队）"""
    logger.info("构建Worker线程启动")
    while True:
        try:
            # 从队列中获取任务
            task = build_state.queue.get()
            build_state.set_current_task(task)
            logger.info(f"取出任务 {task.task_id}，分支: {task.branch}，开始执行完整流程")

            # 第1步：拉取分支
            task.status = "fetching"
            logger.info(f"任务 {task.task_id} 第1步: 正在拉取分支 '{task.branch}'...")
            success, message = fetch_branch(task.branch)
            if not success:
                task.status = "failed"
                task.error_message = f"分支拉取失败: {message}"
                task.end_time = datetime.now()
                logger.error(f"任务 {task.task_id} 拉取分支失败: {message}")
                build_state.set_current_task(None)
                continue

            # 记录拉取分支的commit信息
            short_hash, commit_msg = get_current_commit_info()
            logger.info(f"任务 {task.task_id} 分支拉取成功: {short_hash} - {commit_msg}，即将进行第2步构建")

            # 第2步：执行npm构建
            task.status = "building"
            success, message = execute_npm_commands(task)
            # 注意：execute_npm_commands 会根据结果设置 task.status 为 "completed" 或 "failed"

            build_state.set_current_task(None)

        except Exception as e:
            logger.exception(f"Worker异常")


# 启动后台Worker线程
worker_thread = threading.Thread(target=build_worker, daemon=True)
worker_thread.start()


# ==================== API 端点 ====================

@app.post("/api/submit-build-task")
async def api_submit_build_task(request: BuildRequest) -> Dict[str, Any]:
    """
    提交完整构建任务接口（全程排队）
    包含：排队 -> 拉取分支 -> 构建
    返回任务ID和队列位置
    """
    # 创建新任务（完整流程：拉分支 + 构建）
    task_id = str(uuid.uuid4())
    task = BuildTask(task_id, request.branch)
    task.status = "queued"  # 统一的初始状态

    # 加入全局队列
    build_state.add_task(task)
    queue_position = build_state.get_queue_position(task_id)

    return {
        "success": True,
        "message": f"完整构建任务已加入队列，排在第{queue_position}位（包括拉取分支和构建）",
        "task_id": task_id,
        "queue_position": queue_position,
    }


@app.get("/api/build-status")
async def api_build_status(task_id: str) -> Dict[str, Any]:
    """
    任务状态查询接口（全程排队）
    返回任务状态、队列位置等信息
    """
    task = build_state.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    response = {
        "success": True,
        "status": task.status,
        "message": "",
    }

    # 排队状态
    if task.status == "queued":
        queue_pos = build_state.get_queue_position(task_id)
        response["queue_position"] = queue_pos
        response["message"] = f"任务排队中，当前排在第{queue_pos}位"

    # 拉取分支状态
    elif task.status == "fetching":
        response["message"] = "正在拉取分支..."

    # 构建状态
    elif task.status == "building":
        current = build_state.get_current_task()
        if current:
            response["current_building_branch"] = current.branch
        # 获取当前commit信息并显示
        short_hash, commit_msg = get_current_commit_info()
        progress_msg = task.error_message if task.error_message else "构建进行中..."
        response["message"] = f"{progress_msg} | Building: {short_hash} - {commit_msg}"
        response["build_logs"] = task.logs

    # 任务完成
    elif task.status == "completed":
        short_hash, commit_msg = get_current_commit_info()
        response["message"] = f"任务成功（拉分支 + 构建） | Built: {short_hash} - {commit_msg}"
        response["build_logs"] = task.logs
        response["result_file"] = task.result_file

    # 任务失败
    elif task.status == "failed":
        response["message"] = "任务失败（拉分支或构建失败）"
        response["error_message"] = task.error_message
        response["build_logs"] = task.logs

    return response


@app.get("/api/get-artifact")
async def api_get_artifact(branch: str) -> Dict[str, Any]:
    """
    构建产物获取接口
    根据分支名返回最新的vsix文件下载URL
    """
    vsix_file = find_latest_vsix()
    if not vsix_file:
        raise HTTPException(status_code=404, detail="未找到.vsix文件")

    # 注意：这里返回的URL需要客户端在实际使用时替换为正确的IP地址
    url = f"http://{{BUILD_SERVER_IP}}:1234/artifacts/{vsix_file}"

    return {
        "success": True,
        "url": url,
        "filename": vsix_file,
        "message": f"产物: {vsix_file}",
    }


@app.get("/artifacts/{file_name}")
async def download_artifact(file_name: str):
    """提供vsix文件下载"""
    file_path = Path(ARTIFACTS_DIR) / file_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    # 直接返回二进制文件，设置正确的响应头
    return FileResponse(
        path=file_path,
        media_type="application/octet-stream",
        filename=file_name,
        headers={
            "Content-Disposition": f"attachment; filename={file_name}",
        }
    )


@app.get("/health")
async def health_check() -> Dict[str, str]:
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
    logger.info("="*60)

    uvicorn.run(
        app,
        host=BUILD_SERVICE_HOST,
        port=BUILD_SERVICE_PORT,
        log_level="info",
    )
