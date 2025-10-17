/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 统一的模型配置文件
 * 整合了所有支持模型的输出限制、token限制、定价等完整信息
 * 基于2024年12月的官方搜索结果和Vertex AI平台定价
 * 
 * 🔗 主要数据来源:
 * - Anthropic官方: https://docs.anthropic.com/zh-CN/docs/about-claude/pricing
 * - Google Cloud Vertex AI: https://cloud.google.com/vertex-ai/generative-ai/pricing?hl=zh-CN
 * - Firebase模型文档: https://firebase.google.com/docs/vertex-ai/models?hl=zh-cn
 * - GitHub LLM价格对比: https://github.com/syaoranwe/LLM-Price/blob/main/README.md
 * - CometAPI分析: https://www.cometapi.com/zh-CN/how-much-does-gemini-2-5-pro-cost-access-pricing/
 * - Cursor IDE博客: https://www.cursor-ide.com/blog/gemini-2-5-pro-vs-claude-4-chinese-comparison
 */

export interface ModelConfiguration {
  // 基本信息
  name: string;
  displayName: string;
  provider: 'anthropic' | 'google';
  family: 'claude' | 'gemini';
  version: string;
  
  // Token限制
  contextWindow: number;      // 上下文窗口大小
  maxOutputTokens: number;    // 最大输出token数量
  
  // 定价信息 (每token价格)
  pricing: {
    baseInput: number;        // 基础输入价格
    outputTokens: number;     // 输出价格
    
    // Claude模型的缓存定价
    cacheRead?: number;       // 缓存读取价格 (0.1x基础价格)
    cacheWrite?: number;      // 缓存写入价格 (1.25x基础价格)
    
    // Gemini模型的缓存定价
    cacheInput?: number;      // 缓存输入价格 (10%基础价格)
    cacheStorage?: number;    // 缓存存储价格 (每token每小时)
  };
  
  // 特殊特性
  features: {
    multimodal?: boolean;     // 是否支持多模态
    caching?: boolean;        // 是否支持缓存
    batchDiscount?: number;   // 批处理折扣 (50% = 0.5)
  };
}

/**
 * 所有支持的模型配置
 * 基于官方文档和搜索结果的准确定价
 */
