/**
 * Login Service - 独立的登录管理服务
 * 使用core中的共享认证功能
 */

import * as vscode from 'vscode';
import { ProxyAuthManager, AuthType, AuthServer, AuthTemplates } from 'deepv-code-core';
import { Logger } from '../utils/logger';

export interface LoginResult {
  success: boolean;
  accessToken?: string;
  error?: string;
}

export interface LoginStatus {
  isLoggedIn: boolean;
  userInfo?: any;
  error?: string;
}

/**
 * VSCode版本的登录服务
 * 使用core中的共享AuthServer进行认证
 */
export class LoginService {
  private static instance?: LoginService;
  private proxyAuthManager: any;
  private logger: Logger;
  private authServer?: AuthServer;
  private static extensionPathInitialized = false;

  private constructor(logger: Logger) {
    this.logger = logger;
    this.proxyAuthManager = ProxyAuthManager.getInstance();
  }

  /**
   * 获取LoginService单例实例
   */
  static getInstance(logger: Logger, extensionPath?: string): LoginService {
    if (!LoginService.instance) {
      LoginService.instance = new LoginService(logger);
    }

    // 在VSCode扩展环境中，设置AuthTemplates的基础路径（只需设置一次）
    if (extensionPath && !LoginService.extensionPathInitialized) {
      AuthTemplates.setBasePath(extensionPath);
      LoginService.extensionPathInitialized = true;
    }

    return LoginService.instance;
  }

  /**
   * 检查登录状态
   * 新流程：1. 检查customProxyServerUrl -> 2. 检查本地token -> 3. 调用/web-api/auth/me验证 -> 4. 返回结果
   *
   * 🎯 如果配置了customProxyServerUrl，跳过认证检查，信任自定义服务器处理认证
   */
  async checkLoginStatus(): Promise<LoginStatus> {
    try {
      this.logger.info('🔍 开始检查登录状态...');

      // 🎯 第一步：检查是否配置了自定义代理服务器URL
      const customProxyUrl = await this.getCustomProxyServerUrl();
      if (customProxyUrl) {
        this.logger.info(`🌐 检测到自定义代理服务器URL已配置，跳过认证检查，信任服务器自己处理认证`);
        return {
          isLoggedIn: true,
          userInfo: undefined // 自定义服务器处理，我们不管用户信息
        };
      }

      // 第二步：检查本地是否有JWT token
      const userInfo = await this.proxyAuthManager.getUserInfo?.() || null;
      const hasJWTData = this.proxyAuthManager.jwtTokenData !== null && this.proxyAuthManager.jwtTokenData !== undefined;
      const jwtToken = await this.proxyAuthManager.getAccessToken();

      if (userInfo && hasJWTData && jwtToken) {
        this.logger.info(`📋 本地找到JWT token，用户: ${userInfo.name} (${userInfo.email})`);

        // 第三步：使用/web-api/auth/me接口验证token是否有效
        const isValid = await this.validateTokenWithServer(jwtToken);
        if (isValid) {
          this.logger.info('✅ JWT token验证成功，用户已登录');
          return {
            isLoggedIn: true,
            userInfo: userInfo
          };
        } else {
          this.logger.warn('❌ JWT token验证失败，可能已过期');
          // Token无效，清除本地数据
          await this.clearInvalidAuth();
        }
      } else {
        this.logger.info('📋 本地未找到有效的JWT token');
      }



      this.logger.info('❌ 未找到有效的认证信息，需要登录');
      return {
        isLoggedIn: false,
        error: '未找到有效的认证信息'
      };

    } catch (error) {
      this.logger.error('❌ 检查登录状态失败', error instanceof Error ? error : undefined);
      return {
        isLoggedIn: false,
        error: error instanceof Error ? error.message : '登录状态检查失败'
      };
    }
  }

