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
  }

  /**
   * 拉取分支
   */
  async fetchBranch(branch) {
    try {
      const response = await this.client.post('/api/fetch-branch', {
        branch: branch,
      });
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: this.formatError(error),
      };
    }
  }

  /**
   * 触发构建
   */
  async triggerBuild(branch) {
    try {
      const response = await this.client.post('/api/build', {
        branch: branch,
      });
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: this.formatError(error),
      };
    }
  }

  /**
   * 查询构建状态
   */
  async getBuildStatus(taskId) {
    try {
      const response = await this.client.get('/api/build-status', {
        params: { task_id: taskId },
      });
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: this.formatError(error),
      };
    }
  }

  /**
   * 获取构建产物
   */
  async getArtifact(branch) {
    try {
      const response = await this.client.get('/api/get-artifact', {
        params: { branch: branch },
      });
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: this.formatError(error),
      };
    }
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: this.formatError(error),
      };
    }
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