export const MODEL_CONFIGURATIONS: Record<string, ModelConfiguration> = {
  // Claude Sonnet 4
  // 数据来源:
  // - 官方定价: https://docs.anthropic.com/zh-CN/docs/about-claude/pricing
  // - 模型规格: https://docs.anthropic.com/zh-CN/docs/about-claude/models/overview
  // - 输出限制: https://docs.anthropic.com/zh-CN/docs/about-claude/models/overview
  // - 缓存机制: https://docs.anthropic.com/zh-CN/docs/build-with-claude/prompt-caching
  'claude-sonnet-4@20250514': {
    name: 'claude-sonnet-4@20250514',
    displayName: 'Claude Sonnet 4',
    provider: 'anthropic',
    family: 'claude',
    version: '4.0',
    contextWindow: 200_000,     // 200K tokens上下文窗口
    maxOutputTokens: 64_000,    // 64K tokens最大输出
    pricing: {
      baseInput: 0.000003,      // $3.00 / MTok
      outputTokens: 0.000015,   // $15.00 / MTok
      cacheRead: 0.0000003,     // $0.30 / MTok (0.1x基础价格)
      cacheWrite: 0.00000375,   // $3.75 / MTok (1.25x基础价格)
    },
    features: {
      multimodal: true,
      caching: true,            // 支持prompt caching
      batchDiscount: 0.5,       // 50%批处理折扣
    }
  },

  // Claude 3.5 Haiku
  // 数据来源:
  // - 官方定价: https://docs.anthropic.com/zh-CN/docs/about-claude/pricing
  // - 模型规格: https://docs.anthropic.com/zh-CN/docs/about-claude/models/overview
  // - GitHub价格对比: https://github.com/syaoranwe/LLM-Price/blob/main/README.md
  'claude-3-5-haiku@20241022': {
    name: 'claude-3-5-haiku@20241022',
    displayName: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    family: 'claude',
    version: '3.5',
    contextWindow: 200_000,     // 200K tokens上下文窗口
    maxOutputTokens: 8_192,     // 8K tokens最大输出
    pricing: {
      baseInput: 0.0000008,     // $0.80 / MTok
      outputTokens: 0.000004,   // $4.00 / MTok
      cacheRead: 0.00000008,    // $0.08 / MTok (0.1x基础价格)
      cacheWrite: 0.000001,     // $1.00 / MTok (1.25x基础价格)
    },
    features: {
      multimodal: false,        // 不支持多模态
      caching: true,            // 支持prompt caching
      batchDiscount: 0.5,       // 50%批处理折扣
    }
  },

  // Claude 3 Haiku
  // 数据来源:
  // - 官方定价: https://docs.anthropic.com/zh-CN/docs/about-claude/pricing
  // - 模型规格: https://docs.anthropic.com/zh-CN/docs/about-claude/models/overview
  // - GitHub价格对比: https://github.com/syaoranwe/LLM-Price/blob/main/README.md
  // - 智增增API文档: https://doc.zhizengzeng.com/doc-3979947
  'claude-3-haiku@20240307': {
    name: 'claude-3-haiku@20240307',
    displayName: 'Claude 3 Haiku',
    provider: 'anthropic',
    family: 'claude',
    version: '3.0',
    contextWindow: 200_000,     // 200K tokens上下文窗口
    maxOutputTokens: 4_096,     // 4K tokens最大输出
    pricing: {
      baseInput: 0.00000025,    // $0.25 / MTok
      outputTokens: 0.00000125, // $1.25 / MTok
      cacheRead: 0.000000025,   // $0.025 / MTok (0.1x基础价格)
      cacheWrite: 0.00000031,   // $0.31 / MTok (1.25x基础价格)
    },
    features: {
      multimodal: false,        // 不支持多模态
      caching: true,            // 支持prompt caching
      batchDiscount: 0.5,       // 50%批处理折扣
    }
  },

  // Gemini 2.5 Flash
  // 数据来源:
  // - Vertex AI定价: https://cloud.google.com/vertex-ai/generative-ai/pricing?hl=zh-CN
  // - 模型规格: https://firebase.google.com/docs/vertex-ai/models?hl=zh-cn
  // - GitHub价格对比: https://github.com/syaoranwe/LLM-Price/blob/main/README.md
  // - CometAPI分析: https://www.cometapi.com/zh-CN/how-much-does-gemini-2-5-pro-cost-access-pricing/
  'gemini-2.5-flash': {
    name: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    provider: 'google',
    family: 'gemini',
    version: '2.5',
    contextWindow: 1_048_576,   // 1M tokens上下文窗口
    maxOutputTokens: 65_536,    // 65K tokens最大输出
    pricing: {
      baseInput: 0.000000375,   // $0.375 / MTok (Vertex AI定价)
      outputTokens: 0.0000015,  // $1.50 / MTok (Vertex AI定价)
      cacheInput: 0.0000000375, // $0.0375 / MTok (10%折扣)
      cacheStorage: 0.000001,   // $1.00 / MTok / 小时存储费用
    },
    features: {
      multimodal: true,         // 支持多模态(文本、图像、视频、音频)
      caching: true,            // 支持context caching
      batchDiscount: 0.5,       // 50%批处理折扣
    }
  },

  // Gemini 2.5 Pro
  // 数据来源:
  // - Vertex AI定价: https://cloud.google.com/vertex-ai/generative-ai/pricing?hl=zh-CN
  // - Cursor IDE博客: https://www.cursor-ide.com/blog/gemini-2-5-pro-vs-claude-4-chinese-comparison
  // - CometAPI分析: https://www.cometapi.com/zh-CN/how-much-does-gemini-2-5-pro-cost-access-pricing/
  // - Pin张好博客: https://pinzhanghao.com/ai-models/gemini-2-5-tokens-limit/
  'gemini-2.5-pro': {
    name: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    provider: 'google',
    family: 'gemini',
    version: '2.5',
    contextWindow: 1_048_576,   // 1M tokens上下文窗口
    maxOutputTokens: 65_536,    // 65K tokens最大输出
    pricing: {
      baseInput: 0.000007,      // $7.00 / MTok (Vertex AI, ≤200K tokens)
      outputTokens: 0.000021,   // $21.00 / MTok (Vertex AI)
      cacheInput: 0.00000031,   // $0.31 / MTok (10%折扣)
      cacheStorage: 0.0000045,  // $4.50 / MTok / 小时存储费用
    },
    features: {
      multimodal: true,         // 支持多模态(文本、图像、视频、音频)
      caching: true,            // 支持context caching
      batchDiscount: 0.5,       // 50%批处理折扣
    }
  },

  // Gemini 1.5 Flash
  // 数据来源:
  // - Vertex AI定价: https://cloud.google.com/vertex-ai/generative-ai/pricing?hl=zh-CN
  // - GitHub价格对比: https://github.com/syaoranwe/LLM-Price/blob/main/README.md
  // - Firebase文档: https://firebase.google.com/docs/vertex-ai/models?hl=zh-cn
  'gemini-1.5-flash-002': {
    name: 'gemini-1.5-flash-002',
    displayName: 'Gemini 1.5 Flash',
    provider: 'google',
    family: 'gemini',
    version: '1.5',
    contextWindow: 1_048_576,   // 1M tokens上下文窗口
    maxOutputTokens: 8_192,     // 8K tokens最大输出
    pricing: {
      baseInput: 0.00000054,    // $0.54 / MTok
      outputTokens: 0.00000216, // $2.16 / MTok
      cacheInput: 0.000000054,  // $0.054 / MTok (10%折扣)
      cacheStorage: 0.000001,   // $1.00 / MTok / 小时存储费用
    },
    features: {
      multimodal: true,         // 支持多模态(文本、图像、视频、音频)
      caching: true,            // 支持context caching
      batchDiscount: 0.5,       // 50%批处理折扣
    }
  },
};

