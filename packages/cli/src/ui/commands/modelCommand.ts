/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, CommandContext, MessageActionReturn, OpenDialogActionReturn, SlashCommand } from './types.js';
import { SettingScope } from '../../config/settings.js';
import { proxyAuthManager, Config } from 'deepv-code-core';
import { HistoryItemWithoutId } from '../types.js';
import { t, tp } from '../utils/i18n.js';
import { appEvents, AppEvent } from '../../utils/events.js';
import { Suggestion } from '../components/SuggestionsDisplay.js';

// 降级模型列表（当服务端不可用时使用）
// 🛡️ 优先使用'auto'让服务端决定成本最优的模型，避免客户端硬编码高费用模型
const FALLBACK_MODELS: string[] = [];

// auto模式的默认配置
const AUTO_MODE_CONFIG = {
  name: 'auto',
  displayName: 'Auto',
  creditsPerRequest: 6.0,
  available: true,
  maxToken: 200000,
  highVolumeThreshold: 200000,
  highVolumeCredits: 12.0
};

// 防止并发刷新：使用 Promise 缓存确保同时只有一个刷新在进行
let refreshPromise: Promise<void> | null = null;

// 创建模型显示名称映射的辅助函数
function createModelDisplayNameMap(models: ModelInfo[], config?: Config | null): Map<string, string> {
  const map = new Map<string, string>();

  // 添加auto模式
  map.set('auto', AUTO_MODE_CONFIG.displayName);

  // 添加云端模型的显示名称
  models.forEach(model => {
    map.set(model.name, model.displayName);
  });

  return map;
}

// 模型信息接口（匹配服务端API响应）
export interface ModelInfo {
  name: string;
  displayName: string;
  creditsPerRequest: number;
  available: boolean;
  maxToken: number;
  highVolumeThreshold: number;
  highVolumeCredits: number;
}


interface ApiResponse<T> {
  code: number;
  success: boolean;
  data: T;
  message: string;
}



/**
 * 保存云端模型信息到本地设置并更新config
 */
function saveCloudModelsToSettings(models: ModelInfo[], settings: any, config?: Config): void {
  try {
    // 将云端模型信息保存到settings
    console.log(`[ModelCommand] Saving ${models.length} models to local settings cache...`);
    settings.setValue(SettingScope.User, 'cloudModels', models);

    // 同时更新当前运行中的config实例
    if (config && config.setCloudModels) {
      config.setCloudModels(models);
    }
    console.log(`[ModelCommand] Successfully saved ${models.length} models to local settings cache`);
  } catch (error) {
    console.warn('[ModelCommand] Failed to save cloud models to settings:', error);
  }
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

/**
 * 计算两个字符串的Levenshtein距离（编辑距离）
 * 用于模糊匹配模型名称
 */
function calculateLevenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const dp: number[][] = Array(len1 + 1)
    .fill(null)
    .map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) dp[i][0] = i;
  for (let j = 0; j <= len2; j++) dp[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[len1][len2];
}

/**
 * 计算模型名称的相似度分数 (0-100)
 * 使用多维度评分：编辑距离 + 前缀匹配 + 关键字匹配
 */
function calculateModelSimilarity(preferredName: string, availableModel: string): number {
  const normalizedPreferred = preferredName.toLowerCase();
  const normalizedAvailable = availableModel.toLowerCase();

  // 完全匹配
  if (normalizedPreferred === normalizedAvailable) {
    return 100;
  }

  // 编辑距离评分 (50% 权重)
  const maxLen = Math.max(normalizedPreferred.length, normalizedAvailable.length);
  const distance = calculateLevenshteinDistance(normalizedPreferred, normalizedAvailable);
  const editDistanceScore = Math.max(0, 100 - (distance / maxLen) * 100);

  // 前缀匹配评分 (30% 权重)
  let prefixScore = 0;
  if (normalizedAvailable.startsWith(normalizedPreferred.substring(0, Math.min(5, normalizedPreferred.length)))) {
    prefixScore = 80; // 前5个字符匹配得高分
  } else if (normalizedAvailable.includes(normalizedPreferred.substring(0, Math.min(3, normalizedPreferred.length)))) {
    prefixScore = 40;
  }

  // 关键字匹配评分 (20% 权重)
  const preferredWords = normalizedPreferred.split(/[-_.]/);
  const availableWords = normalizedAvailable.split(/[-_.]/);
  const matchedWords = preferredWords.filter(word => availableWords.some(w => w.includes(word)));
  const keywordScore = (matchedWords.length / preferredWords.length) * 100;

  // 加权平均
  const finalScore = editDistanceScore * 0.5 + prefixScore * 0.3 + keywordScore * 0.2;
  return Math.round(finalScore);
}

