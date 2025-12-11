/**
 * Model Service - 模型配置服务
 * 负责从服务端获取模型列表、本地缓存、配置管理等
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

// 模型信息接口（匹配服务端API响应）
export interface ModelInfo {
  name: string;
  displayName: string;
  creditsPerRequest: number|undefined;
  available: boolean;
  maxToken: number;
  highVolumeThreshold: number|undefined;
  highVolumeCredits: number|undefined;
}

interface ApiResponse<T> {
  code: number;
  success: boolean;
  data: T;
  message: string;
}

// 降级模型列表（当服务端不可用时使用）
const FALLBACK_MODELS: ModelInfo[] = [
];

// auto模式的默认配置
const AUTO_MODE_CONFIG: ModelInfo = {
  name: 'auto',
  displayName: 'Auto',
  creditsPerRequest: undefined,
  available: true,
  maxToken: 200000,
  highVolumeThreshold: undefined,
  highVolumeCredits: undefined
};

export class ModelService {
  private logger: Logger;
  private proxyAuthManager: any;

  constructor(logger: Logger, proxyAuthManager: any) {
    this.logger = logger;
    this.proxyAuthManager = proxyAuthManager;
  }

  /**
   * 从服务端获取模型列表
   */
  private async fetchModelsFromServer(): Promise<ModelInfo[]> {
    try {
      const userHeaders = await this.proxyAuthManager.getUserHeaders();
      const proxyUrl = `${this.proxyAuthManager.getProxyServerUrl()}/web-api/models`;

      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DeepCode VSCode Extension',
          ...userHeaders,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required - please re-authenticate');
        }
        throw new Error(`API request failed (${response.status}): ${await response.text()}`);
      }

      const apiResponse = await response.json() as ApiResponse<ModelInfo[]>;

      if (!apiResponse.success) {
        throw new Error(apiResponse.message || 'API request unsuccessful');
      }

      if (!apiResponse.data || !Array.isArray(apiResponse.data)) {
        throw new Error('Server returned invalid data format - expected models array');
      }

      return apiResponse.data;
    } catch (error) {
      this.logger.error('Failed to fetch models from server', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * 将云端模型信息保存到VSCode设置
   */
  private saveCloudModelsToSettings(models: ModelInfo[]): void {
    try {
      const config = vscode.workspace.getConfiguration('deepv');
      config.update('cloudModels', models, vscode.ConfigurationTarget.Global);
      this.logger.info('✅ Cloud models saved to VSCode settings');
    } catch (error) {
      this.logger.warn('Failed to save cloud models to settings', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 从VSCode设置读取已缓存的模型信息
   */
  private getLocalCachedModels(): ModelInfo[] {
    try {
      const config = vscode.workspace.getConfiguration('deepv');
      const cloudModels = config.get<ModelInfo[]>('cloudModels', []);
      if (Array.isArray(cloudModels) && cloudModels.length > 0) {
        return cloudModels;
      }
    } catch (error) {
      this.logger.warn('Failed to read cached models from settings', error instanceof Error ? error : undefined);
    }
    return [];
  }

  /**
   * 异步刷新模型配置到本地（供下次使用）
   */
  private async refreshModelsInBackground(): Promise<void> {
    try {
      const models = await this.fetchModelsFromServer();
      if (models.length > 0) {
        this.saveCloudModelsToSettings(models);
        this.logger.info('Background refresh: Updated local model cache');
      }
    } catch (error) {
      // 静默失败，不影响当前使用
      this.logger.warn('Background refresh failed', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 获取可用模型列表（优先本地缓存，异步刷新）
   */
  async getAvailableModels(): Promise<{
    models: ModelInfo[];
    source: 'local' | 'server' | 'fallback'
  }> {
    // 优先从本地VSCode设置读取缓存的模型信息
    const localModels = this.getLocalCachedModels();

    if (localModels.length > 0) {
      // 异步刷新配置供下次使用（不等待结果）
      this.refreshModelsInBackground().catch(() => {
        // 静默处理刷新失败
      });

      return {
        models: [AUTO_MODE_CONFIG, ...localModels],
        source: 'local'
      };
    }

    // 如果本地没有缓存，尝试从服务器获取并保存
    try {
      const models = await this.fetchModelsFromServer();
      if (models.length > 0) {
        this.saveCloudModelsToSettings(models);
      }
      return {
        models: [AUTO_MODE_CONFIG, ...models],
        source: 'server'
      };
    } catch (error) {
      // 降级到'auto'模式让服务端决定
      this.logger.warn('Failed to fetch models from server, falling back to auto mode');
      this.logger.warn('Fallback reason:', error instanceof Error ? error.message : String(error));
      return {
        models: [AUTO_MODE_CONFIG, ...FALLBACK_MODELS],
        source: 'fallback'
      };
    }
  }

  /**
   * 根据模型名获取显示名称
   */
  getModelDisplayName(modelName: string, models: ModelInfo[]): string {
    if (modelName === 'auto') {
      return AUTO_MODE_CONFIG.displayName;
    }

    const model = models.find(m => m.name === modelName);
    return model ? model.displayName : modelName;
  }

  /**
   * 根据模型名获取模型信息
   */
  getModelInfo(modelName: string, models: ModelInfo[]): ModelInfo | undefined {
    if (modelName === 'auto') {
      return AUTO_MODE_CONFIG;
    }

    return models.find(m => m.name === modelName);
  }

  /**
   * 将显示名称转换为模型名称
   */
  getModelNameFromDisplayName(displayName: string, models: ModelInfo[]): string {
    // 处理特殊的 'auto' 模式
    if (displayName === 'auto' || displayName === AUTO_MODE_CONFIG.displayName) {
      return 'auto';
    }

    // 查找匹配的模型
    const matchedModel = models.find(model =>
      model.displayName === displayName || model.name === displayName
    );

    return matchedModel ? matchedModel.name : displayName;
  }

  /**
   * 获取当前配置的模型
   */
  getCurrentModel(): string {
    const config = vscode.workspace.getConfiguration('deepv');
    const preferredModel = config.get<string>('preferredModel', 'auto');

    // 🎯 如果配置是 'auto'，直接返回 'auto'，不要解析为具体模型
    // 这样前端 UI 才能正确显示 "Auto" 选项
    if (preferredModel === 'auto') {
      return 'auto';
    }

    return preferredModel;
  }

  /**
   * 设置当前模型并保存到设置
   */
  async setCurrentModel(modelName: string): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('deepv');
      await config.update('preferredModel', modelName, vscode.ConfigurationTarget.Global);
      this.logger.info(`✅ Model set to: ${modelName}`);
    } catch (error) {
      this.logger.error('Failed to save model preference', error instanceof Error ? error : undefined);
      throw error;
    }
  }
}