/**
 * 获取模型配置
 * @param modelName 模型名称
 * @returns 模型配置，如果不存在则返回null
 */
export function getModelConfig(modelName: string): ModelConfiguration | null {
  return MODEL_CONFIGURATIONS[modelName] || null;
}

/**
 * 获取所有支持的模型名称
 * @returns 模型名称数组
 */
export function getSupportedModelNames(): string[] {
  return Object.keys(MODEL_CONFIGURATIONS);
}

/**
 * 根据family筛选模型
 * @param family 模型系列
 * @returns 指定系列的模型配置数组
 */
export function getModelsByFamily(family: 'claude' | 'gemini'): ModelConfiguration[] {
  return Object.values(MODEL_CONFIGURATIONS).filter(config => config.family === family);
}

/**
 * 根据provider筛选模型
 * @param provider 提供商
 * @returns 指定提供商的模型配置数组
 */
export function getModelsByProvider(provider: 'anthropic' | 'google'): ModelConfiguration[] {
  return Object.values(MODEL_CONFIGURATIONS).filter(config => config.provider === provider);
}

/**
 * 检查模型是否支持指定特性
 * @param modelName 模型名称
 * @param feature 特性名称
 * @returns 是否支持
 */
export function modelSupportsFeature(modelName: string, feature: keyof ModelConfiguration['features']): boolean {
  const config = getModelConfig(modelName);
  if (!config) return false;
  
  const featureValue = config.features[feature];
  
  // 对于boolean类型的特性，直接返回其值
  if (typeof featureValue === 'boolean') {
    return featureValue;
  }
  
  // 对于number类型的特性（如batchDiscount），检查是否存在且大于0
  if (typeof featureValue === 'number') {
    return featureValue > 0;
  }
  
  return false;
}

/**
 * 获取模型的性价比评分 (输出tokens/价格比率)
 * 评分越高表示性价比越好
 * @param modelName 模型名称
 * @returns 性价比评分，如果模型不存在则返回0
 */
export function getModelCostEfficiencyScore(modelName: string): number {
  const config = getModelConfig(modelName);
  if (!config) return 0;
  
  // 使用 maxOutputTokens / outputTokens价格 作为性价比指标
  return config.maxOutputTokens / config.pricing.outputTokens;
}

/**
 * 按性价比排序获取模型列表
 * @returns 按性价比降序排列的模型配置数组
 */
export function getModelsSortedByCostEfficiency(): ModelConfiguration[] {
  return Object.values(MODEL_CONFIGURATIONS)
    .sort((a, b) => getModelCostEfficiencyScore(b.name) - getModelCostEfficiencyScore(a.name));
}
