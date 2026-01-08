/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DeepVlab统一认证处理器
 * 处理DeepVlab统一认证系统的认证流程
 */

export interface DeepvlabAuthConfig {
  authUrl: string;
  redirectUri: string;
}

export interface DeepvlabAuthResult {
  success: boolean;
  token?: string;
  user_id?: string;
  error?: string;
}

/**
 * DeepVlab统一认证处理器
 */
export class DeepvlabAuthHandler {
  private config: DeepvlabAuthConfig;

  constructor(config: DeepvlabAuthConfig) {
    this.config = config;
  }

  /**
   * 构建DeepVlab认证URL
   */
  public buildAuthUrl(): string {
    // 直接构建完整的认证URL，避免重定向问题
    const authUrl = `${this.config.authUrl}?redirect_to=${encodeURIComponent(this.config.redirectUri)}&redirect_mode=same_window`;
    console.log('🔗 DeepVlab认证URL:', authUrl);

    return authUrl;
  }

  /**
   * 处理DeepVlab认证回调
   */
  public handleCallback(url: URL): DeepvlabAuthResult {
    console.log('🔄 [DeepVlab Auth] 处理DeepVlab认证回调');
    console.log('🔄 [DeepVlab Auth] 回调URL:', url.toString());

    const allParams = Object.fromEntries(url.searchParams.entries());
    console.log('🔄 [DeepVlab Auth] 回调参数:', allParams);

    // 提取token和user_id参数
    const token = url.searchParams.get('token');
    const user_id = url.searchParams.get('user_id');
    const error = url.searchParams.get('error');

    if (error) {
      console.error('❌ [DeepVlab Auth] 认证错误:', error);
      return {
        success: false,
        error: `DeepVlab认证失败: ${error}`
      };
    }

    if (!token) {
      console.error('❌ [DeepVlab Auth] 缺少token参数');
      return {
        success: false,
        error: 'DeepVlab认证回调中缺少token参数'
      };
    }

    if (!user_id) {
      console.error('❌ [DeepVlab Auth] 缺少user_id参数');
      return {
        success: false,
        error: 'DeepVlab认证回调中缺少user_id参数'
      };
    }

    // 打印token和user_id（按要求）
    console.log('🎉 [DeepVlab Auth] 获取到JWT Token:', token);
    console.log('🎉 [DeepVlab Auth] 获取到User ID:', user_id);

    console.log('✅ [DeepVlab Auth] DeepVlab认证成功');
    return {
      success: true,
      token: token,
      user_id: user_id
    };
  }
}

/**
 * 创建DeepVlab认证处理器的便捷函数
 */
export function createDeepvlabAuthHandler(callbackPort?: number): DeepvlabAuthHandler {
  const actualPort = callbackPort || 7863;
  const config: DeepvlabAuthConfig = {
    authUrl: 'https://accounts.deepvlab.ai/login',
    redirectUri: `http://localhost:${actualPort}/callback?plat=deepvlab`,
  };

  return new DeepvlabAuthHandler(config);
}
