/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 代理模式认证管理器
 * 管理本地用户信息和代理服务器配置
 *
 * BUG修复: 移除token验证，改为本地用户信息管理
 * 修复策略: 登录时保存用户信息到本地，API调用时发送用户信息header
 * 影响范围: packages/core/src/core/proxyAuth.ts
 * 修复日期: 2025-01-27
 */

// Note: Using console.log instead of logger to avoid dependency issues
import { getActiveProxyServerUrl } from '../config/proxyConfig.js';
import { logIfNotSilent } from '../utils/logging.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ProxyAuthConfig {
  proxyServerUrl: string;
  userInfo?: FeishuUserInfo;
  feishuToken?: string;
  cliVersion?: string;
}

export interface JWTTokenData {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  expiresAt: number;
  savedAt: string;
}

export interface FeishuUserInfo {
  openId: string;
  userId: string;
  name: string;
  enName?: string;
  email?: string;
  avatar?: string;
}

export interface UsageStats {
  totalCreditsConsumed: number;
  lastUpdated: string;
}

/**
 * Token 刷新阈值常量
 * 针对 10+ 天有效期的 token，提前 3 天发起刷新
 * 这符合业界最佳实践，避免用户离线后 token 过期
 */
const TOKEN_REFRESH_THRESHOLD_SECONDS = 259200; // 3 天

export class ProxyAuthManager {
  private static instance: ProxyAuthManager | null = null;
  private config: ProxyAuthConfig;
  private userInfo: FeishuUserInfo | null = null;
  private jwtTokenData: JWTTokenData | null = null;
  private usageStats: UsageStats = { totalCreditsConsumed: 0, lastUpdated: new Date().toISOString() };
  private userInfoFilePath: string;
  private jwtTokenFilePath: string;
  private usageStatsFilePath: string;
  private refreshPromise: Promise<string> | null = null;
  private cliVersion: string = 'unknown';
  private periodicStatusCheckIntervalId: NodeJS.Timeout | null = null;

  /**
   * 获取CLI版本号
   */
  private getCliVersion(): string {
    return this.cliVersion;
  }

