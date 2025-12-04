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
    // 优先级：手动覆盖 > 默认 Flash 模型 > Config 配置
    // 代码补全优先使用快速模型以保证响应速度
    return this.modelOverride || 'gemini-2.5-flash';
  }

  /**
   * 生成行内代码补全
   */
  async generateCompletion(
    request: InlineCompletionRequest,
    signal?: AbortSignal
  ): Promise<InlineCompletionResponse | null> {
    const fileName = request.filePath.split(/[\\/]/).pop() || 'unknown';
    const startTime = Date.now();

    console.log(`[Core:InlineCompletion] 🚀 generateCompletion started`, JSON.stringify({
      file: fileName,
      position: `${request.position.line}:${request.position.character}`,
      language: request.language,
      prefixLen: request.prefix.length,
      suffixLen: request.suffix.length,
    }));

    try {
      // 检查缓存
      const cacheKey = this.getCacheKey(request);
      if (this.cache.has(cacheKey)) {
        console.log(`[Core:InlineCompletion] ✅ Internal cache HIT`, JSON.stringify({
          file: fileName,
          duration: `${Date.now() - startTime}ms`,
        }));
        return this.cache.get(cacheKey)!;
      }

      // 检查是否被取消
      if (signal?.aborted) {
        console.log(`[Core:InlineCompletion] ⏭️ Request already aborted before API call`, { file: fileName });
        return null;
      }

      // 构建提示词
      const prompt = this.buildPrompt(request);
      console.log(`[Core:InlineCompletion] 📝 Prompt built`, JSON.stringify({
        file: fileName,
        promptLen: prompt.length,
      }));

      // 调用 AI 生成补全
      // 🎯 行内补全使用快速模型（优先速度而非复杂推理）
      // 优先使用 Gemini Flash 以获得更快的响应速度
      const currentModel = this.getCurrentModel();
      console.log(`[Core:InlineCompletion] 📡 Calling AI API...`, JSON.stringify({
        file: fileName,
        model: currentModel,
        scene: 'CONTENT_SUMMARY',
      }));

      const apiStartTime = Date.now();
      const response = await this.contentGenerator.generateContent({
        model: currentModel,
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
      }, SceneType.CONTENT_SUMMARY); // 使用快速场景而非 CODE_ASSIST（避免强制使用 Claude）

      const apiDuration = Date.now() - apiStartTime;
      console.log(`[Core:InlineCompletion] 📡 API response received`, JSON.stringify({
        file: fileName,
        apiDuration: `${apiDuration}ms`,
        hasResponse: !!response,
        hasCandidates: !!response?.candidates?.length,
      }));

      if (signal?.aborted) {
        console.log(`[Core:InlineCompletion] ⏭️ Request aborted after API response`, { file: fileName });
        return null;
      }

      // 提取补全文本
      const completionText = this.extractCompletionText(response);

      if (!completionText) {
        console.log(`[Core:InlineCompletion] ⚠️ extractCompletionText returned null/empty`, JSON.stringify({
          file: fileName,
          duration: `${Date.now() - startTime}ms`,
          responseStructure: response ? {
            hasCandidates: !!response.candidates,
            candidateCount: response.candidates?.length || 0,
            firstCandidateHasContent: !!response.candidates?.[0]?.content,
            partsCount: response.candidates?.[0]?.content?.parts?.length || 0,
          } : 'null response',
        }));
        return null;
      }

      const result: InlineCompletionResponse = {
        text: completionText,
      };

      // 缓存结果
      this.addToCache(cacheKey, result);

      console.log(`[Core:InlineCompletion] ✅ Completion generated successfully`, JSON.stringify({
        file: fileName,
        totalDuration: `${Date.now() - startTime}ms`,
        apiDuration: `${apiDuration}ms`,
        resultLen: completionText.length,
        resultPreview: completionText.slice(0, 60).replace(/\n/g, '\\n') + (completionText.length > 60 ? '...' : ''),
        cacheSize: this.cache.size,
      }));

      return result;
    } catch (error) {
      console.error(`[Core:InlineCompletion] ❌ Error generating completion:`, JSON.stringify({
        file: fileName,
        duration: `${Date.now() - startTime}ms`,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : undefined,
      }));
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

    // 🎯 检测特殊场景
    const prefixTrimmed = prefix.trimEnd();
    const lastLine = prefixTrimmed.split('\n').pop() || '';
    const lastLineTrimmed = lastLine.trim();

    // 场景检测
    const isFunctionDefinition = /^(def|function|fn|func|class)\s+\w+.*:\s*$/.test(lastLineTrimmed);
    const isDocstring = /'''|"""|\/\*\*/.test(lastLineTrimmed);
    const isCommentIntent = /^(#|\/\/)\s*\w+/.test(lastLineTrimmed) && lastLineTrimmed.length > 5;

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

**Context Analysis:**
${isFunctionDefinition ? '- Previous line is a function/class definition - provide the function body implementation' : ''}
${isDocstring ? '- Previous line is a docstring - provide the function body implementation' : ''}
${isCommentIntent ? '- Previous line is a comment describing intent - generate the complete code for that intent' : ''}

**Instructions:**
1. Provide ONLY the code that should be inserted at the cursor position
2. Do NOT repeat the prefix or suffix
3. If the cursor is after a function definition or docstring, provide the complete function body
4. If the cursor is after a comment describing intent (e.g., "# 写一个冒泡排序"), generate the complete code
5. Keep the completion concise but complete enough to be useful
6. Ensure the completion is syntactically correct and idiomatic
7. Match the existing code style and indentation
8. For multi-line completions, use proper indentation

**Completion (code only):**`;
  }

  /**
   * 从 AI 响应中提取补全文本
   */
  private extractCompletionText(response: any): string | null {
    try {
      const candidate = response.candidates?.[0];
      if (!candidate) {
        console.log(`[Core:InlineCompletion] ⚠️ extractCompletionText: no candidate in response`);
        return null;
      }

      const content = candidate.content;
      if (!content?.parts || content.parts.length === 0) {
        console.log(`[Core:InlineCompletion] ⚠️ extractCompletionText: no parts in content`, JSON.stringify({
          hasContent: !!content,
          hasParts: !!content?.parts,
          partsLength: content?.parts?.length || 0,
          finishReason: candidate.finishReason,
        }));
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
        console.log(`[Core:InlineCompletion] ⚠️ extractCompletionText: extracted text is empty`, JSON.stringify({
          partsCount: content.parts.length,
          partTypes: content.parts.map((p: any) => Object.keys(p).join(',')),
        }));
        return null;
      }

      // 清理输出（移除可能的 markdown 代码块标记）
      const originalText = text;
      text = text.trim();
      text = text.replace(/^```[\w]*\n/, ''); // 移除开头的 ```language
      text = text.replace(/\n```$/, ''); // 移除结尾的 ```
      text = text.trim();

      if (originalText !== text) {
        console.log(`[Core:InlineCompletion] 🧹 Text cleaned (removed markdown blocks)`, JSON.stringify({
          originalLen: originalText.length,
          cleanedLen: text.length,
        }));
      }

      return text;
    } catch (error) {
      console.error('[Core:InlineCompletion] ❌ Error extracting completion text:', error);
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
