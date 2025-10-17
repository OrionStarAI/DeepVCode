/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AuthType,
  UserTierId,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  isProQuotaExceededError,
  isGenericQuotaExceededError,
  isDeepXQuotaError,
  getDeepXQuotaErrorMessage,
  isApiError,
  isStructuredError,
} from 'deepv-code-core';
import { isChineseLocale } from './i18n.js';

// Free Tier message functions
const getRateLimitErrorMessageGoogleFree = (
  fallbackModel: string = DEFAULT_GEMINI_FLASH_MODEL,
) =>
  `\nPossible quota limitations in place or slow response times detected. Switching to the ${fallbackModel} model for the rest of this session.`;

const getRateLimitErrorMessageGoogleProQuotaFree = (
  currentModel: string = DEFAULT_GEMINI_MODEL,
  fallbackModel: string = DEFAULT_GEMINI_FLASH_MODEL,
) =>
  `\nYou have reached your daily ${currentModel} quota limit. You will be switched to the ${fallbackModel} model for the rest of this session. To increase your limits, upgrade to a Gemini Code Assist Standard or Enterprise plan with higher limits at https://goo.gle/set-up-gemini-code-assist, or use /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`;

const getRateLimitErrorMessageGoogleGenericQuotaFree = () =>
  `\nYou have reached your daily quota limit. To increase your limits, upgrade to a Gemini Code Assist Standard or Enterprise plan with higher limits at https://goo.gle/set-up-gemini-code-assist, or use /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`;

// Legacy/Standard Tier message functions
const getRateLimitErrorMessageGooglePaid = (
  fallbackModel: string = DEFAULT_GEMINI_FLASH_MODEL,
) =>
  `\nPossible quota limitations in place or slow response times detected. Switching to the ${fallbackModel} model for the rest of this session. We appreciate you for choosing Gemini Code Assist and the DeepV Code CLI.`;

const getRateLimitErrorMessageGoogleProQuotaPaid = (
  currentModel: string = DEFAULT_GEMINI_MODEL,
  fallbackModel: string = DEFAULT_GEMINI_FLASH_MODEL,
) =>
  `\nYou have reached your daily ${currentModel} quota limit. You will be switched to the ${fallbackModel} model for the rest of this session. We appreciate you for choosing Gemini Code Assist and the DeepV Code CLI. To continue accessing the ${currentModel} model today, consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`;

const getRateLimitErrorMessageGoogleGenericQuotaPaid = (
  currentModel: string = DEFAULT_GEMINI_MODEL,
) =>
  `\nYou have reached your daily quota limit. We appreciate you for choosing Gemini Code Assist and the DeepV Code CLI. To continue accessing the ${currentModel} model today, consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`;
const RATE_LIMIT_ERROR_MESSAGE_USE_GEMINI =
  '\nPlease wait and try again later. To increase your limits, request a quota increase through AI Studio, or switch to another /auth method';
const RATE_LIMIT_ERROR_MESSAGE_VERTEX =
  '\nPlease wait and try again later. To increase your limits, request a quota increase through Vertex, or switch to another /auth method';
const getRateLimitErrorMessageDefault = (
  fallbackModel: string = DEFAULT_GEMINI_FLASH_MODEL,
) =>
  `\nPossible quota limitations in place or slow response times detected. Switching to the ${fallbackModel} model for the rest of this session.`;

function getRateLimitMessage(
  authType?: AuthType,
  error?: unknown,
  userTier?: UserTierId,
  currentModel?: string,
  fallbackModel?: string,
): string {
  switch (authType) {
    case AuthType.USE_CHEETH_OA: {
      // Determine if user is on a paid tier (Legacy or Standard) - default to FREE if not specified
      const isPaidTier =
        userTier === UserTierId.LEGACY || userTier === UserTierId.STANDARD;

      if (isProQuotaExceededError(error)) {
        return isPaidTier
          ? getRateLimitErrorMessageGoogleProQuotaPaid(
              currentModel || DEFAULT_GEMINI_MODEL,
              fallbackModel,
            )
          : getRateLimitErrorMessageGoogleProQuotaFree(
              currentModel || DEFAULT_GEMINI_MODEL,
              fallbackModel,
            );
      } else if (isGenericQuotaExceededError(error)) {
        return isPaidTier
          ? getRateLimitErrorMessageGoogleGenericQuotaPaid(
              currentModel || DEFAULT_GEMINI_MODEL,
            )
          : getRateLimitErrorMessageGoogleGenericQuotaFree();
      } else {
        return isPaidTier
          ? getRateLimitErrorMessageGooglePaid(fallbackModel)
          : getRateLimitErrorMessageGoogleFree(fallbackModel);
      }
    }
    // Other auth types no longer supported
    default:
      return getRateLimitErrorMessageDefault(fallbackModel);
  }
}

