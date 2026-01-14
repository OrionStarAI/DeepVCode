/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import { CustomModelConfig, validateCustomModelConfig, generateCustomModelId } from 'deepv-code-core';
import stripJsonComments from 'strip-json-comments';

const SETTINGS_DIRECTORY_NAME = '.deepv';
const CUSTOM_MODELS_FILE = 'custom-models.json';

/**
 * 获取自定义模型配置文件路径
 */
export function getCustomModelsFilePath(): string {
  return path.join(homedir(), SETTINGS_DIRECTORY_NAME, CUSTOM_MODELS_FILE);
}

/**
 * 确保目录存在
 */
function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 加载自定义模型配置（从独立文件）
 * 这样可以避免与settings.json的并发冲突
 */
export function loadCustomModels(): CustomModelConfig[] {
  const filePath = getCustomModelsFilePath();

  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(stripJsonComments(content));

    if (!Array.isArray(parsed.models)) {
      console.warn('[CustomModels] Invalid format in custom-models.json, expected { models: [...] }');
      return [];
    }

    // 验证每个模型配置
    const validModels: CustomModelConfig[] = [];
    for (const model of parsed.models) {
      const errors = validateCustomModelConfig(model);
      if (errors.length === 0) {
        validModels.push(model);
      } else {
        console.warn(`[CustomModels] Skipping invalid model "${model.displayName}":`, errors);
      }
    }

    return validModels;
  } catch (error) {
    console.error('[CustomModels] Failed to load custom models:', error);
    return [];
  }
}

/**
 * 保存自定义模型配置（到独立文件）
 * 使用原子写入操作，避免文件损坏
 */
export function saveCustomModels(models: CustomModelConfig[]): void {
  const filePath = getCustomModelsFilePath();
  const dirPath = path.dirname(filePath);

  try {
    // 确保目录存在
    ensureDirectoryExists(dirPath);

    // 验证所有模型配置
    for (const model of models) {
      const errors = validateCustomModelConfig(model);
      if (errors.length > 0) {
        throw new Error(`Invalid model configuration for "${model.displayName}": ${errors.join(', ')}`);
      }
    }

    // 准备数据
    const data = {
      models: models,
      _metadata: {
        version: '1.0',
        lastModified: new Date().toISOString(),
      }
    };

    const jsonContent = JSON.stringify(data, null, 2);

    // 原子写入：先写临时文件，再重命名
    const tempFilePath = filePath + '.tmp';
    fs.writeFileSync(tempFilePath, jsonContent, 'utf-8');
    fs.renameSync(tempFilePath, filePath);

    console.log(`[CustomModels] Successfully saved ${models.length} custom model(s) to ${filePath}`);
  } catch (error) {
    console.error('[CustomModels] Failed to save custom models:', error);
    throw error;
  }
}

/**
 * 添加或更新自定义模型
 * 如果 displayName 已存在则更新，否则添加
 */
export function addOrUpdateCustomModel(model: CustomModelConfig): void {
  const models = loadCustomModels();
  const existingIndex = models.findIndex(m => m.displayName === model.displayName);

  if (existingIndex >= 0) {
    models[existingIndex] = model;
  } else {
    models.push(model);
  }

  saveCustomModels(models);
}

/**
 * 删除自定义模型
 * @param modelId 格式: custom:{displayName}
 */
export function deleteCustomModel(modelId: string): boolean {
  const models = loadCustomModels();
  const displayName = modelId.replace('custom:', '');
  const filteredModels = models.filter(m => m.displayName !== displayName);

  if (filteredModels.length === models.length) {
    return false; // 没有找到要删除的模型
  }

  saveCustomModels(filteredModels);
  return true;
}

/**
 * 获取单个自定义模型配置
 * @param modelId 格式: custom:{displayName}
 */
export function getCustomModel(modelId: string): CustomModelConfig | undefined {
  const models = loadCustomModels();
  const displayName = modelId.replace('custom:', '');
  return models.find(m => m.displayName === displayName);
}

/**
 * 检查自定义模型是否已存在
 * @param modelId 格式: custom:{displayName}
 */
export function customModelExists(modelId: string): boolean {
  const models = loadCustomModels();
  const displayName = modelId.replace('custom:', '');
  return models.some(m => m.displayName === displayName);
}
