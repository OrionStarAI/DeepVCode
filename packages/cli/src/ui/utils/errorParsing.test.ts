/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
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
  const _vertexMessage = 'request a quota increase through Vertex';
  const _geminiMessage = 'request a quota increase through AI Studio';

  it('should format a valid API error JSON', () => {
    const errorMessage =
      'got status: 400 Bad Request. {"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}';
    const expected =
      '[API Error: API key not valid. Please pass a valid API key. (Status: INVALID_ARGUMENT)]';
    expect(parseAndFormatApiError(errorMessage)).toBe(expected);
  });

  it('should format a 429 API error with the friendly message (banner)', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Rate limit exceeded","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      undefined,
      undefined,
      'auto',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain('Service Quota Limit Exceeded');
    expect(result).toContain('Your account has reached its usage quota');
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
    // Note: Currently generic 429s return the friendly banner
    expect(result).toContain('Service Quota Limit Exceeded');
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
    // Note: Currently generic 429s return the friendly banner even if nested
    expect(result).toContain('Service Quota Limit Exceeded');
  });

  it('should format a StructuredError', () => {
    const error: StructuredError = {
      message: 'A structured error occurred',
      status: 500,
    };
    const expected = '[API Error: A structured error occurred]';
    expect(parseAndFormatApiError(error)).toBe(expected);
  });

  it('should format a 429 StructuredError with friendly banner', () => {
    const error: StructuredError = {
      message: 'Rate limit exceeded',
      status: 429,
    };
    const result = parseAndFormatApiError(error, AuthType.USE_VERTEX_AI);
    expect(result).toContain('Service Quota Limit Exceeded');
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
      "[API Error: Quota exceeded for quota metric]",
    );
    expect(result).toContain(
      'Possible quota limitations in place or slow response times detected',
    );
  });

  it('should format a regular 429 API error with banner message for Google auth', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Rate limit exceeded","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      AuthType.LOGIN_WITH_GOOGLE,
      undefined,
      'auto',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain('Service Quota Limit Exceeded');
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
      "[API Error: Quota exceeded for quota metric]",
    );
    expect(result).toContain('Possible quota limitations in place or slow response times detected');
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
      "[API Error: Quota exceeded for quota metric]",
    );
    expect(result).toContain(
      'Possible quota limitations in place or slow response times detected',
    );
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
      "[API Error: Quota exceeded for quota metric]",
    );
    expect(result).toContain(
      'Possible quota limitations in place or slow response times detected',
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
      "[API Error: Quota exceeded for quota metric]",
    );
    expect(result).toContain(
      'Possible quota limitations in place or slow response times detected',
    );
  });

  it('should handle different Gemini 2.5 version strings in Pro quota exceeded errors', () => {
    const errorMessage25 =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Quota exceeded for quota metric \'Gemini 2.5 Pro Requests\' and limit \'RequestsPerDay\' of service \'generativelanguage.googleapis.com\' for consumer \'project_number:123456789\'.","status":"RESOURCE_EXHAUSTED"}}';

    const result25 = parseAndFormatApiError(
      errorMessage25,
      AuthType.LOGIN_WITH_GOOGLE,
      undefined,
      'auto',
      DEFAULT_GEMINI_FLASH_MODEL,
    );

    expect(result25).toContain(
      'Possible quota limitations in place or slow response times detected',
    );
  });

  it('should not match non-Pro models with similar version strings', () => {
    // Test that Flash models with similar version strings don't match
    expect(
      isProQuotaExceededError(
        "Quota exceeded for quota metric 'Gemini 2.5 Flash Requests' and limit",
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
      "[API Error: Quota exceeded for quota metric]",
    );
    expect(result).toContain('Possible quota limitations in place or slow response times detected');
  });

  it('should format a regular 429 API error with banner message for Google auth (Standard tier)', () => {
    const errorMessage =
      'got status: 429 Too Many Requests. {"error":{"code":429,"message":"Rate limit exceeded","status":"RESOURCE_EXHAUSTED"}}';
    const result = parseAndFormatApiError(
      errorMessage,
      AuthType.LOGIN_WITH_GOOGLE,
      UserTierId.STANDARD,
      'auto',
      DEFAULT_GEMINI_FLASH_MODEL,
    );
    expect(result).toContain('Service Quota Limit Exceeded');
  });

  // 403 Forbidden错误测试
  describe('403 Forbidden Error Handling', () => {
    it('should format a 403 forbidden error from string message', () => {
      const errorMessage = 'API request failed (403): Forbidden';
      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('🚫 Access Forbidden (403)');
      expect(result).toContain('Possible causes:');
      expect(result).toContain('Suggested solutions:');
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
    });

    it('should format a 403 forbidden error from JSON string', () => {
      const errorMessage =
        'got status: 403, got error: {"error":{"code":403,"message":"Permission denied","status":"PERMISSION_DENIED"}}';
      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('🚫 Access Forbidden (403)');
    });

    it('should format a 403 error with Chinese locale', () => {
      // 模拟中文环境
      vi.mocked(isChineseLocale).mockReturnValueOnce(true);

      const errorMessage = 'API request failed (403): Forbidden';
      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('🚫 访问被拒绝 (403 Forbidden)');
      expect(result).toContain('可能的原因：');
      expect(result).toContain('💡 建议解决方案：');
    });
  });

  describe('Network Connection Failed Error Handling', () => {
    it('should format a fetch failed error in English', () => {
      const errorMessage = 'fetch failed';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('🌐 Network Connection Failed');
      expect(result).toContain('💡 Suggestion: Check your proxy settings');
    });

    it('should format a fetch failed error in Chinese', () => {
      vi.mocked(isChineseLocale).mockReturnValueOnce(true);

      const errorMessage = 'fetch failed';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('🌐 网络连接失败');
      expect(result).toContain('💡 建议：检查您的代理设置');
    });

    it('should format an ECONNREFUSED error', () => {
      const errorMessage = 'Connection error: ECONNREFUSED';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('🌐 Network Connection Failed');
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

  describe('Quota Limit Exceeded (402) Error Handling', () => {
    it('should format a 402 API error with friendly message in English', () => {
      const errorMessage =
        'got status: 402 Payment Required. {"error":{"code":402,"message":"Quota limit exceeded","status":"PAYMENT_REQUIRED"}}';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('⚡ Service Quota Limit Exceeded (402)');
      expect(result).toContain('Your account has reached its usage quota');
      expect(result).toContain('Upgrade your plan');
      expect(result).toContain('https://dvcode.deepvlab.ai/');
    });

    it('should format a 402 API error with friendly message in Chinese', () => {
      // 模拟中文环境
      vi.mocked(isChineseLocale).mockReturnValueOnce(true);

      const errorMessage =
        'got status: 402 Payment Required. {"error":{"code":402,"message":"Quota limit exceeded","status":"PAYMENT_REQUIRED"}}';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('⚡ 服务配额已达上限 (402)');
      expect(result).toContain('您账户的可用额度已用尽');
      expect(result).toContain('升级您的套餐');
      expect(result).toContain('https://dvcode.deepvlab.ai/');
    });

    it('should format a 402 StructuredError with friendly message', () => {
      const error: StructuredError = {
        message: 'Quota limit exceeded. Available: 0, Needed: 5',
        status: 402,
      };

      const result = parseAndFormatApiError(error);

      expect(result).toContain('⚡ Service Quota Limit Exceeded (402)');
      expect(result).toContain('Upgrade your plan');
      expect(result).toContain('https://dvcode.deepvlab.ai/');
    });

    it('should extract and display quota details when available in 402 error', () => {
      const errorMessage =
        'got status: 402 Payment Required. {"error":{"code":402,"message":"Quota limit exceeded. Available: 0.00, Needed: 8.5","status":"PAYMENT_REQUIRED"}}';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('⚡ Service Quota Limit Exceeded (402)');
      expect(result).toContain('Available: 0.00');
      expect(result).toContain('Needed: 8.5');
    });

    it('should handle 402 error in string format with quota limit exceeded message', () => {
      const errorMessage = 'API Error 402: Quota limit exceeded. Available: 0, Needed: 8.5';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('⚡ Service Quota Limit Exceeded (402)');
      expect(result).toContain('Upgrade your plan');
    });

    it('should format a 402 No quota configuration error in English', () => {
      const errorMessage =
        'got status: 402 Payment Required. {"error":{"code":402,"message":"No quota configuration","status":"PAYMENT_REQUIRED"}}';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('🚫');
      expect(result).toContain('402');
      expect(result).toContain('Credits');
      expect(result).toContain('https://dvcode.deepvlab.ai/');
    });

    it('should format a 402 No quota configuration error in Chinese', () => {
      // 模拟中文环境
      vi.mocked(isChineseLocale).mockReturnValueOnce(true);

      const errorMessage =
        'got status: 402 Payment Required. {"error":{"code":402,"message":"No quota configuration","status":"PAYMENT_REQUIRED"}}';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('🚫');
      expect(result).toContain('402');
      expect(result).toContain('Credit');
      expect(result).toContain('https://dvcode.deepvlab.ai/');
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
    });

    it('should format a REGION_BLOCKED_451 error without JSON message', () => {
      const errorMessage = 'REGION_BLOCKED_451: Service blocked in this region';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('🌍 Region Access Restricted (451)');
      expect(result).toContain('DeepV Code service is not available in your current region');
    });

    it('should format a 451 structured error', () => {
      const error: StructuredError = {
        message: 'Region blocked',
        status: 451,
      };

      const result = parseAndFormatApiError(error);

      expect(result).toContain('🌍 Region Access Restricted (451)');
    });

    it('should format a string error containing 451 and region keywords', () => {
      const errorMessage = 'API Error 451: region not supported';

      const result = parseAndFormatApiError(errorMessage);

      expect(result).toContain('🌍 Region Access Restricted (451)');
    });
  });
});
