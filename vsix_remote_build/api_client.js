/**
 * API客户端 - 与构建服务通信
 */
import axios from 'axios';

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
    });
    this.maxRetries = 3; // 最多重试3次
    this.retryDelay = 500; // 重试延迟（毫秒）
  }

  /**
   * 带重试的请求方法
   */
  async requestWithRetry(fn, operationName = 'request') {
    let lastError;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        // 只对网络错误进行重试
        if (attempt < this.maxRetries && this.isNetworkError(error)) {
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        } else {
          break;
        }
      }
    }

    return {
      success: false,
      error: this.formatError(lastError),
    };
  }

  /**
   * 判断是否为网络错误（可重试）
   */
  isNetworkError(error) {
    if (!error.response && error.request) {
      // 网络层错误
      return true;
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return true;
    }
    if (error.message && error.message.includes('socket hang up')) {
      return true;
    }
    return false;
  }

  /**
   * 提交完整构建任务（全程排队）
   */
  async submitBuildTask(branch) {
    return this.requestWithRetry(async () => {
      const response = await this.client.post('/api/submit-build-task', {
        branch: branch,
      });
      return {
        success: true,
        data: response.data,
      };
    }, 'submitBuildTask');
  }

  /**
   * 查询构建状态
   */
  async getBuildStatus(taskId) {
    return this.requestWithRetry(async () => {
      const response = await this.client.get('/api/build-status', {
        params: { task_id: taskId },
      });
      return {
        success: true,
        data: response.data,
      };
    }, 'getBuildStatus');
  }

  /**
   * 获取构建产物
   */
  async getArtifact(branch) {
    return this.requestWithRetry(async () => {
      const response = await this.client.get('/api/get-artifact', {
        params: { branch: branch },
      });
      return {
        success: true,
        data: response.data,
      };
    }, 'getArtifact');
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    return this.requestWithRetry(async () => {
      const response = await this.client.get('/health');
      return {
        success: true,
        data: response.data,
      };
    }, 'healthCheck');
  }

  /**
   * 格式化错误消息
   */
  formatError(error) {
    if (error.response) {
      return `[${error.response.status}] ${
        error.response.data?.detail || error.response.statusText
      }`;
    } else if (error.request) {
      return `无法连接到服务器: ${error.message}`;
    } else {
      return error.message;
    }
  }
}

export default ApiClient;
