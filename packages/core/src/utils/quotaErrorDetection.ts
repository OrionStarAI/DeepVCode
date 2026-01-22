/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ApiError {
  error: {
    code: number;
    message: string;
    status: string;
    details: unknown[];
  };
}

interface StructuredError {
  message: string;
  status?: number;
}

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    typeof (error as ApiError).error === 'object' &&
    'message' in (error as ApiError).error
  );
}

export function isStructuredError(error: unknown): error is StructuredError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as StructuredError).message === 'string'
  );
}

export function isProQuotaExceededError(error: unknown): boolean {
  // Check for Pro quota exceeded errors by looking for the specific pattern
  // This will match patterns like:
  // - "Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'"
  // - "Quota exceeded for quota metric 'Gemini 2.5-preview Pro Requests'"
  // We use string methods instead of regex to avoid ReDoS vulnerabilities

  const checkMessage = (message: string): boolean =>
    message.includes("Quota exceeded for quota metric 'Gemini") &&
    message.includes("Pro Requests'");

  if (typeof error === 'string') {
    return checkMessage(error);
  }

  if (isStructuredError(error)) {
    return checkMessage(error.message);
  }

  if (isApiError(error)) {
    return checkMessage(error.error.message);
  }

  // Check if it's a Gaxios error with response data
  if (error && typeof error === 'object' && 'response' in error) {
    const gaxiosError = error as {
      response?: {
        data?: unknown;
      };
    };
    if (gaxiosError.response && gaxiosError.response.data) {
      if (typeof gaxiosError.response.data === 'string') {
        return checkMessage(gaxiosError.response.data);
      }
      if (
        typeof gaxiosError.response.data === 'object' &&
        gaxiosError.response.data !== null &&
        'error' in gaxiosError.response.data
      ) {
        const errorData = gaxiosError.response.data as {
          error?: { message?: string };
        };
        return checkMessage(errorData.error?.message || '');
      }
    }
  }
  return false;
}

export function isGenericQuotaExceededError(error: unknown): boolean {
  if (typeof error === 'string') {
    return error.includes('Quota exceeded for quota metric');
  }

  if (isStructuredError(error)) {
    return error.message.includes('Quota exceeded for quota metric');
  }

  if (isApiError(error)) {
    return error.error.message.includes('Quota exceeded for quota metric');
  }

  return false;
}

// 🆕 DeepX服务端配额错误检测和格式化
export interface DeepXQuotaError {
  error: string;
  message: string;
  currentUsage?: {
    totalRequests?: number;
    totalTokens?: number;
    totalCost?: number;
  };
  limits?: {
    requests?: number;
    tokens?: number;
    cost?: number;
  };
  requestId?: string;
  timestamp?: string;
}

export function isDeepXQuotaError(error: unknown): boolean {
  // 检测HTTP响应数据中的DeepX配额错误
  if (error && typeof error === 'object' && 'response' in error) {
    const gaxiosError = error as {
      response?: {
        status?: number;
        data?: unknown;
      };
    };

    // 检测402支付/配额错误（服务端统一使用402表示配额相关问题）
    if (gaxiosError.response?.status === 402 && gaxiosError.response.data) {
      const data = gaxiosError.response.data as any;
      if (data &&
          typeof data.error === 'string' &&
          (data.error === 'Quota limit exceeded' || data.error === 'No quota configuration') &&
          typeof data.message === 'string') {
        return true;
      }
    }

    // 🆕 检测500错误且message包含 quota exceeded (DeepV Server)
    if (gaxiosError.response?.status === 500 && gaxiosError.response.data) {
      const data = gaxiosError.response.data as any;
      if (data && typeof data.message === 'string' && data.message.includes('quota exceeded')) {
        return true;
      }
    }
  }

  // 检测Error对象message中的DeepX配额错误
  if (error instanceof Error && error.message) {
    // 检测402配额错误
    if (error.message.includes('API request failed (402):') &&
        (error.message.includes('"error":"Quota limit exceeded"') ||
         error.message.includes('"error":"No quota configuration"'))) {
      return true;
    }
    // 🆕 检测500配额错误 (DeepV Server)
    if (error.message.includes('API request failed (500):') && error.message.includes('quota exceeded')) {
      return true;
    }
    // 🆕 检测流式 API 错误消息 (Stream API error (500))
    if (error.message.includes('Stream API error (500):') && error.message.includes('quota exceeded')) {
      return true;
    }
  }

  // 检测结构化错误对象
  if (typeof error === 'object' && error !== null) {
    const obj = error as any;

    // 检查对象有message属性且包含DeepX配额错误的情况
    if (obj.message && typeof obj.message === 'string') {
      if (obj.message.includes('API request failed (402):') &&
          (obj.message.includes('"error":"Quota limit exceeded"') ||
           obj.message.includes('"error":"No quota configuration"'))) {
        return true;
      }
      if (obj.message.includes('API error (402):') &&
          (obj.message.includes('"error":"Quota limit exceeded"') ||
           obj.message.includes('"error":"No quota configuration"'))) {
        return true;
      }
      // 🆕 500 配额错误
      if ((obj.message.includes('API request failed (500):') || obj.message.includes('Stream API error (500):')) &&
          obj.message.includes('quota exceeded')) {
        return true;
      }
    }

    // 直接对象检测
    if ((obj.error === 'Quota limit exceeded' || obj.error === 'No quota configuration') &&
        typeof obj.message === 'string') {
      return true;
    }

    // 🆕 500 配额错误直接对象检测
    if (obj.status === 500 && typeof obj.message === 'string' && obj.message.includes('quota exceeded')) {
      return true;
    }
  }

  // 检测字符串形式的错误
  if (typeof error === 'string') {
    return error.includes('Quota limit exceeded') ||
           error.includes('No quota configuration') ||
           error.includes('Daily token limit would be exceeded') ||
           error.includes('Daily request limit exceeded') ||
           error.includes('Daily cost limit would be exceeded') ||
           (error.includes('500') && error.includes('quota exceeded'));
  }

  return false;
}

