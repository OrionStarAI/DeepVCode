/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'crypto';

let cachedSessionId: string | undefined;

/**
 * 获取或生成会话ID。
 * 使用懒加载模式确保同一个进程中始终使用相同的会话ID。
 * 避免在module level生成，防止每次导入时都重新生成。
 */
export function getSessionId(): string {
  if (!cachedSessionId) {
    cachedSessionId = randomUUID();
  }
  return cachedSessionId;
}

/**
 * 设置会话ID（用于恢复已保存的会话）
 */
export function setSessionId(newSessionId: string): void {
  cachedSessionId = newSessionId;
}

/**
 * 重置会话ID（仅用于测试）
 */
export function resetSessionId(): void {
  cachedSessionId = undefined;
}

/**
 * @deprecated 使用 getSessionId() 代替
 * 保留此导出用于向后兼容，但它不再适合作为默认导出
 */
export const sessionId = getSessionId();
