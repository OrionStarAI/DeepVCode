/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentResponse,
  FinishReason,
} from '@google/genai';
import { CustomModelConfig } from '../types/customModel.js';
import { MESSAGE_ROLES } from '../config/messageRoles.js';
import { retryWithBackoff, getErrorStatus } from '../utils/retry.js';

/**
 * 为对象添加 functionCalls getter，兼容不同的结构
 * - GenerateContentResponse 结构: response.candidates[0].content.parts
 * - Content 结构: content.parts
 */
function addFunctionCallsGetter(obj: any) {
  if (!obj) return;

  // 检查是否已经有该属性或 getter
  const descriptor = Object.getOwnPropertyDescriptor(obj, 'functionCalls');
  if (descriptor) return;

  Object.defineProperty(obj, 'functionCalls', {
    get: function() {
      // 优先尝试 GenerateContentResponse 结构
      const partsFromResponse = this.candidates?.[0]?.content?.parts;
      // 如果不是 GenerateContentResponse，尝试 Content 结构
      const parts = partsFromResponse || this.parts;

      if (!parts || !Array.isArray(parts)) return undefined;

      const calls = parts
        .filter((p: any) => p && p.functionCall)
        .map((p: any) => p.functionCall);

      return calls.length > 0 ? calls : undefined;
    },
    enumerable: false,
    configurable: true
  });
}

/**
 * 环境变量替换函数
 */
function resolveEnvVar(value: string): string {
  const envVarRegex = /\$\{([^}]+)\}|\$(\w+)/g;
  return value.replace(envVarRegex, (match, varName1, varName2) => {
    const varName = varName1 || varName2;
    return process.env[varName] || match;
  });
}

/**
 * 安全解析 JSON - 增强版
 * 专门针对流式工具调用场景优化，处理各种不完整或格式异常的 JSON
 *
 * 常见问题场景：
 * 1. 流式传输中 JSON 被截断：{"pattern": "TO  (缺少结尾)
 * 2. 模型返回空字符串或 undefined
 * 3. 模型返回非标准格式（如带有多余空格、换行）
 * 4. 嵌套 JSON 字符串（需要二次解析）
 */