export function getDeepXQuotaErrorMessage(error: unknown): string | null {
  let quotaError: DeepXQuotaError | any = null;

  // 从HTTP响应中提取配额错误信息
  if (error && typeof error === 'object' && 'response' in error) {
    const gaxiosError = error as {
      response?: {
        status?: number;
        data?: unknown;
      };
    };

    // 402 Payment Required - 配额相关错误统一状态码
    if (gaxiosError.response?.status === 402 && gaxiosError.response.data) {
      quotaError = gaxiosError.response.data as DeepXQuotaError;
    } else if (gaxiosError.response?.status === 500 && gaxiosError.response.data) {
      // 🆕 处理 500 配额错误
      const data = gaxiosError.response.data as any;
      if (data && typeof data.message === 'string' && data.message.includes('quota exceeded')) {
        quotaError = data;
      }
    }
  } else if (typeof error === 'object' && error !== null) {
    const obj = error as any;

    // 处理对象有message属性且包含DeepX配额错误的情况
    if (obj.message && typeof obj.message === 'string') {
      if ((obj.message.includes('API request failed (402):') ||
           obj.message.includes('API request failed (500):') ||
           obj.message.includes('Stream API error (500):')) &&
          (obj.message.includes('"error":"Quota limit exceeded"') ||
           obj.message.includes('"error":"No quota configuration"') ||
           obj.message.includes('quota exceeded'))) {
        try {
          const jsonMatch = obj.message.match(/\{.*\}$/);
          if (jsonMatch) {
            quotaError = JSON.parse(jsonMatch[0]) as any;
          }
        } catch (parseError) {
          // JSON解析失败，继续其他检查
        }
      }
    }

    // 如果还没找到，尝试直接对象检测
    if (!quotaError) {
      quotaError = error as any;
    }
  }

  // 从Error对象message中提取DeepX配额错误信息
  if (!quotaError && error instanceof Error && error.message) {
    if ((error.message.includes('API request failed (402):') ||
         error.message.includes('API request failed (500):') ||
         error.message.includes('Stream API error (500):')) &&
        (error.message.includes('"error":"Quota limit exceeded"') ||
         error.message.includes('"error":"No quota configuration"') ||
         error.message.includes('quota exceeded'))) {
      try {
        const jsonMatch = error.message.match(/\{.*\}$/);
        if (jsonMatch) {
          quotaError = JSON.parse(jsonMatch[0]) as any;
        }
      } catch (parseError) {
        // 继续手动处理
      }
    }
  }

  if (!quotaError) return null;

  // 🆕 特殊处理 500 quota exceeded 错误
  if (quotaError.message && quotaError.message.includes('quota exceeded')) {
    return formatDeepVServerQuotaError(quotaError);
  }

  return formatDeepXQuotaError(quotaError);
}

