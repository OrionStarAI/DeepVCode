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
 * 安全解析 JSON
 */
function parseJSONSafe(jsonStr: string): any {
  if (!jsonStr) return {};
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    if (typeof jsonStr === 'object') return jsonStr;
    console.error(`[CustomModel] Failed to parse tool arguments: ${jsonStr}`);
    return { raw: jsonStr, parseError: true };
  }
}



/**
 * OpenAI 格式转换工具
 */
const OpenAIConverter = {
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
 */
const AnthropicConverter = {
  contentsToAnthropic(contents: any[]): { messages: any[], system?: string } {
    const messages: any[] = [];
    let system: string | undefined = undefined;

    for (const content of contents) {
      const parts = content.parts || [];

      if (content.role === 'system') {
        system = parts.filter((p: any) => p.text).map((p: any) => p.text).join('\n');
        continue;
      }

      const role = content.role === MESSAGE_ROLES.MODEL ? 'assistant' : 'user';
      const anthropicParts: any[] = [];

      for (const part of parts) {
        if (part.text) {
          anthropicParts.push({ type: 'text', text: part.text });
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

    return { messages: merged, system };
  },

  toolsToAnthropicTools(tools: any[]): any[] | undefined {
    if (!tools || tools.length === 0) return undefined;

    const cleanSchema = (schema: any): any => {
      if (!schema || typeof schema !== 'object') return schema;
      const cleaned: any = {};
      const validFields = ['type', 'properties', 'required', 'items', 'enum', 'description', 'default', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'format', 'minItems', 'maxItems', 'uniqueItems', 'additionalProperties', 'anyOf', 'oneOf', 'allOf', 'not'];
      for (const key of validFields) {
        if (schema[key] !== undefined) {
          if (key === 'type' && typeof schema[key] === 'string') cleaned[key] = schema[key].toLowerCase();
          else if (['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems'].includes(key)) {
            const val = parseFloat(schema[key]);
            if (!isNaN(val)) cleaned[key] = val;
          }
          else if (key === 'properties' && typeof schema[key] === 'object') {
            cleaned[key] = {};
            for (const k in schema[key]) cleaned[key][k] = cleanSchema(schema[key][k]);
          } else if (key === 'items') cleaned[key] = cleanSchema(schema[key]);
          else cleaned[key] = schema[key];
        }
      }
      return cleaned;
    };

    return tools.flatMap((tool: any) => {
      const decls = tool.functionDeclarations || [tool];
      return decls.map((fd: any) => {
        const cleaned = cleanSchema(fd.parameters || {});
        return {
          name: fd.name,
          description: fd.description || '',
          input_schema: {
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'object',
            properties: cleaned.properties || {},
            ...(cleaned.required && { required: cleaned.required }),
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

  if (!response.ok) throw new Error(`OpenAI API error (${response.status}): ${await response.text()}`);

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

  const result = {
    candidates: [{
      content: { role: MESSAGE_ROLES.MODEL, parts: parts.length ? parts : [{ text: '' }] },
      finishReason: OpenAIConverter.mapFinishReason(choice.finish_reason),
      index: 0,
    }],
    usageMetadata: {
      promptTokenCount: data.usage?.prompt_tokens || 0,
      candidatesTokenCount: data.usage?.completion_tokens || 0,
      totalTokenCount: data.usage?.total_tokens || 0,
      // OpenAI prompt caching support
      cacheCreationInputTokenCount: data.usage?.cache_creation_input_tokens,
      cacheReadInputTokenCount: data.usage?.cache_read_input_tokens,
    } as any,
  };
  addFunctionCallsGetter(result);
  return result as GenerateContentResponse;
}

/**
 * Anthropic 模型单次调用
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
    system,
    tools: AnthropicConverter.toolsToAnthropicTools(request.config?.tools),
    max_tokens: modelConfig.maxTokens || 4096,
  };

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

  if (!response.ok) throw new Error(`Anthropic error (${response.status}): ${await response.text()}`);

  const data = await response.json();
  const parts = data.content.map((c: any) => {
    if (c.type === 'text') return { text: c.text };
    if (c.type === 'tool_use') return { functionCall: { name: c.name, args: c.input, id: c.id } };
    return null;
  }).filter(Boolean);

  const result = {
    candidates: [{
      content: { role: MESSAGE_ROLES.MODEL, parts: parts.length ? parts : [{ text: '' }] },
      finishReason: AnthropicConverter.mapFinishReason(data.stop_reason),
      index: 0,
    }],
    usageMetadata: {
      promptTokenCount: data.usage?.input_tokens || 0,
      candidatesTokenCount: data.usage?.output_tokens || 0,
      totalTokenCount: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      // Claude prompt caching support
      cacheCreationInputTokenCount: data.usage?.cache_creation_input_tokens,
      cacheReadInputTokenCount: data.usage?.cache_read_input_tokens,
    } as any,
  };
  addFunctionCallsGetter(result);
  return result as GenerateContentResponse;
}

/**
 * OpenAI 兼容模型流式调用
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

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...modelConfig.headers,
    },
    body: JSON.stringify(requestBody),
    signal: abortSignal,
  });

  if (!response.ok) throw new Error(`OpenAI Stream error (${response.status}): ${await response.text()}`);

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
            yield {
              candidates: [],
              usageMetadata: {
                promptTokenCount: chunk.usage.prompt_tokens || 0,
                candidatesTokenCount: chunk.usage.completion_tokens || 0,
                totalTokenCount: chunk.usage.total_tokens || 0,
                // OpenAI prompt caching support
                cacheCreationInputTokenCount: chunk.usage.cache_creation_input_tokens,
                cacheReadInputTokenCount: chunk.usage.cache_read_input_tokens,
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
    system,
    tools: AnthropicConverter.toolsToAnthropicTools(request.config?.tools),
    max_tokens: modelConfig.maxTokens || 4096,
    stream: true,
  };

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

  if (!response.ok) throw new Error(`Anthropic Stream error (${response.status}): ${await response.text()}`);

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  const aggregatedTools: Map<number, { id: string, name: string, args: string }> = new Map();

  // 用于累积 token 使用统计
  let inputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreationInputTokens = 0;
  let totalCacheReadInputTokens = 0;

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

          if (chunk.type === 'content_block_start' && chunk.content_block?.type === 'tool_use') {
            aggregatedTools.set(idx, {
              id: chunk.content_block.id,
              name: chunk.content_block.name,
              args: ''
            });
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
          } else if (chunk.type === 'message_delta') {
            // 累积 token 统计（message_delta 包含增量）
            if (chunk.usage) {
              totalOutputTokens += chunk.usage.output_tokens || 0;
              totalCacheCreationInputTokens += chunk.usage.cache_creation_input_tokens || 0;
              totalCacheReadInputTokens += chunk.usage.cache_read_input_tokens || 0;
            }

            const content = { role: MESSAGE_ROLES.MODEL, parts: [] };
            const resp = {
              candidates: [{
                content,
                finishReason: AnthropicConverter.mapFinishReason(chunk.delta?.stop_reason),
                index: 0
              }],
              usageMetadata: {
                promptTokenCount: inputTokens,
                candidatesTokenCount: totalOutputTokens,
                // Claude prompt caching support - 累积缓存相关 token
                cacheCreationInputTokenCount: totalCacheCreationInputTokens || undefined,
                cacheReadInputTokenCount: totalCacheReadInputTokens || undefined,
              }
            } as any;
            addFunctionCallsGetter(resp);
            addFunctionCallsGetter(content);
            yield resp;
          } else if (chunk.type === 'message_start' && chunk.message?.usage) {
            // message_start 包含初始状态，仅记录数据不 yield（避免覆盖最后的统计）
            inputTokens = chunk.message.usage.input_tokens || 0;
            totalOutputTokens = chunk.message.usage.output_tokens || 0;
            totalCacheCreationInputTokens = chunk.message.usage.cache_creation_input_tokens || 0;
            totalCacheReadInputTokens = chunk.message.usage.cache_read_input_tokens || 0;
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
