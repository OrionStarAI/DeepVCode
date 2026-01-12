/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProxyAuthManager } from 'deepv-code-core';

/**
 * 用户积分信息
 */
export interface UserCreditsInfo {
  totalCredits: number;        // 总积分
  usedCredits: number;          // 已使用积分
  remainingCredits: number;     // 剩余积分
  usagePercentage: number;      // 使用比例 (0-100)
}

/**
 * 积分服务类
 * 负责异步获取和管理用户积分信息
 *
 * 设计特点：
 * - 完全异步，不阻塞 UI 启动
 * - 5 秒超时保护，接口快速响应无需等待更长
 * - 缓存 1 分钟内的请求结果
 * - 去重处理：多个请求会共用同一个 fetch 操作
 *
 * 调用示例：
 * ```
 * const service = getCreditsService();
 * const info = await service.getCreditsInfo(); // 异步，非阻塞
 * if (info) {
 *   // 显示积分信息
 * }
 * ```
 */
class CreditsService {
  private creditsInfo: UserCreditsInfo | null = null;
  private fetchPromise: Promise<UserCreditsInfo | null> | null = null;
  private lastFetchTime: number = 0;
  private readonly CACHE_DURATION = 60000; // 缓存 1 分钟

  /**
   * 获取用户积分信息（带缓存和超时保护）
   *
   * 特点：
   * - 异步操作，使用 await 时会阻塞但不会影响 UI（取决于调用方）
   * - 5 秒硬超时（足够快速接口响应）
   * - 1 分钟缓存，快速重复调用不会多次请求
   * - 请求去重：同时的多个调用会共用一个请求
   *
   * @param forceRefresh 是否强制刷新（跳过缓存）
   *   - false（默认）：如果缓存未过期（1分钟内），返回缓存数据
   *   - true：无条件从服务器获取最新数据，用于退出时获取最新积分
   * @returns 积分信息或 null（失败/超时时）
   */
  async getCreditsInfo(forceRefresh: boolean = false): Promise<UserCreditsInfo | null> {
    const now = Date.now();

    // 如果有缓存且未过期，直接返回
    if (!forceRefresh && this.creditsInfo && (now - this.lastFetchTime < this.CACHE_DURATION)) {
      return this.creditsInfo;
    }

    // 如果已经有正在进行的请求，返回该Promise
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    // 发起新的请求
    this.fetchPromise = this.fetchCreditsFromServer();

    try {
      const result = await this.fetchPromise;
      this.fetchPromise = null;
      return result;
    } catch (error) {
      this.fetchPromise = null;
      throw error;
    }
  }

  /**
   * 从服务器获取积分信息
   */
  private async fetchCreditsFromServer(): Promise<UserCreditsInfo | null> {
    // 使用 AbortController 实现超时机制 (5 秒超时)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const authManager = ProxyAuthManager.getInstance();
      const token = await authManager.getAccessToken();
      const proxyServerUrl = authManager.getProxyServerUrl();

      if (!token) {
        return null;
      }

      const response = await fetch(`${proxyServerUrl}/web-api/user/stats`, {
        method: 'GET',
        headers: {
          'accept': 'application/json, text/plain, */*',
          'authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'DeepVCode-CLI'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`⚠️ Failed to fetch credits info: ${response.status} ${response.statusText}`);
        return null;
      }

      const result = await response.json() as any;

      if (!result.success || !result.data) {
        console.warn('⚠️ Invalid credits API response');
        return null;
      }

      // 解析积分数据
      const totalCredits = result.data.totalCreditsLimits || 0;
      const usedCredits = result.data.creditsUsage?.totalCreditsUsed || 0;
      const remainingCredits = totalCredits - usedCredits;
      const usagePercentage = totalCredits > 0 ? (usedCredits / totalCredits) * 100 : 0;

      const creditsInfo: UserCreditsInfo = {
        totalCredits,
        usedCredits,
        remainingCredits,
        usagePercentage
      };

      // 更新缓存
      this.creditsInfo = creditsInfo;
      this.lastFetchTime = Date.now();

      return creditsInfo;
    } catch (error) {
      clearTimeout(timeoutId);

      // 超时错误特殊处理
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('⚠️ Credits fetch timeout after 10s');
        return null;
      }

      console.warn('⚠️ Error fetching credits info:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  /**
   * 检查积分是否低于指定百分比
   */
  isCreditsLow(threshold: number = 5): boolean {
    if (!this.creditsInfo) {
      return false;
    }

    const remainingPercentage = 100 - this.creditsInfo.usagePercentage;
    return remainingPercentage < threshold;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.creditsInfo = null;
    this.lastFetchTime = 0;
  }
}

// 单例实例
let creditsServiceInstance: CreditsService | null = null;

/**
 * 获取积分服务单例
 */
export function getCreditsService(): CreditsService {
  if (!creditsServiceInstance) {
    creditsServiceInstance = new CreditsService();
  }
  return creditsServiceInstance;
}

/**
 * 格式化积分数字（添加千位分隔符）
 */
export function formatCredits(credits: number): string {
  return credits.toLocaleString('en-US');
}