function parseJSONSafe(jsonStr: string): any {
  // 处理空值
  if (!jsonStr || jsonStr === 'null' || jsonStr === 'undefined') {
    return {};
  }

  // 如果已经是对象，直接返回
  if (typeof jsonStr === 'object') {
    return jsonStr;
  }

  // 清理字符串
  let cleanStr = jsonStr.trim();

  // 处理空对象字符串
  if (cleanStr === '{}' || cleanStr === '') {
    return {};
  }

  // 第一次尝试：直接解析
  try {
    return JSON.parse(cleanStr);
  } catch (firstError) {
    // 继续尝试修复
  }

  // 修复策略 1：处理不完整的 JSON 对象
  if (cleanStr.startsWith('{') && !cleanStr.endsWith('}')) {
    const repaired = repairIncompleteJSON(cleanStr);
    if (repaired) {
      try {
        return JSON.parse(repaired);
      } catch {
        // 继续尝试其他方法
      }
    }
  }

  // 修复策略 2：处理不完整的 JSON 数组
  if (cleanStr.startsWith('[') && !cleanStr.endsWith(']')) {
    // 尝试找到最后一个完整的元素
    const lastCompleteComma = cleanStr.lastIndexOf(',');
    if (lastCompleteComma > 0) {
      const repaired = cleanStr.substring(0, lastCompleteComma) + ']';
      try {
        return JSON.parse(repaired);
      } catch {
        // 继续尝试
      }
    }
    // 尝试直接补全
    try {
      return JSON.parse(cleanStr + ']');
    } catch {
      // 继续尝试
    }
  }

  // 修复策略 3：移除尾部可能的垃圾字符
  // 有时模型会在 JSON 后附加额外内容
  const jsonEndMatch = cleanStr.match(/^(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonEndMatch) {
    try {
      return JSON.parse(jsonEndMatch[1]);
    } catch {
      // 继续尝试
    }
  }

  // 修复策略 4：处理转义问题
  // 有时 JSON 字符串中的引号没有正确转义
  try {
    // 尝试修复常见的转义问题
    const fixedEscape = cleanStr
      .replace(/([^\\])\\([^"\\/bfnrtu])/g, '$1\\\\$2')  // 修复无效转义
      .replace(/\t/g, '\\t')  // 替换实际的 tab
      .replace(/\n/g, '\\n')  // 替换实际的换行
      .replace(/\r/g, '\\r'); // 替换实际的回车
    return JSON.parse(fixedEscape);
  } catch {
    // 继续尝试
  }

  // 所有修复尝试都失败，记录错误并返回带标记的对象
  console.error(`[CustomModel] Failed to parse tool arguments after all repair attempts`);
  console.error(`[CustomModel] Original string (first 500 chars): ${jsonStr.substring(0, 500)}`);

  // 返回一个标记了解析错误的对象
  // 使用 __parseError 前缀避免与正常工具参数冲突
  return {
    __parseError: true,
    __rawArgs: jsonStr,
    __errorMessage: `Failed to parse tool arguments as JSON. Raw value: ${jsonStr.substring(0, 200)}${jsonStr.length > 200 ? '...' : ''}`
  };
}

/**
 * 尝试修复不完整的 JSON 对象
 * 使用括号匹配和引号状态追踪来找到可以安全截断的位置
 */
function repairIncompleteJSON(jsonStr: string): string | null {
  let braceCount = 0;
  let bracketCount = 0;
  let inString = false;
  let escapeNext = false;
  let lastSafePosition = -1;
  let lastKeyValueEnd = -1;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    switch (char) {
      case '{':
        braceCount++;
        break;
      case '}':
        braceCount--;
        if (braceCount === 0) {
          lastSafePosition = i;
        }
        break;
      case '[':
        bracketCount++;
        break;
      case ']':
        bracketCount--;
        break;
      case ',':
        // 逗号后面可能是安全的截断点（如果不在嵌套结构中）
        if (braceCount === 1 && bracketCount === 0) {
          lastKeyValueEnd = i;
        }
        break;
    }
  }

  // 如果找到了完整的 JSON，直接返回
  if (lastSafePosition > 0 && braceCount === 0) {
    return jsonStr.substring(0, lastSafePosition + 1);
  }

  // 尝试在最后一个逗号处截断并补全
  if (lastKeyValueEnd > 0) {
    const truncated = jsonStr.substring(0, lastKeyValueEnd);
    // 补全缺失的括号
    let result = truncated;
    for (let i = 0; i < braceCount; i++) {
      result += '}';
    }
    for (let i = 0; i < bracketCount; i++) {
      result += ']';
    }
    return result;
  }

  // 尝试找到最后一个完整的键值对（以 " 结尾的值）
  // 例如: {"pattern": "TODO", "path": "/src  -> 截断到 "TODO"
  const patterns = [
    /^(.*"[^"]*"\s*:\s*"[^"]*")\s*,?\s*"[^"]*"\s*:\s*"?[^"}]*$/,  // 截断到上一个完整的字符串值
    /^(.*"[^"]*"\s*:\s*\d+)\s*,?\s*"[^"]*"\s*:\s*"?[^"}]*$/,       // 截断到上一个完整的数字值
    /^(.*"[^"]*"\s*:\s*(?:true|false|null))\s*,?\s*"[^"]*"\s*:\s*"?[^"}]*$/,  // 截断到布尔/null值
  ];

  for (const pattern of patterns) {
    const match = jsonStr.match(pattern);
    if (match && match[1]) {
      return match[1] + '}';
    }
  }

  // 最后的尝试：直接补全括号
  if (braceCount > 0) {
    let result = jsonStr;
    // 如果在字符串中间被截断，先补全引号
    if (inString) {
      result += '"';
    }
    // 补全括号
    for (let i = 0; i < braceCount; i++) {
      result += '}';
    }
    return result;
  }

  return null;
}

/**
 * 创建带状态码的错误对象，便于重试逻辑判断
 */
function createHttpError(status: number, message: string, response?: Response): Error & { status: number; response?: { headers: Record<string, string> } } {
  const error = new Error(message) as Error & { status: number; response?: { headers: Record<string, string> } };
  error.status = status;

  // 尝试解析 Retry-After 头，传递给重试逻辑
  if (response) {
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
      error.response = {
        headers: { 'retry-after': retryAfter }
      };
    }
  }

  return error;
}

/**
 * 判断是否应该重试自定义模型请求
 * 重试条件：429 限流 或 5xx 服务器错误
 */
function shouldRetryCustomModel(error: Error): boolean {
  const status = getErrorStatus(error);

  // ✅ 429 限流 - 重试
  if (status === 429) {
    console.warn(`[CustomModel] Rate limited (429), will retry with backoff...`);
    return true;
  }

  // ✅ 5xx 服务器错误 - 重试
  if (status && status >= 500 && status < 600) {
    console.warn(`[CustomModel] Server error (${status}), will retry...`);
    return true;
  }

  // ✅ 检查错误消息中的 429
  if (error.message.includes('429')) {
    console.warn(`[CustomModel] Rate limit detected in message, will retry...`);
    return true;
  }

  // ❌ 其他错误（如 4xx 客户端错误）不重试
  return false;
}



/**
 * OpenAI 格式转换工具
 */
