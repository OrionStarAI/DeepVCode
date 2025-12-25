#!/usr/bin/env node

/**
 * VSIX 构建触发服务 - 用户机命令行工具
 * 与构建服务交互，管理构建流程
 */

import ApiClient from './api_client.js';
import UI from './ui.js';

// ==================== 配置 ====================

const BUILD_SERVICE_URL = 'http://10.61.8.100:1234'; // 修改为实际的构建服务地址
// const BUILD_SERVICE_URL = 'http://localhost:1234'; // 修改为实际的构建服务地址
const POLL_INTERVAL = 2000; // 轮询间隔（毫秒） - 2秒
const BUILD_TIMEOUT = 300000; // 构建超时（毫秒） - 5分钟
const MAX_RETRIES = 5; // 最大重试次数

// ==================== 主程序 ====================

class BuildTrigger {
  constructor() {
    this.api = new ApiClient(BUILD_SERVICE_URL);
    this.retries = 0;
  }

  /**
   * 主流程
   */
  async run() {
    UI.printTitle(BUILD_SERVICE_URL);

    // 检查服务连接
    UI.printInfo('正在检查网络连接...');
    if (!(await this.checkConnection())) {
      UI.printConnectionError(BUILD_SERVICE_URL);
      return;
    }
    UI.printSuccess('网络连接正常');

    while (true) {
      try {
        // 1. 询问分支名
        const branch = await UI.askBranch();
        UI.printSeparator();

        // 2. 提交完整构建任务（全程排队）- 从这里开始就排队，直到任务完成
        const taskId = await this.submitBuildTaskFlow(branch);
        if (!taskId) {
          if (await UI.askRetry()) {
            continue;
          } else {
            break;
          }
        }

        // 3. 等待完整任务完成（包括拉分支和构建）
        const success = await this.waitForFullTaskCompletion(taskId, branch);

        if (success) {
          // 4. 获取产物URL
          await this.getArtifactFlow(branch);

          // 询问是否开始新的构建任务
          const newTask = await UI.askNewBuildTask();
          if (!newTask) {
            UI.clear();
            UI.printSuccess('感谢使用，再见！');
            break;
          }
        } else {
          // 任务失败，询问是否重试
          if (await UI.askRetry()) {
            continue;
          } else {
            UI.clear();
            UI.printSuccess('感谢使用，再见！');
            break;
          }
        }

        UI.clear();
      } catch (error) {
        UI.printError(error.message);
        if (await UI.askRetry()) {
          continue;
        } else {
          break;
        }
      }
    }
  }

  /**
   * 检查服务连接
   */
  async checkConnection() {
    const result = await this.api.healthCheck();
    return result.success;
  }

  /**
   * 提交完整构建任务（全程排队）
   */
  async submitBuildTaskFlow(branch) {
    UI.printInfo(`⚠️  请确保分支 "${branch}" 已推送到远程仓库`);
    UI.printInfo(`正在提交完整构建任务到队列...`);

    const result = await this.api.submitBuildTask(branch);

    if (!result.success) {
      UI.printError(result.error);
      return null;
    }

    const { task_id, queue_position, message } = result.data;
    UI.printSuccess(message);

    if (queue_position > 1) {
      UI.printInfo(`排队中，当前排在第 ${queue_position} 位，等待轮到...`);
    }

    return task_id;
  }

