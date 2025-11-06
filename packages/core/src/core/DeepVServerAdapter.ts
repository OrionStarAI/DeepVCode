/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  FinishReason,
} from '@google/genai';
import { stripUIFieldsFromArray } from '../types/extendedContent.js';
import { ContentGenerator } from './contentGenerator.js';
import { Config } from '../config/config.js';
import { UserTierId } from '../code_assist/types.js';
import { proxyAuthManager } from './proxyAuth.js';
import { getActiveProxyServerUrl } from '../config/proxyConfig.js';
import { logger } from '../utils/enhancedLogger.js';
import { getDefaultAuthHandler } from '../auth/authNavigator.js';
import { UnauthorizedError } from '../utils/errors.js';
import { SceneType, SceneManager } from './sceneManager.js';

import { realTimeTokenEventManager } from '../events/realTimeTokenEvents.js';
import { MESSAGE_ROLES } from '../config/messageRoles.js';
import { getGlobalDispatcher } from 'undici';

/**
 * DeepV服务器适配器 - 精简版
 * 通过统一的聊天API调用所有AI模型，服务端智能处理模型选择和格式转换
 * 支持Claude和Gemini模型的统一接口
 */
export class DeepVServerAdapter implements ContentGenerator {
  public userTier?: UserTierId;
  private authHandler: (() => Promise<void>) | null = null;
  private config?: Config;