const OpenAIConverter = {
  /**
   * 将单个 part 转换为 OpenAI content 格式
   * 支持 text 和 inlineData (图片)
   */
  partToOpenAIContent(part: any): any | null {
    if (part.text) {
      return { type: 'text', text: part.text };
    }
    if (part.inlineData) {
      // 转换 Gemini inlineData 格式为 OpenAI image_url 格式
      const { mimeType, data } = part.inlineData;
      return {
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${data}`,
        },
      };
    }
    return null;
  },

  contentsToMessages(contents: any[]): any[] {
    return contents.map((content: any) => {
      const parts = content.parts || [];

      if (parts.some((p: any) => p.functionCall)) {
        return {
          role: content.role === MESSAGE_ROLES.MODEL ? 'assistant' : 'user',
          content: null,
          tool_calls: parts
            .filter((p: any) => p.functionCall)
            .map((p: any, idx: number) => ({
              id: p.functionCall.id || `call_${Date.now()}_${idx}`,
              type: 'function',
              function: {
                name: p.functionCall.name,
                arguments: typeof p.functionCall.args === 'string'
                  ? p.functionCall.args
                  : JSON.stringify(p.functionCall.args || {}),
              },
            })),
        };
      }

      if (parts.some((p: any) => p.functionResponse)) {
        const functionResponseParts = parts.filter((p: any) => p.functionResponse);
        return functionResponseParts.map((p: any) => ({
          role: 'tool',
          tool_call_id: p.functionResponse.id || `call_${p.functionResponse.name}`,
          content: typeof p.functionResponse.response === 'string'
            ? p.functionResponse.response
            : JSON.stringify(p.functionResponse.response || {}),
        }));
      }

      // 检查是否包含图片内容
      const hasImageContent = parts.some((p: any) => p.inlineData);

      if (hasImageContent) {
        // 使用数组格式以支持混合内容（文本 + 图片）
        const contentParts = parts
          .map((part: any) => OpenAIConverter.partToOpenAIContent(part))
          .filter(Boolean);

        return {
          role: content.role === MESSAGE_ROLES.MODEL ? 'assistant' : 'user',
          content: contentParts,
        };
      }

      // 纯文本内容，使用简单字符串格式
      return {
        role: content.role === MESSAGE_ROLES.MODEL ? 'assistant' : 'user',
        content: parts.map((part: any) => part.text || '').join('\n'),
      };
    }).flat();
  },

  toolsToOpenAITools(tools: any[]): any[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools.flatMap((tool: any) => {
      if (tool.functionDeclarations && Array.isArray(tool.functionDeclarations)) {
        return tool.functionDeclarations.map((fd: any) => ({
          type: 'function',
          function: {
            name: fd.name,
            description: fd.description,
            parameters: fd.parameters,
          },
        }));
      }
      return [{
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }];
    });
  },

  mapFinishReason(reason: string): FinishReason {
    switch (reason) {
      case 'stop': return FinishReason.STOP;
      case 'length': return FinishReason.MAX_TOKENS;
      case 'content_filter': return FinishReason.SAFETY;
      case 'tool_calls': return FinishReason.STOP;
      default: return FinishReason.OTHER;
    }
  }
};

/**
 * Anthropic 格式转换工具
 * 完整支持 Anthropic Messages API 格式，包括：
 * - system 数组格式（带 cache_control）
 * - extended thinking 配置
 * - 完整的 input_schema（含 additionalProperties）
 * @see https://docs.anthropic.com/en/api/messages
 */
const AnthropicConverter = {
  /**
   * 将 Gemini 格式内容转换为 Anthropic 格式
   * 自动添加 cache_control 以利用 Anthropic prompt caching：
   * - 所有 system 消息块添加 cache_control: { type: 'ephemeral' }
   * - 用户消息的最后一个文本块添加 cache_control: { type: 'ephemeral' }
   * @see https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
   */
  contentsToAnthropic(contents: any[]): { messages: any[], system?: any[] } {
    const messages: any[] = [];
    const systemBlocks: any[] = [];

    for (const content of contents) {
      const parts = content.parts || [];

      if (content.role === 'system') {
        // 转换为 Anthropic system 数组格式
        for (const p of parts) {
          if (p.text) {
            const block: any = { type: 'text', text: p.text };
            // 🆕 自动添加 cache_control（与 Claude Code 行为一致）
            block.cache_control = p.cache_control || { type: 'ephemeral' };
            systemBlocks.push(block);
          }
        }
        continue;
      }

      const role = content.role === MESSAGE_ROLES.MODEL ? 'assistant' : 'user';
      const anthropicParts: any[] = [];

      for (const part of parts) {
        if (part.text) {
          const textBlock: any = { type: 'text', text: part.text };
          // 透传已有的 cache_control（后续会为最后一个文本块自动添加）
          if (part.cache_control) {
            textBlock.cache_control = part.cache_control;
          }
          anthropicParts.push(textBlock);
        }
        if (part.inlineData) {
          // 转换 Gemini inlineData 格式为 Anthropic image 格式
          anthropicParts.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: part.inlineData.mimeType,
              data: part.inlineData.data,
            },
          });
        }
        if (part.functionCall) {
          anthropicParts.push({
            type: 'tool_use',
            id: part.functionCall.id || `toolu_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            name: part.functionCall.name,
            input: part.functionCall.args || {},
          });
        }
        if (part.functionResponse) {
          anthropicParts.push({
            type: 'tool_result',
            tool_use_id: part.functionResponse.id || `toolu_${part.functionResponse.name}`,
            content: typeof part.functionResponse.response === 'string'
              ? part.functionResponse.response
              : JSON.stringify(part.functionResponse.response || {}),
          });
        }
      }

      if (anthropicParts.length > 0) {
        messages.push({ role, content: anthropicParts });
      }
    }

    if (messages.length > 0 && messages[0].role === 'assistant') {
      messages.unshift({ role: 'user', content: '...' });
    }

    const merged: any[] = [];
    for (const msg of messages) {
      const prev = merged[merged.length - 1];
      if (prev && prev.role === msg.role) {
        const prevContent = Array.isArray(prev.content) ? prev.content : [{type:'text', text: prev.content}];
        const msgContent = Array.isArray(msg.content) ? msg.content : [{type:'text', text: msg.content}];
        prev.content = [...prevContent, ...msgContent];
      } else {
        merged.push(msg);
      }
    }

    // 🆕 为最后一条用户消息的最后一个文本块添加 cache_control
    // 与 Claude Code 行为一致，利用 prompt caching 减少 token 消耗
    for (let i = merged.length - 1; i >= 0; i--) {
      if (merged[i].role === 'user' && Array.isArray(merged[i].content)) {
        const content = merged[i].content;
        // 找到最后一个文本块
        for (let j = content.length - 1; j >= 0; j--) {
          if (content[j].type === 'text' && !content[j].cache_control) {
            content[j].cache_control = { type: 'ephemeral' };
            break;
          }
        }
        break; // 只处理最后一条用户消息
      }
    }

    return {
      messages: merged,
      system: systemBlocks.length > 0 ? systemBlocks : undefined
    };
  },

  /**
   * 将工具定义转换为 Anthropic 格式
   * 完整支持 input_schema（含 additionalProperties: false）
   */
  toolsToAnthropicTools(tools: any[]): any[] | undefined {
    if (!tools || tools.length === 0) return undefined;

    const cleanSchema = (schema: any, isRoot: boolean = false): any => {
      if (!schema || typeof schema !== 'object') return schema;
      const cleaned: any = {};
      const validFields = ['type', 'properties', 'required', 'items', 'enum', 'description', 'default', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'pattern', 'format', 'minItems', 'maxItems', 'uniqueItems', 'additionalProperties', 'anyOf', 'oneOf', 'allOf', 'not'];
      for (const key of validFields) {
        if (schema[key] !== undefined) {
          if (key === 'type' && typeof schema[key] === 'string') cleaned[key] = schema[key].toLowerCase();
          else if (['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'minItems', 'maxItems'].includes(key)) {
            const val = parseFloat(schema[key]);
            if (!isNaN(val)) cleaned[key] = val;
          }
          else if (key === 'properties' && typeof schema[key] === 'object') {
            cleaned[key] = {};
            for (const k in schema[key]) cleaned[key][k] = cleanSchema(schema[key][k], false);
          } else if (key === 'items') cleaned[key] = cleanSchema(schema[key], false);
          else cleaned[key] = schema[key];
        }
      }
      return cleaned;
    };

    return tools.flatMap((tool: any) => {
      const decls = tool.functionDeclarations || [tool];
      return decls.map((fd: any) => {
        const cleaned = cleanSchema(fd.parameters || {}, true);
        return {
          name: fd.name,
          description: fd.description || '',
          input_schema: {
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'object',
            properties: cleaned.properties || {},
            ...(cleaned.required && { required: cleaned.required }),
            // 🔧 关键：添加 additionalProperties: false 以匹配 Claude Code 的行为
            additionalProperties: false,
          },
        };
      });
    });
  },

  mapFinishReason(reason: string): FinishReason {
    switch (reason) {
      case 'end_turn': return FinishReason.STOP;
      case 'max_tokens': return FinishReason.MAX_TOKENS;
      case 'tool_use': return FinishReason.STOP;
      default: return FinishReason.OTHER;
    }
  }
};

