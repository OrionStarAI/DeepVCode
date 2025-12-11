/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Footer显示优化工具函数
 * 根据终端宽度智能调整显示内容
 */

/**
 * 智能缩短版本号
 * 完整: v1.0.161(22.19.0)
 * 简化: v1.0.161
 * @param version 版本号 (如: "1.0.161")
 * @param includeNodeVersion 是否包含Node版本
 */
export function getShortVersion(version: string, includeNodeVersion: boolean = false): string {
  if (includeNodeVersion) {
    return `v${version}(${process.versions.node})`;
  }
  return `v${version}`;
}

/**
 * 智能缩短模型名称
 * 完整: Claude-3.5-Sonnet → Claude-Sonnet-4.5
 * 简化: Sonnet-4.5 (去掉供应商前缀)
 *
 * @param modelName 完整模型名
 * @param simplified 是否使用简化版本
 */
export function getShortModelName(modelName: string, simplified: boolean = false): string {
  if (!simplified) {
    return modelName;
  }

  // 移除常见的供应商前缀
  const patterns = [
    /^Claude-(?:3\.5-)?(.+)$/i,      // Claude-3.5-Sonnet → Sonnet
    /^Claude-(.+)$/i,                // Claude-Opus → Opus
    /^Gemini-(?:2\.0-)?(.+)$/i,      // Gemini-2.0-Flash → Flash
    /^Gemini-(.+)$/i,                // Gemini-Pro → Pro
    /^GPT-(.+)$/i,                   // GPT-4 → 4
    /^OpenAI-(.+)$/i,                // OpenAI-GPT4 → GPT4
  ];

  for (const pattern of patterns) {
    const match = modelName.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  // 如果没有匹配到模式，返回原名称
  return modelName;
}

/**
 * 智能缩短上下文显示文本
 * 完整: (92% context left)
 * 简化: 92%
 *
 * @param percentage 百分比数值
 * @param simplified 是否使用简化版本
 */
export function getContextDisplay(percentage: number | string, simplified: boolean = false): string {
  const percentText = `${percentage}%`;

  if (simplified) {
    return percentText;
  }

  return `(${percentText} context left)`;
}

/**
 * 根据终端宽度获取Footer显示配置
 *
 * @param terminalWidth 终端宽度（列数）
 * @returns 显示配置对象
 */
export interface FooterDisplayConfig {
  /** 是否显示Node版本 */
  showNodeVersion: boolean;
  /** 是否简化上下文显示 */
  simplifyContext: boolean;
  /** 是否简化模型名称 */
  simplifyModel: boolean;
  /** 显示级别描述 */
  level: 'full' | 'compact';
}

export function getFooterDisplayConfig(terminalWidth: number): FooterDisplayConfig {
  // Level 1: 完整显示 (宽度 >= 80列)
  if (terminalWidth >= 80) {
    return {
      showNodeVersion: true,
      simplifyContext: false,
      simplifyModel: false,
      level: 'full',
    };
  }

  // Level 2: 简化显示 (宽度 60-79列)
  return {
    showNodeVersion: false,
    simplifyContext: true,
    simplifyModel: true,
    level: 'compact',
  };
}