  constructor(region: string, projectId: string, proxyServerUrl?: string, config?: Config) {
    // 保存 Config 引用用于模型回退
    this.config = config;

    // NOTE: region and projectId parameters are legacy, no longer used after switching to proxy-based architecture
    // 使用硬编码的代理服务器URL，用户无需配置
    const finalProxyUrl = proxyServerUrl || getActiveProxyServerUrl();
    proxyAuthManager.configure({ proxyServerUrl: finalProxyUrl });

    // 初始化认证处理器 - 直接抛出UnauthorizedError触发/auth对话框
    this.authHandler = async () => {
      console.log('🔄 [DeepV Server] Authentication required, opening auth dialog...');
      throw new UnauthorizedError('Authentication required - please re-authenticate');
    };

    // 只在调试模式下显示详细日志
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      console.log(`[DeepV Server] Initialized with proxy server: ${finalProxyUrl}`);
    }
  }

  /**
   * 设置飞书用户信息
   */
  setUserInfo(userInfo: any): void {
    proxyAuthManager.setUserInfo(userInfo);
    // 只在调试模式下显示详细日志
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      console.log(`[DeepV Server] User info configured: ${userInfo.name}`);
    }
  }

  /**
   * 检查飞书认证状态
   */
  async verifyFeishuAuth(): Promise<boolean> {
    try {
      const userInfo = proxyAuthManager.getUserInfo();
      if (userInfo) {
        // 只在调试模式下显示详细日志
        if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
          console.log(`[DeepV Server] User info found: ${userInfo.name} (${userInfo.email || userInfo.openId || 'N/A'})`);
        }
        return true;
      } else {
        console.warn(`[DeepV Server] No user info found, please login first`);
        return false;
      }
    } catch (error) {
      console.error(`[DeepV Server] Authentication check failed:`, error);
      return false;
    }
  }

  /**
   * 核心方法：统一的内容生成接口
   * 使用新的 /v1/chat/messages 统一端点，服务端智能处理所有模型差异
   */
  async generateContent(request: GenerateContentParameters, scene: SceneType): Promise<GenerateContentResponse> {
    try {
      // 1. 构建统一的GenAI格式请求
      const sceneModel = SceneManager.getModelForScene(scene);
      const userModel = this.config?.getModel();

      // 模型解析优先级：request.model > sceneModel > userModel > 'auto'
      // 这样固定值场景（如 'gemini-2.5-flash'）会优先，'auto' 场景会回退到用户模型
      const modelToUse = request.model || sceneModel || userModel || 'auto';

      // 详细的模型决策日志 - 仅在调试模式下显示
      if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
        console.log(`[🎯 Model Resolution] Using model: ${modelToUse} for scene: ${scene}`);
      }

      const unifiedRequest = {
        model: modelToUse,
        contents: stripUIFieldsFromArray(request.contents),
        config: {
          ...request.config,
          // 添加场景信息到headers，供服务端参考
          httpOptions: {
            ...request.config?.httpOptions,
            headers: {
              ...request.config?.httpOptions?.headers,
              'X-Scene-Type': scene,
              'X-Scene-Display': SceneManager.getSceneDisplayName(scene),
            }
          }
        }
      };

      logger.info(`[DeepV Server] Calling unified chat API with model: ${modelToUse}`);

      // 2. 统一API调用 - 服务端处理所有模型差异
      const response = await this.callUnifiedChatAPI('/v1/chat/messages', unifiedRequest, request.config?.abortSignal);

      // 3. 日志记录工具调用
      if (response.functionCalls && response.functionCalls.length > 0 && (process.env.DEBUG || process.env.NODE_ENV === 'development')) {
        console.log(`[DeepV Server] Model called ${response.functionCalls.length} tool(s): ${response.functionCalls.map(fc => fc.name).join(', ')}`);
      }

      logger.debug('[DeepV Server] Response received successfully', { model: modelToUse });
      return response;

    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * 统一的API调用方法 - 使用新的统一端点
   */
  private async callUnifiedChatAPI(endpoint: string, requestBody: any, abortSignal?: AbortSignal): Promise<GenerateContentResponse> {
    const userHeaders = await proxyAuthManager.getUserHeaders();
    const proxyUrl = `${proxyAuthManager.getProxyServerUrl()}${endpoint}`;

    const controller = new AbortController();
    let abortListener: (() => void) | null = null;

    if (abortSignal) {
      // 🚨 防止内存泄漏：检查传入的signal是否已被中止
      if (abortSignal.aborted) {
        controller.abort();
      } else {
        const handleAbort = () => {
          console.log('[DeepV Server] Request cancelled by user');
          controller.abort();
        };
        abortSignal.addEventListener('abort', handleAbort);
        abortListener = () => abortSignal.removeEventListener('abort', handleAbort);
      }
    }

    // 🚨 添加两层超时保护：
    // 1. 连接层：30秒超时（保护TCP连接建立和响应头接收）
    // 2. 数据层：120秒超时（保护完整响应体接收，response.json()）
    const fetchTimeoutId = setTimeout(() => {
      console.warn('[DeepV Server] API fetch timeout - aborting after 30s');
      controller.abort();
    }, 30000);

    const startTime = Date.now();

    try {
      logger.debug('[DeepV Server] Making unified API call', {
        endpoint,
        url: proxyUrl,
        model: requestBody.model
      });

      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...userHeaders,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      // 🚨 获取响应头后清理连接超时，改用数据超时
      clearTimeout(fetchTimeoutId);
      const dataTimeoutId = setTimeout(() => {
        console.warn('[DeepV Server] API data timeout - response.json() taking too long (>120s)');
        controller.abort();
      }, 120000);

      if (!response.ok) {
        clearTimeout(dataTimeoutId);
        const errorText = await response.text();

        // 401错误特殊处理
        if (response.status === 401) {
          console.error('[DeepV Server] 401 Unauthorized - triggering auth dialog');
          if (this.authHandler) {
            await this.authHandler();
          }
          throw new UnauthorizedError('Authentication required - please re-authenticate');
        }

        // 451错误特殊处理 - 立即中断
        if (response.status === 451) {
          console.error('[DeepV Server] 451 Region Blocked - IMMEDIATE ABORT');
          // 立即中断当前请求
          controller.abort();
          // 抛出特殊异常立即中断事件循环
          throw new Error(`REGION_BLOCKED_451: ${errorText}`);
        }

        throw new Error(`API request failed (${response.status}): ${errorText}`);
      }

      // 🚨 使用数据层超时保护 response.json()
      const responseData = await this.withTimeout(
        response.json() as Promise<GenerateContentResponse>,
        120000,
        '[DeepV Server] API response parsing timeout after 120s'
      );
      clearTimeout(dataTimeoutId);

      // 确保响应对象有 functionCalls getter
      if (!responseData.functionCalls) {
        Object.defineProperty(responseData, 'functionCalls', {
          get: function() {
            if (this.candidates?.[0]?.content?.parts?.length === 0) {
              return undefined;
            }
            if (this.candidates && this.candidates.length > 1) {
              console.warn(
                'there are multiple candidates in the response, returning function calls from the first one.',
              );
            }
            const functionCalls = this.candidates?.[0]?.content?.parts
              ?.filter((part: any) => part.functionCall)
              .map((part: any) => part.functionCall)
              .filter((functionCall: any) => functionCall !== undefined);
            if (functionCalls?.length === 0) {
              return undefined;
            }
            return functionCalls;
          },
          enumerable: false,
          configurable: true
        });
      }

      const duration = Date.now() - startTime;
      logger.debug('[DeepV Server] API call completed', {
        endpoint,
        duration: `${duration}ms`,
        status: response.status
      });

      return responseData;

    } catch (error) {
      const duration = Date.now() - startTime;

      // 🚨 清理资源：移除abort监听器和所有超时定时器
      if (abortListener) {
        abortListener();
      }
      clearTimeout(fetchTimeoutId);

      // 用户取消请求的优雅处理
      if (error instanceof Error &&
          (error.message.includes('cancelled by user') || error.name === 'AbortError')) {
        console.log('⚠️  任务已取消');
        throw error;
      }

      // 超时错误处理
      if (error instanceof Error && error.message.includes('timeout')) {
        logger.warn('[DeepV Server] Request timeout', {
          endpoint,
          duration: `${duration}ms`,
          reason: error.message
        });
      } else if (error instanceof Error && error.message.includes('abort')) {
        logger.warn('[DeepV Server] Request aborted', {
          endpoint,
          duration: `${duration}ms`,
          reason: error.message
        });
      } else {
        logger.error('[DeepV Server] API call failed', {
          endpoint,
          duration: `${duration}ms`,
          error: error instanceof Error ? error.message : error
        });
      }

      throw error;
    } finally {
      // 🚨 最终清理：确保资源一定被释放
      clearTimeout(fetchTimeoutId);
      if (abortListener) {
        abortListener();
      }
    }
  }



  /**
   * 统一错误处理方法
   */
  private handleError(error: unknown): never {
    // 🚨 特殊处理用户中断 - 优雅处理，不显示错误堆栈
    if (error instanceof Error &&
        (error.message.includes('cancelled by user') || error.name === 'AbortError')) {
      throw error;
    }

    // 🚨 特殊处理网络连接错误
    const isConnectionError = error instanceof TypeError &&
      (error.message.includes('fetch failed') ||
       error.message.includes('ECONNREFUSED') ||
       (error as any).cause?.code === 'ECONNREFUSED');

    if (isConnectionError) {
      console.error(`❌ 无法连接到服务器，请检查网络连接或服务器状态`);
    } else {
      console.error('[DeepV Server] Error in generateContent:', error);
    }

    // 🚨 特殊处理401错误 - 提供更友好的错误信息
    if (error instanceof Error && (error as any).isAuthError) {
      const friendlyError = new Error(
        `Authentication failed (401): ${error.message}\n\n` +
        `Please check your Feishu authentication token and try again.\n` +
        `If the problem persists, you may need to re-authenticate.`
      );
      (friendlyError as any).isAuthError = true;
      (friendlyError as any).statusCode = 401;
      throw friendlyError;
    }

    throw error;
  }

  async generateContentStream(request: GenerateContentParameters, scene: SceneType): Promise<AsyncGenerator<GenerateContentResponse>> {
    // 🆕 云模式下禁用SSE流式传输，直接使用非流式API避免消息被打断
    // 通过检查环境变量判断是否为云模式
    const isCloudMode = process.env.DEEPV_CLOUD_MODE === 'true';

    if (isCloudMode) {
      return this._generateContent(request, scene);
    }

    // 🔍 Model-specific SSE streaming support check (not model selection)
    // This detects which API features are available for the requested model
    // Actual model selection is done by the server based on 'auto' requests
    // These hardcoded checks are for API capability detection only
    if (request.model === 'claude-sonnet-4@20250514' ||
        request.model === 'claude-sonnet-4-5@20250929' ||
        request.model === 'claude-haiku-4-5@20251001') {
      return this._generateContentStream(request, scene);
    } else {
      // 其他模型将非流式响应包装为流式格式
      return this._generateContent(request, scene);
    }
  }

  async _generateContent(request: GenerateContentParameters, scene: SceneType): Promise<AsyncGenerator<GenerateContentResponse>> {
    const response = await this.generateContent(request, scene);
    return (async function* () {
          yield response;
    })();
  }

  /**
   * 🆕 真正的流式内容生成
   * 支持Server-Sent Events (SSE)和ESC键中断
   */
  async _generateContentStream(request: GenerateContentParameters, scene: SceneType): Promise<AsyncGenerator<GenerateContentResponse>> {
    try {
      // 构建流式请求
      const sceneModel = SceneManager.getModelForScene(scene);
      const userModel = this.config?.getModel();

      // 模型解析优先级：request.model > sceneModel > userModel > 'auto'
      // 这样固定值场景（如 'gemini-2.5-flash'）会优先，'auto' 场景会回退到用户模型
      const modelToUse = request.model || sceneModel || userModel || 'auto';

      // 详细的模型决策日志 - 仅在调试模式下显示
      if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
        console.log(`[🎯 Model Resolution (Stream)] Using model: ${modelToUse} for scene: ${scene}`);
      }

      const streamRequest = {
        model: modelToUse,
        contents: stripUIFieldsFromArray(request.contents),
        config: {
          ...request.config,
          stream: true,  // 启用流式输出
          // 添加场景信息到headers
          httpOptions: {
            ...request.config?.httpOptions,
            headers: {
              ...request.config?.httpOptions?.headers,
              'X-Scene-Type': scene,
              'X-Scene-Display': SceneManager.getSceneDisplayName(scene),
            }
          }
        }
      };

      logger.info(`[DeepV Server] Starting stream with model: ${modelToUse}`);

      // 调用流式API（错误处理已在callStreamAPI中统一处理）
      const response = await this.callStreamAPI('/v1/chat/stream', streamRequest, request.config?.abortSignal);

      // 返回流式生成器
      return this.createStreamGenerator(response, request.config?.abortSignal);

    } catch (error) {
      logger.error('[DeepV Server] Stream request failed', { error });
      return this.handleStreamError(error);
    }
  }

  /**
   * 🆕 调用流式API
   */
  private async callStreamAPI(endpoint: string, requestBody: any, abortSignal?: AbortSignal): Promise<Response> {
    const userHeaders = await proxyAuthManager.getUserHeaders();
    const proxyUrl = `${proxyAuthManager.getProxyServerUrl()}${endpoint}`;

    // 🔍 调试：打印代理相关信息（流式调用）- 仅在调试模式下显示
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      console.log('🔍 [DeepV Debug Stream] Proxy environment variables:');
      console.log('  HTTP_PROXY:', process.env.HTTP_PROXY);
      console.log('  HTTPS_PROXY:', process.env.HTTPS_PROXY);
      console.log('  http_proxy:', process.env.http_proxy);
      console.log('  https_proxy:', process.env.https_proxy);
      console.log('  Target URL:', proxyUrl);

      // 🔍 检查 undici 全局调度器（流式）
      const globalDispatcher = getGlobalDispatcher();
      console.log('🔍 [DeepV Debug Stream] Global dispatcher:', globalDispatcher?.constructor?.name || 'undefined');
      if (globalDispatcher && 'uri' in globalDispatcher) {
        console.log('  Dispatcher URI:', (globalDispatcher as any).uri);
      }
    }

    const controller = new AbortController();
    let abortListener: (() => void) | null = null;

    if (abortSignal) {
      // 🚨 防止内存泄漏：检查传入的signal是否已被中止
      if (abortSignal.aborted) {
        controller.abort();
      } else {
        const handleAbort = () => {
          if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
            console.log('[DeepV Server] Stream request cancelled by user');
          }
          controller.abort();
        };
        abortSignal.addEventListener('abort', handleAbort);
        abortListener = () => abortSignal.removeEventListener('abort', handleAbort);
      }
    }

    // 注意：不使用全局超时定时器
    // 原因：
    // 1. 流式API本身没有明确的时间限制（可能会持续很长时间）
    // 2. 如果中途没有数据，createStreamGenerator 中的 120秒 read() 超时会生效
    // 3. 全局定时器易导致定时器泄漏（流完成后无法清理）
    // 4. 用户可以通过 abortSignal 随时取消请求

    const startTime = Date.now();

    try {
      logger.debug('[DeepV Server] Making stream API call', {
        endpoint,
        url: proxyUrl,
        model: requestBody.model
      });

      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
          ...userHeaders,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();

        // 401错误特殊处理 - 与非流式API保持一致
        if (response.status === 401) {
          console.error('[DeepV Server] Stream 401 Unauthorized - triggering auth dialog');
          if (this.authHandler) {
            await this.authHandler();
          }
          throw new UnauthorizedError('Authentication required - please re-authenticate');
        }

        // 451错误特殊处理 - 立即中断
        if (response.status === 451) {
          console.error('[DeepV Server] Stream 451 Region Blocked - IMMEDIATE ABORT');
          // 立即中断当前请求
          controller.abort();
          // 抛出特殊异常立即中断事件循环
          throw new Error(`REGION_BLOCKED_451: ${errorText}`);
        }

        throw new Error(`Stream API error (${response.status}): ${errorText}`);
      }

      const duration = Date.now() - startTime;
      logger.debug('[DeepV Server] Stream API call initiated', {
        endpoint,
        duration: `${duration}ms`,
        status: response.status
      });

      return response;

    } catch (error) {
      const duration = Date.now() - startTime;

      // 🚨 清理资源：移除abort监听器
      if (abortListener) {
        abortListener();
      }

      // 用户取消请求的优雅处理
      if (error instanceof Error &&
          (error.message.includes('cancelled by user') || error.name === 'AbortError')) {
        console.log('⚠️  流式任务已取消');
        throw error;
      }

      // 超时错误处理
      if (error instanceof Error && error.message.includes('abort')) {
        logger.warn('[DeepV Server] Stream API aborted', {
          endpoint,
          duration: `${duration}ms`,
          reason: error.message
        });
      } else {
        logger.error('[DeepV Server] Stream API call failed', {
          endpoint,
          duration: `${duration}ms`,
          error: error instanceof Error ? error.message : error
        });
      }

      throw error;
    } finally {
      // 清理abort监听器
      if (abortListener) {
        abortListener();
      }
    }
  }

  /**
   * 🆕 创建流式生成器
   *
   * 超时保护策略：
   * - 每个 read() 调用有 120 秒超时（这是唯一的超时保护）
   * - 如果 120 秒内没有收到数据，自动中止
   * - 允许长时间的数据流传输（只要持续有数据到达）
   * - 用户可以通过 abortSignal 随时取消请求
   */
  private async *createStreamGenerator(response: Response, abortSignal?: AbortSignal): AsyncGenerator<GenerateContentResponse> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No stream reader available');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        // 检查是否被取消
        if (abortSignal?.aborted) {
          console.log('[DeepV Server] Stream generation cancelled');
          break;
        }

        // 为流读取添加超时保护（120秒）
        // 这确保如果长时间没有收到任何数据，会自动中止
        // 但如果数据在持续到达，流可以无限期地运行
        const { done, value } = await this.withTimeout(
          reader.read(),
          120000,
          '[DeepV Server] Stream read timeout after 120s (no data received)'
        );
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return; // 流结束
            }

            try {
              const chunk = JSON.parse(data);

              // 跳过连接确认消息
              if (chunk.type === 'connection_established') {
                continue;
              }

              // 处理错误
              if (chunk.error) {
                throw new Error(chunk.error);
              }

              // 🚀 立即转换并发送 - 真正的流式
              const genaiResponse = this.convertStreamChunkToGenAI(chunk);
              if (genaiResponse) {
                yield genaiResponse;
              }

            } catch (parseError) {
              logger.warn('[DeepV Server] Stream chunk parse error', {
                data: data.substring(0, 100) + '...',
                error: parseError instanceof Error ? parseError.message : parseError
              });
              // 忽略解析错误，继续处理
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 🆕 将流式块转换为GenAI格式
   */
  private convertStreamChunkToGenAI(chunk: any): GenerateContentResponse | null {
    if (!chunk.candidates || !Array.isArray(chunk.candidates) || chunk.candidates.length === 0) {
      return null;
    }

    // 确保响应对象有 functionCalls getter（复用现有逻辑）
    const response = {
      candidates: chunk.candidates,
      usageMetadata: chunk.usageMetadata
    } as GenerateContentResponse;

    if (!response.functionCalls) {
      Object.defineProperty(response, 'functionCalls', {
        get: function() {
          if (this.candidates?.[0]?.content?.parts?.length === 0) {
            return undefined;
          }
          if (this.candidates && this.candidates.length > 1) {
            console.warn(
              'there are multiple candidates in the response, returning function calls from the first one.',
            );
          }
          const functionCalls = this.candidates?.[0]?.content?.parts
            ?.filter((part: any) => part.functionCall)
            .map((part: any) => part.functionCall)
            .filter((functionCall: any) => functionCall !== undefined);
          if (functionCalls?.length === 0) {
            return undefined;
          }
          return functionCalls;
        },
        enumerable: false,
        configurable: true
      });
    }

    return response;
  }

  /**
   * 🆕 合并流式内容（用于累积显示）
   */
  private mergeStreamContent(accumulated: any, newChunk: GenerateContentResponse): GenerateContentResponse {
    if (!accumulated) {
      return newChunk;
    }

    // 合并文本内容
    const accumulatedParts = accumulated.candidates?.[0]?.content?.parts || [];
    const newParts = newChunk.candidates?.[0]?.content?.parts || [];

    if (newParts.length > 0 && newParts[0].text) {
      // 如果有新的文本，累积到现有文本中
      const lastAccPart = accumulatedParts[accumulatedParts.length - 1];
      if (lastAccPart && lastAccPart.text && !lastAccPart.functionCall) {
        lastAccPart.text += newParts[0].text;
      } else {
        accumulatedParts.push(...newParts);
      }
    } else if (newParts.length > 0 && newParts[0].functionCall) {
      // 如果有工具调用，直接添加
      accumulatedParts.push(...newParts);
    }

    // 更新使用统计（使用最新的）
    if (newChunk.usageMetadata) {
      accumulated.usageMetadata = newChunk.usageMetadata;
    }

    // 更新完成原因
    if (newChunk.candidates?.[0]?.finishReason) {
      accumulated.candidates[0].finishReason = newChunk.candidates[0].finishReason;
    }

    return accumulated;
  }

  /**
   * 🆕 构建统一请求格式（用于流式）
   */
  private buildUnifiedRequest(request: GenerateContentParameters, scene: SceneType): any {
    const sceneModel = SceneManager.getModelForScene(scene);
    const modelToUse = request.model || sceneModel || 'auto';

    return {
      model: modelToUse,
      contents: request.contents,
      config: {
        ...request.config,
        httpOptions: {
          ...request.config?.httpOptions,
          headers: {
            ...request.config?.httpOptions?.headers,
            'X-Scene-Type': scene,
            'X-Scene-Display': SceneManager.getSceneDisplayName(scene),
          }
        }
      }
    };
  }

  /**
   * 🆕 处理流式错误 - 复用统一错误处理逻辑
   */
  private async *handleStreamError(error: unknown): AsyncGenerator<GenerateContentResponse> {
    this.handleError(error);
  }

  /**
   * Token计数 - 使用新的统一端点
   */
  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    try {
      // 构建统一的GenAI格式请求
      const unifiedRequest = {
        model: request.model || 'auto', // 让服务端智能选择模型
        contents: request.contents
      };

      // 调用统一Token计数API
      const response = await this.callUnifiedTokenCountAPI(unifiedRequest);

      // 发射实时token事件，立即更新UI显示
      realTimeTokenEventManager.emitRealTimeToken({
        inputTokens: response.totalTokens || 0,
        outputTokens: 0, // Token计数不生成输出
        totalTokens: response.totalTokens || 0,
        timestamp: Date.now(),
      });

      return response;

    } catch (error) {
      logger.error('[DeepV Server] Token count failed:', error);

      // 回退到估算方法
      return this.estimateTokensAsFailback(request);
    }
  }

  /**
   * Token计数专用API调用
   */
  private async callUnifiedTokenCountAPI(requestBody: any): Promise<CountTokensResponse> {
    const userHeaders = await proxyAuthManager.getUserHeaders();
    const proxyUrl = `${proxyAuthManager.getProxyServerUrl()}/v1/chat/count-tokens`;

    try {
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...userHeaders,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();

        // 401错误特殊处理
        if (response.status === 401) {
          console.error('[DeepV Server] Token count 401 Unauthorized');
          if (this.authHandler) {
            await this.authHandler();
          }
          throw new UnauthorizedError('Authentication required - please re-authenticate');
        }

        throw new Error(`Token count API failed (${response.status}): ${errorText}`);
      }

      const responseData = await response.json();

      logger.debug('[DeepV Server] Token count response', {
        totalTokens: responseData.totalTokens
      });

      return {
        totalTokens: responseData.totalTokens || 0
      };

    } catch (error) {
      logger.error('[DeepV Server] Token count API call failed:', error);
      throw error;
    }
  }

  /**
   * 回退的Token估算方法
   * 改进版：包含工具调用、响应，以及更准确的字符到token转换
   */
  private estimateTokensAsFailback(request: CountTokensParameters): CountTokensResponse {
    try {
      const contentsArray = Array.isArray(request.contents) ? request.contents : [{ role: MESSAGE_ROLES.USER, parts: [{ text: request.contents }] }];
      let totalChars = 0;
      let toolCallCount = 0;
      let toolResultCount = 0;
      let textParts = 0;

      for (const content of contentsArray) {
        if (typeof content === 'object' && content && 'parts' in content && Array.isArray(content.parts)) {
          for (const part of content.parts) {
            if (typeof part === 'object' && part && 'text' in part && typeof part.text === 'string') {
              totalChars += part.text.length;
              textParts++;
            } else if (typeof part === 'object' && part && 'functionCall' in part && (part as any).functionCall) {
              // 估算工具调用的token数
              const functionCall = (part as any).functionCall;
              const toolCallText = `[Tool: ${functionCall.name}]` +
                                  JSON.stringify(functionCall.args || {});
              totalChars += toolCallText.length;
              toolCallCount++;
           } else if (typeof part === 'object' && part && 'functionResponse' in part && (part as any).functionResponse) {
              // 估算工具响应的token数
              const functionResponse = (part as any).functionResponse;
              const output = functionResponse.response?.output || 'result';
              const toolResultText = `[Tool Result: ${output}]`;
              totalChars += toolResultText.length + 20; // 额外的结构开销
              toolResultCount++;
           }
          }
        } else if (typeof content === 'string') {
          totalChars += content.length;
          textParts++;
        }
      }

      // 改进的字符到token转换
      const contentStr = JSON.stringify(contentsArray);
      const hasChineseChars = /[\u4e00-\u9fff]/.test(contentStr);
      const hasCodeContent = /```|function|class|import|export|\{|\}|\[|\]/.test(contentStr);

      let charsPerToken = 4; // 默认英文比例
      if (hasChineseChars) {
        charsPerToken = 2; // 中文密度更高
      } else if (hasCodeContent) {
        charsPerToken = 3; // 代码token密度介于中间
      }

      const estimatedTokens = Math.ceil(totalChars / charsPerToken);

      return {
        totalTokens: estimatedTokens,
      };
    } catch (error) {
      console.error('[DeepV Server] Fallback estimation error:', error);
      return {
        totalTokens: 1000, // Default fallback
      };
    }
  }



  /**
   * Embedding: Claude doesn't support this
   */
  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    throw new Error('Claude models do not support embedding content');
  }

  /**
   * 🚨 为 Promise 添加超时保护
   * 用于防止流式读取等长时间操作无限期等待
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs)
      )
    ]);
  }
}
