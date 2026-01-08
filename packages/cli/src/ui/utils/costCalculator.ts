/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @deprecated
 * 此文件已不再使用。费用显示功能已从CLI中移除。
 * 相关模型配置位于 modelConfig.ts，同样已被标记为废弃。
 */

import { ModelMetrics } from '../contexts/SessionContext.js';
import { getModelConfig, getSupportedModelNames } from 'deepv-code-core';

export interface ModelCost {
  baseInput: number;
  cacheRead: number;        // Claude模型的缓存读取费用
  cacheWrite: number;       // Claude模型的缓存写入费用
  cacheInput?: number;      // Gemini模型的缓存输入费用
  cacheStorage?: number;    // Gemini模型的缓存存储费用 (需要时长计算)
  outputTokens: number;
  total: number;
  modelType: 'claude' | 'gemini'; // 标识模型类型以便UI显示
}

/**
 * 计算指定模型的成本
 * @param modelName 模型名称
 * @param modelMetrics 模型指标数据
 * @param cacheStorageHours Gemini模型缓存存储时长(小时)，默认1小时
 * @returns 成本信息，如果不是支持的模型则返回null
 */
export function calculateModelCost(modelName: string, modelMetrics: ModelMetrics, cacheStorageHours: number = 1): ModelCost | null {
  const config = getModelConfig(modelName);
  if (!config) {
    return null;
  }

  const pricing = config.pricing;

  // 获取主会话token数量
  const mainPromptTokens = modelMetrics.tokens.prompt || 0;
  const mainCacheWriteTokens = modelMetrics.tokens.cacheWrite || 0;
  const mainCacheReadTokens = modelMetrics.tokens.cacheRead || 0;
  const mainOutputTokens = modelMetrics.tokens.candidates || 0;

  // 获取subAgent token数量
  const subAgentPromptTokens = modelMetrics.subAgents.tokens.prompt || 0;
  const subAgentCacheWriteTokens = modelMetrics.subAgents.tokens.cacheWrite || 0;
  const subAgentCacheReadTokens = modelMetrics.subAgents.tokens.cacheRead || 0;
  const subAgentOutputTokens = modelMetrics.subAgents.tokens.candidates || 0;

  // 计算总token数量（主会话 + subAgent）
  const totalPromptTokens = mainPromptTokens + subAgentPromptTokens;
  const totalCacheWriteTokens = mainCacheWriteTokens + subAgentCacheWriteTokens;
  const totalCacheReadTokens = mainCacheReadTokens + subAgentCacheReadTokens;
  const totalOutputTokens = mainOutputTokens + subAgentOutputTokens;

  // 判断是Claude还是Gemini模型
  const isClaudeModel = modelName.includes('claude');
  const isGeminiModel = modelName.includes('gemini');

  let costs: ModelCost;

  if (isClaudeModel) {
    // Claude模型计算逻辑
    // base input tokens = prompt - cache_write - cache_read
    const baseInputTokens = totalPromptTokens - totalCacheWriteTokens - totalCacheReadTokens;

    costs = {
      baseInput: Math.max(0, baseInputTokens) * pricing.baseInput,
      cacheRead: totalCacheReadTokens * (pricing.cacheRead || 0),
      cacheWrite: totalCacheWriteTokens * (pricing.cacheWrite || 0),
      outputTokens: totalOutputTokens * pricing.outputTokens,
      total: 0,
      modelType: 'claude'
    };

    costs.total = costs.baseInput + costs.cacheRead + costs.cacheWrite + costs.outputTokens;

  } else if (isGeminiModel) {
    // Gemini模型计算逻辑
    // 假设cache tokens是总prompt的一部分，其余为base input
    const cacheInputTokens = totalCacheReadTokens; // 使用cacheRead字段表示缓存命中的tokens
    const baseInputTokens = totalPromptTokens - cacheInputTokens;

    costs = {
      baseInput: Math.max(0, baseInputTokens) * pricing.baseInput,
      cacheRead: 0, // Gemini不使用此字段
      cacheWrite: 0, // Gemini不使用此字段
      cacheInput: cacheInputTokens * (pricing.cacheInput || 0),
      cacheStorage: totalCacheWriteTokens * (pricing.cacheStorage || 0) * cacheStorageHours, // 使用cacheWrite字段表示缓存的tokens
      outputTokens: totalOutputTokens * pricing.outputTokens,
      total: 0,
      modelType: 'gemini'
    };

    costs.total = costs.baseInput + (costs.cacheInput || 0) + (costs.cacheStorage || 0) + costs.outputTokens;

  } else {
    return null;
  }

  return costs;
}

/**
 * 获取支持的模型列表
 * @returns 支持成本计算的模型名称数组
 */
export function getSupportedModels(): string[] {
  // 现在直接使用modelConfig的函数
  return getSupportedModelNames();
}

/**
 * 检查模型是否支持成本计算
 * @param modelName 模型名称
 * @returns 是否支持
 */
export function isModelSupported(modelName: string): boolean {
  return getModelConfig(modelName) !== null;
}
