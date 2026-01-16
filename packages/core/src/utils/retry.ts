/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '../core/contentGenerator.js';
import {
  isProQuotaExceededError,
  isGenericQuotaExceededError,
  isDeepXQuotaError,
} from './quotaErrorDetection.js';

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  shouldRetry: (error: Error) => boolean;
  onPersistent429?: (
    authType?: string,
    error?: unknown,
  ) => Promise<string | boolean | null>;
  authType?: string;
  /**
   * 是否使用更激进的退避策略（用于高负载场景如批量工具调用）
   * 当 true 时，使用更大的初始延迟和更慢的退避速度
   */
  aggressiveBackoff?: boolean;
}

/**
 * 默认重试配置 - 符合 Google Cloud 指数退避建议
 * @see https://cloud.google.com/storage/docs/retry-strategy#exponential-backoff
 *
 * 标准退避序列 (jitter ±30%):
 * - 第1次重试: ~1s (0.7s - 1.3s)
 * - 第2次重试: ~2s (1.4s - 2.6s)
 * - 第3次重试: ~4s (2.8s - 5.2s)
 * - 第4次重试: ~8s (5.6s - 10.4s)
 * - 第5次重试: ~16s (11.2s - 20.8s)
 * - 第6次重试: ~32s -> capped at 32s
 */
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 6, // 增加到6次，更宽容的重试
  initialDelayMs: 1000, // 从1秒开始，符合标准指数退避
  maxDelayMs: 32000, // 32秒最大延迟，符合 Google 建议
  shouldRetry: defaultShouldRetry,
  aggressiveBackoff: false,
};

/**
 * 激进退避配置 - 用于高负载场景（如大量工具调用触发429）
 *
 * 激进退避序列 (jitter ±30%):
 * - 第1次重试: ~5s (3.5s - 6.5s)
 * - 第2次重试: ~10s (7s - 13s)
 * - 第3次重试: ~20s (14s - 26s)
 * - 第4次重试: ~40s (28s - 52s)
 * - 第5次重试: ~60s -> capped at 60s
 */
const AGGRESSIVE_RETRY_OPTIONS: Partial<RetryOptions> = {
  maxAttempts: 5,
  initialDelayMs: 5000, // 5秒初始延迟
  maxDelayMs: 60000, // 60秒最大延迟
};

/**
 * Default predicate function to determine if a retry should be attempted.
 * Retries on 429 (Too Many Requests) and 5xx server errors.
 * @param error The error object.
 * @returns True if the error is a transient error, false otherwise.
 */
function defaultShouldRetry(error: Error | unknown): boolean {
  // 🚫 DeepX配额错误不应重试 - 需要立即显示友好提示
  if (isDeepXQuotaError(error)) {
    return false;
  }

  // Check for common transient error status codes either in message or a status property
  if (error && typeof (error as { status?: number }).status === 'number') {
    const status = (error as { status: number }).status;
    if (status === 429 || (status >= 500 && status < 600)) {
      return true;
    }
  }
  if (error instanceof Error && error.message) {
    if (error.message.includes('429')) return true;
    if (error.message.match(/5\d{2}/)) return true;
  }
  return false;
}

