/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * 代理服务器配置模块
 * 硬编码代理服务器地址，用户无需配置任何环境变量
 */

export interface ProxyServerConfig {
  url: string;
  name: string;
  region: string;
  status: 'active' | 'maintenance' | 'deprecated';
}

/**
 * 获取代理服务器列表（按优先级排序）
 * 用户无需配置，系统自动选择可用的服务器
 * 动态获取以确保环境变量正确加载
 */
export function getProxyServers(): ProxyServerConfig[] {
  return [
    {
      url: process.env.DEEPX_SERVER_URL || 'https://api-code.deepvlab.ai',
      name: 'Primary Development Server',
      region: 'default',
      status: 'active',
    },
    // 可以在这里添加更多备用服务器
    // {
    //   url: 'https://proxy.your-domain.com',
    //   name: 'Production Server',
    //   region: 'production',
    //   status: 'active',
    // },
  ];
}

/**
 * 获取可用的代理服务器URL
 * 按优先级返回第一个活跃的服务器
 */
export function getActiveProxyServerUrl(): string {
  const proxyServers = getProxyServers();
  const activeServer = proxyServers.find(server => server.status === 'active');

  if (!activeServer) {
    throw new Error(
      'No active proxy server available. Please contact support.'
    );
  }

  return activeServer.url;
}

/**
 * 获取所有可用的代理服务器
 */
export function getAvailableProxyServers(): ProxyServerConfig[] {
  const proxyServers = getProxyServers();
  return proxyServers.filter(server => server.status === 'active');
}

/**
 * 检查是否有可用的代理服务器
 */
export function hasAvailableProxyServer(): boolean {
  const proxyServers = getProxyServers();
  return proxyServers.some(server => server.status === 'active');
}

/**
 * 获取代理服务器配置信息
 */
export function getProxyServerInfo(url: string): ProxyServerConfig | undefined {
  const proxyServers = getProxyServers();
  return proxyServers.find(server => server.url === url);
}

/**
 * 默认的代理服务器配置
 * 这个配置会在运行时自动使用，用户无需手动配置
 */
export const DEFAULT_PROXY_CONFIG = {
  serverUrl: getActiveProxyServerUrl(),
  timeout: 200000, // 200秒超时
  retryAttempts: 3,
  retryDelay: 1000, // 1秒重试延迟
};