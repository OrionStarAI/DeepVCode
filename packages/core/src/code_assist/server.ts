/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OAuth2Client } from 'google-auth-library';
import {
  CodeAssistGlobalUserSettingResponse,
  LoadCodeAssistRequest,
  LoadCodeAssistResponse,
  LongRunningOperationResponse,
  OnboardUserRequest,
  SetCodeAssistGlobalUserSettingRequest,
} from './types.js';
import { SceneType } from '../core/sceneManager.js';
import {
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import * as readline from 'readline';
import { ContentGenerator } from '../core/contentGenerator.js';
import { UserTierId } from './types.js';
import {
  CaCountTokenResponse,
  CaGenerateContentResponse,
  fromCountTokenResponse,
  fromGenerateContentResponse,
  toCountTokenRequest,
  toGenerateContentRequest,
} from './converter.js';

/** HTTP options to be used in each of the requests. */
export interface HttpOptions {
  /** Additional HTTP headers to be sent with the request. */
  headers?: Record<string, string>;
}

export const CODE_ASSIST_ENDPOINT = 'https://cloudcode-pa.googleapis.com';
export const CODE_ASSIST_API_VERSION = 'v1internal';

export class CodeAssistServer implements ContentGenerator {
  constructor(
    readonly client: OAuth2Client,
    readonly projectId?: string,
    readonly httpOptions: HttpOptions = {},
    readonly sessionId?: string,
    readonly userTier?: UserTierId,
  ) {}

  async generateContentStream(
    req: GenerateContentParameters,
    scene: SceneType,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const resps = await this.requestStreamingPost<CaGenerateContentResponse>(
      'streamGenerateContent',
      toGenerateContentRequest(req, this.projectId, this.sessionId),
      req.config?.abortSignal,
    );
    return (async function* (): AsyncGenerator<GenerateContentResponse> {
      for await (const resp of resps) {
        yield fromGenerateContentResponse(resp);
      }
    })();
  }

  async generateContent(
    req: GenerateContentParameters,
    scene: SceneType,
  ): Promise<GenerateContentResponse> {
    const resp = await this.requestPost<CaGenerateContentResponse>(
      'generateContent',
      toGenerateContentRequest(req, this.projectId, this.sessionId),
      req.config?.abortSignal,
    );
    return fromGenerateContentResponse(resp);
  }

  async onboardUser(
    req: OnboardUserRequest,
  ): Promise<LongRunningOperationResponse> {
    return await this.requestPost<LongRunningOperationResponse>(
      'onboardUser',
      req,
    );
  }

  async loadCodeAssist(
    req: LoadCodeAssistRequest,
  ): Promise<LoadCodeAssistResponse> {
    return await this.requestPost<LoadCodeAssistResponse>(
      'loadCodeAssist',
      req,
    );
  }

  async getCodeAssistGlobalUserSetting(): Promise<CodeAssistGlobalUserSettingResponse> {
    return await this.requestGet<CodeAssistGlobalUserSettingResponse>(
      'getCodeAssistGlobalUserSetting',
    );
  }

  async setCodeAssistGlobalUserSetting(
    req: SetCodeAssistGlobalUserSettingRequest,
  ): Promise<CodeAssistGlobalUserSettingResponse> {
    return await this.requestPost<CodeAssistGlobalUserSettingResponse>(
      'setCodeAssistGlobalUserSetting',
      req,
    );
  }

  async countTokens(req: CountTokensParameters): Promise<CountTokensResponse> {
    const resp = await this.requestPost<CaCountTokenResponse>(
      'countTokens',
      toCountTokenRequest(req),
    );
    return fromCountTokenResponse(resp);
  }

  async embedContent(
    _req: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw Error();
  }

  async requestPost<T>(
    method: string,
    req: object,
    signal?: AbortSignal,
  ): Promise<T> {
    const res = await this.client.request({
      url: this.getMethodUrl(method),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.httpOptions.headers,
      },
      responseType: 'json',
      body: JSON.stringify(req),
      signal,
    });
    return res.data as T;
  }

  async requestGet<T>(method: string, signal?: AbortSignal): Promise<T> {
    const res = await this.client.request({
      url: this.getMethodUrl(method),
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...this.httpOptions.headers,
      },
      responseType: 'json',
      signal,
    });
    return res.data as T;
  }

  async requestStreamingPost<T>(
    method: string,
    req: object,
    signal?: AbortSignal,
  ): Promise<AsyncGenerator<T>> {
    const res = await this.client.request({
      url: this.getMethodUrl(method),
      method: 'POST',
      params: {
        alt: 'sse',
      },
      headers: {
        'Content-Type': 'application/json',
        ...this.httpOptions.headers,
      },
      responseType: 'stream',
      body: JSON.stringify(req),
      signal,
    });

    return (async function* (): AsyncGenerator<T> {
      const rl = readline.createInterface({
        input: res.data as NodeJS.ReadableStream,
        crlfDelay: Infinity, // Recognizes '\r\n' and '\n' as line breaks
      });

      // 🎯 关键保护机制：监听客户端取消信号（云模式）
      // 当用户中止时，立即关闭 readline 接口并停止消费数据
      const handleAbort = () => {
        console.log('[CodeAssist] Stream cancelled by user - closing readline interface');
        try {
          rl.close();  // 立即关闭 readline，停止流消费
        } catch (e) {
          // 忽略close可能抛出的错误
        }
      };

      let abortListener: (() => void) | undefined;
      if (signal && !signal.aborted) {
        abortListener = handleAbort;
        signal.addEventListener('abort', abortListener);
      }

      try {
        let bufferedLines: string[] = [];
        for await (const line of rl) {
          // 检查是否被用户中止（快速退出）
          if (signal?.aborted) {
            console.log('[CodeAssist] Stream generation cancelled by user - exiting loop');
            break;
          }

          // blank lines are used to separate JSON objects in the stream
          if (line === '') {
            if (bufferedLines.length === 0) {
              continue; // no data to yield
            }
            yield JSON.parse(bufferedLines.join('\n')) as T;
            bufferedLines = []; // Reset the buffer after yielding
          } else if (line.startsWith('data: ')) {
            bufferedLines.push(line.slice(6).trim());
          } else {
            throw new Error(`Unexpected line format in response: ${line}`);
          }
        }
      } finally {
        // 🧹 清理：移除 abort 监听器
        if (abortListener && signal) {
          signal.removeEventListener('abort', abortListener);
        }
        try {
          rl.close();
        } catch (e) {
          // 忽略close可能的错误
        }
      }
    })();
  }

  getMethodUrl(method: string): string {
    const endpoint = process.env.CODE_ASSIST_ENDPOINT ?? CODE_ASSIST_ENDPOINT;
    return `${endpoint}/${CODE_ASSIST_API_VERSION}:${method}`;
  }
}