/**
 * Delays execution for a specified number of milliseconds.
 * @param ms The number of milliseconds to delay.
 * @returns A promise that resolves after the delay.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries a function with exponential backoff and jitter.
 * @param fn The asynchronous function to retry.
 * @param options Optional retry configuration.
 * @returns A promise that resolves with the result of the function if successful.
 * @throws The last error encountered if all attempts fail.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>,
): Promise<T> {
  // 根据 aggressiveBackoff 选项决定使用哪个默认配置
  const baseOptions = options?.aggressiveBackoff
    ? { ...DEFAULT_RETRY_OPTIONS, ...AGGRESSIVE_RETRY_OPTIONS }
    : DEFAULT_RETRY_OPTIONS;

  const {
    maxAttempts,
    initialDelayMs,
    maxDelayMs,
    onPersistent429,
    authType,
    shouldRetry,
  } = {
    ...baseOptions,
    ...options,
  };

  let attempt = 0;
  let currentDelay = initialDelayMs;
  let consecutive429Count = 0;
  const startTime = Date.now();

  // 🛡️ Helper to check if auth type supports fallback (OAuth only)
  const supportsFallback = authType && (authType.toLowerCase().includes('oauth') || authType.toLowerCase().includes('personal'));

  while (attempt < maxAttempts) {
    attempt++;
    try {
      return await fn();
    } catch (error) {
      // 🚨 用户中断错误 - 立即停止重试
      if (error instanceof Error &&
          (error.message.includes('cancelled by user') || error.name === 'AbortError')) {
        throw error;
      }

      const errorStatus = getErrorStatus(error);

      // Check for Pro quota exceeded error first - immediate fallback for OAuth users
      if (onPersistent429 && supportsFallback && isProQuotaExceededError(error)) {
        try {
          const fallbackModel = await onPersistent429!(authType, error);
          if (fallbackModel !== false && fallbackModel !== null) {
            // Reset attempt counter and try with new model
            attempt = 0;
            consecutive429Count = 0;
            currentDelay = initialDelayMs;
            // With the model updated, we continue to the next attempt
            continue;
          } else if (fallbackModel === null) {
            // Fallback handler returned null, meaning don't continue - stop retry process
            throw error;
          }
        } catch (fallbackError) {
          // If fallback fails, continue with original error
          console.warn('Fallback to Flash model failed:', fallbackError);
        }
      }

      // Check for generic quota exceeded error (but not Pro, which was handled above) - immediate fallback for OAuth users
      if (onPersistent429 && supportsFallback && isGenericQuotaExceededError(error)) {
        try {
          const fallbackModel = await onPersistent429!(authType, error);
          if (fallbackModel !== false && fallbackModel !== null) {
            // Reset attempt counter and try with new model
            attempt = 0;
            consecutive429Count = 0;
            currentDelay = initialDelayMs;
            // With the model updated, we continue to the next attempt
            continue;
          } else if (fallbackModel === null) {
            // Fallback handler returned null, meaning don't continue - stop retry process
            throw error;
          }
        } catch (fallbackError) {
          // If fallback fails, continue with original error
          console.warn('Fallback to Flash model failed:', fallbackError);
        }
      }

      // Track consecutive 429 errors
      if (errorStatus === 429) {
        consecutive429Count++;
      } else {
        consecutive429Count = 0;
      }

      // If we have persistent 429s and a fallback callback for OAuth
      // We trigger fallback after 2 consecutive 429s to be proactive
      if (onPersistent429 && supportsFallback && consecutive429Count >= 2) {
        try {
          const fallbackModel = await onPersistent429!(authType, error);
          if (fallbackModel !== false && fallbackModel !== null) {
            // Reset attempt counter and try with new model
            attempt = 0;
            consecutive429Count = 0;
            currentDelay = initialDelayMs;
            // With the model updated, we continue to the next attempt
            continue;
          } else if (fallbackModel === null) {
            // Fallback handler returned null, meaning don't continue - stop retry process
            throw error;
          }
        } catch (fallbackError) {
          // If fallback fails, continue with original error
          console.warn('Fallback to Flash model failed:', fallbackError);
        }
      }

      // Check if we've exhausted retries or shouldn't retry
      if (attempt >= maxAttempts || !shouldRetry(error as Error)) {
        const totalDuration = Date.now() - startTime;
        console.warn(
          `[Retry] All ${attempt} attempts exhausted after ${Math.round(totalDuration / 1000)}s. ` +
          `Last error: ${errorStatus ?? 'unknown'}`
        );
        throw error;
      }

      const { delayDurationMs, errorStatus: delayErrorStatus } =
        getDelayDurationAndStatus(error);

      if (delayDurationMs > 0) {
        // Respect Retry-After header if present and parsed
        // 服务端返回的 Retry-After 通常更准确，优先使用
        console.warn(
          `[Retry] Attempt ${attempt}/${maxAttempts} failed (${delayErrorStatus ?? 'unknown'}). ` +
          `Server requested retry after ${Math.round(delayDurationMs / 1000)}s`
        );
        await delay(delayDurationMs);
        // Reset currentDelay for next potential non-429 error, or if Retry-After is not present next time
        currentDelay = initialDelayMs;
      } else {
        // Fall back to exponential backoff with jitter
        // Google recommends: delay = min(maxDelay, initialDelay * 2^attempt + random_jitter)
        // Add jitter: +/- 30% of currentDelay
        const jitter = currentDelay * 0.3 * (Math.random() * 2 - 1);
        const delayWithJitter = Math.max(0, currentDelay + jitter);

        logRetryAttempt(attempt, maxAttempts, error, errorStatus, delayWithJitter);
        await delay(delayWithJitter);
        currentDelay = Math.min(maxDelayMs, currentDelay * 2);
      }
    }
  }
  // This line should theoretically be unreachable due to the throw in the catch block.
  // Added for type safety and to satisfy the compiler that a promise is always returned.
  throw new Error('Retry attempts exhausted');
}

/**
 * Extracts the HTTP status code from an error object.
 * @param error The error object.
 * @returns The HTTP status code, or undefined if not found.
 */