  /**
   * 等待完整任务完成（包括排队、拉分支和构建）
   */
  async waitForFullTaskCompletion(taskId, branch) {
    const pollFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frameIndex = 0;
    let statusData = null;
    let lastRefreshTime = UI.getRefreshTimeStr();
    let lastDisplayedText = ''; // 缓存上次显示的文本，避免重复输出
    let buildStartTime = null; // 真正开始构建时的时间戳

    return new Promise((resolve) => {
      // 快速动画间隔（UI更新）
      const animationInterval = setInterval(() => {
        if (statusData) {
          const spinner = pollFrames[frameIndex % pollFrames.length];
          const timeStr = `[${lastRefreshTime}]`;
          let displayText = '';

          // 根据状态显示不同的提示
          if (statusData.status === 'queued') {
            displayText = `${spinner} 任务排队中，排在第 ${statusData.queue_position} 位... ${timeStr}`;
          } else if (statusData.status === 'fetching') {
            displayText = `${spinner} 正在拉取分支... ${timeStr}`;
          } else if (statusData.status === 'building') {
            displayText = `${spinner} 远程构建机正在进行: ${statusData.message} ${timeStr}`;
          } else {
            displayText = `${spinner} ${statusData.message} ${timeStr}`;
          }

          // 仅当文本内容改变时才输出（避免 Windows 下频繁闪屏）
          if (displayText !== lastDisplayedText) {
            // 使用 ANSI 清行码 + \r 确保跨平台兼容
            process.stdout.write('\x1B[2K\r' + displayText);
            lastDisplayedText = displayText;
          }
          frameIndex++;
        }
      }, 100);

      // 较慢的请求间隔
      const pollInterval = setInterval(async () => {
        // 更新刷新时间
        lastRefreshTime = UI.getRefreshTimeStr();

        const result = await this.api.getBuildStatus(taskId);

        if (result.success) {
          statusData = result.data;
          const { status, build_logs, error_message } = statusData;

          // 当进入构建状态时，记录开始时间
          if (status === 'building' && buildStartTime === null) {
            buildStartTime = Date.now();
          }

          // 任务完成
          if (status === 'completed') {
            clearInterval(pollInterval);
            clearInterval(animationInterval);
            process.stdout.write('\x1B[2K\r');
            UI.printSuccess('任务已完成（拉分支 + 构建）！');

            if (build_logs) {
              UI.printBuildLogs(build_logs);
            }

            setTimeout(() => {
              resolve(true);
            }, 50);
          }
          // 任务失败
          else if (status === 'failed') {
            clearInterval(pollInterval);
            clearInterval(animationInterval);
            process.stdout.write('\x1B[2K\r');
            UI.printError('任务失败（拉分支或构建）！');

            if (error_message) {
              UI.printError(error_message);
            }

            if (build_logs) {
              UI.printBuildLogs(build_logs);
            }

            setTimeout(() => {
              resolve(false);
            }, 50);
          }
          // 超时检查：仅在真正开始构建后计时
          else if (buildStartTime !== null && Date.now() - buildStartTime > BUILD_TIMEOUT) {
            clearInterval(pollInterval);
            clearInterval(animationInterval);
            process.stdout.write('\x1B[2K\r');
            UI.printError('构建超时（5分钟）');
            setTimeout(() => {
              resolve(false);
            }, 50);
          }
        } else {
          clearInterval(pollInterval);
          clearInterval(animationInterval);
          process.stdout.write('\x1B[2K\r');
          UI.printError('无法获取任务状态: ' + result.error);
          setTimeout(() => {
            resolve(false);
          }, 50);
        }
      }, POLL_INTERVAL);
    });
  }

  /**
   * 获取产物流程
   */
  async getArtifactFlow(branch) {
    UI.printInfo('正在获取构建产物...');

    const result = await this.api.getArtifact(branch);

    if (!result.success) {
      UI.printError(result.error);
      return;
    }

    const { filename, url } = result.data;

    // 将URL中的{BUILD_SERVER_IP}替换为实际IP
    const finalUrl = url.replace('{BUILD_SERVER_IP}', this.extractHost(BUILD_SERVICE_URL));

    UI.printDownloadUrl(filename, finalUrl);
  }

  /**
   * 从URL中提取主机部分
   */
  extractHost(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return 'localhost';
    }
  }
}

// ==================== 启动 ====================

const trigger = new BuildTrigger();
trigger.run().catch((error) => {
  UI.printError(error.message);
  process.exit(1);
});