/**
 * OpenAI 兼容模型单次调用
 * 使用指数退避重试策略处理 429 和 5xx 错误
 */
export async function callOpenAICompatibleModel(
  modelConfig: CustomModelConfig,
  request: any,
  abortSignal?: AbortSignal
): Promise<GenerateContentResponse> {
  const baseUrl = resolveEnvVar(modelConfig.baseUrl).replace(/\/+$/, '');
  const apiKey = resolveEnvVar(modelConfig.apiKey);
  const url = `${baseUrl}/chat/completions`;

  const requestBody: any = {
    model: modelConfig.modelId,
    messages: OpenAIConverter.contentsToMessages(request.contents),
    tools: OpenAIConverter.toolsToOpenAITools(request.config?.tools),
    stream: false,
  };

  // 使用指数退避重试包装 API 调用
  return retryWithBackoff(
    async () => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          ...modelConfig.headers,
        },
        body: JSON.stringify(requestBody),
        signal: abortSignal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw createHttpError(response.status, `OpenAI API error (${response.status}): ${errorText}`, response);
      }

      const data = await response.json();
      const choice = data.choices[0];
      const message = choice.message;

      const parts: any[] = [];
      if (message.content) parts.push({ text: message.content });
      if (message.tool_calls) {
        for (const tc of message.tool_calls) {
          if (tc.type === 'function') {
            parts.push({
              functionCall: {
                name: tc.function.name,
                args: parseJSONSafe(tc.function.arguments),
                id: tc.id,
              },
            });
          }
        }
      }

      // 🔧 OpenAI prompt caching：缓存信息在 usage.prompt_tokens_details.cached_tokens
      // 参考：https://platform.openai.com/docs/guides/prompt-caching
      const cachedTokens = data.usage?.prompt_tokens_details?.cached_tokens || 0;
      const promptTokens = data.usage?.prompt_tokens || 0;

      const result = {
        candidates: [{
          content: { role: MESSAGE_ROLES.MODEL, parts: parts.length ? parts : [{ text: '' }] },
          finishReason: OpenAIConverter.mapFinishReason(choice.finish_reason),
          index: 0,
        }],
        usageMetadata: {
          promptTokenCount: promptTokens,
          candidatesTokenCount: data.usage?.completion_tokens || 0,
          totalTokenCount: data.usage?.total_tokens || 0,
          // 🔧 OpenAI prompt caching support
          // OpenAI 使用 prompt_tokens_details.cached_tokens 表示缓存命中的 token
          // 映射到我们的字段名以保持与 geminiChat.ts 兼容
          ...(cachedTokens > 0 && { cacheReadInputTokens: cachedTokens }),
          // OpenAI 不区分 cache creation，只有 cache read
          // uncachedInputTokens = promptTokens - cachedTokens
          uncachedInputTokens: promptTokens - cachedTokens,
        } as any,
      };
      addFunctionCallsGetter(result);
      return result as GenerateContentResponse;
    },
    {
      shouldRetry: shouldRetryCustomModel,
    }
  );
}

