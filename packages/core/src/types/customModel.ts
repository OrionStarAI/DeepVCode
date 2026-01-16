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
   * - true: Auto-enable thinking with budget_tokens = maxTokens - 1
   * - false/undefined: Disable thinking
   * @see https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking
   */
  enableThinking?: boolean;
}

/**
 * 生成自定义模型的内部ID
 * 格式: custom:{displayName}
 */
export function generateCustomModelId(displayName: string): string {
  return `custom:${displayName}`;
}

/**
 * 从内部ID提取displayName
 */
export function extractDisplayName(modelId: string): string | null {
  if (!isCustomModel(modelId)) {
    return null;
  }
  return modelId.replace('custom:', '');
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
