/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from '@google/genai';
import { Config } from '../config/config.js';
import { UserTierId } from '../code_assist/types.js';
import { DeepVServerAdapter } from './DeepVServerAdapter.js';
import { getActiveProxyServerUrl, hasAvailableProxyServer } from '../config/proxyConfig.js';
import { SceneType } from './sceneManager.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
    scene: SceneType,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
    scene: SceneType,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  userTier?: UserTierId;
}

export enum AuthType {
  USE_CHEETH_OA = 'cheeth-oa',
}

export type ContentGeneratorConfig = {
  //model: string;
  authType?: AuthType | undefined;
  proxy?: string | undefined;
};

export function createContentGeneratorConfig(
  config: Config,
  authType: AuthType | undefined,
): ContentGeneratorConfig {

  // BUG修复: 系统默认使用Claude模型，无需特殊处理
  // 修复策略: 直接使用配置的模型或默认模型（现在默认就是Claude）
  // ✅ 移除默认模型依赖 - 服务端内部决定模型
  const effectiveModel = config.getModel() || 'auto'; // 使用auto让服务端决定
  
  const contentGeneratorConfig: ContentGeneratorConfig = {
    //model: effectiveModel,
    authType,
    proxy: config?.getProxy(),
  };

  // Cheeth OA authentication - no additional validation needed
  if (authType === AuthType.USE_CHEETH_OA) {
    return contentGeneratorConfig;
  }


  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  const version = process.env.CLI_VERSION || process.version;
  const httpOptions = {
    headers: {
      'User-Agent': `GeminiCLI/${version} (${process.platform}; ${process.arch})`,
    },
  };

  // 🎯 统一DeepV Server处理：所有模型都使用DeepVServerAdapter，但路由逻辑会自动选择正确的API端点
  const isDeepVServer = true; // 现在所有模型都通过DeepV Server，适配器内部会根据模型类型选择正确路径
  
  if (isDeepVServer) {

    // 确保有可用的代理服务器
    if (!hasAvailableProxyServer()) {
      throw new Error(
        'DeepV Code server is required for all models but is not available. ' +
        'Please start the DeepV Code server or use Cheeth OA authentication.'
      );
    }

    const proxyServerUrl = getActiveProxyServerUrl();
    console.log(`[DeepX] Connecting to DeepV Code server: ${proxyServerUrl}`);

    // 🔧 Linus式修复：统一使用DeepVServerAdapter，内部会根据模型类型自动路由
    const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION || 'us-east5';
    const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT || 'cmcm-cd';
    
    return new DeepVServerAdapter(googleCloudLocation, googleCloudProject, proxyServerUrl);
  }

  // For other auth types (should only be USE_CHEETH_OA now), fall through to error

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}
