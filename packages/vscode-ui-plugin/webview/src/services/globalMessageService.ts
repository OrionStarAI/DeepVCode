/**
 * Global Message Service
 * 全局消息服务单例
 * 
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import { MultiSessionMessageService } from './multiSessionMessageService';

/**
 * 全局MessageService实例
 */
let globalMessageServiceInstance: MultiSessionMessageService | null = null;

/**
 * 获取全局MessageService实例（不会自动发送ready消息）
 */
export function getGlobalMessageService(): MultiSessionMessageService {
  if (!globalMessageServiceInstance) {
    console.log('🌐 Creating global MultiSessionMessageService instance (not ready yet)');
    globalMessageServiceInstance = new MultiSessionMessageService();
    // 注意：构造函数中已经调用了sendReady()，这里不需要再次调用
  }
  return globalMessageServiceInstance;
}

/**
 * 销毁全局MessageService实例
 */
export function disposeGlobalMessageService(): void {
  if (globalMessageServiceInstance) {
    console.log('🗑️ Disposing global MultiSessionMessageService instance');
    globalMessageServiceInstance.dispose();
    globalMessageServiceInstance = null;
  }
}

/**
 * 检查全局MessageService是否已初始化
 */
export function isGlobalMessageServiceInitialized(): boolean {
  return globalMessageServiceInstance !== null;
}
