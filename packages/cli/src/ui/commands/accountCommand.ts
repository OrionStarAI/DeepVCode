/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand, SlashCommandActionReturn, CommandContext, MessageActionReturn } from './types.js';
import { ProxyAuthManager } from 'deepv-code-core';
import open from 'open';
import { t, tp } from '../utils/i18n.js';

interface TempCodeResponse {
  success: boolean;
  code?: string;
  expiresAt?: number;
  expiresIn?: number;
  error?: string;
}

/**
 * 获取临时登录代码并打开用户信息页面
 */
async function generateTempCodeAndOpenUserInfo(context?: CommandContext): Promise<void> {
  try {
    // 使用ProxyAuthManager获取当前的JWT token
    let accessToken: string | null = null;

    try {
      const proxyAuthManager = ProxyAuthManager.getInstance();
      accessToken = await proxyAuthManager.getAccessToken();
      if (process.env.DEBUG || process.env.FILE_DEBUG) {
        console.error('🔍 从ProxyAuthManager获取到访问令牌');
      }
    } catch (error) {
      if (process.env.DEBUG || process.env.FILE_DEBUG) {
        console.error('🔍 ProxyAuthManager获取token失败:', error);
      }
    }
    if (!accessToken) {
      console.error('❌ 未找到有效的认证令牌，请先登录');
      console.error('💡 请确保已通过交互模式完成登录认证');
      return;
    }
    console.log('🔄 正在生成临时登录代码...');

    // 获取服务器端点
    const serverEndpoint = process.env.DEEPX_SERVER_URL || 'https://api-code.deepvlab.ai';

    // 请求生成临时代码
    const response = await fetch(`${serverEndpoint}/auth/temp-code/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'DeepCode CLI',
      },
      body: JSON.stringify({
        expiresIn: 600, // 10分钟有效期
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ 生成临时代码失败 (${response.status}): ${errorText}`);
      return;
    }

    const result: TempCodeResponse = await response.json();

    if (!result.success || !result.code) {
      console.error(`❌ 生成临时代码失败: ${result.error || '未知错误'}`);
      return;
    }

    // 构建登录URL
    const loginUrl = `https://dvcode.deepvlab.ai/token-login?code=${result.code}&redirect=/userinfo&method=dvcode`;

    console.log('✅ 临时登录代码生成成功');
    console.log(`⏰ 代码有效期: ${result.expiresIn}秒`);
    console.log('🌐 正在为您打开浏览器...');

    // 打开浏览器
    await open(loginUrl);

    console.log('✅ 浏览器已打开，请查看用户信息页面');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ 操作失败:', errorMessage);

    // 增强错误日志，方便调试
    if (process.env.DEBUG || process.env.FILE_DEBUG) {
      console.error('🔍 详细错误信息:', error);
      const endpoint = process.env.DEEPX_SERVER_URL || 'https://api-code.deepvlab.ai';
      console.error('🌐 使用的服务器端点:', endpoint);
    }

    // 重新抛出错误，让UI能显示错误消息
    throw new Error(`Account命令执行失败: ${errorMessage}`);
  }
}

export const accountCommand: SlashCommand = {
  name: 'account',
  description: t('command.account.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context, _args): Promise<SlashCommandActionReturn> => {
    console.log('🚀 Account命令开始执行...');

    // 显示初始提示
    context.ui.addItem({
      type: 'info',
      text: t('command.account.opening_browser'),
    }, Date.now());

    try {
      await generateTempCodeAndOpenUserInfo(context);
      console.log('✅ Account命令执行完成');

      return {
        type: 'message',
        messageType: 'info',
        content: t('command.account.success'),
      };
    } catch (error) {
      console.error('❌ Account命令执行失败:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        type: 'message',
        messageType: 'error',
        content: tp('command.account.error', { error: errorMsg }),
      };
    }
  },
};