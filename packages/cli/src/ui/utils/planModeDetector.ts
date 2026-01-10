/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * Plan Mode Detector
 *
 * Detects Plan mode state changes from messages and external sources.
 * Used to keep Plan mode state in sync between CLI and VS Code extension.
 */

export interface PlanModeDetectionResult {
  modeChanged: boolean;
  newMode: boolean; // true = entered, false = exited
  source: 'message' | 'command' | 'unknown';
}

/**
 * 检测消息内容中的 Plan 模式状态变更
 * Detects plan mode state changes from message content
 */
export function detectPlanModeChange(messageContent: string): PlanModeDetectionResult {
  const content = messageContent.toLowerCase().trim();

  // 检测 Plan 模式激活指令
  if (content.includes('[plan mode active]') ||
      content.includes('plan mode active') ||
      /\bplan\s+mode\s+active\b/.test(content)) {
    return {
      modeChanged: true,
      newMode: true,
      source: 'message'
    };
  }

  // 检测 Plan 模式退出指令
  if (content.includes('[plan mode exited]') ||
      content.includes('plan mode exited') ||
      /plan\s+mode\s+exited/.test(content)) {
    return {
      modeChanged: true,
      newMode: false,
      source: 'message'
    };
  }

  return {
    modeChanged: false,
    newMode: false,
    source: 'unknown'
  };
}

/**
 * 验证是否为 Plan 模式退出标记消息
 * Checks if message is specifically a plan mode exit marker
 */
export function isPlanModeExitMarker(messageContent: string): boolean {
  return messageContent.toLowerCase().includes('[plan mode exited]') ||
         messageContent.toLowerCase().includes('plan mode exited');
}

/**
 * 验证是否为 Plan 模式进入标记消息
 * Checks if message is specifically a plan mode entry marker
 */
export function isPlanModeEntryMarker(messageContent: string): boolean {
  return messageContent.toLowerCase().includes('[plan mode active]') ||
         messageContent.toLowerCase().includes('plan mode active');
}

/**
 * 获取 Plan 模式标记消息类型
 * Returns the type of plan mode marker, if any
 */
export function getPlanModeMArkerType(messageContent: string): 'entry' | 'exit' | 'none' {
  if (isPlanModeExitMarker(messageContent)) {
    return 'exit';
  }
  if (isPlanModeEntryMarker(messageContent)) {
    return 'entry';
  }
  return 'none';
}