// 检测是否为中文环境的辅助函数 - 使用与CLI主体一致的检测逻辑
const isChineseEnvironment = (): boolean => {
  // 直接使用CLI主体的语言检测函数，保持一致性
  return isChineseLocale();
};

// 网络连接失败错误检测函数
function isNetworkConnectionError(error: unknown): boolean {
  // 检查字符串错误消息
  if (typeof error === 'string') {
    return error.includes('fetch failed') ||
           error.includes('ECONNREFUSED') ||
           error.includes('network error') ||
           error.includes('Network request failed');
  }

  // 检查结构化错误
  if (isStructuredError(error)) {
    return error.message.includes('fetch failed') ||
           error.message.includes('ECONNREFUSED') ||
           error.message.includes('network error');
  }

  return false;
}

// 生成网络连接失败友好错误消息
function getNetworkConnectionFriendlyMessage(): string {
  const isChinese = isChineseEnvironment();

  if (isChinese) {
    return `🌐 网络连接失败\n💡 建议：检查您的代理设置或更换质量较好的网络节点`;
  } else {
    return `🌐 Network Connection Failed\n💡 Suggestion: Check your proxy settings or switch to a better network`;
  }
}

// 地区屏蔽错误检测函数
function isRegionBlockedError(error: unknown): boolean {
  // 检查字符串错误消息
  if (typeof error === 'string') {
    return error.includes('REGION_BLOCKED_451') ||
           error.includes('REGION_BLOCKED') ||
           (error.includes('451') && error.toLowerCase().includes('region'));
  }

  // 检查结构化错误
  if (isStructuredError(error)) {
    return error.status === 451 ||
           error.message.includes('REGION_BLOCKED');
  }

  return false;
}

// 生成地区屏蔽友好错误消息
function getRegionBlockedFriendlyMessage(error: unknown): string {
  const isChinese = isChineseEnvironment();

  // 尝试从错误中提取服务端返回的详细消息
  let serverMessage = '';
  try {
    if (typeof error === 'string') {
      // 尝试解析 JSON
      const jsonMatch = error.match(/\{[^}]*"message"[^}]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        serverMessage = parsed.message || '';
      }
    }
  } catch (_e) {
    // 解析失败，使用默认消息
  }

  if (isChinese) {
    return `─────────────────────────────────────────────────────
🌍 地区访问受限 (451)

${serverMessage || '当前网络（中国大陆）暂不支持访问 DeepV Code 服务。'}

我们正在努力扩大服务覆盖范围，感谢您的支持！

如果您认为我们的判断不正确，请检查您当前网络设置或反馈问题。

🔗 获取帮助：https://dvcode.deepvlab.ai/
─────────────────────────────────────────────────────`;
  } else {
    return `─────────────────────────────────────────────────────
🌍 Region Access Restricted (451)

${serverMessage || 'DeepV Code service is not available in your current region.'}

We are expanding service coverage. Thank you for your support!

If you believe this is an error, please check your network settings or report the issue.

🔗 Get help: https://dvcode.deepvlab.ai/
─────────────────────────────────────────────────────`;
  }
}

// 403禁止访问错误检测函数
function is403ForbiddenError(error: unknown): boolean {
  // 检查字符串错误消息
  if (typeof error === 'string') {
    return error.includes('API request failed (403)') ||
           error.includes('403') && error.toLowerCase().includes('forbidden');
  }

  // 检查结构化错误
  if (isStructuredError(error)) {
    return error.status === 403 ||
           (error.message.includes('403') && error.message.toLowerCase().includes('forbidden'));
  }

  // 检查API错误格式
  if (isApiError(error)) {
    return error.error.code === 403 ||
           error.error.status === 'PERMISSION_DENIED' ||
           error.error.message.toLowerCase().includes('forbidden');
  }

  return false;
}

