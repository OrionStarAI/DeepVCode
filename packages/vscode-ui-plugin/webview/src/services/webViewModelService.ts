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

// 🎯 压缩确认请求类型
export interface CompressionConfirmationRequest {
  requestId: string;
  sessionId: string;
  targetModel: string;
  currentTokens: number;
  targetTokenLimit: number;
  compressionThreshold: number;
  message: string;
}

// 🎯 压缩确认回调类型
type CompressionConfirmationHandler = (request: CompressionConfirmationRequest) => void;
type CompressionErrorHandler = (error: string) => void;

export class WebviewModelService {
  private static instance: WebviewModelService;
  private pendingRequests = new Map<string, (response: any) => void>();
  private isInitialized = false;
  private compressionConfirmationHandler?: CompressionConfirmationHandler;
  private compressionErrorHandler?: CompressionErrorHandler;

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

      // 🎯 监听压缩确认请求
      messageService.onExtensionMessage('compression_confirmation_request', (payload: any) => {
        console.log('📊 [WebviewModelService] Received compression confirmation request:', payload);
        if (this.compressionConfirmationHandler) {
          this.compressionConfirmationHandler(payload as CompressionConfirmationRequest);
        }
      });

      // 🎯 监听模型响应中的错误（用于压缩失败时清除状态）
      messageService.onExtensionMessage('model_response', (payload: any) => {
        if (!payload.success && this.compressionErrorHandler) {
          this.compressionErrorHandler(payload.error || 'Unknown error');
        }
      });

      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize message handlers:', error);
    }
  }

  // 🎯 设置压缩确认处理器
  onCompressionConfirmationRequest(handler: CompressionConfirmationHandler): void {
    this.compressionConfirmationHandler = handler;
  }

  // 🎯 发送压缩确认响应
  sendCompressionConfirmationResponse(data: {
    requestId: string;
    sessionId: string;
    targetModel: string;
    confirmed: boolean;
  }): void {
    const messageService = getGlobalMessageService();
    messageService.send({
      type: 'compression_confirmation_response',
      payload: data
    });
  }

  // 🎯 设置压缩错误处理器
  onCompressionError(handler: CompressionErrorHandler): void {
    this.compressionErrorHandler = handler;
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