/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SubAgentDisplay } from './tools.js';

/**
 * 结构化的工具输出消息格式
 * 替代ugly的字符串前缀比较
 */
export interface ToolOutputMessage {
  type: 'text' | 'subagent_update' | 'structured_data';
  data: any;
  timestamp?: number;
}

/**
 * SubAgent更新消息
 */
export interface SubAgentUpdateMessage extends ToolOutputMessage {
  type: 'subagent_update';
  data: SubAgentDisplay;
}

/**
 * 普通文本消息
 */
export interface TextOutputMessage extends ToolOutputMessage {
  type: 'text';
  data: string;
}

/**
 * 创建SubAgent更新消息
 */
export function createSubAgentUpdateMessage(data: SubAgentDisplay): string {
  const message: SubAgentUpdateMessage = {
    type: 'subagent_update',
    data,
    timestamp: Date.now(),
  };
  return JSON.stringify(message);
}

/**
 * 创建文本输出消息
 */
export function createTextOutputMessage(text: string): string {
  const message: TextOutputMessage = {
    type: 'text',
    data: text,
    timestamp: Date.now(),
  };
  return JSON.stringify(message);
}

/**
 * 解析工具输出消息
 * 如果不是JSON格式，则认为是纯文本
 */
export function parseToolOutputMessage(output: string): ToolOutputMessage {
  try {
    const parsed = JSON.parse(output);
    if (parsed && typeof parsed === 'object' && parsed.type && parsed.data !== undefined) {
      return parsed as ToolOutputMessage;
    }
  } catch (error) {
    // JSON解析失败，认为是纯文本
  }
  
  // 默认返回文本消息
  return {
    type: 'text',
    data: output,
    timestamp: Date.now(),
  };
}

/**
 * 类型守卫：检查是否是SubAgent更新消息
 */
export function isSubAgentUpdateMessage(message: ToolOutputMessage): message is SubAgentUpdateMessage {
  return message.type === 'subagent_update';
}

/**
 * 类型守卫：检查是否是文本消息
 */
export function isTextOutputMessage(message: ToolOutputMessage): message is TextOutputMessage {
  return message.type === 'text';
}
