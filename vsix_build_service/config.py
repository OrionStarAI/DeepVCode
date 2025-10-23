"""
构建服务配置文件
"""
import os
from pathlib import Path

# 服务配置
BUILD_SERVICE_HOST = "0.0.0.0"
BUILD_SERVICE_PORT = 1234

# 项目路径配置
SCRIPT_DIR = Path(__file__).parent  # build_service文件夹
BASE_REPO_PATH = str(SCRIPT_DIR.parent)  # 项目根目录
PROJECT_PATH = os.path.join(BASE_REPO_PATH, "packages", "vscode-ui-plugin")
ARTIFACTS_DIR = os.path.join(PROJECT_PATH)

# 超时配置（秒）
BUILD_TIMEOUT = 300  # npm 命令超时
GIT_TIMEOUT = 60    # git 命令超时

# npm 命令
NPM_INSTALL_CMD = "npm i"
NPM_BUILD_CMD = "npm run build"
NPM_PACKAGE_CMD = "npm run package"
