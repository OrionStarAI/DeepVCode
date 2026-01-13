/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { tp } from './i18n.js';
import wrapAnsi from 'wrap-ansi';

/**
 * 文本截断配置
 */
export interface TextTruncationConfig {
  /** 最大行数阈值 */
  maxRows: number;
  /** 终端宽度（用于软换行计算） */
  terminalWidth: number;
  /** 头部保留行数比例（默认 0.5） */
  headRatio?: number;
}

/**
 * 截断结果
 */
export interface TruncatedText {
  /** 显示用的文本（可能被截断） */
  displayText: string;
  /** 完整的原始文本（用于复制/发送） */
  fullText: string;
  /** 是否被截断 */
  isTruncated: boolean;
  /** 被省略的行数 */
  omittedLines?: number;
  /** 省略提示的占位符（用于在渲染时替换为特殊样式） */
  omittedPlaceholder?: string;
}

/**
 * 将文本按终端宽度进行软换行，返回逻辑行数组
 */
function wrapTextToLines(text: string, terminalWidth: number): string[] {
  if (!text) return [];

  try {
    // 使用 wrap-ansi 进行智能换行（支持 ANSI 颜色代码）
    // @ts-ignore - handle ESM default import compatibility
    const wrapped = (wrapAnsi.default || wrapAnsi)(text, terminalWidth, { hard: false, trim: false });
    return wrapped.split('\n');
  } catch (error) {
    // 降级处理：简单分行
    return text.split('\n');
  }
}

/**
 * 截断长文本，采用"头部 + 省略提示 + 尾部"的策略
 *
 * @param text 原始文本
 * @param config 截断配置
 * @returns 截断结果
 */
export function truncateText(
  text: string,
  config: TextTruncationConfig
): TruncatedText {
  const { maxRows, terminalWidth, headRatio = 0.5 } = config;

  // 获取逻辑行
  const lines = wrapTextToLines(text, terminalWidth);
  const totalLines = lines.length;

  // 短文本：不截断
  if (totalLines <= maxRows) {
    return {
      displayText: text,
      fullText: text,
      isTruncated: false,
    };
  }

  // 长文本：头尾 + 省略
  // 计算头部和尾部行数（中间预留 1 行给省略提示）
  const headRows = Math.ceil(maxRows * headRatio) - 1;
  const tailRows = maxRows - headRows - 1;
  const omittedLines = totalLines - headRows - tailRows;

  // 提取头部和尾部
  const headLines = lines.slice(0, headRows);
  const tailLines = lines.slice(-tailRows);

  // 构建省略提示行
  const omittedNotice = tp('text_truncator.omitted_lines', {
    count: omittedLines,
  });

  // 使用特殊占位符标记省略提示（后续渲染时可识别并应用特殊样式）
  const OMITTED_PLACEHOLDER = '___OMITTED_NOTICE___';

  // 组合显示文本
  const displayLines = [
    ...headLines,
    OMITTED_PLACEHOLDER,
    ...tailLines,
  ];
  const displayText = displayLines.join('\n');

  return {
    displayText,
    fullText: text,
    isTruncated: true,
    omittedLines,
    omittedPlaceholder: OMITTED_PLACEHOLDER,
  };
}

/**
 * 获取不同场景的默认阈值
 */
export function getDefaultMaxRows(
  scenario: 'sent' | 'refined',
  viewportRows: number
): number {
  if (scenario === 'sent') {
    // 发送原文：更严格的阈值
    return Math.min(8, viewportRows - 1);
  } else {
    // Refine 结果：更宽松的阈值，但不超过一屏
    return Math.min(viewportRows - 1, 16);
  }
}
