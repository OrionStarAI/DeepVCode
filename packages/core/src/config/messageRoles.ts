/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 消息角色常量定义
 * 
 * 用于大模型消息交互中的角色标识，统一管理所有角色相关的字符串常量
 */

export const MESSAGE_ROLES = {
  /** 用户角色 - 用户发送的消息 */
  USER: 'user' as const,
  /** 模型角色 - AI模型的响应 */
  MODEL: 'model' as const,
} as const;

// 类型导出，便于类型检查
export type MessageRole = typeof MESSAGE_ROLES[keyof typeof MESSAGE_ROLES];
