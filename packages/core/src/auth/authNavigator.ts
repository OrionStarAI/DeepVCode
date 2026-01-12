/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * 认证导航器
 * 处理认证失败时的自动跳转逻辑
 */

import { ProxyAuthManager } from '../core/proxyAuth.js';

export interface AuthNavigatorConfig {
  /**
   * 认证页面URL
   */
  authUrl?: string;
  
  /**
   * 是否自动打开浏览器
   */
  autoOpenBrowser?: boolean;
  
  /**
   * 自定义认证处理函数
   */
  customAuthHandler?: () => Promise<void> | void;
}

export class AuthNavigator {
  private static instance: AuthNavigator | null = null;
  private config: AuthNavigatorConfig;
  private isAuthenticating = false;

  private constructor(config: AuthNavigatorConfig = {}) {
    this.config = {
      authUrl: '/auth',
      autoOpenBrowser: true,
      ...config
    };
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: AuthNavigatorConfig): AuthNavigator {
    if (!AuthNavigator.instance) {
      AuthNavigator.instance = new AuthNavigator(config);
    }
    return AuthNavigator.instance;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AuthNavigatorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 处理认证失败
   */
  async handleAuthenticationRequired(): Promise<void> {
    if (this.isAuthenticating) {
      console.log('[AuthNavigator] Authentication already in progress, skipping...');
      return;
    }

    this.isAuthenticating = true;

    try {
      console.log('🔐 [AuthNavigator] Authentication required');

      // 清除当前的认证信息
      const authManager = ProxyAuthManager.getInstance();
      authManager.clear();

      if (this.config.customAuthHandler) {
        console.log('[AuthNavigator] Using custom authentication handler');
        await this.config.customAuthHandler();
      } else {
        await this.handleDefaultAuthentication();
      }
    } catch (error) {
      console.error('[AuthNavigator] Authentication handling failed:', error);
    } finally {
      this.isAuthenticating = false;
    }
  }

  /**
   * 默认认证处理
   */
  private async handleDefaultAuthentication(): Promise<void> {
    console.log('[AuthNavigator] Starting default authentication flow');

    // 检查是否在CLI环境中
    if (typeof process !== 'undefined' && process.argv) {
      await this.handleCLIAuthentication();
    } else {
      await this.handleWebAuthentication();
    }
  }

  /**
   * 处理CLI环境下的认证
   */
  private async handleCLIAuthentication(): Promise<void> {
    console.log('');
    console.log('🔐 认证已过期，需要重新认证');
    console.log('💡 请在CLI中输入 /auth 命令进行重新认证');
    console.log('');
  }

  /**
   * 处理Web环境下的认证
   */
  private async handleWebAuthentication(): Promise<void> {
    if (typeof window !== 'undefined') {
      const authManager = ProxyAuthManager.getInstance();
      const serverUrl = authManager.getProxyServerUrl();
      const authUrl = `${serverUrl}${this.config.authUrl}`;
      
      console.log(`[AuthNavigator] Redirecting to auth page: ${authUrl}`);
      window.location.href = authUrl;
    } else {
      console.error('[AuthNavigator] Cannot redirect in non-browser environment');
    }
  }

  /**
   * 检查是否正在认证中
   */
  isInProgress(): boolean {
    return this.isAuthenticating;
  }
}

/**
 * 创建默认的认证导航器实例
 */
export function createAuthNavigator(config?: AuthNavigatorConfig): AuthNavigator {
  return AuthNavigator.getInstance(config);
}

/**
 * 获取默认认证导航器的认证处理函数
 */
export function getDefaultAuthHandler(config?: AuthNavigatorConfig): () => Promise<void> {
  const navigator = AuthNavigator.getInstance(config);
  return () => navigator.handleAuthenticationRequired();
}
