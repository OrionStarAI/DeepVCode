"""
构建服务配置文件
"""
import os
from pathlib import Path

# 服务配置
BUILD_SERVICE_HOST = "0.0.0.0"
BUILD_SERVICE_PORT = 1234

# 项目路径配置
# BASE_REPO_PATH 为当前py脚本的上一级目录（项目根目录）
SCRIPT_DIR = Path(__file__).parent  # build_service文件夹
BASE_REPO_PATH = str(SCRIPT_DIR.parent)  # 上一级目录（项目根）
PROJECT_PATH = os.path.join(BASE_REPO_PATH, "packages", "vscode-ui-plugin")
ARTIFACTS_DIR = os.path.join(PROJECT_PATH)

# 构建配置
BUILD_TIMEOUT = 300  # 5分钟超时（秒）
BUILD_SERVICE_URL = "http://0.0.0.0:1234"  # 客户端访问时需要替换为实际IP

# npm命令
NPM_INSTALL_CMD = "npm i"
NPM_BUILD_CMD = "npm run build"
NPM_PACKAGE_CMD = "npm run package"