/**
 * 检查是否应该启用 Extended Thinking
 * 对于 Anthropic 协议，默认启用 thinking（让服务端决定是否支持）
 * 不支持的模型会忽略此参数，因此统一启用更简单通用
 * @see https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking
 */
function shouldEnableThinkingByDefault(): boolean {
  // 对于所有 Anthropic 协议的模型，默认启用 thinking
  // 如果模型不支持，服务端会自动忽略此参数
  return true;
}

/**
 * Anthropic 模型单次调用
 * 使用指数退避重试策略处理 429 和 5xx 错误
 * 支持 extended thinking 配置
 */
export async function callAnthropicModel(
  modelConfig: CustomModelConfig,
  request: any,
  abortSignal?: AbortSignal
): Promise<GenerateContentResponse> {
  const baseUrl = resolveEnvVar(modelConfig.baseUrl).replace(/\/+$/, '');
  const apiKey = resolveEnvVar(modelConfig.apiKey);
  const { messages, system } = AnthropicConverter.contentsToAnthropic(request.contents);

  const requestBody: any = {
    model: modelConfig.modelId,
    messages,
    tools: AnthropicConverter.toolsToAnthropicTools(request.config?.tools),
    max_tokens: modelConfig.maxTokens || 4096,
  };

  // 添加 system（数组格式，带 cache_control 支持）
  if (system && system.length > 0) {
    requestBody.system = system;
  }

  // 🆕 Extended Thinking 智能启用策略：
  // 1. 如果用户明确设置了 enableThinking，遵循用户配置
  // 2. 如果用户未设置（undefined），默认启用（所有 Anthropic 协议）
  // 3. 不支持的模型会自动忽略 thinking 参数，因此统一启用更简单
  const shouldEnableThinking = modelConfig.enableThinking !== undefined
    ? modelConfig.enableThinking
    : shouldEnableThinkingByDefault();

  if (shouldEnableThinking) {
    const maxTokens = modelConfig.maxTokens || 32000; // 思考模式建议使用较大的 max_tokens
    requestBody.thinking = {
      type: 'enabled',
      budget_tokens: Math.min(maxTokens - 1, 31999), // budget_tokens 必须小于 max_tokens，默认使用官方推荐的 31999
    };
    // 确保 max_tokens 足够大以容纳 thinking + 回复
    requestBody.max_tokens = Math.max(maxTokens, 32000);
  }

  // 使用指数退避重试包装 API 调用
  return retryWithBackoff(
    async () => {
      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          ...modelConfig.headers,
        },
        body: JSON.stringify(requestBody),
        signal: abortSignal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw createHttpError(response.status, `Anthropic error (${response.status}): ${errorText}`, response);
      }

      const data = await response.json();
      const parts = data.content.map((c: any) => {
        if (c.type === 'text') return { text: c.text };
        if (c.type === 'tool_use') return { functionCall: { name: c.name, args: c.input, id: c.id } };
        // 🆕 支持 thinking 内容块 - 映射为 reasoning 格式以便 UI 显示
        // Anthropic 的 thinking 块包含模型的内部推理过程，类似于 Gemini 的 reasoning 字段
        if (c.type === 'thinking') return { reasoning: c.thinking };
        return null;
      }).filter(Boolean);

      // 🔧 计算真正的总输入 token：
      // Anthropic 的 input_tokens 只是非缓存的直接输入，实际总输入需要加上缓存 token
      const uncachedInputTokens = data.usage?.input_tokens || 0;
      const cacheCreationTokens = data.usage?.cache_creation_input_tokens || 0;
      const cacheReadTokens = data.usage?.cache_read_input_tokens || 0;
      const actualPromptTokens = uncachedInputTokens + cacheCreationTokens + cacheReadTokens;
      const outputTokens = data.usage?.output_tokens || 0;

      const result = {
        candidates: [{
          content: { role: MESSAGE_ROLES.MODEL, parts: parts.length ? parts : [{ text: '' }] },
          finishReason: AnthropicConverter.mapFinishReason(data.stop_reason),
          index: 0,
        }],
        usageMetadata: {
          // promptTokenCount 应该反映实际处理的总输入 token（包括缓存）
          promptTokenCount: actualPromptTokens,
          candidatesTokenCount: outputTokens,
          totalTokenCount: actualPromptTokens + outputTokens,
          // 🔧 Claude prompt caching 详细信息
          // 字段名与 geminiChat.ts 中读取的一致（不带 Count 后缀）
          // - cacheCreationInputTokens: 本次写入缓存的 token（1.25x 价格）
          // - cacheReadInputTokens: 从缓存读取的 token（0.1x 价格，便宜 90%）
          // - uncachedInputTokens: 非缓存的直接输入 token
          ...(cacheCreationTokens && { cacheCreationInputTokens: cacheCreationTokens }),
          ...(cacheReadTokens != null && { cacheReadInputTokens: cacheReadTokens }),
          uncachedInputTokens: uncachedInputTokens,
        } as any,
      };
      addFunctionCallsGetter(result);
      return result as GenerateContentResponse;
    },
    {
      shouldRetry: shouldRetryCustomModel,
    }
  );
}