export function getErrorStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null) {
    if ('status' in error && typeof error.status === 'number') {
      return error.status;
    }
    // Check for error.response.status (common in axios errors)
    if (
      'response' in error &&
      typeof (error as { response?: unknown }).response === 'object' &&
      (error as { response?: unknown }).response !== null
    ) {
      const response = (
        error as { response: { status?: unknown; headers?: unknown } }
      ).response;
      if ('status' in response && typeof response.status === 'number') {
        return response.status;
      }
    }
  }
  return undefined;
}

/**
 * Extracts the Retry-After delay from an error object's headers.
 * @param error The error object.
 * @returns The delay in milliseconds, or 0 if not found or invalid.
 */
function getRetryAfterDelayMs(error: unknown): number {
  if (typeof error === 'object' && error !== null) {
    // Check for error.response.headers (common in axios errors)
    if (
      'response' in error &&
      typeof (error as { response?: unknown }).response === 'object' &&
      (error as { response?: unknown }).response !== null
    ) {
      const response = (error as { response: { headers?: unknown } }).response;
      if (
        'headers' in response &&
        typeof response.headers === 'object' &&
        response.headers !== null
      ) {
        const headers = response.headers as { 'retry-after'?: unknown };
        const retryAfterHeader = headers['retry-after'];
        if (typeof retryAfterHeader === 'string') {
          const retryAfterSeconds = parseInt(retryAfterHeader, 10);
          if (!isNaN(retryAfterSeconds)) {
            return retryAfterSeconds * 1000;
          }
          // It might be an HTTP date
          const retryAfterDate = new Date(retryAfterHeader);
          if (!isNaN(retryAfterDate.getTime())) {
            return Math.max(0, retryAfterDate.getTime() - Date.now());
          }
        }
      }
    }
  }
  return 0;
}

/**
 * Determines the delay duration based on the error, prioritizing Retry-After header.
 * @param error The error object.
 * @returns An object containing the delay duration in milliseconds and the error status.
 */
function getDelayDurationAndStatus(error: unknown): {
  delayDurationMs: number;
  errorStatus: number | undefined;
} {
  const errorStatus = getErrorStatus(error);
  let delayDurationMs = 0;

  if (errorStatus === 429) {
    delayDurationMs = getRetryAfterDelayMs(error);
  }
  return { delayDurationMs, errorStatus };
}

/**
 * Logs a message for a retry attempt when using exponential backoff.
 *
 * 日志格式符合 Google Cloud 可观测性最佳实践：
 * - 包含尝试次数、最大尝试次数、延迟时间
 * - 区分 429 限流和 5xx 服务器错误
 *
 * @param attempt The current attempt number.
 * @param maxAttempts The maximum number of attempts.
 * @param error The error that caused the retry.
 * @param errorStatus The HTTP status code of the error, if available.
 * @param delayMs The delay before the next retry in milliseconds.
 */
function logRetryAttempt(
  attempt: number,
  maxAttempts: number,
  error: unknown,
  errorStatus?: number,
  delayMs?: number,
): void {
  const delayStr = delayMs ? `${Math.round(delayMs / 1000)}s` : 'unknown';

  if (errorStatus === 429) {
    // 429 限流 - 使用 warn 级别，用户友好的提示
    console.warn(
      `⏳ [Retry] Rate limited (429). Attempt ${attempt}/${maxAttempts}, waiting ${delayStr} before retry...`
    );
  } else if (errorStatus && errorStatus >= 500 && errorStatus < 600) {
    // 5xx 服务器错误 - 使用 error 级别
    console.error(
      `[Retry] Server error (${errorStatus}). Attempt ${attempt}/${maxAttempts}, retrying in ${delayStr}...`
    );
  } else if (error instanceof Error) {
    // 网络连接错误 - 友好提示
    const isConnectionError = error instanceof TypeError &&
      (error.message.includes('fetch failed') ||
       error.message.includes('ECONNREFUSED') ||
       (error as any).cause?.code === 'ECONNREFUSED');

    if (isConnectionError) {
      console.warn(
        `🔄 [Retry] Connection failed. Attempt ${attempt}/${maxAttempts}, retrying in ${delayStr}...`
      );
    } else if (error.message.includes('429')) {
      // 错误消息中包含 429 但没有 status 属性
      console.warn(
        `⏳ [Retry] Rate limited (429 in message). Attempt ${attempt}/${maxAttempts}, waiting ${delayStr}...`
      );
    } else if (error.message.match(/5\d{2}/)) {
      console.error(
        `[Retry] Server error (5xx in message). Attempt ${attempt}/${maxAttempts}, retrying in ${delayStr}...`
      );
    } else {
      console.warn(
        `[Retry] Attempt ${attempt}/${maxAttempts} failed, retrying in ${delayStr}...`
      );
    }
  } else {
    console.warn(
      `[Retry] Attempt ${attempt}/${maxAttempts} failed, retrying in ${delayStr}...`
    );
  }
}