// 生成403友好错误消息
function get403FriendlyMessage(): string {
  const isChinese = isChineseEnvironment();

  if (isChinese) {
    return `─────────────────────────────────────────────────────
🚫 访问被拒绝 (403 Forbidden)

可能的原因：
• 🔒 账户已被暂停或封禁
• 🌍 当前地区暂不支持此服务
• 🎫 API密钥权限不足或已过期
• 🚫 违反了服务条款

💡 建议解决方案：
• 检查账户状态和权限设置
• 确认当前地区是否支持服务
• 联系技术支持获取帮助
• 或尝试使用其他认证方式 (/auth)

🔗 获取帮助：https://dvcode.deepvlab.ai/
─────────────────────────────────────────────────────`;
  } else {
    return `─────────────────────────────────────────────────────
🚫 Access Forbidden (403)

Possible causes:
• 🔒 Account suspended or banned
• 🌍 Service not available in your region
• 🎫 Insufficient API key permissions or expired
• 🚫 Terms of service violation

💡 Suggested solutions:
• Check your account status and permissions
• Verify if service is available in your region
• Contact technical support for assistance
• Try alternative authentication method (/auth)

🔗 Get help: https://dvcode.deepvlab.ai/
─────────────────────────────────────────────────────`;
  }
}

export function parseAndFormatApiError(
  error: unknown,
  authType?: AuthType,
  userTier?: UserTierId,
  currentModel?: string,
  fallbackModel?: string,
): string {
  // 🆕 最高优先级检查网络连接失败错误 - 显示友好提示
  if (isNetworkConnectionError(error)) {
    return getNetworkConnectionFriendlyMessage();
  }

  // 🆕 最高优先级检查地区屏蔽错误 - 显示友好提示
  if (isRegionBlockedError(error)) {
    return getRegionBlockedFriendlyMessage(error);
  }

  // 🆕 优先检查403禁止访问错误 - 显示友好提示
  if (is403ForbiddenError(error)) {
    return get403FriendlyMessage();
  }

  // 🆕 优先检查DeepX服务端的配额错误 - 显示友好提示
  if (isDeepXQuotaError(error)) {
    const friendlyMessage = getDeepXQuotaErrorMessage(error);
    if (friendlyMessage) {
      return friendlyMessage;
    }
    // 如果没有生成友好消息，使用默认的i18n消息
    const isChinese = isChineseEnvironment();
    return isChinese
      ? '🚫 服务不可用\n💡 请联系管理员检查账户配置\n🔗 升级套餐：https://dvcode.deepvlab.ai/'
      : '🚫 Service unavailable\n💡 Please contact administrator to check account configuration\n🔗 Upgrade: https://dvcode.deepvlab.ai/';
  }

  if (isStructuredError(error)) {
    // 检查451错误（中国IP被拒绝） - 直接显示接口返回内容
    if (error.status === 451) {
      return error.message;
    }

    // 检查403错误
    if (error.status === 403) {
      return get403FriendlyMessage();
    }

    let text = `[API Error: ${error.message}]`;
    if (error.status === 429) {
      text += getRateLimitMessage(
        authType,
        error,
        userTier,
        currentModel,
        fallbackModel,
      );
    }
    return text;
  }

  // The error message might be a string containing a JSON object.
  if (typeof error === 'string') {
    // 检查字符串中的451错误（中国IP被拒绝） - 直接显示内容
    if (error.includes('451')) {
      return error;
    }

    // 检查字符串中的403错误
    if (is403ForbiddenError(error)) {
      return get403FriendlyMessage();
    }

    const jsonStart = error.indexOf('{');
    if (jsonStart === -1) {
      return `[API Error: ${error}]`; // Not a JSON error, return as is.
    }

    const jsonString = error.substring(jsonStart);

    try {
      const parsedError = JSON.parse(jsonString) as unknown;
      if (isApiError(parsedError)) {
        // 检查解析后的API错误是否为451
        if (parsedError.error.code === 451) {
          return parsedError.error.message;
        }

        // 检查解析后的API错误是否为403
        if (parsedError.error.code === 403 || parsedError.error.status === 'PERMISSION_DENIED') {
          return get403FriendlyMessage();
        }

        let finalMessage = parsedError.error.message;
        try {
          // See if the message is a stringified JSON with another error
          const nestedError = JSON.parse(finalMessage) as unknown;
          if (isApiError(nestedError)) {
            finalMessage = nestedError.error.message;
          }
        } catch (_e) {
          // It's not a nested JSON error, so we just use the message as is.
        }
        let text = `[API Error: ${finalMessage} (Status: ${parsedError.error.status})]`;
        if (parsedError.error.code === 429) {
          text += getRateLimitMessage(
            authType,
            parsedError,
            userTier,
            currentModel,
            fallbackModel,
          );
        }
        return text;
      }
    } catch (_e) {
      // Not a valid JSON, fall through and return the original message.
    }
    return `[API Error: ${error}]`;
  }

  return '[API Error: An unknown error occurred.]';
}
