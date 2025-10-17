/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tool } from '@google/genai';
import { Content } from '../types/extendedContent.js';
import { ChatCompressionInfo } from '../core/turn.js';
import { ContentGenerator } from '../core/contentGenerator.js';
import { SceneType } from '../core/sceneManager.js';
import { getCompressionPrompt } from '../core/prompts.js';
import { tokenLimit } from '../core/tokenLimits.js';
import { getErrorMessage } from '../utils/errors.js';
import { GeminiClient } from '../core/client.js';
import { Config } from '../config/config.js';
import { MESSAGE_ROLES } from '../config/messageRoles.js';

/**
 * 对话历史压缩服务配置
 */
export interface CompressionServiceConfig {
  /**
   * 压缩触发阈值：当对话历史token数量超过模型限制的此倍数时触发压缩
   * 默认: 0.7 (70%)
   */
  compressionTokenThreshold?: number;

  /**
   * 压缩保留阈值：压缩后保留最近历史的倍数
   * 默认: 0.3 (30%)
   */
  compressionPreserveThreshold?: number;

  /**
   * 跳过环境信息的数量：通常前2条消息是环境设置
   * 默认: 2 (用户环境信息 + 模型确认)
   */
  skipEnvironmentMessages?: number;
}

/**
 * 对话历史压缩结果
 */
export interface CompressionResult {
  success: boolean;
  compressionInfo?: ChatCompressionInfo;
  error?: string;
  summary?: string;
  newHistory?: Content[];
}

/**
 * 查找指定比例后的内容索引
 * 导出用于测试目的
 */
export function findIndexAfterFraction(
  history: Content[],
  fraction: number,
): number {
  if (fraction <= 0 || fraction >= 1) {
    throw new Error('Fraction must be between 0 and 1');
  }

  const contentLengths = history.map(
    (content) => JSON.stringify(content).length,
  );

  const totalCharacters = contentLengths.reduce(
    (sum, length) => sum + length,
    0,
  );
  const targetCharacters = totalCharacters * fraction;

  let charactersSoFar = 0;
  for (let i = 0; i < contentLengths.length; i++) {
    charactersSoFar += contentLengths[i];
    if (charactersSoFar >= targetCharacters) {
      return i;
    }
  }
  return contentLengths.length;
}

/**
 * 对话历史压缩服务
 * 提供统一的对话历史压缩功能，可被 client.ts 和 subAgent.ts 共同使用
 */
export class CompressionService {
  private readonly compressionTokenThreshold: number;
  private readonly compressionPreserveThreshold: number;
  private readonly skipEnvironmentMessages: number;

  constructor(config: CompressionServiceConfig = {}) {
    this.compressionTokenThreshold = config.compressionTokenThreshold ?? 0.8;
    this.compressionPreserveThreshold = config.compressionPreserveThreshold ?? 0.3;
    this.skipEnvironmentMessages = config.skipEnvironmentMessages ?? 2;
  }

  /**
   * 寻找合适的工具调用边界作为压缩分割点
   * 从startIndex开始寻找第一个user消息进行切分
   * 统一处理主agent和subAgent场景
   * @param history 对话历史
   * @param startIndex 开始搜索的索引位置
   * @returns 合适的切分索引，如果没找到返回-1表示不应压缩
   */
  private findToolCallBoundary(history: Content[], startIndex: number): number {
    // 边界检查
    if (startIndex >= history.length) {
      return -1; // 没有合适的压缩区间
    }

    // 从startIndex开始寻找第一个user消息
    for (let i = startIndex; i < history.length; i++) {
      if (history[i].role === 'user') {
        return i + 1; // 压缩到这个user消息（包含），保留后面的内容
      }
    }

    // 如果没有找到user消息，返回-1表示不应该压缩
    return -1;
  }

