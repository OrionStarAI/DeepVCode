/**
 * User Stats Service
 * 用户积分统计服务
 *
 * 负责从服务器获取用户的积分统计信息
 * 注意：此服务涉及大SQL查询，不应频繁调用
 */

export interface UserStats {
  /** 总额度（估算） */
  totalQuota: number;
  /** 已使用积分 */
  usedCredits: number;
  /** 剩余积分（估算） */
  remainingCredits: number;
  /** 使用百分比 */
  usagePercentage: number;
}

export class UserStatsService {
  private proxyServerUrl: string;
  private cachedStats: UserStats | null = null;
  private lastFetchTime: number = 0;
  private readonly CACHE_DURATION = 60000; // 1分钟缓存

  constructor(proxyServerUrl: string) {
    this.proxyServerUrl = proxyServerUrl;
  }

  /**
   * 获取用户积分统计
   * @param token - JWT认证令牌
   * @param forceRefresh - 是否强制刷新（忽略缓存）
   */
  async getUserStats(token: string, forceRefresh: boolean = false): Promise<UserStats> {
    const now = Date.now();

    // 如果有缓存且未过期，直接返回缓存
    if (!forceRefresh && this.cachedStats && (now - this.lastFetchTime) < this.CACHE_DURATION) {
      return this.cachedStats;
    }

    try {
      const response = await fetch(`${this.proxyServerUrl}/web-api/user/stats`, {
        method: 'GET',
        headers: {
          'accept': 'application/json, text/plain, */*',
          'authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'DeepVCode-VSCode'
        },
        timeout: 10000 // 10秒超时
      } as any);

      if (!response.ok) {
        throw new Error(`Failed to fetch user stats: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // 解析响应数据
      const stats: UserStats = {
        totalQuota: data.totalQuota || 0,
        usedCredits: data.usedCredits || 0,
        remainingCredits: data.remainingCredits || 0,
        usagePercentage: data.usagePercentage || 0
      };

      // 更新缓存
      this.cachedStats = stats;
      this.lastFetchTime = now;

      return stats;
    } catch (error) {
      console.error('Failed to fetch user stats:', error);
      throw error;
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cachedStats = null;
    this.lastFetchTime = 0;
  }

  /**
   * 更新代理服务器URL
   */
  updateProxyServerUrl(url: string): void {
    this.proxyServerUrl = url;
    this.clearCache();
  }
}