  /**
   * 启动登录流程
   * 使用core中的AuthServer进行认证
   */
  async startLogin(): Promise<LoginResult> {
    try {
      this.logger.info('🚀 启动登录流程...');

      // 创建AuthServer实例
      this.authServer = new AuthServer();
      this.logger.info('✅ AuthServer已创建，认证成功时会自动保存到ProxyAuthManager');

      // 启动认证服务器
      await this.authServer.start();

      // 获取认证选择页面URL
      const selectPort = this.authServer.getActualSelectPort();
      const authUrl = `http://localhost:${selectPort}`;

      // 使用VSCode的openExternal API打开浏览器
      await vscode.env.openExternal(vscode.Uri.parse(authUrl));

      this.logger.info('🌐 浏览器已打开，请完成认证...');
      this.logger.info(`🔗 认证选择页面: ${authUrl}`);

      // 等待认证完成 - 轮询检查认证状态
      return await this.waitForAuthCompletion();

    } catch (error) {
      this.logger.error('启动登录流程失败', error instanceof Error ? error : undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : '登录流程启动失败'
      };
    }
  }

  /**
   * 登出
   */
  async logout(): Promise<void> {
    try {
      // 重置ProxyAuthManager
      this.proxyAuthManager.configure({
        proxyServerUrl: this.proxyAuthManager.getProxyServerUrl()
      });

      this.logger.info('✅ 已登出');

    } catch (error) {
      this.logger.error('登出失败', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * 等待认证完成
   */
  private async waitForAuthCompletion(): Promise<LoginResult> {
    return new Promise((resolve) => {
      // 设置超时
      const timeout = setTimeout(() => {
        this.cleanup();
        resolve({ success: false, error: '登录超时（5分钟）' });
      }, 300000); // 5分钟超时

      // 轮询检查认证状态
      const checkInterval = setInterval(async () => {
        try {
          const status = await this.checkLoginStatus();
          if (status.isLoggedIn) {
            clearTimeout(timeout);
            clearInterval(checkInterval);
            this.cleanup();
            resolve({ success: true });
          }
        } catch (error) {
          // 继续轮询，忽略检查错误
        }
      }, 2000); // 每2秒检查一次
    });
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    if (this.authServer) {
      this.authServer.stop();
      this.authServer = undefined;
    }
  }

  /**
   * 使用/web-api/auth/me接口验证JWT token是否有效
   */
  private async validateTokenWithServer(token: string): Promise<boolean> {
    try {
      const proxyServerUrl = this.proxyAuthManager.getProxyServerUrl();
      const response = await fetch(`${proxyServerUrl}/web-api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'DeepVCode-VSCode'
        },
        timeout: 5000 // 5秒超时
      } as any);

      if (response.ok) {
        const userData = await response.json();
        this.logger.info('✅ 服务器验证JWT token成功:', userData);
        return true;
      } else {
        this.logger.warn(`❌ 服务器验证JWT token失败: ${response.status} ${response.statusText}`);
        return false;
      }
    } catch (error) {
      this.logger.warn('❌ 调用/web-api/auth/me接口失败', error instanceof Error ? error : undefined);
      return false;
    }
  }

  /**
   * 清除无效的认证信息
   */
  private async clearInvalidAuth(): Promise<void> {
    try {
      // 清除JWT token数据
      this.proxyAuthManager.setJwtTokenData(null);
      this.proxyAuthManager.setUserInfo(null);

      this.logger.info('🧹 已清除无效的认证信息');
    } catch (error) {
      this.logger.warn('⚠️ 清除认证信息时出错', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 获取配置的自定义代理服务器URL
   * 优先级：VSCode扩展设置 > 文件配置 > undefined
   */
  private async getCustomProxyServerUrl(): Promise<string | undefined> {
    try {
      // 从 VSCode 扩展设置中读取
      const vscodeConfig = vscode.workspace.getConfiguration('deepv');
      const vscodeCustomProxyUrl = vscodeConfig.get<string>('customProxyServerUrl', '');
      if (vscodeCustomProxyUrl && vscodeCustomProxyUrl.trim()) {
        return vscodeCustomProxyUrl.trim();
      }

      // 从文件配置中读取
      try {
        const { MCPSettingsService } = await import('./mcpSettingsService.js');
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const fileSettings = MCPSettingsService.loadSettings(workspaceRoot);
        if (fileSettings.customProxyServerUrl) {
          return fileSettings.customProxyServerUrl;
        }
      } catch (fileLoadError) {
        this.logger.debug('Could not load customProxyServerUrl from file settings');
      }

      return undefined;
    } catch (error) {
      this.logger.debug('Error getting custom proxy server URL:', error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }

  /**
   * 销毁服务
   */
  dispose(): void {
    this.cleanup();
  }
}