  /**
   * 检查是否需要压缩对话历史
   * @param history 对话历史
   * @param model 使用的模型
   * @param contentGenerator 内容生成器，用于计算token数量
   * @param force 是否强制压缩
   * @returns 是否需要压缩
   */
  async shouldCompress(
    history: Content[],
    model: string,
    contentGenerator: ContentGenerator,
    force: boolean = false,
    config?: Config
  ): Promise<{ shouldCompress: boolean; tokenCount?: number }> {
    // 如果历史为空，不需要压缩
    if (history.length === 0) {
      return { shouldCompress: false };
    }

    // 如果强制压缩，直接返回true
    if (force) {
      return { shouldCompress: true };
    }

    // 计算当前token数量
    let tokenCount: number | undefined;
    try {
      const result = await contentGenerator.countTokens({
        model,
        contents: history,
      });
      tokenCount = result.totalTokens;
    } catch (error) {
      console.warn(`Could not determine token count for model ${model}. Error: ${getErrorMessage(error)}`);
      return { shouldCompress: false };
    }

    if (tokenCount === undefined) {
      console.warn(`Could not determine token count for model ${model}.`);
      return { shouldCompress: false };
    }

    // 检查是否超过压缩阈值
    const threshold = this.compressionTokenThreshold * tokenLimit(model, config);
    const shouldCompress = tokenCount >= threshold;

    return { shouldCompress, tokenCount };
  }

