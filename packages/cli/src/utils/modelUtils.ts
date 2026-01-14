/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config, CustomModelConfig, isCustomModel, generateCustomModelId } from 'deepv-code-core';

// 模型信息接口（匹配服务端API响应）
export interface ModelInfo {
  name: string;
  displayName: string;
  creditsPerRequest: number;
  available: boolean;
  maxToken: number;
  highVolumeThreshold: number;
  highVolumeCredits: number;
  isCustom?: boolean; // 标识是否为自定义模型
}

// auto模式的默认配置
export const AUTO_MODE_CONFIG = {
  name: 'auto',
  displayName: 'Auto',
  creditsPerRequest: 6.0,
  available: true,
  maxToken: 200000,
  highVolumeThreshold: 200000,
  highVolumeCredits: 12.0
};

/**
 * 将自定义模型配置转换为ModelInfo格式
 */
function convertCustomModelToModelInfo(customModel: CustomModelConfig): ModelInfo {
  return {
    name: generateCustomModelId(customModel.displayName),  // 自动生成 custom:{displayName}
    displayName: `${customModel.displayName} [Custom]`,
    creditsPerRequest: 0, // 自定义模型不显示积分
    available: customModel.enabled !== false,
    maxToken: customModel.maxTokens || 0,
    highVolumeThreshold: 0,
    highVolumeCredits: 0,
    isCustom: true,
  };
}

// 创建模型显示名称映射的辅助函数
export function createModelDisplayNameMap(models: ModelInfo[], config?: Config | null): Map<string, string> {
  const map = new Map<string, string>();

  // 添加auto模式
  map.set('auto', AUTO_MODE_CONFIG.displayName);

  // 添加云端模型的显示名称
  models.forEach(model => {
    map.set(model.name, model.displayName);
  });

  // 添加自定义模型的显示名称
  if (config) {
    const customModels = config.getCustomModels() || [];
    customModels.forEach(customModel => {
      if (customModel.enabled !== false) {
        map.set(generateCustomModelId(customModel.displayName), `${customModel.displayName} [Custom]`);
      }
    });
  }

  return map;
}

/**
 * 根据模型名获取显示名称
 */
export function getModelDisplayName(modelName: string, config?: Config | null): string {
  // 如果传入了 config，从 config 中获取模型信息
  if (config) {
    const cloudModels = config.getCloudModels() || [];
    const displayMap = createModelDisplayNameMap(cloudModels, config);
    return displayMap.get(modelName) || modelName;
  }

  // 降级情况：没有 config 时的处理
  if (modelName === 'auto') {
    return AUTO_MODE_CONFIG.displayName;
  }

  return modelName;
}

/**
 * 根据模型名获取模型信息
 */
export function getModelInfo(modelName: string, config?: Config | null): ModelInfo | undefined {
  // 如果传入了 config，从 config 中获取模型信息
  if (config) {
    // 先检查是否为自定义模型
    if (isCustomModel(modelName)) {
      const customModel = config.getCustomModelConfig(modelName);
      if (customModel) {
        return convertCustomModelToModelInfo(customModel);
      }
    }

    // 否则从云端模型中查找
    const cloudModels = config.getCloudModels() || [];
    return cloudModels.find((model: ModelInfo) => model.name === modelName);
  }

  // 降级情况：没有 config 时返回 undefined
  return undefined;
}

/**
 * 将显示名称转换为模型名称
 */
export function getModelNameFromDisplayName(displayName: string, modelInfos: ModelInfo[]): string {
  // 处理特殊的 'auto' 模式
  if (displayName === 'auto' || displayName === AUTO_MODE_CONFIG.displayName) {
    return 'auto';
  }

  // 查找匹配的模型
  const matchedModel = modelInfos.find(model =>
    model.displayName === displayName || model.name === displayName
  );

  return matchedModel ? matchedModel.name : displayName;
}