/**
 * OpenAI 兼容模型流式调用
 * 使用指数退避重试策略处理初始连接的 429 和 5xx 错误
 */
export async function* callOpenAICompatibleModelStream(
  modelConfig: CustomModelConfig,
  request: any,
  abortSignal?: AbortSignal
): AsyncGenerator<GenerateContentResponse> {
  const baseUrl = resolveEnvVar(modelConfig.baseUrl).replace(/\/+$/, '');
  const apiKey = resolveEnvVar(modelConfig.apiKey);

  const requestBody: any = {
    model: modelConfig.modelId,
    messages: OpenAIConverter.contentsToMessages(request.contents),
    tools: OpenAIConverter.toolsToOpenAITools(request.config?.tools),
    stream: true,
    stream_options: { include_usage: true } // 请求包含 usage 信息
  };

  // 使用指数退避重试包装初始连接
  const response = await retryWithBackoff(
    async () => {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          ...modelConfig.headers,
        },
        body: JSON.stringify(requestBody),
        signal: abortSignal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw createHttpError(res.status, `OpenAI Stream error (${res.status}): ${errorText}`, res);
      }

      return res;
    },
    {
      shouldRetry: shouldRetryCustomModel,
    }
  );

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  // 用于聚合流式工具调用
  const aggregatedTools: Map<number, { id: string, name: string, args: string }> = new Map();

  const flushTools = function* (): Generator<GenerateContentResponse> {
    if (aggregatedTools.size === 0) return;
    const toolParts = Array.from(aggregatedTools.values()).map(at => ({
      functionCall: {
        name: at.name || 'unknown_tool',
        args: parseJSONSafe(at.args),
        id: at.id || `call_${Date.now()}`
      }
    }));
    const content = { role: MESSAGE_ROLES.MODEL, parts: toolParts };
    const resp = {
      candidates: [{
        content,
        finishReason: FinishReason.STOP,
        index: 0
      }]
    };
    addFunctionCallsGetter(resp);
    addFunctionCallsGetter(content);
    yield resp as GenerateContentResponse;
    aggregatedTools.clear();
  };

  try {
    let isDone = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        isDone = true;
      }

      if (!done) {
        buffer += decoder.decode(value, { stream: true });
      } else {
        // 流结束，使用最终解码
        buffer += decoder.decode(undefined, { stream: false });
      }

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const dataStr = trimmed.slice(6);
        if (dataStr === '[DONE]') {
          // OpenAI 明确表示流结束，此时应该 flush 所有待完成的工具调用
          yield* flushTools();
          isDone = true;
          break;
        }

        try {
          const chunk = JSON.parse(dataStr);
          const choice = chunk.choices?.[0];

          if (choice) {
            const delta = choice.delta;

            // 处理文本内容 - 立即 yield
            if (delta?.content) {
              const content = { role: MESSAGE_ROLES.MODEL, parts: [{ text: delta.content }] };
              const resp = { candidates: [{ content, index: 0 }] };
              addFunctionCallsGetter(resp);
              addFunctionCallsGetter(content);
              yield resp as GenerateContentResponse;
            }

            // 聚合工具调用 - 不立即 yield，等待完全接收
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                let tool = aggregatedTools.get(idx);
                if (!tool) {
                  tool = { id: '', name: '', args: '' };
                  aggregatedTools.set(idx, tool);
                }
                if (tc.id) tool.id = tc.id;
                if (tc.function?.name) tool.name = tc.function.name;
                if (tc.function?.arguments) tool.args += tc.function.arguments;
              }
            }

            // 只在流结束时 flush，不在 finish_reason 中间 flush
            // 这与 Claude 的行为一致，防止不完整的工具调用被识别
          }

          if (chunk.usage) {
            // 🔧 OpenAI prompt caching：缓存信息在 usage.prompt_tokens_details.cached_tokens
            const cachedTokens = chunk.usage.prompt_tokens_details?.cached_tokens || 0;
            const promptTokens = chunk.usage.prompt_tokens || 0;

            yield {
              candidates: [],
              usageMetadata: {
                promptTokenCount: promptTokens,
                candidatesTokenCount: chunk.usage.completion_tokens || 0,
                totalTokenCount: chunk.usage.total_tokens || 0,
                // 🔧 OpenAI prompt caching support
                // OpenAI 使用 prompt_tokens_details.cached_tokens 表示缓存命中的 token
                // 映射到我们的字段名以保持与 geminiChat.ts 兼容
                ...(cachedTokens > 0 && { cacheReadInputTokens: cachedTokens }),
                // OpenAI 不区分 cache creation，只有 cache read
                uncachedInputTokens: promptTokens - cachedTokens,
              }
            } as any;
          }
        } catch (e) {}
      }

      if (isDone) {
        // 在流完全结束时，flush 所有待完成的工具调用
        yield* flushTools();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Anthropic 模型流式调用
 * 使用指数退避重试策略处理初始连接的 429 和 5xx 错误
 * 支持 extended thinking 配置
 */
export async function* callAnthropicModelStream(
  modelConfig: CustomModelConfig,
  request: any,
  abortSignal?: AbortSignal
): AsyncGenerator<GenerateContentResponse> {
  const baseUrl = resolveEnvVar(modelConfig.baseUrl).replace(/\/+$/, '');
  const apiKey = resolveEnvVar(modelConfig.apiKey);
  const { messages, system } = AnthropicConverter.contentsToAnthropic(request.contents);

  const requestBody: any = {
    model: modelConfig.modelId,
    messages,
    tools: AnthropicConverter.toolsToAnthropicTools(request.config?.tools),
    max_tokens: modelConfig.maxTokens || 4096,
    stream: true,
  };

  // 添加 system（数组格式，带 cache_control 支持）
  if (system && system.length > 0) {
    requestBody.system = system;
  }

  // 🆕 Extended Thinking 智能启用策略（流式调用）：
  // 1. 如果用户明确设置了 enableThinking，遵循用户配置
  // 2. 如果用户未设置（undefined），默认启用（所有 Anthropic 协议）
  // 3. 不支持的模型会自动忽略 thinking 参数，因此统一启用更简单
  const shouldEnableThinking = modelConfig.enableThinking !== undefined
    ? modelConfig.enableThinking
    : shouldEnableThinkingByDefault();

  if (shouldEnableThinking) {
    const maxTokens = modelConfig.maxTokens || 32000; // 思考模式建议使用较大的 max_tokens
    requestBody.thinking = {
      type: 'enabled',
      budget_tokens: Math.min(maxTokens - 1, 31999), // budget_tokens 必须小于 max_tokens，默认使用官方推荐的 31999
    };
    // 确保 max_tokens 足够大以容纳 thinking + 回复
    requestBody.max_tokens = Math.max(maxTokens, 32000);
  }

  // 使用指数退避重试包装初始连接
  const response = await retryWithBackoff(
    async () => {
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          ...modelConfig.headers,
        },
        body: JSON.stringify(requestBody),
        signal: abortSignal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw createHttpError(res.status, `Anthropic Stream error (${res.status}): ${errorText}`, res);
      }

      return res;
    },
    {
      shouldRetry: shouldRetryCustomModel,
    }
  );

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  const aggregatedTools: Map<number, { id: string, name: string, args: string }> = new Map();
  // 🆕 用于聚合 thinking 内容块（流式累积后一次性发送）
  const aggregatedThinking: Map<number, string> = new Map();

  // 用于累积 token 使用统计
  // 🔧 修复：缓存 token 来自 message_start（初始值），output_tokens 来自 message_delta（累加）
  let inputTokens = 0;
  let totalOutputTokens = 0;
  // 缓存相关 token（从 message_start 获取，不累加）
  let cacheCreationInputTokens = 0;
  let cacheReadInputTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const dataStr = trimmed.slice(6);

        try {
          const chunk = JSON.parse(dataStr);
          const idx = chunk.index ?? 0;

          if (chunk.type === 'content_block_start') {
            if (chunk.content_block?.type === 'tool_use') {
              aggregatedTools.set(idx, {
                id: chunk.content_block.id,
                name: chunk.content_block.name,
                args: ''
              });
            } else if (chunk.content_block?.type === 'thinking') {
              // 🆕 开始聚合 thinking 内容块
              aggregatedThinking.set(idx, chunk.content_block.thinking || '');
            }
          } else if (chunk.type === 'content_block_delta') {
            if (chunk.delta?.type === 'text_delta') {
              const content = { role: MESSAGE_ROLES.MODEL, parts: [{ text: chunk.delta.text }] };
              const resp = { candidates: [{ content, index: 0 }] };
              addFunctionCallsGetter(resp);
              addFunctionCallsGetter(content);
              yield resp as any;
            } else if (chunk.delta?.type === 'input_json_delta') {
              const tool = aggregatedTools.get(idx);
              if (tool) tool.args += chunk.delta.partial_json;
            } else if (chunk.delta?.type === 'thinking_delta') {
              // 🆕 实时流式输出 thinking 内容，让 UI 能显示模型思考过程
              const thinkingChunk = chunk.delta.thinking || '';
              if (thinkingChunk) {
                const content = { role: MESSAGE_ROLES.MODEL, parts: [{ reasoning: thinkingChunk }] } as any;
                const resp = { candidates: [{ content, index: 0 }] } as any;
                addFunctionCallsGetter(resp);
                addFunctionCallsGetter(content);
                yield resp;
              }
              // 同时累积完整内容，以便在 content_block_stop 时可用（如果需要）
              const existing = aggregatedThinking.get(idx) || '';
              aggregatedThinking.set(idx, existing + thinkingChunk);
            }
          } else if (chunk.type === 'content_block_stop') {
            const tool = aggregatedTools.get(idx);
            if (tool) {
              const content = { role: MESSAGE_ROLES.MODEL, parts: [{ functionCall: { name: tool.name, args: parseJSONSafe(tool.args), id: tool.id } }] };
              const resp = {
                candidates: [{
                  content,
                  index: 0
                }]
              };
              addFunctionCallsGetter(resp);
              addFunctionCallsGetter(content);
              yield resp as GenerateContentResponse;
              aggregatedTools.delete(idx);
            }
            // 🆕 thinking 内容已在 thinking_delta 中实时流式输出，这里只需清理状态
            // 不再重复 yield 完整内容，避免 UI 显示重复
            if (aggregatedThinking.has(idx)) {
              aggregatedThinking.delete(idx);
            }
          } else if (chunk.type === 'message_delta') {
            // 🔧 message_delta 中的 output_tokens 是最终总数，不是增量，所以用替换而非累加
            // 参考日志：message_start 有 output_tokens:5，message_delta 有 output_tokens:298（最终值）
            if (chunk.usage?.output_tokens != null) {
              totalOutputTokens = chunk.usage.output_tokens;
            }

            // 🔧 鲁棒性增强：一些上游厂商（如 GLM-4 的 Anthropic 兼容接口）在 message_start 中
            // 返回 input_tokens: 0，但在最后的 message_delta 中才返回真实的 token 用量。
            // 这里采用"有非零值就更新"的策略，确保能从任何位置获取正确的 token 数据。
            if (chunk.usage?.input_tokens != null && chunk.usage.input_tokens > 0) {
              inputTokens = chunk.usage.input_tokens;
            }
            if (chunk.usage?.cache_creation_input_tokens != null && chunk.usage.cache_creation_input_tokens > 0) {
              cacheCreationInputTokens = chunk.usage.cache_creation_input_tokens;
            }
            if (chunk.usage?.cache_read_input_tokens != null && chunk.usage.cache_read_input_tokens > 0) {
              cacheReadInputTokens = chunk.usage.cache_read_input_tokens;
            }

            // 🔧 计算真正的总输入 token：
            // Anthropic 的 input_tokens 只是非缓存的直接输入，实际总输入需要加上缓存 token
            // 实际总输入 = input_tokens + cache_creation_input_tokens + cache_read_input_tokens
            const actualPromptTokens = inputTokens + cacheCreationInputTokens + cacheReadInputTokens;

            const content = { role: MESSAGE_ROLES.MODEL, parts: [] };
            const resp = {
              candidates: [{
                content,
                finishReason: AnthropicConverter.mapFinishReason(chunk.delta?.stop_reason),
                index: 0
              }],
              usageMetadata: {
                // promptTokenCount 应该反映实际处理的总输入 token（包括缓存）
                promptTokenCount: actualPromptTokens,
                candidatesTokenCount: totalOutputTokens,
                totalTokenCount: actualPromptTokens + totalOutputTokens,
                // 🔧 Claude prompt caching 详细信息
                // 字段名与 geminiChat.ts 中读取的一致（不带 Count 后缀）
                // - cacheCreationInputTokens: 本次写入缓存的 token（1.25x 价格）
                // - cacheReadInputTokens: 从缓存读取的 token（0.1x 价格，便宜 90%）
                // - uncachedInputTokens: 非缓存的直接输入 token（原始 input_tokens）
                ...(cacheCreationInputTokens != null && { cacheCreationInputTokens }),
                ...(cacheReadInputTokens != null && { cacheReadInputTokens }),
                // 保留原始的非缓存输入 token 以便精确计费
                uncachedInputTokens: inputTokens,
              }
            } as any;
            addFunctionCallsGetter(resp);
            addFunctionCallsGetter(content);
            yield resp;
          } else if (chunk.type === 'message_start' && chunk.message?.usage) {
            // 🔧 message_start 包含完整的初始 usage，包括缓存 token
            const usage = chunk.message.usage;
            inputTokens = usage.input_tokens || 0;
            totalOutputTokens = usage.output_tokens || 0;
            // 缓存 token 只在 message_start 中出现，记录后不再累加
            cacheCreationInputTokens = usage.cache_creation_input_tokens || 0;
            cacheReadInputTokens = usage.cache_read_input_tokens || 0;
          }
        } catch (e) {}
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 统一入口
 */