  /**
   * 压缩对话历史
   * @param history 要压缩的对话历史
   * @param model 用于测算长度的模型（history实际使用的模型）
   * @param compressionModel 用于执行压缩的模型（由scene决定）
   * @param contentGenerator 内容生成器
   * @param prompt_id 提示ID
   * @param originalTokenCount 原始token数量（可选，如果提供则跳过重复计算）
   * @returns 压缩结果
   */
  async compressHistory(
    config: Config,
    history: Content[],
    model: string,
    compressionModel: string,
    geminiClient: GeminiClient, // 使用 GeminiClient 而不是 ContentGenerator
    prompt_id: string,
    abortSignal: AbortSignal,
    originalTokenCount?: number
  ): Promise<CompressionResult> {
    try {
      // 获取或计算原始token数量
      let finalOriginalTokenCount = originalTokenCount;

      if (finalOriginalTokenCount === undefined) {
        const originalTokenResult = await this.shouldCompress(history, model, geminiClient.getContentGenerator(), false, config);
        finalOriginalTokenCount = originalTokenResult.tokenCount;

        if (finalOriginalTokenCount === undefined) {
          return {
            success: false,
            error: 'Could not determine original token count'
          };
        }
      }

      // 分离环境信息和实际对话历史
      const environmentMessages = history.slice(0, Math.min(this.skipEnvironmentMessages, history.length));
      const conversationHistory = history.slice(this.skipEnvironmentMessages);

      // 如果对话历史太少，不进行压缩
      if (conversationHistory.length <= 2) {
        return {
          success: false,
          error: 'Insufficient conversation history to compress'
        };
      }

      // 在对话历史中确定压缩分割点
      let compressBeforeIndex = findIndexAfterFraction(
        conversationHistory,
        1 - this.compressionPreserveThreshold,
      );

      // 寻找最近的完整工具调用对边界，统一处理主agent和subAgent场景
      compressBeforeIndex = this.findToolCallBoundary(conversationHistory, compressBeforeIndex);

      // 如果没有找到合适的压缩边界，不进行压缩
      if (compressBeforeIndex === -1) {
        return {
          success: false,
          error: 'Could not find suitable compression boundary'
        };
      }

      const historyToCompress = conversationHistory.slice(0, compressBeforeIndex);
      const historyToKeep = conversationHistory.slice(compressBeforeIndex);

      // 检查historyToCompress最后一个消息，如果是user需要添加model回复避免连续user消息
      let historyForCompression = [...environmentMessages, ...historyToCompress];
      const lastMessage = historyToCompress[historyToCompress.length - 1];

      if (lastMessage && lastMessage.role === 'user') {
        // 添加一个简单的model确认，确保对话格式正确
        historyForCompression.push({
          role: MESSAGE_ROLES.MODEL,
          parts: [{ text: 'Understood.' }],
        });
      }

      // 使用临时GeminiChat进行压缩，获得完整的API监控和错误处理
      const compressionPrompt = 'First, reason in your scratchpad. Then, generate the <state_snapshot>.';

      console.log(`[CompressionService] Using temporary chat for compression with full API monitoring`);

      // 创建临时Chat获得完整的API日志、Token统计、错误处理等功能
      const temporaryChat = await geminiClient.createTemporaryChat(
        SceneType.COMPRESSION,
        compressionModel, // 使用压缩模型（由scene决定）
        { type: 'sub', agentId: 'CompressionService' }
      );

      // 🔧 获取工具注册表并设置工具，确保服务器端工具配置一致性
      const toolRegistry = await config.getToolRegistry();
      const toolDeclarations = toolRegistry.getFunctionDeclarations();
      const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];
      temporaryChat.setTools(tools);

      // 构建包含历史的完整对话
      const compressionContents = [
        ...historyForCompression,
        { role: MESSAGE_ROLES.USER, parts: [{ text: compressionPrompt }] }
      ];

      // 设置历史并发送压缩请求
      temporaryChat.setHistory(compressionContents.slice(0, -1)); // 设置历史，不包括最后的用户消息

      const compressionResponse = await temporaryChat.sendMessage(
        {
          message: compressionPrompt,
          config: {
            maxOutputTokens: 8192, // 压缩摘要不需要太长
            temperature: 0.1, // 低温度确保一致性
            abortSignal,
            systemInstruction: getCompressionPrompt()
          }
        },
        `compress-${prompt_id}-${Date.now()}`,
        SceneType.COMPRESSION
      );

      const summary = compressionResponse.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (!summary) {
        throw new Error('Failed to generate compression summary - empty response');
      }

      // 构建新的对话历史：环境信息 + 压缩摘要 + 保留的最近历史
      const newHistory: Content[] = [
        ...environmentMessages, // 保留环境信息
        {
          role: MESSAGE_ROLES.USER,
          parts: [{ text: summary }],
        },
        ...historyToKeep,
      ];

      // 计算压缩后的token数量
      let newTokenCount: number | undefined;
      try {
        const result = await geminiClient.getContentGenerator().countTokens({
          model,
          contents: newHistory,
        });
        newTokenCount = result.totalTokens;
      } catch (error) {
        console.warn(`Could not determine compressed history token count. Error: ${getErrorMessage(error)}`);
        return {
          success: false,
          error: 'Could not determine compressed history token count'
        };
      }

      if (newTokenCount === undefined) {
        console.warn('Could not determine compressed history token count.');
        return {
          success: false,
          error: 'Could not determine compressed history token count'
        };
      }

      console.log(`[CompressionService] Compression completed: ${finalOriginalTokenCount} -> ${newTokenCount} tokens`);

      return {
        success: true,
        compressionInfo: {
          originalTokenCount: finalOriginalTokenCount,
          newTokenCount,
        },
        summary,
        newHistory,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[CompressionService] Compression failed:', errorMessage);

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * 一步式压缩方法：检查并执行压缩
   * @param history 对话历史
   * @param model 用于测算长度的模型（history实际使用的模型）
   * @param compressionModel 用于执行压缩的模型（由scene决定）
   * @param contentGenerator 内容生成器
   * @param prompt_id 提示ID
   * @param force 是否强制压缩
   * @returns 压缩结果，如果不需要压缩则返回null
   */
  async tryCompress(
    config: Config,
    history: Content[],
    model: string,
    compressionModel: string,
    geminiClient: any, // 使用 GeminiClient 而不是 ContentGenerator
    prompt_id: string,
    abortSignal: AbortSignal,
    force: boolean = false
  ): Promise<CompressionResult | null> {
    // 检查是否需要压缩
    const shouldCompressResult = await this.shouldCompress(history, model, geminiClient.getContentGenerator(), force, config);

    if (!shouldCompressResult.shouldCompress) {
      return null;
    }

    // 执行压缩，传递已计算的token数量避免重复计算
    return await this.compressHistory(
      config,
      history,
      model,
      compressionModel,
      geminiClient,
      prompt_id,
      abortSignal,
      shouldCompressResult.tokenCount
    );
  }

  /**
   * 获取压缩配置
   */
  getConfig(): CompressionServiceConfig {
    return {
      compressionTokenThreshold: this.compressionTokenThreshold,
      compressionPreserveThreshold: this.compressionPreserveThreshold,
      skipEnvironmentMessages: this.skipEnvironmentMessages,
    };
  }
}