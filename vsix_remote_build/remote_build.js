#!/usr/bin/env node

/**
 * VSIX 构建触发服务 - 用户机命令行工具
 * 与构建服务交互，管理构建流程
 */

import ApiClient from './api_client.js';
import UI from './ui.js';

// ==================== 配置 ====================

const BUILD_SERVICE_URL = 'http://192.168.66.100:1234'; // 修改为实际的构建服务地址
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

        // 2. 拉取分支
        if (!(await this.fetchBranchFlow(branch))) {
          if (await UI.askRetry()) {
            continue;
          } else {
            break;
          }
        }

        // 3. 触发构建
        const taskId = await this.triggerBuildFlow(branch);
        if (!taskId) {
          if (await UI.askRetry()) {
            continue;
          } else {
            break;
          }
        }

        // 4. 等待构建完成
        const success = await this.waitForBuildCompletion(taskId, branch);

        if (success) {
          // 5. 获取产物URL
          await this.getArtifactFlow(branch);

          // 询问是否开始新的构建任务
          const newTask = await UI.askNewBuildTask();
          if (!newTask) {
            UI.clear();
            UI.printSuccess('感谢使用，再见！');
            break;
          }
        } else {
          // 构建失败，询问是否重试
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
   * 分支拉取流程
   */
  async fetchBranchFlow(branch) {
    UI.printInfo(`⚠️  请确保分支 "${branch}" 已推送到远程仓库`);
    UI.printInfo(`正在提交分支拉取任务到队列...`);

    const result = await this.api.fetchBranch(branch);

    if (!result.success) {
      UI.printError(result.error);
      return false;
    }

    const { task_id, queue_position, message } = result.data;
    UI.printSuccess(message);

    // 等待分支拉取完成（排队+执行）
    if (queue_position > 1) {
      UI.printInfo(`排队中，当前排在第 ${queue_position} 位，等待轮到...`);
    }

    const fetchSuccess = await this.waitForFetchCompletion(task_id, branch);
    if (!fetchSuccess) {
      UI.printError('分支拉取失败，中止操作');
      return false;
    }

    return true;
  }

  /**
   * 触发构建流程
   */
  async triggerBuildFlow(branch) {
    UI.printInfo(`正在提交构建任务...`);

    const result = await this.api.triggerBuild(branch);

    if (!result.success) {
      UI.printError(result.error);
      return null;
    }

    const { task_id, queue_position } = result.data;
    UI.printSuccess(
      `构建任务已提交 (任务ID: ${task_id.substring(0, 8)}...)`
    );

    if (queue_position > 1) {
      UI.printWarning(
        `排队中，当前排在第 ${queue_position} 位，请稍候...`
      );
    }

    return task_id;
  }

  /**
   * 等待分支拉取完成
   */
  async waitForFetchCompletion(taskId, branch) {
    const startTime = Date.now();
    const pollFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frameIndex = 0;
    let statusData = null;
    let lastRefreshTime = UI.getRefreshTimeStr();

    return new Promise((resolve) => {
      // 快速动画间隔（UI更新）
      const animationInterval = setInterval(() => {
        if (statusData) {
          const spinner = pollFrames[frameIndex % pollFrames.length];
          const timeStr = `[${lastRefreshTime}]`;
          if (statusData.status === 'fetch_queued') {
            process.stdout.write(
              `\r${spinner} 分支拉取排队中，排在第 ${statusData.queue_position} 位... ${timeStr}`.padEnd(80)
            );
          } else {
            process.stdout.write(
              `\r${spinner} ${statusData.message} ${timeStr}`.padEnd(80)
            );
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
          const { status } = statusData;

          // 分支拉取成功
          if (status === 'fetch_completed') {
            clearInterval(pollInterval);
            clearInterval(animationInterval);
            process.stdout.write('\r' + ' '.repeat(80) + '\r');
            UI.printSuccess('分支拉取已完成！');
            setTimeout(() => {
              resolve(true);
            }, 50);
          }
          // 拉取失败
          else if (status === 'failed') {
            clearInterval(pollInterval);
            clearInterval(animationInterval);
            process.stdout.write('\r' + ' '.repeat(80) + '\r');
            UI.printError('分支拉取失败！');
            setTimeout(() => {
              resolve(false);
            }, 50);
          }
          // 超时检查
          else if (Date.now() - startTime > BUILD_TIMEOUT) {
            clearInterval(pollInterval);
            clearInterval(animationInterval);
            process.stdout.write('\r' + ' '.repeat(80) + '\r');
            UI.printError('分支拉取超时');
            setTimeout(() => {
              resolve(false);
            }, 50);
          }
        } else {
          clearInterval(pollInterval);
          clearInterval(animationInterval);
          process.stdout.write('\r' + ' '.repeat(80) + '\r');
          UI.printError('无法获取分支拉取状态: ' + result.error);
          setTimeout(() => {
            resolve(false);
          }, 50);
        }
      }, POLL_INTERVAL);
    });
  }

  /**
   * 等待构建完成
   */
  async waitForBuildCompletion(taskId, branch) {
    const startTime = Date.now();
    const pollFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let frameIndex = 0;
    let statusData = null;
    let lastRefreshTime = UI.getRefreshTimeStr();

    return new Promise((resolve) => {
      // 快速动画间隔（UI更新）
      const animationInterval = setInterval(() => {
        if (statusData) {
          const spinner = pollFrames[frameIndex % pollFrames.length];
          const timeStr = `[${lastRefreshTime}]`;
          process.stdout.write(
            `\r${spinner} 远程构建机正在进行: ${statusData.message} ${timeStr}`.padEnd(90)
          );
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

          // 构建完成
          if (status === 'completed') {
            clearInterval(pollInterval);
            clearInterval(animationInterval);
            process.stdout.write('\r' + ' '.repeat(80) + '\r');
            UI.printSuccess('远程构建已完成！');

            if (build_logs) {
              UI.printBuildLogs(build_logs);
            }

            // 在 macOS 上需要延迟确保 stdout 缓冲被正确刷新
            // 否则后续 inquirer 的终端初始化会清除待发送的输出
            setTimeout(() => {
              resolve(true);
            }, 50);
          }
          // 构建失败
          else if (status === 'failed') {
            clearInterval(pollInterval);
            clearInterval(animationInterval);
            process.stdout.write('\r' + ' '.repeat(80) + '\r');
            UI.printError('远程构建失败！');

            if (error_message) {
              UI.printError(error_message);
            }

            if (build_logs) {
              UI.printBuildLogs(build_logs);
            }

            // 在 macOS 上需要延迟确保 stdout 缓冲被正确刷新
            setTimeout(() => {
              resolve(false);
            }, 50);
          }
          // 超时检查
          else if (Date.now() - startTime > BUILD_TIMEOUT) {
            clearInterval(pollInterval);
            clearInterval(animationInterval);
            process.stdout.write('\r' + ' '.repeat(80) + '\r');
            UI.printError('远程构建超时（5分钟）');
            setTimeout(() => {
              resolve(false);
            }, 50);
          }
        } else {
          clearInterval(pollInterval);
          clearInterval(animationInterval);
          process.stdout.write('\r' + ' '.repeat(80) + '\r');
          UI.printError('无法获取远程构建状态: ' + result.error);
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