/**
 * 根据用户偏好模型名称，从可用模型列表中找到最相似的模型
 * 如果没有足够相似的模型，返回 'auto'
 * @param preferredModelName 用户之前选择的模型名称
 * @param availableModels 当前可用的模型列表
 * @param similarityThreshold 相似度阈值（0-100），默认60
 * @returns 最相似的模型名称或 'auto'
 */
export function findMostSimilarModel(
  preferredModelName: string,
  availableModels: ModelInfo[],
  similarityThreshold: number = 60
): string {
  // 如果列表为空，返回 auto
  if (!availableModels || availableModels.length === 0) {
    return 'auto';
  }

  // 如果用户偏好就是 'auto'，直接返回
  if (preferredModelName === 'auto' || !preferredModelName) {
    return 'auto';
  }

  // 计算每个可用模型与偏好模型的相似度
  const scores = availableModels.map(model => ({
    name: model.name,
    displayName: model.displayName,
    score: calculateModelSimilarity(preferredModelName, model.name)
  }));

  // 按相似度降序排序
  scores.sort((a, b) => b.score - a.score);

  // 按相似度降序排序，便于调试
  if (process.env.DEBUG_MODEL_MATCHING === 'true') {
    console.log(`[ModelCommand] Similarity matching for '${preferredModelName}':`, scores.slice(0, 3));
  }

  // 如果最高分超过阈值，返回该模型
  if (scores[0].score >= similarityThreshold) {
    return scores[0].name;
  }

  // 否则返回 'auto' 让服务端决定
  return 'auto';
}

/**
 * 自定义错误类：表示需要重新认证
 */
export class AuthenticationRequiredError extends Error {
  constructor(message: string = 'Authentication required - please re-authenticate') {
    super(message);
    this.name = 'AuthenticationRequiredError';
  }
}

/**
 * 从服务端获取模型列表
 */
async function fetchModelsFromServer(): Promise<{ models: ModelInfo[]; modelNames: string[] }> {
  try {
    const userHeaders = await proxyAuthManager.getUserHeaders();
    const proxyUrl = `${proxyAuthManager.getProxyServerUrl()}/web-api/models`;

    console.log('[ModelCommand] Fetching models from cloud server...');
    const response = await fetch(proxyUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'DeepCode CLI',
        ...userHeaders,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // 抛出特定的认证错误，让调用方可以区分处理
        throw new AuthenticationRequiredError();
      }
      throw new Error(`API request failed (${response.status}): ${await response.text()}`);
    }

    const apiResponse: ApiResponse<ModelInfo[]> = await response.json();

    if (!apiResponse.success) {
      throw new Error(apiResponse.message || 'API request unsuccessful');
    }

    if (!apiResponse.data || !Array.isArray(apiResponse.data)) {
      throw new Error('Server returned invalid data format - expected models array');
    }

    // 返回完整的模型信息和名称列表
    const models = apiResponse.data;

    // 按 displayName 字母顺序排序
    models.sort((a, b) => a.displayName.localeCompare(b.displayName));

    // 模型信息已通过参数返回，不需要单独的缓存更新函数

    const modelNames = ['auto', ...models.map(model => model.displayName)];

    console.log(`[ModelCommand] Cloud server returned ${models.length} models`);
    return { models, modelNames };
  } catch (error) {
    throw error;
  }
}

