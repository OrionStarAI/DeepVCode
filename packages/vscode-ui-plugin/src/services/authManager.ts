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
        // 🔄 尝试从VSCode配置读取feishu token
        this.logger?.info('ℹ️ No valid JWT token found, checking VSCode settings for Feishu token...');
        await this.setupFeishuFromVSCode();
      }

      this.isInitialized = true;
      this.logger?.info('✅ AuthManager initialized successfully');

    } catch (error) {
      this.logger?.warn('⚠️ Failed to initialize auth manager', error instanceof Error ? error : undefined);
      // 不抛出错误，允许系统在没有认证的情况下继续运行
    }
  }

  /**
   * 从VSCode配置中设置飞书认证
   */
  private async setupFeishuFromVSCode(): Promise<void> {
    const config = vscode.workspace.getConfiguration('deepv');
    const feishuToken = config.get<string>('feishuToken', '');

    if (feishuToken && feishuToken.trim()) {
      this.logger?.info('🔄 Setting up Feishu authentication from VSCode settings');

      try {
        const proxyServerUrl = this.proxyAuthManager.getProxyServerUrl();
        
        this.proxyAuthManager.configure({
          proxyServerUrl: proxyServerUrl,
          feishuToken: feishuToken.trim()
        });

        // 设置环境变量作为备份
        process.env.FEISHU_ACCESS_TOKEN = feishuToken.trim();
        
        this.logger?.info('✅ Feishu token configured successfully from VSCode settings');

      } catch (configError) {
        this.logger?.error('❌ Failed to configure ProxyAuthManager with Feishu token', configError instanceof Error ? configError : undefined);
        throw configError;
      }
    } else {
      this.logger?.info('⚠️ No authentication found in either ~/.deepcode/ or VSCode settings');
      this.logger?.info('💡 Tip: You can add JWT tokens to ~/.deepcode/ or configure feishuToken in VSCode settings');
      
      // 即使没有token，也确保有基本配置
      try {
        const proxyServerUrl = this.proxyAuthManager.getProxyServerUrl();
        this.proxyAuthManager.configure({
          proxyServerUrl: proxyServerUrl
        });
        this.logger?.info('ℹ️ Basic ProxyAuthManager configuration applied (no authentication)');
      } catch (configError) {
        this.logger?.warn('⚠️ Failed to apply basic ProxyAuthManager configuration', configError instanceof Error ? configError : undefined);
      }
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
  async updateFeishuToken(newToken: string): Promise<boolean> {
    try {
      const config = vscode.workspace.getConfiguration('deepv');
      await config.update('feishuToken', newToken.trim(), vscode.ConfigurationTarget.Global);

      // 重新设置认证
      await this.setupFeishuFromVSCode();
      
      this.logger?.info('✅ Feishu token updated successfully');
      return true;

    } catch (error) {
      this.logger?.error('❌ Failed to update Feishu token', error instanceof Error ? error : undefined);
      return false;
    }
  }

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