  /**
   * 格式化时间间隔为人类可读的字符串
   */
  private formatTimeRemaining(milliseconds: number): string {
    if (milliseconds <= 0) return '已过期';

    const totalSeconds = Math.floor(milliseconds / 1000);
    const days = Math.floor(totalSeconds / (24 * 3600));
    const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
      return `${days}天${hours}小时${minutes}分钟`;
    } else if (hours > 0) {
      return `${hours}小时${minutes}分钟${seconds}秒`;
    } else if (minutes > 0) {
      return `${minutes}分钟${seconds}秒`;
    } else {
      return `${seconds}秒`;
    }
  }

  /**
   * 格式化绝对时间
   */
  private formatAbsoluteTime(timestamp: number): string {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }

  private constructor() {
    // 用户信息存储路径

    if ( process.env.DEEPX_SERVER_URL?.includes('localhost')) {
      this.userInfoFilePath = path.join(os.homedir(), '.deepv', 'user-info-dev.json');
      this.jwtTokenFilePath = path.join(os.homedir(), '.deepv', 'jwt-token-dev.json');
      this.usageStatsFilePath = path.join(os.homedir(), '.deepv', 'usage-stats-dev.json');
    } else {
      this.userInfoFilePath = path.join(os.homedir(), '.deepv', 'user-info.json');
      this.jwtTokenFilePath = path.join(os.homedir(), '.deepv', 'jwt-token.json');
      this.usageStatsFilePath = path.join(os.homedir(), '.deepv', 'usage-stats.json');
    }


    // 尝试从环境变量获取CLI版本
    this.cliVersion = process.env.CLI_VERSION || 'unknown';

    this.config = {
      proxyServerUrl: getActiveProxyServerUrl(),
    };

    // 启动时加载本地用户信息和JWT token
    this.loadUserInfo();
    this.loadJwtToken();
    this.loadUsageStats();

    // 启动定期状态检查（每10分钟打印一次状态）
    this.startPeriodicStatusCheck();
  }

  /**
   * 启动定期状态检查
   * ⚠️ 关键：保存 intervalId 以支持后续清理，防止内存泄漏
   */
  private startPeriodicStatusCheck(): void {
    this.periodicStatusCheckIntervalId = setInterval(() => {
      if (this.jwtTokenData) {
        const now = Date.now();
        const timeRemaining = this.jwtTokenData.expiresAt - now;
        const timeRemainingFormatted = this.formatTimeRemaining(timeRemaining);
        const expiresAtFormatted = this.formatAbsoluteTime(this.jwtTokenData.expiresAt);

        if (timeRemaining > 0) {
          const nextRefreshFormatted = this.formatAbsoluteTime(this.jwtTokenData.expiresAt - TOKEN_REFRESH_THRESHOLD_SECONDS * 1000);
          console.log(`[Login Check] 📊 Periodic status check - Credential remaining: ${timeRemainingFormatted} (until ${expiresAtFormatted}), next renewal: ${nextRefreshFormatted}`);
        } else {
          console.log(`[Login Check] ⚠️  Periodic status check - Credential expired at: ${expiresAtFormatted}`);
        }
      }
    }, 10 * 60 * 1000); // 每10分钟检查一次
  }

  /**
   * 获取单例实例
   */
  static getInstance(): ProxyAuthManager {
    if (!ProxyAuthManager.instance) {
      ProxyAuthManager.instance = new ProxyAuthManager();
    }
    return ProxyAuthManager.instance;
  }

  /**
   * 加载本地用户信息
   */
  private loadUserInfo(): void {
    try {
      if (fs.existsSync(this.userInfoFilePath)) {
        const data = fs.readFileSync(this.userInfoFilePath, 'utf8');
        this.userInfo = JSON.parse(data);
        // 简单的email掩码函数
        const maskEmail = (email: string) => {
          if (!email || !email.includes('@')) return email;
          const [local, domain] = email.split('@');
          if (local.length <= 2) return email;
          const masked = local[0] + '*'.repeat(local.length - 2) + local[local.length - 1];
          return `${masked}@${domain}`;
        };

        // 用户信息已加载，不再打印欢迎信息（由 WelcomeScreen 组件显示）
      }
    } catch (error) {
      console.warn('[Login Check] Failed to load user info from local file:', error);
      this.userInfo = null;
    }
  }

  /**
   * 保存用户信息到本地
   */
  private saveUserInfo(): void {
    try {
      // 确保目录存在
      const dir = path.dirname(this.userInfoFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.userInfoFilePath, JSON.stringify(this.userInfo, null, 2));
      console.log('[Login Check] User info saved to local file');
    } catch (error) {
      console.error('[Login Check] Failed to save user info:', error);
    }
  }

  /**
   * 加载JWT token
   */
  private loadJwtToken(): void {
    try {
      if (fs.existsSync(this.jwtTokenFilePath)) {
        const data = fs.readFileSync(this.jwtTokenFilePath, 'utf8');
        this.jwtTokenData = JSON.parse(data) as JWTTokenData;

        const now = Date.now();

        // 检查token是否过期
        if (this.isTokenExpired()) {
          this.jwtTokenData = null;
        } else {
          // 简化：只在即将过期时提醒
          if (this.isTokenNearExpiry(300)) {
            console.log(`⚠️  Access credential expiring soon, auto-renewal in progress`);
          }
        }
      } else {
        console.log('[Login Check] No stored access credential found, authentication required');
      }
    } catch (error) {
      console.warn('[Login Check] Failed to load access credential from local file:', error);
      this.jwtTokenData = null;
    }
  }

  /**
   * 保存JWT token到本地
   */
  private saveJwtToken(): void {
    try {
      if (!this.jwtTokenData) {
        return;
      }

      // 确保目录存在
      const dir = path.dirname(this.jwtTokenFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.jwtTokenFilePath, JSON.stringify(this.jwtTokenData, null, 2));
      console.log('[Login Check] Access credential data saved to local file');
    } catch (error) {
      console.error('[Login Check] Failed to save access credential:', error);
    }
  }

  /**
   * 加载使用统计
   */
  private loadUsageStats(): void {
    try {
      if (fs.existsSync(this.usageStatsFilePath)) {
        const data = fs.readFileSync(this.usageStatsFilePath, 'utf8');
        this.usageStats = JSON.parse(data);
      }
    } catch (error) {
      console.warn('[Login Check] Failed to load usage stats from local file:', error);
      this.usageStats = { totalCreditsConsumed: 0, lastUpdated: new Date().toISOString() };
    }
  }

  /**
   * 保存使用统计到本地
   */
  private saveUsageStats(): void {
    try {
      // 确保目录存在
      const dir = path.dirname(this.usageStatsFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.usageStatsFilePath, JSON.stringify(this.usageStats, null, 2));
      console.log('[Login Check] Usage stats saved to local file');
    } catch (error) {
      console.error('[Login Check] Failed to save usage stats:', error);
    }
  }

  /**
   * 更新使用统计
   * @param credits 消耗的积分
   */
  updateUsageStats(credits: number): void {
    if (credits <= 0) return;

    this.usageStats.totalCreditsConsumed += credits;
    this.usageStats.lastUpdated = new Date().toISOString();
    this.saveUsageStats();
    console.log(`[Usage Stats] Updated total credits consumed: ${this.usageStats.totalCreditsConsumed} (+${credits})`);
  }

  /**
   * 获取使用统计
   */
  getUsageStats(): UsageStats {
    return { ...this.usageStats };
  }

  /**
   * 启动时检查 token 状态
   * 用于 CLI 启动预检查，提前发现过期 token 并提示用户
   * @returns token 状态信息
   */
  checkStartupTokenStatus(): {
    hasToken: boolean;
    isExpired: boolean;
    expiresAt: number | null;
    hasRefreshToken: boolean;
  } {
    if (!this.jwtTokenData) {
      return {
        hasToken: false,
        isExpired: true,
        expiresAt: null,
        hasRefreshToken: false
      };
    }

    const now = Date.now();
    const isExpired = now >= this.jwtTokenData.expiresAt;

    return {
      hasToken: true,
      isExpired,
      expiresAt: this.jwtTokenData.expiresAt,
      hasRefreshToken: !!this.jwtTokenData.refreshToken
    };
  }

  /**
   * 配置代理认证
   */
  configure(config: Partial<ProxyAuthConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.userInfo) {
      this.userInfo = config.userInfo;
      this.saveUserInfo();
      console.log(`[Login Check] User info configured: ${config.userInfo.name}`);
    }

    if (config.proxyServerUrl) {
      console.log(`[Login Check] Proxy server URL: ${config.proxyServerUrl}`);
    }

    if (config.cliVersion) {
      this.cliVersion = config.cliVersion;
      console.log(`[Login Check] CLI version set: ${config.cliVersion}`);
    }
  }

  /**
   * 设置用户信息
   */
  setUserInfo(userInfo: FeishuUserInfo): void {
    this.userInfo = userInfo;
    this.saveUserInfo();
    console.log(`[Login Check] User info updated: ${userInfo.name} (${userInfo.email || userInfo.openId || 'N/A'})`);
  }

  /**
   * 设置CLI版本号
   */
  setCliVersion(version: string): void {
    this.cliVersion = version;
    console.log(`[Login Check] CLI version updated: ${version}`);
  }

  /**
   * 设置JWT token
   */
  setJwtToken(token: string): void {
    const now = Date.now();
    this.jwtTokenData = {
      accessToken: token,
      expiresIn: 900, // 默认15分钟
      expiresAt: now + 900 * 1000,
      savedAt: new Date().toISOString()
    };
    this.saveJwtToken();
    console.log('[Login Check] Access credential updated');
  }

  /**
   * 设置JWT token数据（包含refresh token）
   */
  setJwtTokenData(tokenData: {
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
  }): void {
    const now = Date.now();
    const expiresAt = now + tokenData.expiresIn * 1000;
    this.jwtTokenData = {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresIn: tokenData.expiresIn,
      expiresAt: expiresAt,
      savedAt: new Date().toISOString()
    };
    this.saveJwtToken();

    const timeRemainingFormatted = this.formatTimeRemaining(tokenData.expiresIn * 1000);
    const expiresAtFormatted = this.formatAbsoluteTime(expiresAt);
    const nextRefreshFormatted = this.formatAbsoluteTime(expiresAt - TOKEN_REFRESH_THRESHOLD_SECONDS * 1000);
    const hasRefreshToken = !!tokenData.refreshToken;
    const autoRenewal = hasRefreshToken ? ', will auto-renew' : ', manual login required';

    console.log(`[Login Check] Access credential updated - valid for: ${timeRemainingFormatted} (until ${expiresAtFormatted}), next renewal: ${nextRefreshFormatted}${autoRenewal}`);
  }

  /**
   * 获取当前的access token
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.jwtTokenData) {
      console.log('[Login Check] No access credential available, authentication required');
      return null;
    }

    const now = Date.now();
    const timeRemaining = this.jwtTokenData.expiresAt - now;
    const timeRemainingFormatted = this.formatTimeRemaining(timeRemaining);
    const nextRefreshTime = this.jwtTokenData.expiresAt - TOKEN_REFRESH_THRESHOLD_SECONDS * 1000;
    const nextRefreshFormatted = this.formatAbsoluteTime(nextRefreshTime);

    // 检查token是否即将过期（提前3天刷新的主要检查）
    if (this.isTokenNearExpiry()) {
      console.log(`[Login Check] Access credential expiring soon (remaining: ${timeRemainingFormatted}), starting auto-renewal...`);
      try {
        const newToken = await this.refreshAccessToken();
        return newToken;
      } catch (error) {
        console.error('[Login Check] Credential renewal failed:', error);
        return null;
      }
    }

    return this.jwtTokenData.accessToken;
  }

  /**
   * 检查token是否过期
   */
  private isTokenExpired(): boolean {
    if (!this.jwtTokenData) {
      return true;
    }
    return Date.now() >= this.jwtTokenData.expiresAt;
  }

  /**
   * 检查token是否即将过期
   * 阈值为 3 天（259200 秒）- 针对10+天有效期的token提前3天renew
   * 符合业界最佳实践：长期token应提前足够的时间renew，避免用户离线后token过期
   */
  private isTokenNearExpiry(thresholdSeconds: number = TOKEN_REFRESH_THRESHOLD_SECONDS): boolean {
    if (!this.jwtTokenData) {
      return true;
    }
    const timeToExpiry = this.jwtTokenData.expiresAt - Date.now();
    const isNearExpiry = timeToExpiry <= (thresholdSeconds * 1000);

    // 调试日志：显示详细的时间计算
    if (isNearExpiry) {
      const timeRemainingFormatted = this.formatTimeRemaining(timeToExpiry);
      console.log(`[Login Check] Credential expiry check: ${timeRemainingFormatted} remaining <= ${thresholdSeconds}s threshold, renewal needed: ${isNearExpiry}`);
    }

    return isNearExpiry;
  }

  /**
   * 刷新access token
   */
  async refreshAccessToken(): Promise<string> {
    // 防止并发刷新
    if (this.refreshPromise) {
      return await this.refreshPromise;
    }

    this.refreshPromise = this.performTokenRefresh();

    try {
      const newToken = await this.refreshPromise;
      return newToken;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * 执行token刷新
   */
  private async performTokenRefresh(): Promise<string> {
    if (!this.jwtTokenData?.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      console.log('[Login Check] Refreshing access credential...');

      const response = await fetch(`${this.config.proxyServerUrl}/auth/jwt/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DeepCode CLI ProxyAuthManager'
        },
        body: JSON.stringify({
          refreshToken: this.jwtTokenData.refreshToken
        })
      });

      if (!response.ok) {
        if (response.status === 401) {
          // 刷新令牌无效，清除所有令牌
          this.clearTokens();
          throw new Error('Refresh credential expired or invalid - authentication required');
        }

        const errorText = await response.text();
        throw new Error(`Credential refresh failed (${response.status}): ${errorText}`);
      }

      const result = await response.json();

      if (!result.success || !result.data?.accessToken) {
        throw new Error('Invalid refresh response from server');
      }

      // 更新token数据
      const now = Date.now();
      const hasNewRefreshToken = !!result.data.refreshToken;
      this.jwtTokenData = {
        accessToken: result.data.accessToken,
        refreshToken: result.data.refreshToken || this.jwtTokenData.refreshToken, // 优先使用服务端返回的新refresh token
        expiresIn: result.data.expiresIn || 900,
        expiresAt: now + (result.data.expiresIn || 900) * 1000,
        savedAt: new Date().toISOString()
      };

      this.saveJwtToken();

      const newTimeRemainingFormatted = this.formatTimeRemaining((result.data.expiresIn || 900) * 1000);
      const newExpiresAtFormatted = this.formatAbsoluteTime(this.jwtTokenData.expiresAt);
      const newNextRefreshFormatted = this.formatAbsoluteTime(this.jwtTokenData.expiresAt - TOKEN_REFRESH_THRESHOLD_SECONDS * 1000);

      console.log(`[Login Check] ✅ Credential renewed successfully - valid for: ${newTimeRemainingFormatted} (until ${newExpiresAtFormatted}), next renewal: ${newNextRefreshFormatted}${hasNewRefreshToken ? ' (refresh credential updated)' : ' (reusing existing refresh credential)'}`);
      return this.jwtTokenData.accessToken;
    } catch (error) {
      console.error('[Login Check] Credential refresh error:', error);
      throw error;
    }
  }

  /**
   * 清除所有token
   */
  private clearTokens(): void {
    this.jwtTokenData = null;
    try {
      if (fs.existsSync(this.jwtTokenFilePath)) {
        fs.unlinkSync(this.jwtTokenFilePath);
      }
    } catch (error) {
      console.warn('[Login Check] Failed to delete access credential file:', error);
    }
  }

  /**
   * 获取代理服务器 URL
   */
  getProxyServerUrl(): string {
    return this.config.proxyServerUrl;
  }

  /**
   * 获取用户请求头信息（用于API调用）
   * 使用JWT token认证
   */
  async getUserHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    const cliVersion = this.getCliVersion();

    if (token) {
      return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Client-Version': cliVersion,
        'User-Agent': `DeepVCode-CLI/${cliVersion}`
      };
    }

    return {
      'X-Client-Version': cliVersion,
      'User-Agent': `DeepVCode-CLI/${cliVersion}`
    };
  }

  /**
   * 同步获取用户请求头（兼容性方法）
   * 注意：此方法不会自动刷新token，可能返回过期的token
   */
  getUserHeadersSync(): Record<string, string> {
    const cliVersion = this.getCliVersion();

    // 使用当前的token（不进行刷新检查）
    if (this.jwtTokenData?.accessToken) {
      return {
        'Authorization': `Bearer ${this.jwtTokenData.accessToken}`,
        'Content-Type': 'application/json',
        'X-Client-Version': cliVersion,
        'User-Agent': `DeepVCode-CLI/${cliVersion}`
      };
    }

    return {
      'X-Client-Version': cliVersion,
      'User-Agent': `DeepVCode-CLI/${cliVersion}`
    };
  }

  /**
   * 获取缓存的用户信息
   */
  getUserInfo(): FeishuUserInfo | null {
    return this.userInfo;
  }

  /**
   * 检查是否已配置认证
   */
  isConfigured(): boolean {
    return !!this.userInfo;
  }

  /**
   * 获取配置状态信息
   */
  getStatus(): {
    configured: boolean;
    proxyServerUrl: string;
    hasUserInfo: boolean;
    userInfo: FeishuUserInfo | null;
  } {
    return {
      configured: this.isConfigured(),
      proxyServerUrl: this.config.proxyServerUrl,
      hasUserInfo: !!this.userInfo,
      userInfo: this.userInfo,
    };
  }

  /**
   * 清除认证信息及资源
   * ⚠️ 关键：清理 periodicStatusCheckIntervalId 防止内存泄漏
   */
  clear(): void {
    this.userInfo = null;
    this.jwtTokenData = null;

    // 🔑 清理定期检查的 interval
    if (this.periodicStatusCheckIntervalId !== null) {
      clearInterval(this.periodicStatusCheckIntervalId);
      this.periodicStatusCheckIntervalId = null;
    }

    // 删除本地用户信息文件
    try {
      if (fs.existsSync(this.userInfoFilePath)) {
        fs.unlinkSync(this.userInfoFilePath);
      }
    } catch (error) {
      console.warn('[Login Check] Failed to delete user info file:', error);
    }

    // 删除JWT token文件
    try {
      if (fs.existsSync(this.jwtTokenFilePath)) {
        fs.unlinkSync(this.jwtTokenFilePath);
      }
    } catch (error) {
      console.warn('[Login Check] Failed to delete access credential file:', error);
    }

    console.log('[Login Check] Authentication cleared');
  }
}

/**
 * 全局代理认证管理器实例
 */
export const proxyAuthManager = ProxyAuthManager.getInstance();

/**
 * 便捷函数：配置代理认证
 */
export function configureProxyAuth(config: Partial<ProxyAuthConfig>): void {
  proxyAuthManager.configure(config);
}

/**
 * 便捷函数：设置用户信息
 */
export function setUserInfo(userInfo: FeishuUserInfo): void {
  proxyAuthManager.setUserInfo(userInfo);
}

/**
 * 便捷函数：设置CLI版本号
 */
export function setCliVersion(version: string): void {
  proxyAuthManager.setCliVersion(version);
}

/**
 * 便捷函数：获取用户请求头（异步）
 */
export async function getUserHeaders(): Promise<Record<string, string>> {
  return await proxyAuthManager.getUserHeaders();
}


/**
 * 便捷函数：获取认证状态
 */
export function getProxyAuthStatus(): ReturnType<ProxyAuthManager['getStatus']> {
  return proxyAuthManager.getStatus();
}