export async function* callCustomModelStream(
  modelConfig: CustomModelConfig,
  request: any,
  abortSignal?: AbortSignal
): AsyncGenerator<GenerateContentResponse> {
  console.log(`[CustomModel] Stream call: ${modelConfig.displayName} (${modelConfig.provider})`);
  if (modelConfig.provider === 'openai') yield* callOpenAICompatibleModelStream(modelConfig, request, abortSignal);
  else if (modelConfig.provider === 'anthropic') yield* callAnthropicModelStream(modelConfig, request, abortSignal);
  else throw new Error(`Unsupported custom model provider for streaming: ${modelConfig.provider}`);
}

export async function callCustomModel(
  modelConfig: CustomModelConfig,
  request: any,
  abortSignal?: AbortSignal
): Promise<GenerateContentResponse> {
  console.log(`[CustomModel] Unary call: ${modelConfig.displayName} (${modelConfig.provider})`);
  if (modelConfig.provider === 'openai') return callOpenAICompatibleModel(modelConfig, request, abortSignal);
  else if (modelConfig.provider === 'anthropic') return callAnthropicModel(modelConfig, request, abortSignal);
  else throw new Error(`Unsupported custom model provider: ${modelConfig.provider}`);
}

/**
 * @internal
 * 导出 parseJSONSafe 用于单元测试
 * 这是内部实现细节，不属于公开 API，可能随时变更
 */
export { parseJSONSafe as parseJSONSafeExport };