/**
 * 从本地settings读取已缓存的模型信息
 */
function getLocalCachedModels(settings: any): ModelInfo[] {
  try {
    const cloudModels = settings.merged.cloudModels;
    if (Array.isArray(cloudModels) && cloudModels.length > 0) {
      // 按 displayName 字母顺序排序
      cloudModels.sort((a, b) => a.displayName.localeCompare(b.displayName));
      return cloudModels;
    }
  } catch (error) {
    console.warn('[ModelCommand] Failed to read cached models from settings:', error);
  }
  return [];
}

/**
 * 异步刷新模型配置到本地（供下次使用）
 * 防止并发：如果已经有一个刷新在进行，等待它完成后返回
 *
 * 🆕 当用户选中的偏好模型在云端列表中不再存在时，自动更新为最相似的模型
 * 🆕 当遇到 401 认证错误时，会抛出 AuthenticationRequiredError 让调用方处理
 */
export async function refreshModelsInBackground(settings: any, config?: Config): Promise<void> {
  // 如果已经有刷新在进行，等待它完成
  if (refreshPromise) {
    await refreshPromise;
    return;
  }

  refreshPromise = (async () => {
    try {
      const { models } = await fetchModelsFromServer();
      if (models.length > 0) {
        saveCloudModelsToSettings(models, settings, config);
        console.log(`[ModelCommand] Background refresh: Updated local model cache (${models.length} models)`);

        // 🆕 检查并自动更新用户选中的模型
        await autoUpdateUserPreferredModel(settings, models, config);
      } else {
        console.warn('[ModelCommand] Background refresh: No models returned from server');
      }
    } catch (error) {
      // 如果是认证错误，重新抛出让调用方处理
      if (error instanceof AuthenticationRequiredError) {
        console.warn('[ModelCommand] Background refresh: Authentication required (401)');
        throw error;
      }
      // 其他错误静默失败，不影响当前使用
      console.warn('[ModelCommand] Background refresh failed:', error);
    } finally {
      refreshPromise = null;
    }
  })();

  await refreshPromise;
}

/**
 * 🆕 自动更新用户选中的模型
 * 如果用户的偏好模型不在新的可用模型列表中，自动选择最相似的模型
 * 如果没有足够相似的模型，自动设置为 'auto'
 */
async function autoUpdateUserPreferredModel(
  settings: any,
  newModels: ModelInfo[],
  config?: Config
): Promise<void> {
  try {
    // 获取用户当前选中的模型
    const preferredModel = settings?.merged?.preferredModel;

    // 如果没有设置偏好模型或者是 'auto'，不需要更新
    if (!preferredModel || preferredModel === 'auto') {
      return;
    }

    // 检查偏好模型是否在新的模型列表中
    const modelExists = newModels.some(m => m.name === preferredModel);
    if (modelExists) {
      // 模型仍然可用，无需更新
      return;
    }

    // 模型不存在，需要自动更新为最相似的模型
    const bestMatch = findMostSimilarModel(preferredModel, newModels, 60);

    console.log(`[ModelCommand] User's preferred model '${preferredModel}' no longer exists.`);
    console.log(`[ModelCommand] Auto-updating to: '${bestMatch}'`);

    // 更新用户设置
    settings.setValue(SettingScope.User, 'preferredModel', bestMatch);

    // 更新config实例
    if (config) {
      config.setModel(bestMatch);

      // 同时更新当前GeminiChat实例的specifiedModel
      const geminiClient = config.getGeminiClient();
      if (geminiClient) {
        const chat = geminiClient.getChat();
        chat.setSpecifiedModel(bestMatch);
      }

      // 发出模型变化事件，通知UI更新
      console.log(`[ModelCommand] Emitting ModelChanged event with model: '${bestMatch}'`);
      appEvents.emit(AppEvent.ModelChanged, bestMatch);
    } else {
      // 即使没有 config，也尝试发出事件（UI仍然应该更新）
      console.log(`[ModelCommand] No config provided, still emitting ModelChanged event: '${bestMatch}'`);
      appEvents.emit(AppEvent.ModelChanged, bestMatch);
    }
  } catch (error) {
    console.warn('[ModelCommand] Auto-update preferred model failed:', error);
  }
}

