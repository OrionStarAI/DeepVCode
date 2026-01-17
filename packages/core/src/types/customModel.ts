/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 自定义模型提供商类型
 * - openai: OpenAI 兼容格式（OpenAI API、Azure OpenAI、Groq、Together AI 等）
 * - anthropic: Anthropic Claude API 格式
 */
export type CustomModelProvider = 'openai' | 'anthropic';

/**
 * 自定义模型配置接口
 * 支持用户配置标准OpenAI兼容格式和Claude API格式的自定义模型
 */
export interface CustomModelConfig {
  /** 显示名称，在UI中展示，同时作为唯一标识符 */
  displayName: string;

  /** 提供商类型 */
  provider: CustomModelProvider;

  /** API基础URL */
  baseUrl: string;

  /** API密钥，支持环境变量替换（如 ${OPENAI_API_KEY}） */
  apiKey: string;

  /** 模型ID（传递给API的实际模型名称） */
  modelId: string;

  /** 最大token数（上下文窗口大小） */
  maxTokens?: number;

  /** 是否启用此模型 */
  enabled?: boolean;

  /** 额外的HTTP headers（可选） */
  headers?: Record<string, string>;

  /** 超时时间（毫秒，可选） */
  timeout?: number;

  /**
   * Enable Anthropic extended thinking (only for anthropic provider)
   * - true: Force enable thinking with budget_tokens = min(maxTokens - 1, 31999)
   * - false: Force disable thinking
   * - undefined (default): Auto-enable for all Anthropic models
   *   (Models that don't support thinking will ignore this parameter)
   *
   * When enabled, thinking content will be displayed in the UI as "Reasoning" before the response.
   * Official recommended budget_tokens: 31999
   * @see https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking
   */
  enableThinking?: boolean;
}

/**
 * 生成自定义模型的唯一键
 * 基于 provider + baseUrl + modelId 确定唯一性
 */
export function generateCustomModelKey(config: CustomModelConfig): string {
  return `${config.provider}|${config.baseUrl}|${config.modelId}`;
}

/**
 * 生成自定义模型的内部ID（用于 UI 选择和配置保存）
 * 格式: custom:{provider}:{modelId}@{baseUrlHash}
 *
 * 使用简短的 baseUrl hash 避免 ID 过长，同时保证唯一性
 */
export function generateCustomModelId(config: CustomModelConfig): string {
  // 简单的字符串哈希函数
  const hashString = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 6);
  };

  const baseUrlHash = hashString(config.baseUrl);
  return `custom:${config.provider}:${config.modelId}@${baseUrlHash}`;
}

/**
 * @deprecated 使用 generateCustomModelId(config) 代替
 * 仅用于向后兼容旧格式 custom:{displayName}
 */
export function generateLegacyCustomModelId(displayName: string): string {
  return `custom:${displayName}`;
}

/**
 * 从内部ID提取provider
 * 支持新格式 custom:{provider}:{modelId}@{hash} 和旧格式 custom:{displayName}
 */
export function extractProvider(modelId: string): CustomModelProvider | null {
  if (!isCustomModel(modelId)) {
    return null;
  }
  const withoutPrefix = modelId.replace('custom:', '');
  if (withoutPrefix.startsWith('openai:')) {
    return 'openai';
  }
  if (withoutPrefix.startsWith('anthropic:')) {
    return 'anthropic';
  }
  return null;
}

/**
 * 验证自定义模型配置
 */
export function validateCustomModelConfig(config: CustomModelConfig): string[] {
  const errors: string[] = [];

  if (!config.displayName || typeof config.displayName !== 'string') {
    errors.push('displayName is required and must be a string');
  }

  if (!['openai', 'anthropic'].includes(config.provider)) {
    errors.push('provider must be one of: openai, anthropic');
  }

  if (!config.baseUrl || typeof config.baseUrl !== 'string') {
    errors.push('baseUrl is required and must be a string');
  }

  if (!config.apiKey || typeof config.apiKey !== 'string') {
    errors.push('apiKey is required and must be a string');
  }

  if (!config.modelId || typeof config.modelId !== 'string') {
    errors.push('modelId is required and must be a string');
  }

  if (config.maxTokens !== undefined && (typeof config.maxTokens !== 'number' || config.maxTokens <= 0)) {
    errors.push('maxTokens must be a positive number if specified');
  }

  if (config.timeout !== undefined && (typeof config.timeout !== 'number' || config.timeout <= 0)) {
    errors.push('timeout must be a positive number if specified');
  }

  return errors;
}

/**
 * 检查模型是否为自定义模型
 * 格式: custom:{displayName}
 */
export function isCustomModel(modelName: string): boolean {
  return modelName.startsWith('custom:');
}
