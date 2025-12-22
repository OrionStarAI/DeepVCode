/**
 * Auth Manager - 独立的认证管理单例
 * 负责管理所有认证相关逻辑，可被多个AI服务实例共享
 */

import * as vscode from 'vscode';
import { ProxyAuthManager } from 'deepv-code-core';
import { Logger } from '../utils/logger';

export class AuthManager {
  private static instance?: AuthManager;
  private proxyAuthManager: any;
  private logger?: Logger;
  private isInitialized = false;

  private constructor() {
    this.proxyAuthManager = ProxyAuthManager.getInstance();
  }

  /**
   * 获取AuthManager单例实例
   */
  static getInstance(logger?: Logger): AuthManager {
    if (!AuthManager.instance) {
      AuthManager.instance = new AuthManager();
    }
    if (logger && !AuthManager.instance.logger) {
      AuthManager.instance.logger = logger;
    }
    return AuthManager.instance;
  }

  /**
   * 初始化认证系统
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger?.info('✅ AuthManager already initialized');
      return;
    }

    this.logger?.info('🔄 Initializing authentication system...');

    try {
      // 确保ProxyAuthManager已正确配置代理服务器URL
      const proxyServerUrl = this.proxyAuthManager.getProxyServerUrl();
      this.logger?.info(`🌐 Proxy server configured: ${proxyServerUrl}`);

      // 🔍 检查是否已有有效的JWT token
      const hasValidToken = await this.checkExistingJWTToken();

      if (hasValidToken) {
        this.logger?.info('🎉 Found valid JWT token from ~/.deepcode/ directory!');

        // 确保ProxyAuthManager配置是完整的
        try {
          this.proxyAuthManager.configure({
            proxyServerUrl: proxyServerUrl
          });
          this.logger?.info('✅ ProxyAuthManager configuration verified');
        } catch (configError) {
          this.logger?.warn('⚠️ ProxyAuthManager configuration check failed', configError instanceof Error ? configError : undefined);
        }
      } else {
        // 确保基本的代理配置
        this.logger?.info('ℹ️ No valid JWT token found, setting up basic proxy configuration...');
        await this.ensureProxyConfig();
      }

      this.isInitialized = true;
      this.logger?.info('✅ AuthManager initialized successfully');

    } catch (error) {
      this.logger?.warn('⚠️ Failed to initialize auth manager', error instanceof Error ? error : undefined);
      // 不抛出错误，允许系统在没有认证的情况下继续运行
    }
  }

  /**
   * 确保基本的代理服务器配置
   */
  private async ensureProxyConfig(): Promise<void> {
    try {
      const proxyServerUrl = this.proxyAuthManager.getProxyServerUrl();
      this.proxyAuthManager.configure({
        proxyServerUrl: proxyServerUrl
      });
      this.logger?.info('ℹ️ ProxyAuthManager configured with server URL');
    } catch (configError) {
      this.logger?.warn('⚠️ Failed to configure ProxyAuthManager', configError instanceof Error ? configError : undefined);
    }
  }

  /**
   * 检查现有的JWT token是否有效
   */
  private async checkExistingJWTToken(): Promise<boolean> {
    try {
      const userInfo = await this.proxyAuthManager.getUserInfo?.() || null;
      const hasJWTData = this.proxyAuthManager.jwtTokenData !== null && this.proxyAuthManager.jwtTokenData !== undefined;

      if (userInfo && hasJWTData) {
        this.logger?.info(`🎯 JWT token found for user: ${userInfo.name} (${userInfo.email})`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger?.warn('❓ Could not verify existing JWT token status', error instanceof Error ? error : undefined);
      return false;
    }
  }

  /**
   * 获取当前的Feishu Token
   */
  getFeishuToken(): string | undefined {
    try {
      const config = vscode.workspace.getConfiguration('deepv');
      const feishuToken = config.get<string>('feishuToken', '');
      return feishuToken && feishuToken.trim() ? feishuToken.trim() : undefined;
    } catch (error) {
      this.logger?.warn('Failed to get Feishu token from configuration', error instanceof Error ? error : undefined);
      return undefined;
    }
  }

  /**
   * 更新Feishu Token配置
   */
  /**
   * 获取ProxyAuthManager实例（供其他服务使用）
   */
  getProxyAuthManager(): any {
    return this.proxyAuthManager;
  }

  /**
   * 检查认证状态
   */
  isAuthenticated(): boolean {
    const feishuToken = process.env.FEISHU_ACCESS_TOKEN;
    return this.isInitialized && (
      this.proxyAuthManager.jwtTokenData !== null ||
      (feishuToken !== undefined && feishuToken.trim() !== '')
    );
  }

  /**
   * 获取认证状态信息
   */
  getAuthStatus(): { initialized: boolean; authenticated: boolean; userInfo?: any } {
    return {
      initialized: this.isInitialized,
      authenticated: this.isAuthenticated(),
      userInfo: this.proxyAuthManager.getUserInfo?.() || null
    };
  }
}
