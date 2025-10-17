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
 * Extracts the curated (valid) history from a comprehensive history.
 *
 * @remarks
 * The model may sometimes generate invalid or empty contents(e.g., due to safety
 * filters or recitation). Extracting valid turns from the history
 * ensures that subsequent requests could be accepted by the model.
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
        modelOutput.push(comprehensiveHistory[i]);
        if (isValid && !isValidContent(comprehensiveHistory[i])) {
          isValid = false;
        }
        i++;
      }
      if (isValid) {
        curatedHistory.push(...modelOutput);
      } else {
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
   * 4. 🆕 检测并警告多余的无匹配 function response（但保留原有行为）
   *
   * @param requestContents 原始请求内容
   * @returns 修正后的请求内容
   */
  private fixRequestContents(requestContents: Content[]): Content[] {
    const fixedContents: Content[] = [];

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

    for (let i = 0; i < requestContents.length; i++) {
      const current = requestContents[i];
      fixedContents.push(current);

      // 🆕 检测用户消息中的多余 function response
      if (current.role === MESSAGE_ROLES.USER && current.parts) {
        const functionResponses = current.parts.filter(part => part.functionResponse);
        if (functionResponses.length > 0) {
          const orphanedResponses = functionResponses.filter(respPart => {
            const functionResponse = respPart.functionResponse!;
            return !allFunctionCalls.some(({ call }) => {
              // 严格匹配：name 和 id 都必须完全一致
              return call.name === functionResponse.name &&
                call.id === functionResponse.id;
            });
          });

          if (orphanedResponses.length > 0) {
            console.log(`[fixRequestContents] 检测到第${i+1}条消息中有 ${orphanedResponses.length} 个多余的 function response:`,
              orphanedResponses.map(r => ({ name: r.functionResponse!.name, id: r.functionResponse!.id })));
          }
        }
      }

      // 检查当前消息是否包含 function call
      const hasFunctionCall = current.role === MESSAGE_ROLES.MODEL &&
        current.parts?.some(part => part.functionCall);

      if (hasFunctionCall) {
        const next = requestContents[i + 1];

        // 获取当前消息中的所有 function call
        const functionCalls = current.parts?.filter(part => part.functionCall) || [];

        if (functionCalls.length > 0) {
          // 检查下一条消息中的 function response
          const nextFunctionResponses = next?.role === MESSAGE_ROLES.USER && next.parts ?
            next.parts.filter(part => part.functionResponse) : [];

          // 找出未匹配的 function call（严格 ID 匹配）
          const unmatchedCalls = functionCalls.filter(callPart => {
            const functionCall = callPart.functionCall!;
            return !nextFunctionResponses.some(respPart => {
              const functionResponse = respPart.functionResponse!;
              // 严格匹配：name 必须相同，id 必须完全一致
              return functionResponse.name === functionCall.name &&
                functionCall.id === functionResponse.id;
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

            console.log(`[fixRequestContents] 为第${i+1}条消息补全了 ${unmatchedCalls.length} 个未匹配的 function call`);
          }

          // 如果下一条消息有混合内容，调整 parts 顺序：function-response 在前，text 在后
          if (next && nextFunctionResponses.length > 0) {
            const textParts = next.parts?.filter(part => !part.functionResponse) || [];

            if (textParts.length > 0) {
              // 修改下一条消息的 parts 顺序
              requestContents[i + 1] = {
                ...next,
                parts: [...nextFunctionResponses, ...textParts]
              };
              console.log(`[fixRequestContents] 调整了第${i+2}条消息的内容顺序，function-response 在前`);
            }
          }
        }
      }
    }

    return fixedContents;
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
        // 收集所有有效的块，包括只包含 usageMetadata 的块
        if (isValidResponse(chunk) || chunk.usageMetadata) {
          chunks.push(chunk);
        }

        // 处理包含内容的有效响应
        if (isValidResponse(chunk)) {
          const content = chunk.candidates?.[0]?.content;
          if (content !== undefined) {
            if (this.isThoughtContent(content)) {
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
    }
    this.recordHistory(inputContent, outputContent);
  }

  private recordHistory(
    userInput: Content,
    modelOutput: Content[],
    automaticFunctionCallingHistory?: Content[],
  ) {
    const nonThoughtModelOutput = modelOutput.filter(
      (content) => !this.isThoughtContent(content),
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
      if (this.isThoughtContent(content)) {
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
}
