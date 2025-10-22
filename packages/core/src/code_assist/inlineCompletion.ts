/**
 * @license
 * Copyright 2025 DeepV Code
 * SPDX-License-Identifier: Apache-2.0
 */

import { Config } from '../config/config.js';
import { ContentGenerator } from '../core/contentGenerator.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { SceneType } from '../core/sceneManager.js';

/**
 * 行内代码补全请求参数
 */
export interface InlineCompletionRequest {
  /** 文件路径 */
  filePath: string;
  /** 当前光标位置 */
  position: {
    line: number;
    character: number;
  };
  /** 光标前的代码 */
  prefix: string;
  /** 光标后的代码 */
  suffix: string;
  /** 编程语言 */
  language: string;
  /** 最大补全长度 */
  maxLength?: number;
}

/**
 * 行内代码补全响应
 */
export interface InlineCompletionResponse {
  /** 补全文本 */
  text: string;
  /** 补全范围（可选，用于替换已有文本） */
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

/**
 * 行内代码补全服务
 *
 * 负责生成上下文感知的代码补全建议
 */
export class InlineCompletionService {
  private config: Config;
  private contentGenerator: ContentGenerator;

  // 补全缓存（避免重复请求）
  private cache = new Map<string, InlineCompletionResponse>();
  private readonly MAX_CACHE_SIZE = 100;

  // 可选的模型名称覆盖（用于强制使用特定模型）
  private modelOverride?: string;

  constructor(config: Config, contentGenerator: ContentGenerator) {
    this.config = config;
    this.contentGenerator = contentGenerator;
  }

  /**
   * 设置模型覆盖
   * @param modelName 模型名称，如 'gemini-2.5-flash' 或 undefined 使用配置的模型
   */
  setModelOverride(modelName?: string): void {
    this.modelOverride = modelName;
    // 模型变更时清空缓存
    this.clearCache();
  }

  /**
   * 获取当前使用的模型
   */
  getCurrentModel(): string {
    // 优先级：手动覆盖 > Config 配置 > 默认 Flash 模型
    return this.modelOverride || this.config.getModel() || 'gemini-2.5-flash';
  }

  /**
   * 生成行内代码补全
   */
  async generateCompletion(
    request: InlineCompletionRequest,
    signal?: AbortSignal
  ): Promise<InlineCompletionResponse | null> {
    try {
      // 检查缓存
      const cacheKey = this.getCacheKey(request);
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey)!;
      }

      // 检查是否被取消
      if (signal?.aborted) {
        return null;
      }

      // 构建提示词
      const prompt = this.buildPrompt(request);

      // 调用 AI 生成补全
      // 🎯 行内补全使用快速模型（优先速度而非复杂推理）
      // 优先使用 Gemini Flash 以获得更快的响应速度
      const currentModel = this.getCurrentModel();

      const response = await this.contentGenerator.generateContent({
        model: currentModel,
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
      }, SceneType.CONTENT_SUMMARY); // 使用快速场景而非 CODE_ASSIST（避免强制使用 Claude）

      if (signal?.aborted) {
        return null;
      }

      // 提取补全文本
      const completionText = this.extractCompletionText(response);

      if (!completionText) {
        return null;
      }

      const result: InlineCompletionResponse = {
        text: completionText,
      };

      // 缓存结果
      this.addToCache(cacheKey, result);

      return result;
    } catch (error) {
      console.error('[InlineCompletionService] Error generating completion:', error);
      return null;
    }
  }

  /**
   * 构建补全提示词
   */
  private buildPrompt(request: InlineCompletionRequest): string {
    const { prefix, suffix, language, filePath } = request;

    // 提取文件名
    const fileName = filePath.split('/').pop() || 'file';

    return `You are an expert ${language} programmer. Your task is to provide a concise code completion for the current cursor position.

**File:** ${fileName}
**Language:** ${language}

**Code before cursor:**
\`\`\`${language}
${prefix}
\`\`\`

**Code after cursor:**
\`\`\`${language}
${suffix}
\`\`\`

**Instructions:**
1. Provide ONLY the code that should be inserted at the cursor position
2. Do NOT repeat the prefix or suffix
3. Do NOT include explanations or comments unless necessary
4. Keep the completion concise and focused (single line or small block)
5. Ensure the completion is syntactically correct and idiomatic
6. Match the existing code style and indentation

**Completion (code only):**`;
  }

  /**
   * 从 AI 响应中提取补全文本
   */
  private extractCompletionText(response: any): string | null {
    try {
      const candidate = response.candidates?.[0];
      if (!candidate) {
        return null;
      }

      const content = candidate.content;
      if (!content?.parts || content.parts.length === 0) {
        return null;
      }

      // 提取文本部分
      let text = '';
      for (const part of content.parts) {
        if (part.text) {
          text += part.text;
        }
      }

      if (!text.trim()) {
        return null;
      }

      // 清理输出（移除可能的 markdown 代码块标记）
      text = text.trim();
      text = text.replace(/^```[\w]*\n/, ''); // 移除开头的 ```language
      text = text.replace(/\n```$/, ''); // 移除结尾的 ```
      text = text.trim();

      return text;
    } catch (error) {
      console.error('[InlineCompletionService] Error extracting completion text:', error);
      return null;
    }
  }

  /**
   * 生成缓存键
   */
  private getCacheKey(request: InlineCompletionRequest): string {
    const { prefix, suffix, language } = request;
    // 使用最后 200 个字符的 prefix 和前 100 个字符的 suffix
    const prefixKey = prefix.slice(-200);
    const suffixKey = suffix.slice(0, 100);
    return `${language}:${prefixKey}|||${suffixKey}`;
  }

  /**
   * 添加到缓存
   */
  private addToCache(key: string, value: InlineCompletionResponse): void {
    // 如果缓存满了，删除最旧的条目
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cache.clear();
  }
}
