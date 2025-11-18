/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseAndFormatApiError } from './errorParsing.js';
import { isChineseLocale } from './i18n.js';
import {
  AuthType,
  UserTierId,
  DEFAULT_GEMINI_FLASH_MODEL,
  isProQuotaExceededError,
} from 'deepv-code-core';

// Define StructuredError type for testing
interface StructuredError {
  message: string;
  status: number;
}

// Mock isChineseLocale to return false for most tests (English environment)
vi.mock('./i18n.js', async () => {
  const actual = await vi.importActual('./i18n.js');
  return {
    ...actual,
    isChineseLocale: vi.fn(() => false), // Default to English
  };
});

describe('parseAndFormatApiError', () => {
  const _enterpriseMessage =
    'upgrade to a Gemini Code Assist Standard or Enterprise plan with higher limits';
  const vertexMessage = 'request a quota increase through Vertex';
  const geminiMessage = 'request a quota increase through AI Studio';

  it('should format a valid API error JSON', () => {
    const errorMessage =
      'got status: 400 Bad Request. {"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}';
    const expected =
      '[API Error: API key not valid. Please pass a valid API key. (Status: INVALID_ARGUMENT)]';
    expect(parseAndFormatApiError(errorMessage)).toBe(expected);
  });

  it('should format a 429 API error with the default message', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Rate limit exceeded","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      undefined,
      undefined,
      'auto',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain('[API Error: Rate limit exceeded');
    expect(result).toContain(
      'Possible quota limitations in place or slow response times detected. Switching to the auto model',
    );
  });

  it('should format a 429 API error with the personal message', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Rate limit exceeded","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      AuthType.LOGIN_WITH_GOOGLE,
      undefined,
      'auto',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain('[API Error: Rate limit exceeded');
    expect(result).toContain(
      'Possible quota limitations in place or slow response times detected. Switching to the auto model',
    );
  });

  it('should format a 429 API error with the vertex message', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Rate limit exceeded","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(errorMessage, AuthType.USE_VERTEX_AI);
    expect(result).toContain('[API Error: Rate limit exceeded');
    expect(result).toContain(vertexMessage);
  });

  it('should return the original message if it is not a JSON error', () => {
    const errorMessage = 'This is a plain old error message';
    expect(parseAndFormatApiError(errorMessage)).toBe(
      `[API Error: ${errorMessage}]`,
    );
  });

  it('should return the original message for malformed JSON', () => {
    const errorMessage = '[Stream Error: {"error": "malformed}';
    expect(parseAndFormatApiError(errorMessage)).toBe(
      `[API Error: ${errorMessage}]`,
    );
  });

  it('should handle JSON that does not match the ApiError structure', () => {
    const errorMessage = '[Stream Error: {"not_an_error": "some other json"}]';
    expect(parseAndFormatApiError(errorMessage)).toBe(
      `[API Error: ${errorMessage}]`,
    );
  });

  it('should format a nested API error', () => {
    const nestedErrorMessage = JSON.stringify({
      error: {
        code: 429,
        message:
          "Gemini 2.5 Pro Preview doesn't have a free quota tier. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.",
        status: 'RESOURCE_EXHAUSTED',
      },
    });

    const errorMessage = JSON.stringify({
      error: {
        code: 429,
        message: nestedErrorMessage,
        status: 'Too Many Requests',
      },
    });

    const result = parseAndFormatApiError(errorMessage, AuthType.USE_GEMINI);
    expect(result).toContain('Gemini 2.5 Pro Preview');
    expect(result).toContain(geminiMessage);
  });

  it('should format a StructuredError', () => {
    const error: StructuredError = {
      message: 'A structured error occurred',
      status: 500,
    };
    const expected = '[API Error: A structured error occurred]';
    expect(parseAndFormatApiError(error)).toBe(expected);
  });

  it('should format a 429 StructuredError with the vertex message', () => {
    const error: StructuredError = {
      message: 'Rate limit exceeded',
      status: 429,
    };
    const result = parseAndFormatApiError(error, AuthType.USE_VERTEX_AI);
    expect(result).toContain('[API Error: Rate limit exceeded]');
    expect(result).toContain(vertexMessage);
  });

  it('should handle an unknown error type', () => {
    const error = 12345;
    const expected = '[API Error: An unknown error occurred.]';
    expect(parseAndFormatApiError(error)).toBe(expected);
  });

  it('should format a 429 API error with Pro quota exceeded message for Google auth (Free tier)', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Quota exceeded for quota metric \'Gemini 2.5 Pro Requests\' and limit \'RequestsPerDay\' of service \'generativelanguage.googleapis.com\' for consumer \'project_number:123456789\'.","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      AuthType.LOGIN_WITH_GOOGLE,
      undefined,
      'auto',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain(
      "[API Error: Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'",
    );
    expect(result).toContain(
      'You have reached your daily auto quota limit',
    );
    expect(result).toContain(
      'upgrade to a Gemini Code Assist Standard or Enterprise plan',
    );
  });

  it('should format a regular 429 API error with standard message for Google auth', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Rate limit exceeded","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      AuthType.LOGIN_WITH_GOOGLE,
      undefined,
      'auto',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain('[API Error: Rate limit exceeded');
    expect(result).toContain(
      'Possible quota limitations in place or slow response times detected. Switching to the auto model',
    );
    expect(result).not.toContain(
      'You have reached your daily auto quota limit',
    );
  });

  it('should format a 429 API error with generic quota exceeded message for Google auth', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Quota exceeded for quota metric \'GenerationRequests\' and limit \'RequestsPerDay\' of service \'generativelanguage.googleapis.com\' for consumer \'project_number:123456789\'.","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      AuthType.LOGIN_WITH_GOOGLE,
      undefined,
      'auto',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain(
      "[API Error: Quota exceeded for quota metric 'GenerationRequests'",
    );
    expect(result).toContain('You have reached your daily quota limit');
    expect(result).not.toContain(
      'You have reached your daily Gemini 2.5 Pro quota limit',
    );
  });

  it('should prioritize Pro quota message over generic quota message for Google auth', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Quota exceeded for quota metric \'Gemini 2.5 Pro Requests\' and limit \'RequestsPerDay\' of service \'generativelanguage.googleapis.com\' for consumer \'project_number:123456789\'.","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      AuthType.LOGIN_WITH_GOOGLE,
      undefined,
      'auto',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain(
      "[API Error: Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'",
    );
    expect(result).toContain(
      'You have reached your daily auto quota limit',
    );
    expect(result).not.toContain('You have reached your daily quota limit');
  });

  it('should format a 429 API error with Pro quota exceeded message for Google auth (Standard tier)', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Quota exceeded for quota metric \'Gemini 2.5 Pro Requests\' and limit \'RequestsPerDay\' of service \'generativelanguage.googleapis.com\' for consumer \'project_number:123456789\'.","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      AuthType.LOGIN_WITH_GOOGLE,
      UserTierId.STANDARD,
      'auto',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain(
      "[API Error: Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'",
    );
    expect(result).toContain(
      'You have reached your daily auto quota limit',
    );
    expect(result).toContain(
      'We appreciate you for choosing Gemini Code Assist and the Gemini CLI',
    );
    expect(result).not.toContain(
      'upgrade to a Gemini Code Assist Standard or Enterprise plan',
    );
  });

  it('should format a 429 API error with Pro quota exceeded message for Google auth (Legacy tier)', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Quota exceeded for quota metric \'Gemini 2.5 Pro Requests\' and limit \'RequestsPerDay\' of service \'generativelanguage.googleapis.com\' for consumer \'project_number:123456789\'.","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      AuthType.LOGIN_WITH_GOOGLE,
      UserTierId.LEGACY,
      'auto',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain(
      "[API Error: Quota exceeded for quota metric 'Gemini 2.5 Pro Requests'",
    );
    expect(result).toContain(
      'You have reached your daily auto quota limit',
    );
    expect(result).toContain(
      'We appreciate you for choosing Gemini Code Assist and the Gemini CLI',
    );
    expect(result).not.toContain(
      'upgrade to a Gemini Code Assist Standard or Enterprise plan',
    );
  });

  it('should handle different Gemini 2.5 version strings in Pro quota exceeded errors', () => {
    const errorMessage25 =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Quota exceeded for quota metric \'Gemini 2.5 Pro Requests\' and limit \'RequestsPerDay\' of service \'generativelanguage.googleapis.com\' for consumer \'project_number:123456789\'.","status":"RESOURCE_EXHAUSTED"}}';
    const errorMessagePreview =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Quota exceeded for quota metric \'Gemini 2.5-preview Pro Requests\' and limit \'RequestsPerDay\' of service \'generativelanguage.googleapis.com\' for consumer \'project_number:123456789\'.","status":"RESOURCE_EXHAUSTED"}}';

    const result25 = parseAndFormatApiError(
      errorMessage25,
      AuthType.LOGIN_WITH_GOOGLE,
      undefined,
      'auto',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    const resultPreview = parseAndFormatApiError(
      errorMessagePreview,
      AuthType.LOGIN_WITH_GOOGLE,
      undefined,
      'test-preview-pro',
      DEFAULT_GEMINI_FLASH_MODEL,
    );

    expect(result25).toContain(
      'You have reached your daily auto quota limit',
    );
    expect(resultPreview).toContain(
      'You have reached your daily test-preview-pro quota limit',
    );
    expect(result25).toContain(
      'upgrade to a Gemini Code Assist Standard or Enterprise plan',
    );
    expect(resultPreview).toContain(
      'upgrade to a Gemini Code Assist Standard or Enterprise plan',
    );
  });

  it('should not match non-Pro models with similar version strings', () => {
    // Test that Flash models with similar version strings don't match
    expect(
      isProQuotaExceededError(
        "Quota exceeded for quota metric 'Gemini 2.5 Flash Requests' and limit",
      ),
    ).toBe(false);
    expect(
      isProQuotaExceededError(
        "Quota exceeded for quota metric 'Gemini 2.5-preview Flash Requests' and limit",
      ),
    ).toBe(false);

    // Test other model types
    expect(
      isProQuotaExceededError(
        "Quota exceeded for quota metric 'Gemini 2.5 Ultra Requests' and limit",
      ),
    ).toBe(false);
    expect(
      isProQuotaExceededError(
        "Quota exceeded for quota metric 'Gemini 2.5 Standard Requests' and limit",
      ),
    ).toBe(false);

    // Test generic quota messages
    expect(
      isProQuotaExceededError(
        "Quota exceeded for quota metric 'GenerationRequests' and limit",
      ),
    ).toBe(false);
    expect(
      isProQuotaExceededError(
        "Quota exceeded for quota metric 'EmbeddingRequests' and limit",
      ),
    ).toBe(false);
  });

  it('should format a generic quota exceeded message for Google auth (Standard tier)', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Quota exceeded for quota metric \'GenerationRequests\' and limit \'RequestsPerDay\' of service \'generativelanguage.googleapis.com\' for consumer \'project_number:123456789\'.","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      AuthType.LOGIN_WITH_GOOGLE,
      UserTierId.STANDARD,
      'auto',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain(
      "[API Error: Quota exceeded for quota metric 'GenerationRequests'",
    );
    expect(result).toContain('You have reached your daily quota limit');
    expect(result).toContain(
      'We appreciate you for choosing Gemini Code Assist and the Gemini CLI',
    );
    expect(result).not.toContain(
      'upgrade to a Gemini Code Assist Standard or Enterprise plan',
    );
  });

  it('should format a regular 429 API error with standard message for Google auth (Standard tier)', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Rate limit exceeded","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      AuthType.LOGIN_WITH_GOOGLE,
      UserTierId.STANDARD,
      'auto',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain('[API Error: Rate limit exceeded');
    expect(result).toContain(
      'We appreciate you for choosing Gemini Code Assist and the Gemini CLI',
    );
    expect(result).not.toContain(
      'upgrade to a Gemini Code Assist Standard or Enterprise plan',
    );
  });

  // 403 Forbidden错误测试
  describe('403 Forbidden Error Handling', () => {
    it('should format a 403 forbidden error from string message', () => {
      const errorMessage = 'API request failed (403): Forbidden';
      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('🚫 Access Forbidden (403)');
      expect(result).toContain('Account suspended or banned');
      expect(result).toContain('Service not available in your region');
      expect(result).toContain('Try alternative authentication method');
      expect(result).toContain('https://dvcode.deepvlab.ai/');
    });

    it('should format a 403 forbidden error from structured error', () => {
      const structuredError = {
        message: 'Access forbidden',
        status: 403
      };
      const result = parseAndFormatApiError(structuredError);

      expect(result).toContain('🚫 Access Forbidden (403)');
      expect(result).toContain('Possible causes:');
    });

    it('should format a 403 forbidden error from API error format', () => {
      const apiError = {
        error: {
          code: 403,
          message: 'Permission denied',
          status: 'PERMISSION_DENIED',
          details: []
        }
      };
      const result = parseAndFormatApiError(apiError);

      expect(result).toContain('🚫 Access Forbidden (403)');
      expect(result).toContain('Account suspended or banned');
    });

    it('should format a 403 forbidden error from JSON string', () => {
      const errorMessage =
        'got status: 403, got error: {"error":{"code":403,"message":"Permission denied","status":"PERMISSION_DENIED"}}';
      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('🚫 Access Forbidden (403)');
      expect(result).toContain('Terms of service violation');
    });

    it('should format a 403 error with Chinese locale', () => {
      // 模拟中文环境
      vi.mocked(isChineseLocale).mockReturnValueOnce(true);

      const errorMessage = 'API request failed (403): Forbidden';
      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('🚫 访问被拒绝 (403 Forbidden)');
      expect(result).toContain('账户已被暂停或封禁');
      expect(result).toContain('当前地区暂不支持此服务');
      expect(result).toContain('联系技术支持获取帮助');
    });
  });

  describe('Network Connection Failed Error Handling', () => {
    it('should format a fetch failed error in English', () => {
      const errorMessage = 'fetch failed';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('🌐 Network Connection Failed');
      expect(result).toContain('Your network is unstable and basic communication with the server failed');
      expect(result).toContain('Check your network connection status');
      expect(result).toContain('Check proxy or firewall settings');
    });

    it('should format a fetch failed error in Chinese', () => {
      vi.mocked(isChineseLocale).mockReturnValueOnce(true);

      const errorMessage = 'fetch failed';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('🌐 网络连接失败');
      expect(result).toContain('您所在的网络环境不稳定，与服务器的基本通信失败');
      expect(result).toContain('检查您的网络连接状态');
      expect(result).toContain('检查代理或防火墙设置');
    });

    it('should format an ECONNREFUSED error', () => {
      const errorMessage = 'Connection error: ECONNREFUSED';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('🌐 Network Connection Failed');
      expect(result).toContain('Your network is unstable');
    });

    it('should format a structured error with fetch failed message', () => {
      const error: StructuredError = {
        message: 'network error: fetch failed',
        status: 500,
      };

      const result = parseAndFormatApiError(error);

      expect(result).toContain('🌐 Network Connection Failed');
    });
  });

  describe('Quota Limit Exceeded (429) Error Handling', () => {
    it('should format a 429 API error with friendly message in English', () => {
      const errorMessage =
        'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Insufficient credits in all available quotas","status":"RESOURCE_EXHAUSTED"}}';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('⚡ Service Quota Limit Exceeded (429)');
      expect(result).toContain('Your account has reached its usage quota');
      expect(result).toContain('Upgrade your plan');
      expect(result).toContain('https://dvcode.deepvlab.ai/');
    });

    it('should format a 429 API error with friendly message in Chinese', () => {
      // 模拟中文环境
      vi.mocked(isChineseLocale).mockReturnValueOnce(true);

      const errorMessage =
        'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Insufficient credits in all available quotas","status":"RESOURCE_EXHAUSTED"}}';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('⚡ 服务配额已达上限 (429)');
      expect(result).toContain('您账户的可用额度已用尽');
      expect(result).toContain('升级您的套餐');
      expect(result).toContain('https://dvcode.deepvlab.ai/');
    });

    it('should format a 429 StructuredError with friendly message', () => {
      const error: StructuredError = {
        message: 'Insufficient balance. Available: 0, Needed: 5',
        status: 429,
      };

      const result = parseAndFormatApiError(error);

      expect(result).toContain('⚡ Service Quota Limit Exceeded (429)');
      expect(result).toContain('Upgrade your plan');
      expect(result).toContain('https://dvcode.deepvlab.ai/');
    });

    it('should extract and display quota details when available in 429 error', () => {
      const errorMessage =
        'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Insufficient credits. Available: 0.00, Needed: 8.5","status":"RESOURCE_EXHAUSTED"}}';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('⚡ Service Quota Limit Exceeded (429)');
      expect(result).toContain('Available: 0.00');
      expect(result).toContain('Needed: 8.5');
    });

    it('should handle 429 error in string format with insufficient credits message', () => {
      const errorMessage = 'API Error 429: Insufficient credits in all available quotas. Available: 0, Needed: 8.5';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('⚡ Service Quota Limit Exceeded (429)');
      expect(result).toContain('Upgrade your plan');
    });
  });

  describe('Region Blocked (451) Error Handling', () => {
    it('should format a REGION_BLOCKED_451 error with JSON message in English', () => {
      const errorMessage =
        'REGION_BLOCKED_451: {"error":"Unsupported country or region","message":"Unsupported country or region.\\nWe\'re working to expand the availability of DeepV Code. Thank you for your support.\\nIf you believe this is an error, please check your network settings.","code":"REGION_BLOCKED","timestamp":"2025-10-12T10:33:34.022Z","requestId":"block-1760265214022-4yca7b"}';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('🌍 Region Access Restricted (451)');
      expect(result).toContain('Unsupported country or region');
      expect(result).toContain('We are expanding service coverage');
      expect(result).toContain('If it was working before, try typing "continue" to proceed');
    });

    it('should format a REGION_BLOCKED_451 error with JSON message in Chinese', () => {
      // 模拟中文环境
      vi.mocked(isChineseLocale).mockReturnValueOnce(true);

      const errorMessage =
        'REGION_BLOCKED_451: {"error":"Unsupported country or region","message":"Unsupported country or region.\\nWe\'re working to expand the availability of DeepV Code. Thank you for your support.\\nIf you believe this is an error, please check your network settings.","code":"REGION_BLOCKED","timestamp":"2025-10-12T10:33:34.022Z","requestId":"block-1760265214022-4yca7b"}';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('🌍 地区访问受限 (451)');
      expect(result).toContain('Unsupported country or region');
      expect(result).toContain('我们正在努力扩大服务覆盖范围');
      expect(result).toContain('⭐ 小贴士：若刚才还正常，现在异常了，请输入"继续"即可');
    });

    it('should format a REGION_BLOCKED_451 error without JSON message', () => {
      const errorMessage = 'REGION_BLOCKED_451: Service blocked in this region';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('🌍 Region Access Restricted (451)');
      expect(result).toContain('DeepV Code service is not available in your current region');
      expect(result).toContain('⭐ Tip: If it was working before, try typing "continue" to proceed');
    });

    it('should format a 451 structured error', () => {
      const error: StructuredError = {
        message: 'Region blocked',
        status: 451,
      };

      const result = parseAndFormatApiError(error);

      expect(result).toContain('🌍 Region Access Restricted (451)');
      expect(result).toContain('DeepV Code service is not available');
    });

    it('should format a string error containing 451 and region keywords', () => {
      const errorMessage = 'API Error 451: region not supported';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('🌍 Region Access Restricted (451)');
    });
  });
});
