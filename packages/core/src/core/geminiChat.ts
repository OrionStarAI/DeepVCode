/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// DISCLAIMER: This is a copied version of https://github.com/googleapis/js-genai/blob/main/src/chats.ts with the intention of working around a key bug
// where function responses are not treated as "valid" responses: https://b.corp.google.com/issues/420354090

import {
  GenerateContentResponse,
  GenerateContentConfig,
  SendMessageParameters,
  createUserContent,
  Part,
  GenerateContentResponseUsageMetadata,
  Tool,
  ContentUnion,
} from '@google/genai';
import { Content, stripUIFieldsFromArray } from '../types/extendedContent.js';
import { retryWithBackoff } from '../utils/retry.js';
import { isFunctionResponse, hasFunctionCall } from '../utils/messageInspectors.js';
import { MESSAGE_ROLES } from '../config/messageRoles.js';
import { SceneType } from './sceneManager.js';
import { ContentGenerator, AuthType } from './contentGenerator.js';
import { Config } from '../config/config.js';
import { isDeepXQuotaError } from '../utils/quotaErrorDetection.js';
import {
  logApiRequest,
  logApiResponse,
  logApiError,
} from '../telemetry/loggers.js';
import {
  ApiErrorEvent,
  ApiRequestEvent,
  ApiResponseEvent,
  AgentContext,
} from '../telemetry/types.js';
import { DEFAULT_GEMINI_FLASH_MODEL, DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { tokenUsageEventManager } from '../events/tokenUsageEvents.js';
import { realTimeTokenEventManager } from '../events/realTimeTokenEvents.js';
import { SessionManager } from '../services/sessionManager.js';

/**
 * Returns true if the response is valid, false otherwise.
 */
function isValidResponse(response: GenerateContentResponse): boolean {
  if (response.candidates === undefined || response.candidates.length === 0) {
    return false;
  }
  const content = response.candidates[0]?.content;
  if (content === undefined) {
    return false;
  }
  return isValidContent(content);
}

function isValidContent(content: Content): boolean {
  if (content.parts === undefined || content.parts.length === 0) {
    return false;
  }
  for (const part of content.parts) {
    if (part === undefined || Object.keys(part).length === 0) {
      return false;
    }
    if (!part.thought && part.text !== undefined && part.text === '') {
      return false;
    }
  }
  return true;
}

/**
 * Validates the history contains the correct roles.
 *
 * @throws Error if the history does not start with a user turn.
 * @throws Error if the history contains an invalid role.
 */
function validateHistory(history: Content[]) {
  for (const content of history) {
    if (content.role !== MESSAGE_ROLES.USER && content.role !== MESSAGE_ROLES.MODEL) {
      throw new Error(`Role must be user or model, but got ${content.role}.`);
    }
  }
}

/**
 * 检查内容是否为 reasoning（思考过程）
 */
function isReasoningContent(content: Content | undefined): boolean {
  return !!(
    content &&
    content.role === 'model' &&
    content.parts &&
    content.parts.length > 0 &&
    'reasoning' in content.parts[0]
  );
}

/**
 * Extracts the curated (valid) history from a comprehensive history.
 *
 * @remarks
 * The model may sometimes generate invalid or empty contents(e.g., due to safety
 * filters or recitation). Extracting valid turns from the history
 * ensures that subsequent requests could be accepted by the model.
 * 同时也会过滤掉 reasoning 内容（模型思考过程）
 */
function extractCuratedHistory(comprehensiveHistory: Content[]): Content[] {
  if (comprehensiveHistory === undefined || comprehensiveHistory.length === 0) {
    return [];
  }
  const curatedHistory: Content[] = [];
  const length = comprehensiveHistory.length;
  let i = 0;
  while (i < length) {
    if (comprehensiveHistory[i].role === MESSAGE_ROLES.USER) {
      curatedHistory.push(comprehensiveHistory[i]);
      i++;
    } else {
      const modelOutput: Content[] = [];
      let isValid = true;
      while (i < length && comprehensiveHistory[i].role === MESSAGE_ROLES.MODEL) {
        const currentContent = comprehensiveHistory[i];
        // 跳过 reasoning 内容，不加入精选历史
        if (!isReasoningContent(currentContent)) {
          modelOutput.push(currentContent);
          if (isValid && !isValidContent(currentContent)) {
            isValid = false;
          }
        }
        i++;
      }
      if (isValid && modelOutput.length > 0) {
        curatedHistory.push(...modelOutput);
      } else if (!isValid) {
        // Remove the last user input when model content is invalid.
        curatedHistory.pop();
      }
    }
  }
  return curatedHistory;
}

/**
 * Chat session that enables sending messages to the model with previous
 * conversation context.
 *
 * @remarks
 * The session maintains all the turns between user and model.
 */
export class GeminiChat {
  // A promise to represent the current state of the message being sent to the
  // model.
  private sendPromise: Promise<void> = Promise.resolve();

  // 保存创建时指定的模型，避免被config覆盖
  private specifiedModel: string;

  constructor(
    private readonly config: Config,
    private readonly contentGenerator: ContentGenerator,
    private readonly generationConfig: GenerateContentConfig = {},
    private history: Content[] = [],
    private readonly agentContext: AgentContext = { type: 'main' }, // 默认为主会话
    specifiedModel?: string // 新增：允许指定特定模型
  ) {
    validateHistory(history);
    // 优先使用指定模型，否则使用config模型
    this.specifiedModel = specifiedModel || this.config.getModel();
  }

  private _getRequestTextFromContents(contents: Content[]): string {
    return JSON.stringify(contents);
  }

  setSpecifiedModel(model: string): void {
    this.specifiedModel = model;
  }

  private async _logApiRequest(
    contents: Content[],
    model: string,
    prompt_id: string,
  ): Promise<void> {
    const requestText = this._getRequestTextFromContents(contents);
    logApiRequest(
      this.config,
      new ApiRequestEvent(model, prompt_id, requestText),
    );
  }

  private async _logApiResponse(
    durationMs: number,
    prompt_id: string,
    usageMetadata?: GenerateContentResponseUsageMetadata,
    responseText?: string,
    agentContext?: AgentContext,
  ): Promise<void> {
    logApiResponse(
      this.config,
      new ApiResponseEvent(
        this.config.getModel(),
        durationMs,
        prompt_id,
        this.config.getContentGeneratorConfig()?.authType,
        usageMetadata,
        responseText,
        undefined, // error
        agentContext,
      ),
    );

    // Update session token statistics
    if (usageMetadata && this.config.getProjectRoot()) {
      try {
        const sessionManager = new SessionManager(this.config.getProjectRoot());
        await sessionManager.updateTokenStats(
          this.config.getSessionId(),
          this.config.getModel(),
          {
            input_token_count: usageMetadata.promptTokenCount || 0,
            output_token_count: usageMetadata.candidatesTokenCount || 0,
            total_token_count: usageMetadata.totalTokenCount || 0,
            cached_content_token_count: usageMetadata.cachedContentTokenCount || 0,
            thoughts_token_count: 0, // Not available in usageMetadata
            tool_token_count: 0, // Not available in usageMetadata
            cache_creation_input_tokens: (usageMetadata as any).cacheCreationInputTokens || 0,
            cache_read_input_tokens: (usageMetadata as any).cacheReadInputTokens || 0,
          }
        );
      } catch (error) {
        // Log error but don't fail the API response logging
        console.warn('[SessionManager] Failed to update token stats:', error);
      }

      // 触发token使用更新事件，通知UI更新
      tokenUsageEventManager.emitTokenUsage({
        cache_creation_input_tokens: (usageMetadata as any).cacheCreationInputTokens || 0,
        cache_read_input_tokens: (usageMetadata as any).cacheReadInputTokens || 0,
        input_tokens: usageMetadata.promptTokenCount || 0,
        output_tokens: usageMetadata.candidatesTokenCount || 0,
        credits_usage: (usageMetadata as any).creditsUsage || 0,
        model: this.config.getModel(),
        timestamp: Date.now(),
      });

      // 清除实时token显示，因为请求已完成
      realTimeTokenEventManager.clearRealTimeToken();
    }
  }

  private _logApiError(
    durationMs: number,
    error: unknown,
    prompt_id: string,
    agentContext?: AgentContext,
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = error instanceof Error ? error.name : 'unknown';

    logApiError(
      this.config,
      new ApiErrorEvent(
        this.config.getModel(),
        errorMessage,
        durationMs,
        prompt_id,
        this.config.getContentGeneratorConfig()?.authType,
        errorType,
        undefined, // status_code
        agentContext,
      ),
    );
  }

  /**
   * Handles falling back to Flash model when persistent 429 errors occur for OAuth users.
   * Uses a fallback handler if provided by the config; otherwise, returns null.
   */
  private async handleFlashFallback(
    authType?: string,
    error?: unknown,
  ): Promise<string | null> {
    // Only handle fallback for OAuth users
    // Flash fallback only supported for Google OAuth, not available with Cheeth OA
    return null;
  }

  /**
   * Sends a message to the model and returns the response.
   *
   * @remarks
   * This method will wait for the previous message to be processed before
   * sending the next message.
   *
   * @see {@link Chat#sendMessageStream} for streaming method.
   * @param params - parameters for sending messages within a chat session.
   * @returns The model's response.
   *
   * @example
   * ```ts
   * const chat = ai.chats.create({model: 'gemini-2.0-flash'});
   * const response = await chat.sendMessage({
   *   message: 'Why is the sky blue?'
   * });
   * console.log(response.text);
   * ```
   */
  async sendMessage(
    params: SendMessageParameters,
    prompt_id: string,
    scene: SceneType,
  ): Promise<GenerateContentResponse> {
    await this.sendPromise;
    const baseUserContent = createUserContent(params.message);
    // 🎯 添加 prompt_id 到用户内容中
    const userContent: Content = {
      ...baseUserContent,
      prompt_id
    };
    const originalContents = this.getHistory(true).concat(userContent);

    // 🔧 修正请求内容，确保 function call/response 成对出现
    const requestContents = this.fixRequestContents(originalContents);

    this._logApiRequest(requestContents, this.config.getModel(), prompt_id);

    const startTime = Date.now();
    let response: GenerateContentResponse;

    try {
      const apiCall = () => {
        const modelToUse = this.specifiedModel || DEFAULT_GEMINI_MODEL;

        // Prevent Flash model calls immediately after quota error
        if (
          this.config.getQuotaErrorOccurred() &&
          modelToUse === DEFAULT_GEMINI_FLASH_MODEL
        ) {
          throw new Error(
            'Please submit a new query to continue with the Flash model.',
          );
        }

        return this.contentGenerator.generateContent({
          model: modelToUse,
          contents: stripUIFieldsFromArray(requestContents),
          config: { ...this.generationConfig, ...params.config },
        }, scene);
      };

      response = await retryWithBackoff(apiCall, {
        shouldRetry: (error: Error) => {
          if (error && error.message) {
            if (error.message.includes('429')) return true;
            if (error.message.match(/5\d{2}/)) return true;
          }
          return false;
        },
        onPersistent429: async (authType?: string, error?: unknown) =>
          await this.handleFlashFallback(authType, error),
        authType: this.config.getContentGeneratorConfig()?.authType,
      });
      const durationMs = Date.now() - startTime;
      await this._logApiResponse(
        durationMs,
        prompt_id,
        response.usageMetadata,
        JSON.stringify(response),
        this.agentContext,
      );

      this.sendPromise = (async () => {
        const outputContent = response.candidates?.[0]?.content;
        // Because the AFC input contains the entire curated chat history in
        // addition to the new user input, we need to truncate the AFC history
        // to deduplicate the existing chat history.
        const fullAutomaticFunctionCallingHistory =
          response.automaticFunctionCallingHistory;
        const index = this.getHistory(true).length;
        let automaticFunctionCallingHistory: Content[] = [];
        if (fullAutomaticFunctionCallingHistory != null) {
          automaticFunctionCallingHistory =
            fullAutomaticFunctionCallingHistory.slice(index) ?? [];
        }
        const modelOutput = outputContent ? [outputContent] : [];
        this.recordHistory(
          userContent,
          modelOutput,
          automaticFunctionCallingHistory,
        );
      })();
      await this.sendPromise.catch(() => {
        // Resets sendPromise to avoid subsequent calls failing
        this.sendPromise = Promise.resolve();
      });
      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this._logApiError(durationMs, error, prompt_id, this.agentContext);
      // 清除实时token显示，因为请求失败
      realTimeTokenEventManager.clearRealTimeToken();
      this.sendPromise = Promise.resolve();
      throw error;
    }
  }

  /**
   * 修正请求内容，确保 function call 和 function response 成对出现
   *
   * 处理逻辑：
   * 1. 检查历史中未完成的 function call
   * 2. 为未完成的 function call 添加 "user cancel" response
   * 3. 如果用户消息包含混合内容（text + function-response），调整顺序为 function-response 在前
   * 4. 🆕 检测并移除重复的 function response（同一个 functionCall 对应多个 response 时取第一个）
   * 5. 🆕 检测并警告多余的无匹配 function response（保留原有行为）
   *
   * @param requestContents 原始请求内容
   * @returns 修正后的请求内容
   */
  private fixRequestContents(requestContents: Content[]): Content[] {
    const fixedContents: Content[] = [];

    // 🔍 辅助函数：判断 functionCall 和 functionResponse 是否匹配
    // 支持模糊匹配：如果其中一方缺少 ID，只要名称相同即视为匹配（兼容 Claude 等模型）
    const isToolMatch = (call: any, resp: any) => {
      if (!call || !resp || call.name !== resp.name) return false;
      if (call.id && resp.id) return call.id === resp.id;
      return true; // 其中一方缺少 ID，仅通过名称匹配
    };

    // 🔍 预先收集所有 function call 用于多余 response 检测
    const allFunctionCalls: Array<{
      call: any;
      messageIndex: number;
    }> = [];

    for (let i = 0; i < requestContents.length; i++) {
      const current = requestContents[i];
      if (current.role === MESSAGE_ROLES.MODEL && current.parts) {
        current.parts.forEach(part => {
          if (part.functionCall) {
            allFunctionCalls.push({
              call: part.functionCall,
              messageIndex: i
            });
          }
        });
      }
    }

    // 🎯 第一步：收集并仲裁所有 functionResponse（关键修复）
    // 当存在多个响应对应同一个 functionCall 时（如：自动补全的 cancel vs 延迟到达的真实结果），
    // 我们根据优先级进行仲裁：真实结果 > 取消占位符。
    // 注意：Map 的 key 逻辑已优化，如果存在带 ID 的响应，它将覆盖同名但不带 ID 的响应。
    const bestResponses: Map<string, { part: Part; priority: number; originalIndex: number }> = new Map();

    // 优先级判定函数
    const getPriority = (part: Part): number => {
      const result = (part.functionResponse?.response as any)?.result;
      return result === 'user cancel' ? 10 : 100;
    };

    // 1.1 预扫描所有消息，找出每个 callId 的最佳响应
    for (let i = 0; i < requestContents.length; i++) {
      const content = requestContents[i];
      if (content.role === MESSAGE_ROLES.USER && content.parts) {
        for (const part of content.parts) {
          if (part.functionResponse) {
            const resp = part.functionResponse;
            const priority = getPriority(part);

            // 智能 Key：如果带 ID，优先使用 ID；否则使用 name
            // 这样带 ID 的真实结果可以覆盖不带 ID 的占位符（Claude 场景）
            const key = resp.id || `name:${resp.name}`;

            const existing = bestResponses.get(key);
            if (!existing || priority > existing.priority) {
              bestResponses.set(key, { part, priority, originalIndex: i });
            }

            // 特殊逻辑：如果是带 ID 的响应，还要尝试覆盖掉只有 name 的记录
            if (resp.id) {
              const nameKey = `name:${resp.name}`;
              const nameExisting = bestResponses.get(nameKey);
              if (nameExisting && priority >= nameExisting.priority) {
                bestResponses.delete(nameKey); // 让位给带精准 ID 的响应
              }
            }
          }
        }
      }
    }

    // 1.2 重构内容，只保留最佳响应，并强制 ID 对齐
    const deduplicatedContents: Content[] = [];
    const usedResponseKeys: Set<string> = new Set();

    for (let i = 0; i < requestContents.length; i++) {
      const content = requestContents[i];
      if (content.role === MESSAGE_ROLES.USER && content.parts) {
        const filteredParts: Part[] = [];

        for (const part of content.parts) {
          if (part.functionResponse) {
            const resp = part.functionResponse;
            const key = resp.id || `name:${resp.name}`;
            const best = bestResponses.get(key);

            // 只有当当前 Part 就是该 callId 的“最佳响应”时，才保留它
            if (best && best.part === part && !usedResponseKeys.has(key)) {
              // 🎯 关键修复：强制 ID 对齐
              // 查找该响应对应的原始 functionCall，确保 ID 完全一致（兼容 Claude 严格协议）
              const matchingCall = allFunctionCalls.find(fc => isToolMatch(fc.call, resp));
              if (matchingCall) {
                if (matchingCall.call.id !== resp.id) {
                  console.log(
                    `[fixRequestContents] 🔧 ID 对齐：将响应 ${resp.name} 的 ID 从 "${resp.id || 'unnamed'}" ` +
                    `同步为调用方的 ID "${matchingCall.call.id || 'unnamed'}"`
                  );
                  resp.id = matchingCall.call.id;
                }
              }

              filteredParts.push(part);
              usedResponseKeys.add(key);
            } else {
              // 如果不带 ID 的响应被带 ID 的响应取代了，也会进入这里
              console.warn(
                `[fixRequestContents] 🗑️ 移除次优或重复的 functionResponse：${resp.name} (id: ${resp.id || 'unnamed'})。` +
                `保留优先级更高或更精准的响应。`
              );
            }
          } else {
            filteredParts.push(part);
          }
        }

        if (filteredParts.length > 0) {
          deduplicatedContents.push({ ...content, parts: filteredParts });
        }
      } else {
        deduplicatedContents.push(content);
      }
    }

    for (let i = 0; i < deduplicatedContents.length; i++) {
      const current = deduplicatedContents[i];
      fixedContents.push(current);

      // 🆕 检测用户消息中的孤立 function response（无匹配的 functionCall）
      if (current.role === MESSAGE_ROLES.USER && current.parts) {
        const functionResponses = current.parts.filter(part => part.functionResponse);
        if (functionResponses.length > 0) {
          const orphanedResponses = functionResponses.filter(respPart => {
            const functionResponse = respPart.functionResponse!;
            return !allFunctionCalls.some(({ call }) => {
              // 使用模糊匹配逻辑
              return isToolMatch(call, functionResponse);
            });
          });

          if (orphanedResponses.length > 0) {
            console.log(
              `[fixRequestContents] 检测到第${i + 1}条消息中有 ${orphanedResponses.length} 个孤立的 function response:`,
              orphanedResponses.map(r => ({
                name: r.functionResponse!.name,
                id: r.functionResponse!.id,
                result: (r.functionResponse!.response as any)?.result
              }))
            );
          }
        }
      }

      // 检查当前消息是否包含 function call
      const hasFunctionCall = current.role === MESSAGE_ROLES.MODEL &&
        current.parts?.some(part => part.functionCall);

      if (hasFunctionCall) {
        const next = deduplicatedContents[i + 1];

        // 获取当前消息中的所有 function call
        const functionCalls = current.parts?.filter(part => part.functionCall) || [];

        if (functionCalls.length > 0) {
          // 检查下一条消息中的 function response
          const nextFunctionResponses = next?.role === MESSAGE_ROLES.USER && next.parts ?
            next.parts.filter(part => part.functionResponse) : [];

          // 找出未匹配的 function call（使用模糊匹配）
          const unmatchedCalls = functionCalls.filter(callPart => {
            const functionCall = callPart.functionCall!;
            return !nextFunctionResponses.some(respPart => {
              const functionResponse = respPart.functionResponse!;
              return isToolMatch(functionCall, functionResponse);
            });
          });

          // 为未匹配的 function call 创建 "user cancel" response
          if (unmatchedCalls.length > 0) {
            const cancelResponses = unmatchedCalls.map(part => {
              const functionCall = part.functionCall!;
              return {
                functionResponse: {
                  name: functionCall.name,
                  response: { result: 'user cancel' },
                  ...(functionCall.id && { id: functionCall.id })
                }
              };
            });

            // 插入补全的 function response
            fixedContents.push({
              role: MESSAGE_ROLES.USER,
              parts: cancelResponses
            });

            console.log(`[fixRequestContents] 为第${i + 1}条消息补全了 ${unmatchedCalls.length} 个未匹配的 function call`);
          }

          // 如果下一条消息有混合内容，调整 parts 顺序：function-response 在前，text 在后
          if (next && nextFunctionResponses.length > 0) {
            const textParts = next.parts?.filter(part => !part.functionResponse) || [];

            if (textParts.length > 0) {
              // 修改下一条消息的 parts 顺序
              deduplicatedContents[i + 1] = {
                ...next,
                parts: [...nextFunctionResponses, ...textParts]
              };
              console.log(`[fixRequestContents] 调整了第${i + 2}条消息的内容顺序，function-response 在前`);
            }
          }
        }
      }
    }

    // 🆕 最终清理：移除所有仍然孤立的 functionResponse
    // 这处理了 "functionResponse without preceding functionCall" 的情况
    // 这种情况可能发生在压缩后，或者历史记录损坏时
    const finalContents: Content[] = [];
    const finalToolCallStack: { [id: string]: boolean } = {};
    const finalToolCallNames: { [name: string]: boolean } = {};

    for (const content of fixedContents) {
      // 记录所有 function call
      if (content.role === MESSAGE_ROLES.MODEL && content.parts) {
        content.parts.forEach(part => {
          if (part.functionCall) {
            if (part.functionCall.id) finalToolCallStack[part.functionCall.id] = true;
            if (part.functionCall.name) finalToolCallNames[part.functionCall.name] = true;
          }
        });
        finalContents.push(content);
      } else if (content.role === MESSAGE_ROLES.USER && content.parts) {
        // 过滤 functionResponse
        const validParts = content.parts.filter(part => {
          if (!part.functionResponse) return true; // 保留非 functionResponse 部分

          const response = part.functionResponse;
          const hasMatchingId = response.id && finalToolCallStack[response.id];
          const hasMatchingName = response.name && finalToolCallNames[response.name];

          if (hasMatchingId || hasMatchingName) {
            return true;
          } else {
            console.warn(
              `[fixRequestContents] ❌ 移除孤立的 functionResponse：${response.name} (id: ${response.id})。` +
              `这个 response 没有对应的 function call。`
            );
            return false;
          }
        });

        if (validParts.length > 0) {
          finalContents.push({ ...content, parts: validParts });
        } else {
          console.warn(`[fixRequestContents] 移除空的用户消息（所有 functionResponse 都被过滤）`);
        }
      } else {
        finalContents.push(content);
      }
    }

    return finalContents;
  }

  /**
   * Sends a message to the model and returns the response in chunks.
   *
   * @remarks
   * This method will wait for the previous message to be processed before
   * sending the next message.
   *
   * @see {@link Chat#sendMessage} for non-streaming method.
   * @param params - parameters for sending the message.
   * @return The model's response.
   *
   * @example
   * ```ts
   * const chat = ai.chats.create({model: 'gemini-2.0-flash'});
   * const response = await chat.sendMessageStream({
   *   message: 'Why is the sky blue?'
   * });
   * for await (const chunk of response) {
   *   console.log(chunk.text);
   * }
   * ```
   */
  async sendMessageStream(
    params: SendMessageParameters,
    prompt_id: string,
    scene: SceneType,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    await this.sendPromise;

    const baseUserContent = createUserContent(params.message);
    // 🎯 添加 prompt_id 到用户内容中
    const userContent: Content = {
      ...baseUserContent,
      prompt_id
    };
    const originalContents = this.getHistory(true).concat(userContent);

    // 🔧 修正请求内容，确保 function call/response 成对出现
    const requestContents = this.fixRequestContents(originalContents);
    this._logApiRequest(requestContents, this.config.getModel(), prompt_id);

    const startTime = Date.now();

    try {
      const apiCall = () => {
        const modelToUse = this.specifiedModel || DEFAULT_GEMINI_MODEL;

        // Prevent Flash model calls immediately after quota error
        if (
          this.config.getQuotaErrorOccurred() &&
          modelToUse === DEFAULT_GEMINI_FLASH_MODEL
        ) {
          throw new Error(
            'Please submit a new query to continue with the Flash model.',
          );
        }

        return this.contentGenerator.generateContentStream({
          model: modelToUse,
          contents: stripUIFieldsFromArray(requestContents),
          config: { ...this.generationConfig, ...params.config },
        }, scene);
      };

      // Note: Retrying streams can be complex. If generateContentStream itself doesn't handle retries
      // for transient issues internally before yielding the async generator, this retry will re-initiate
      // the stream. For simple 429/500 errors on initial call, this is fine.
      // If errors occur mid-stream, this setup won't resume the stream; it will restart it.
      const streamResponse = await retryWithBackoff(apiCall, {
        shouldRetry: (error: Error) => {
          // 🚫 DeepX配额错误不应重试 - 需要立即显示友好提示
          if (isDeepXQuotaError(error)) {
            return false;
          }

          // Check error messages for status codes, or specific error names if known
          if (error && error.message) {
            if (error.message.includes('429')) return true;
            // 451错误不重试 - 立即失败
            if (error.message.includes('REGION_BLOCKED_451') || error.message.includes('451')) return false;
            if (error.message.match(/5\d{2}/)) return true;
          }
          return false; // Don't retry other errors by default
        },
        onPersistent429: async (authType?: string, error?: unknown) =>
          await this.handleFlashFallback(authType, error),
        authType: this.config.getContentGeneratorConfig()?.authType,
      });

      // Resolve the internal tracking of send completion promise - `sendPromise`
      // for both success and failure response. The actual failure is still
      // propagated by the `await streamResponse`.
      this.sendPromise = Promise.resolve(streamResponse)
        .then(() => undefined)
        .catch(() => undefined);

      const result = this.processStreamResponse(
        streamResponse,
        userContent,
        startTime,
        prompt_id,
      );
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this._logApiError(durationMs, error, prompt_id, this.agentContext);
      // 清除实时token显示，因为请求失败
      realTimeTokenEventManager.clearRealTimeToken();
      this.sendPromise = Promise.resolve();
      throw error;
    }
  }

  /**
   * Returns the chat history.
   *
   * @remarks
   * The history is a list of contents alternating between user and model.
   *
   * There are two types of history:
   * - The `curated history` contains only the valid turns between user and
   * model, which will be included in the subsequent requests sent to the model.
   * - The `comprehensive history` contains all turns, including invalid or
   *   empty model outputs, providing a complete record of the history.
   *
   * The history is updated after receiving the response from the model,
   * for streaming response, it means receiving the last chunk of the response.
   *
   * The `comprehensive history` is returned by default. To get the `curated
   * history`, set the `curated` parameter to `true`.
   *
   * @param curated - whether to return the curated history or the comprehensive
   *     history.
   * @return History contents alternating between user and model for the entire
   *     chat session.
   */
  getHistory(curated: boolean = false): Content[] {
    const history = curated
      ? extractCuratedHistory(this.history)
      : this.history;
    // Deep copy the history to avoid mutating the history outside of the
    // chat session.
    return structuredClone(history);
  }

  /**
   * Clears the chat history.
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Adds a new entry to the chat history.
   *
   * @param content - The content to add to the history.
   */
  addHistory(content: Content): void {
    this.history.push(content);
  }
  setHistory(history: Content[]): void {
    this.history = history;
  }

  setTools(tools: Tool[]): void {
    this.generationConfig.tools = tools;
  }

  /**
   * 获取工具声明（用于 token 计数等场景）
   * @returns 工具列表，如果未设置则返回 undefined
   */
  getTools(): typeof this.generationConfig.tools {
    return this.generationConfig.tools;
  }

  /**
   * 获取系统指令（用于 token 计数等场景）
   * @returns 系统指令内容，如果未设置则返回 undefined
   */
  getSystemInstruction(): ContentUnion | undefined {
    return this.generationConfig.systemInstruction;
  }

  getFinalUsageMetadata(
    chunks: GenerateContentResponse[],
  ): GenerateContentResponseUsageMetadata | undefined {
    const lastChunkWithMetadata = chunks
      .slice()
      .reverse()
      .find((chunk) => chunk.usageMetadata);

    return lastChunkWithMetadata?.usageMetadata;
  }

  private async *processStreamResponse(
    streamResponse: AsyncGenerator<GenerateContentResponse>,
    inputContent: Content,
    startTime: number,
    prompt_id: string,
  ) {
    const outputContent: Content[] = [];
    const chunks: GenerateContentResponse[] = [];
    let errorOccurred = false;

    try {
      for await (const chunk of streamResponse) {
        // 先检查是否是 reasoning 内容，如果是就跳过不加入 chunks
        const content = chunk.candidates?.[0]?.content;
        const isReasoning = content && this.isReasoningContent(content);
        const isThought = content && this.isThoughtContent(content);

        // 收集所有有效的块，但排除 thought 和 reasoning
        if ((isValidResponse(chunk) || chunk.usageMetadata) && !isReasoning && !isThought) {
          chunks.push(chunk);
        }

        // 处理包含内容的有效响应
        if (isValidResponse(chunk)) {
          if (content !== undefined) {
            // 跳过 thought 和 reasoning 内容，不加入历史记录
            if (isThought || isReasoning) {
              yield chunk;
              continue;
            }
            outputContent.push(content);
          }
        }
        yield chunk;
      }
    } catch (error) {
      errorOccurred = true;
      const durationMs = Date.now() - startTime;
      this._logApiError(durationMs, error, prompt_id, this.agentContext);
      // 清除实时token显示，因为请求失败
      realTimeTokenEventManager.clearRealTimeToken();

      // 🎯 关键修复：即使发生错误（如用户取消），也要记录已经收到的内容
      // 如果模型已经输出了内容（尤其是 functionCall），记录它能保持历史记录的完整性，
      // 避免后续工具执行结果变成“孤立响应”。
      if (outputContent.length > 0) {
        this.recordHistory(inputContent, outputContent);
      }

      throw error;
    }

    if (!errorOccurred) {
      const durationMs = Date.now() - startTime;
      const allParts: Part[] = [];
      for (const content of outputContent) {
        if (content.parts) {
          allParts.push(...content.parts);
        }
      }
      await this._logApiResponse(
        durationMs,
        prompt_id,
        this.getFinalUsageMetadata(chunks),
        JSON.stringify(chunks),
        this.agentContext,
      );
      // 🎯 正常结束时记录历史
      this.recordHistory(inputContent, outputContent);
    }
  }

  private recordHistory(
    userInput: Content,
    modelOutput: Content[],
    automaticFunctionCallingHistory?: Content[],
  ) {
    // 过滤掉 thought 和 reasoning 内容
    const nonThoughtModelOutput = modelOutput.filter(
      (content) => !this.isThoughtContent(content) && !this.isReasoningContent(content),
    );

    let outputContents: Content[] = [];
    if (
      nonThoughtModelOutput.length > 0 &&
      nonThoughtModelOutput.every((content) => content.role !== undefined)
    ) {
      outputContents = nonThoughtModelOutput;
    } else if (nonThoughtModelOutput.length === 0 && modelOutput.length > 0) {
      // This case handles when the model returns only a thought.
      // We don't want to add an empty model response in this case.
    } else {
      // When not a function response appends an empty content when model returns empty response, so that the
      // history is always alternating between user and model.
      // Workaround for: https://b.corp.google.com/issues/420354090
      if (!isFunctionResponse(userInput)) {
        outputContents.push({
          role: MESSAGE_ROLES.MODEL,
          parts: [],
        } as Content);
      }
    }
    if (
      automaticFunctionCallingHistory &&
      automaticFunctionCallingHistory.length > 0
    ) {
      this.history.push(
        ...extractCuratedHistory(automaticFunctionCallingHistory),
      );
    } else {
      this.history.push(userInput);
    }

    // 🔧 Enhanced consolidation logic to merge function calls into single messages
    const consolidatedOutputContents: Content[] = [];
    for (const content of outputContents) {
      // 跳过 thought 和 reasoning 内容
      if (this.isThoughtContent(content) || this.isReasoningContent(content)) {
        continue;
      }
      const lastContent =
        consolidatedOutputContents[consolidatedOutputContents.length - 1];

      // Check if current content has function calls
      const hasFunctionCalls = content.parts?.some(part => part.functionCall);
      const lastHasFunctionCalls = lastContent?.parts?.some(part => part.functionCall);

      if (this.isTextContent(lastContent) && this.isTextContent(content)) {
        // If both current and last are text, combine their text into the lastContent's first part
        // and append any other parts from the current content.
        lastContent.parts[0].text += content.parts[0].text || '';
        if (content.parts.length > 1) {
          lastContent.parts.push(...content.parts.slice(1));
        }
      } else if (hasFunctionCalls && lastHasFunctionCalls && lastContent.role === MESSAGE_ROLES.MODEL) {
        // 🚀 KEY FIX: Merge consecutive function calls into the same message
        // This ensures multiple function calls are stored as one model message with multiple parts
        console.log('[recordHistory] Merging consecutive function calls into single message');
        lastContent.parts?.push(...(content.parts || []));
      } else {
        consolidatedOutputContents.push(content);
      }
    }

    if (consolidatedOutputContents.length > 0) {
      const lastHistoryEntry = this.history[this.history.length - 1];
      const canMergeWithLastHistory =
        !automaticFunctionCallingHistory ||
        automaticFunctionCallingHistory.length === 0;

      if (
        canMergeWithLastHistory &&
        this.isTextContent(lastHistoryEntry) &&
        this.isTextContent(consolidatedOutputContents[0])
      ) {
        // If both current and last are text, combine their text into the lastHistoryEntry's first part
        // and append any other parts from the current content.
        lastHistoryEntry.parts[0].text +=
          consolidatedOutputContents[0].parts[0].text || '';
        if (consolidatedOutputContents[0].parts.length > 1) {
          lastHistoryEntry.parts.push(
            ...consolidatedOutputContents[0].parts.slice(1),
          );
        }
        consolidatedOutputContents.shift(); // Remove the first element as it's merged
      }
      this.history.push(...consolidatedOutputContents);
    }
  }

  private isTextContent(
    content: Content | undefined,
  ): content is Content & { parts: [{ text: string }, ...Part[]] } {
    return !!(
      content &&
      content.role === 'model' &&
      content.parts &&
      content.parts.length > 0 &&
      typeof content.parts[0].text === 'string' &&
      content.parts[0].text !== ''
    );
  }

  private isThoughtContent(
    content: Content | undefined,
  ): content is Content & { parts: [{ thought: boolean }, ...Part[]] } {
    return !!(
      content &&
      content.role === 'model' &&
      content.parts &&
      content.parts.length > 0 &&
      typeof content.parts[0].thought === 'boolean' &&
      content.parts[0].thought === true
    );
  }

  /**
   * 检查内容是否为模型的 reasoning（思考过程）
   * reasoning 不应该被添加到历史记录中
   * 直接调用外部函数
   */
  private isReasoningContent(content: Content | undefined): boolean {
    return isReasoningContent(content);
  }
}