/**
 * 清空本地缓存的模型列表
 */
function clearLocalCachedModels(settings: any, config?: Config): void {
  try {
    console.log('[ModelCommand] Clearing local model cache due to authentication failure...');
    settings.setValue(SettingScope.User, 'cloudModels', []);
    if (config && config.setCloudModels) {
      config.setCloudModels([]);
    }
    console.log('[ModelCommand] Local model cache cleared');
  } catch (error) {
    console.warn('[ModelCommand] Failed to clear local model cache:', error);
  }
}

/**
 * 获取可用模型列表（优先本地缓存，异步刷新）
 *
 * 返回值说明：
 * - source: 'local' 表示从本地缓存读取
 * - source: 'fallback' 表示降级模式
 * - source: 'auth_required' 表示需要重新登录（401错误）
 */
export async function getAvailableModels(settings?: any, config?: Config): Promise<{
  modelNames: string[];
  modelInfos: ModelInfo[];
  source: 'local' | 'fallback' | 'auth_required'
}> {
  // 优先从本地settings读取缓存的模型信息
  const localModels = settings ? getLocalCachedModels(settings) : [];

  if (localModels.length > 0) {
    // 异步刷新配置供下次使用（不等待结果，但需要处理401错误）
    if (settings) {
      refreshModelsInBackground(settings, config).catch((error) => {
        // 如果是认证错误，需要清空本地缓存
        if (error instanceof AuthenticationRequiredError) {
          clearLocalCachedModels(settings, config);
          console.warn('[ModelCommand] Background refresh: Authentication expired, local cache cleared');
        }
        // 其他错误静默处理
      });
    }

    return {
      modelNames: ['auto', ...localModels.map(m => m.name)],
      modelInfos: localModels,
      source: 'local'
    };
  }

  // 如果本地没有缓存，尝试从服务器获取并保存
  try {
    const { models, modelNames } = await fetchModelsFromServer();
    if (models.length > 0 && settings) {
      saveCloudModelsToSettings(models, settings, config);
    }
    return {
      modelNames,
      modelInfos: models,
      source: 'local' // 已保存到本地，下次就是本地读取
    };
  } catch (error) {
    // 检查是否是认证错误（401）
    if (error instanceof AuthenticationRequiredError) {
      console.warn('[ModelCommand] Authentication required (401) - user needs to re-login');
      // 清空本地缓存，确保下次打开对话框时也能看到登录提示
      if (settings) {
        clearLocalCachedModels(settings, config);
      }
      return {
        modelNames: [],
        modelInfos: [],
        source: 'auth_required'
      };
    }

    // 检查是否是未登录导致的错误
    const authStatus = proxyAuthManager.getStatus();
    if (!authStatus.hasUserInfo) {
      // 未登录，返回空列表
      return {
        modelNames: [],
        modelInfos: [],
        source: 'auth_required'
      };
    }

    // 其他错误，降级到'auto'模式让服务端决定
    console.warn('[ModelCommand] Failed to fetch cloud models from server, falling back to auto mode');
    console.warn('[ModelCommand] Fallback reason:', error instanceof Error ? error.message : String(error));
    return {
      modelNames: ['auto', ...FALLBACK_MODELS],
      modelInfos: [],
      source: 'fallback'
    };
  }
}