// 格式化 DeepV Server 500 配额错误
function formatDeepVServerQuotaError(errorData: any): string {
  // 简单检测系统语言环境
  const isChineseEnvironment = (): boolean => {
    try {
      const env = process.env;
      const locale = env.LC_ALL || env.LC_CTYPE || env.LANG || '';
      return locale.toLowerCase().includes('zh') || locale.toLowerCase().includes('chinese');
    } catch {
      return false;
    }
  };

  const isChinese = isChineseEnvironment();

  // 提取 Role 信息
  let roleInfo = '';
  let limitInfo = '';
  let usedInfo = '';
  let cycleInfo = '';

  const message = errorData.message || '';

  const roleMatch = message.match(/Role:\s*([^,]+)/);
  if (roleMatch) {
    roleInfo = roleMatch[1].trim();
  }

  const limitMatch = message.match(/Limit:\s*([^,]+)/);
  if (limitMatch) {
    limitInfo = limitMatch[1].trim();
  }

  const usedMatch = message.match(/Used:\s*([^,]+)/);
  if (usedMatch) {
    usedInfo = usedMatch[1].trim();
  }

  const cycleMatch = message.match(/Cycle:\s*([^,]+)/);
  if (cycleMatch) {
    cycleInfo = cycleMatch[1].trim();
  }

  if (isChinese) {
    let result = '─────────────────────────────────────────────────────\n';
    result += '🚫 当前模型的循环配额已用尽 (Cycle Quota Exceeded)\n';
    if (roleInfo) result += `👤 角色信息: ${roleInfo}\n`;
    if (limitInfo) result += `📊 额度上限: ${limitInfo}\n`;
    if (usedInfo) result += `📈 已用额度: ${usedInfo}\n`;
    if (cycleInfo) result += `🕒 重置周期: ${cycleInfo}\n`;

    result += '\n💡 请切换模型使用，或等待周期结束后恢复。\n';
    result += '🔗 了解更多: https://dvcode.deepvlab.ai/\n';
    result += '─────────────────────────────────────────────────────';
    return result;
  } else {
    let result = '─────────────────────────────────────────────────────\n';
    result += '🚫 Current model cycle quota exceeded\n';
    if (roleInfo) result += `👤 Role: ${roleInfo}\n`;
    if (limitInfo) result += `📊 Limit: ${limitInfo}\n`;
    if (usedInfo) result += `📈 Used: ${usedInfo}\n`;
    if (cycleInfo) result += `🕒 Cycle: ${cycleInfo}\n`;

    result += '\n💡 Please switch to another model or wait for the cycle to reset.\n';
    result += '🔗 More info: https://dvcode.deepvlab.ai/\n';
    result += '─────────────────────────────────────────────────────';
    return result;
  }
}


// 格式化DeepX配额错误消息，支持i18n
function formatDeepXQuotaError(quotaError: DeepXQuotaError): string {
  // 简单检测系统语言环境
  const isChineseEnvironment = (): boolean => {
    try {
      const env = process.env;
      const locale = env.LC_ALL || env.LC_CTYPE || env.LANG || '';
      return locale.toLowerCase().includes('zh') || locale.toLowerCase().includes('chinese');
    } catch {
      return false;
    }
  };

  const isChinese = isChineseEnvironment();

  // 403无配额配置错误的特殊处理
  if (quotaError.error === 'No quota configuration') {
    return isChinese
      ? '─────────────────────────────────────────────────────\n🚫 当前账户可用的 Credit（积分）不足以继续使用本服务\n💡 请考虑订阅更多额度的套餐。详情请访问官网：https://dvcode.deepvlab.ai/\n\n\x1b[33m🎁 如果希望获得免费体验机会，请联系我们的Boss：https://x.com/fusheng_0306\x1b[0m\n─────────────────────────────────────────────────────'
      : '─────────────────────────────────────────────────────\n🚫 Your account\'s available Credits are insufficient to continue using this service\n💡 Please consider subscribing to a higher quota plan. Details: https://dvcode.deepvlab.ai/\n\n\x1b[33m🎁 For free trial opportunities, contact our Boss: https://x.com/fusheng_0306\x1b[0m\n─────────────────────────────────────────────────────';
  }

  // 429配额超限错误处理
  if (quotaError.error === 'Quota limit exceeded') {
    return isChinese
      ? '🚫 服务配额已达上限\n💡 请升级套餐：https://dvcode.deepvlab.ai/'
      : '🚫 Service quota limit exceeded\n💡 Please upgrade your plan: https://dvcode.deepvlab.ai/';
  }

  // 默认错误处理
  return isChinese
    ? '🚫 服务不可用\n💡 请联系管理员检查账户配置\n🔗 升级套餐：https://dvcode.deepvlab.ai/'
    : '🚫 Service unavailable\n💡 Please contact administrator to check account configuration\n🔗 Upgrade: https://dvcode.deepvlab.ai/';
}