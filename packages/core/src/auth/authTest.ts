/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * 认证功能测试脚本
 * 测试JWT自动刷新和认证失败跳转功能
 */

import { ProxyAuthManager } from '../core/proxyAuth.js';
import { AuthenticatedHttpClient } from './authenticatedHttpClient.js';
import { getDefaultAuthHandler } from './authNavigator.js';

export async function testAuthRefresh() {
  console.log('🧪 开始测试JWT自动刷新功能...\n');

  const authManager = ProxyAuthManager.getInstance();
  
  // 测试设置过期的JWT token
  console.log('1. 设置一个即将过期的JWT token...');
  authManager.setJwtTokenData({
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    expiresIn: 5 // 5秒后过期
  });

  // 创建HTTP客户端
  const authHandler = getDefaultAuthHandler({
    authUrl: '/auth',
    autoOpenBrowser: false,
    customAuthHandler: async () => {
      console.log('🔄 [测试] 模拟认证处理器被调用');
    }
  });

  const httpClient = new AuthenticatedHttpClient(
    'https://code.deepvlab.ai',
    authManager,
    authHandler
  );

  // 等待token过期
  console.log('2. 等待token过期...');
  await new Promise(resolve => setTimeout(resolve, 6000));

  // 尝试获取access token（应该触发自动刷新）
  console.log('3. 尝试获取access token（应该触发自动刷新）...');
  try {
    const token = await authManager.getAccessToken();
    console.log('✅ 获取token成功:', token ? '有效token' : '无token');
  } catch (error) {
    console.log('❌ 获取token失败:', error instanceof Error ? error.message : String(error));
  }

  // 测试HTTP请求
  console.log('4. 测试HTTP请求...');
  try {
    const response = await httpClient.get('/api/test');
    console.log('✅ HTTP请求成功');
  } catch (error) {
    console.log('❌ HTTP请求失败:', error instanceof Error ? error.message : String(error));
  }

  console.log('\n🧪 测试完成');
}

export async function testTokenStatus() {
  console.log('🔍 检查当前token状态...\n');

  const authManager = ProxyAuthManager.getInstance();
  const status = authManager.getStatus();

  console.log('认证状态:', {
    configured: status.configured,
    hasUserInfo: status.hasUserInfo,
    proxyServerUrl: status.proxyServerUrl,
    userInfo: status.userInfo ? {
      name: status.userInfo.name,
      openId: status.userInfo.openId
    } : null
  });

  try {
    const token = await authManager.getAccessToken();
    console.log('当前token状态:', token ? '有效' : '无效');
  } catch (error) {
    console.log('获取token失败:', error instanceof Error ? error.message : String(error));
  }
}

export async function clearAuthData() {
  console.log('🧹 清除认证数据...');
  const authManager = ProxyAuthManager.getInstance();
  authManager.clear();
  console.log('✅ 认证数据已清除');
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];

  switch (command) {
    case 'test':
      await testAuthRefresh();
      break;
    case 'status':
      await testTokenStatus();
      break;
    case 'clear':
      await clearAuthData();
      break;
    default:
      console.log('使用方法:');
      console.log('  npm run auth-test test   - 测试自动刷新功能');
      console.log('  npm run auth-test status - 检查认证状态');
      console.log('  npm run auth-test clear  - 清除认证数据');
  }
}