export const modelCommand: SlashCommand = {
  name: 'model',
  description: t('model.command.description'),
  kind: CommandKind.BUILT_IN,
  action: (context: CommandContext, args: string): OpenDialogActionReturn | void => {
    const { settings, config } = context.services;
    const trimmedArgs = args.trim();

    // 如果没有参数，直接显示模型选择对话框
    if (!trimmedArgs) {
      return {
        type: 'dialog',
        dialog: 'model',
      };
    }

    // 异步处理模型列表获取和命令执行，不显示任何加载状态
    (async () => {
      try {
        const { modelNames, modelInfos, source } = await getAvailableModels(settings, config || undefined);

        // 检查是否未登录（modelNames为空）
        if (modelNames.length === 0) {
          const content = `${t('model.command.not.logged.in')}\n\n${t('model.command.please.login')}`;
          if (context.ui && context.ui.addItem) {
            const historyItem: HistoryItemWithoutId = {
              type: 'error',
              text: content
            };
            context.ui.addItem(historyItem, Date.now());
          }
          return;
        }

        // 显示数据源信息
        const sourceInfo = source === 'local' ? t('model.command.from.cache') : '';

        // 将用户输入的 displayName 转换为 modelName
        const actualModelName = getModelNameFromDisplayName(trimmedArgs, modelInfos);

        // 检查转换后的模型名是否在可用模型中（需要检查实际的name，不是displayName）
        const availableModelNames = ['auto', ...modelInfos.map(model => model.name)];
        if (!availableModelNames.includes(actualModelName)) {
          // 构建可用模型列表（显示displayName和价格信息）
          const availableModelsList = modelNames.map((m: string) => {
            const displayName = getModelDisplayName(m, config);
            let modelLine = `  - ${displayName}`;

            // 添加价格信息（除了auto模式）
            if (m !== 'auto' && modelInfos.length > 0) {
              const modelInfo = modelInfos.find(model => model.name === m);
              if (modelInfo && modelInfo.creditsPerRequest) {
                modelLine += ` - ${modelInfo.creditsPerRequest}x credits`;

                // 添加长上下文价格
                if (modelInfo.highVolumeCredits && modelInfo.highVolumeThreshold) {
                  modelLine += ` (${tp('model.command.long.context.short' as any, {
                    threshold: modelInfo.highVolumeThreshold.toLocaleString(),
                    credits: modelInfo.highVolumeCredits
                  })})`;
                }
              }
            }

            return modelLine;
          }).join('\n');

          const content = `${tp('model.command.invalid.model', { model: trimmedArgs })}\n\n${t('model.command.available.models')}${sourceInfo}：\n${availableModelsList}`;

          if (context.ui && context.ui.addItem) {
            const historyItem: HistoryItemWithoutId = {
              type: 'error',
              text: content
            };
            context.ui.addItem(historyItem, Date.now());
          }
          return;
        }

        // 设置模型（包括auto选项）- 使用实际的模型名称
        settings.setValue(SettingScope.User, 'preferredModel', actualModelName);
        if (config) {
          const geminiClient = config.getGeminiClient();

          if (geminiClient) {
            // 显示正在切换的消息
            if (context.ui && context.ui.addItem) {
              const historyItem: HistoryItemWithoutId = {
                type: 'info',
                text: tp('model.command.switching', { model: actualModelName }) || `Switching to model ${actualModelName}, please wait...`
              };
              context.ui.addItem(historyItem, Date.now());
            }

            // 使用 switchModel 进行安全切换（包含自动压缩）
            const switchResult = await geminiClient.switchModel(actualModelName, new AbortController().signal);

            console.log('[modelCommand] switchResult:', {
              success: switchResult.success,
              hasCompressionInfo: !!switchResult.compressionInfo,
              hasCompressionSkipReason: !!switchResult.compressionSkipReason,
              hasError: !!switchResult.error
            });

            if (!switchResult.success) {
              const content = `Failed to switch to model ${actualModelName}. ${switchResult.error || 'Context compression may have failed.'}`;
              if (context.ui && context.ui.addItem) {
                const historyItem: HistoryItemWithoutId = {
                  type: 'error',
                  text: content
                };
                context.ui.addItem(historyItem, Date.now());
              }
              return;
            }

            // 显示压缩结果或跳过原因
            if (switchResult.compressionInfo) {
              const compressionMsg = `📦 Context compressed: ${switchResult.compressionInfo.originalTokenCount} → ${switchResult.compressionInfo.newTokenCount} tokens`;
              if (context.ui && context.ui.addItem) {
                const historyItem: HistoryItemWithoutId = {
                  type: 'info',
                  text: compressionMsg
                };
                context.ui.addItem(historyItem, Date.now());
              }
            } else if (switchResult.compressionSkipReason) {
              const skipMsg = `✓ ${switchResult.compressionSkipReason}`;
              if (context.ui && context.ui.addItem) {
                const historyItem: HistoryItemWithoutId = {
                  type: 'info',
                  text: skipMsg
                };
                context.ui.addItem(historyItem, Date.now());
              }
            } else {
              console.log('[modelCommand] No compression info or skip reason found in switch result');
            }
          } else {
            // Fallback if client not initialized
            config.setModel(actualModelName);
          }

          // 发出模型变化事件，通知UI更新
          appEvents.emit(AppEvent.ModelChanged, actualModelName);
        }

        // 构建成功消息，包含credit信息（如果可用）
        const modelDisplayName = getModelDisplayName(actualModelName, config);
        let content = tp('model.command.set.success', { model: modelDisplayName });

        // 查找模型的credit信息
        if (actualModelName !== 'auto' && modelInfos.length > 0) {
          const modelInfo = modelInfos.find(model => model.name === actualModelName);
          if (modelInfo && modelInfo.creditsPerRequest) {
            content += `\n${tp('model.command.credit.cost', { credits: modelInfo.creditsPerRequest })}`;

            // 添加长上下文价格显示
            if (modelInfo.highVolumeCredits && modelInfo.highVolumeThreshold) {
              content += `\n💰 ${tp('model.command.long.context.short' as any, {
                credits: modelInfo.highVolumeCredits,
                threshold: modelInfo.highVolumeThreshold.toLocaleString()
              })}`;
            }
          }
        } else if (actualModelName === 'auto') {
          content += `\n${t('model.command.auto.mode')}`;
        }

        if (context.ui && context.ui.addItem) {
          const historyItem: HistoryItemWithoutId = {
            type: 'info',
            text: content
          };
          context.ui.addItem(historyItem, Date.now());
        }

      } catch (error) {
        console.error('[ModelCommand] Operation failed:', error);
      }
    })().catch(error => {
      console.error('[ModelCommand] Async operation failed:', error);
    });

    // 不返回任何内容，避免显示空消息
  },

  // 提供自动完成功能
  completion: async (context, partialArg) => {
    const lowerPartial = partialArg.toLowerCase();

    try {
      const { settings, config } = context.services;
      const { modelNames, modelInfos } = await getAvailableModels(settings, config || undefined);

      // 如果未登录（modelNames为空），返回空数组
      if (modelNames.length === 0) {
        return [];
      }

      // 使用 displayName 进行补全
      const displayNames = modelNames.map((modelName: string) =>
        getModelDisplayName(modelName, config)
      );

      const matchedModels = displayNames.filter((displayName: string) =>
        displayName.toLowerCase().includes(lowerPartial)
      );

      // 返回带有 willAutoExecute 标记的 Suggestion 对象数组，以便选择后自动执行
      return matchedModels.map((displayName: string) => ({
        label: displayName,
        value: displayName,
        willAutoExecute: true
      }));
    } catch (error) {
      // 检查是否是未登录
      const authStatus = proxyAuthManager.getStatus();
      if (!authStatus.hasUserInfo) {
        return [];
      }

      // 其他错误，降级到'auto'模式让服务端决定
      console.warn('[ModelCommand] Model autocomplete: Failed to fetch models from server, falling back to auto mode');
      const fallbackModels = ['auto', ...FALLBACK_MODELS];
      const matchedModels = fallbackModels.filter((model: string) =>
        model.toLowerCase().includes(lowerPartial)
      );

      // 降级模型也需要支持自动执行
      return matchedModels.map((model: string) => ({
        label: model,
        value: model,
        willAutoExecute: true
      }));
    }
  },
};