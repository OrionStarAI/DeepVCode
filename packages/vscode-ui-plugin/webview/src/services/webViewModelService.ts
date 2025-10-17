/**
 * Model Service for Webview - 模型服务（Webview端）
 * 负责与VSCode扩展通信获取模型数据和配置
 */

import { ModelInfo } from '../components/ModelSelector';
import { getGlobalMessageService } from './globalMessageService';

// 消息响应类型
interface ModelResponse {
  success: boolean;
  models?: ModelInfo[];
  currentModel?: string;
  error?: string;
}

export class WebviewModelService {
  private static instance: WebviewModelService;
  private pendingRequests = new Map<string, (response: any) => void>();
  private isInitialized = false;

  private constructor() {
    this.initializeMessageHandlers();
  }

  private initializeMessageHandlers() {
    if (this.isInitialized) {
      return;
    }

    try {
      // 通过MultiSessionMessageService监听模型响应
      
      const messageService = getGlobalMessageService();
      messageService.onExtensionMessage('model_response', (payload: any) => {
        const callback = this.pendingRequests.get(payload.requestId);
        if (callback) {
          callback(payload);
          this.pendingRequests.delete(payload.requestId);
        }
      });

      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize message handlers:', error);
    }
  }

  static getInstance(): WebviewModelService {
    if (!WebviewModelService.instance) {
      WebviewModelService.instance = new WebviewModelService();
    }
    // 确保每次获取实例时都检查初始化状态
    WebviewModelService.instance.initializeMessageHandlers();
    return WebviewModelService.instance;
  }

  /**
   * 获取可用模型列表
   */
  async getAvailableModels(): Promise<ModelInfo[]> {
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();

      // 设置超时
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, 10000);

      this.pendingRequests.set(requestId, (response: ModelResponse) => {
        clearTimeout(timeout);
        if (response.success && response.models) {
          resolve(response.models);
        } else {
          reject(new Error(response.error || 'Failed to get models'));
        }
      });

      // 通过MultiSessionMessageService发送请求
        const messageService = getGlobalMessageService();
        messageService.send({
          type: 'get_available_models',
          payload: { requestId }
        });
    });
  }

  /**
   * 获取当前选中的模型
   */
  async getCurrentModel(sessionId?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, 5000);

      this.pendingRequests.set(requestId, (response: ModelResponse) => {
        clearTimeout(timeout);
        if (response.success && response.currentModel !== undefined) {
          resolve(response.currentModel);
        } else {
          reject(new Error(response.error || 'Failed to get current model'));
        }
      });

      const messageService = getGlobalMessageService();
      messageService.send({
        type: 'get_current_model',
        payload: { requestId, sessionId }
      });
    });
  }

  /**
   * 设置当前模型
   */
  async setCurrentModel(modelName: string, sessionId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }, 5000);

      this.pendingRequests.set(requestId, (response: ModelResponse) => {
        clearTimeout(timeout);
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to set model'));
        }
      });

      const messageService = getGlobalMessageService();
      messageService.send({
        type: 'set_current_model',
        payload: { requestId, modelName, sessionId }
      });
    });
  }

  private generateRequestId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

// 导出单例实例
export const webviewModelService = WebviewModelService.getInstance();