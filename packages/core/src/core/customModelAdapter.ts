/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentResponse,
  FinishReason,
} from '@google/genai';
import { CustomModelConfig, CustomModelProvider } from '../types/customModel.js';
import { MESSAGE_ROLES } from '../config/messageRoles.js';

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
 * OpenAI兼容格式的自定义模型调用
 */
export async function callOpenAICompatibleModel(
  modelConfig: CustomModelConfig,
  request: any,
  abortSignal?: AbortSignal
): Promise<GenerateContentResponse> {
  const baseUrl = resolveEnvVar(modelConfig.baseUrl).replace(/\/+$/, '');
  const apiKey = resolveEnvVar(modelConfig.apiKey);
  const url = `${baseUrl}/chat/completions`;

  // 转换消息格式为OpenAI格式
  const messages = request.contents.map((content: any) => {
    const parts = content.parts || [];

    // 处理包含 functionCall 的消息（上一轮调用结果）
    if (parts.some((p: any) => p.functionCall)) {
      return {
        role: content.role === MESSAGE_ROLES.MODEL ? 'assistant' : 'user',
        content: null,
        tool_calls: parts
          .filter((p: any) => p.functionCall)
          .map((p: any, idx: number) => ({
            // 🔑 使用保存的 ID！不要重新生成
            id: p.functionCall.id || `call_${Date.now()}_${idx}`,
            type: 'function',
            function: {
              name: p.functionCall.name,
              arguments: JSON.stringify(p.functionCall.args || {}),
            },
          })),
      };
    }

    // 处理包含 functionResponse 的消息（工具执行结果）
    if (parts.some((p: any) => p.functionResponse)) {
      const functionResponseParts = parts.filter((p: any) => p.functionResponse);
      return functionResponseParts.map((p: any) => ({
        role: 'tool',
        // 🔑 使用保存在 functionResponse 中的 id（从之前的 functionCall.id 传递过来）
        tool_call_id: p.functionResponse.id || `call_${p.functionResponse.name}`,
        content: JSON.stringify(p.functionResponse.response || {}),
      }));
    }

    // 普通文本消息
    return {
      role: content.role === MESSAGE_ROLES.MODEL ? 'assistant' : 'user',
      content: parts.map((part: any) => part.text || '').join('\n'),
    };
  }).flat(); // flat() 因为 functionResponse 可能返回数组

  // 转换 tools 为 OpenAI 格式
  // DeepV 的 Tool 格式：tools = [{ functionDeclarations: [...] }]
  // 需要展开 functionDeclarations 数组，每个函数声明转换为一个 OpenAI tool
  const tools = request.config?.tools?.flatMap((tool: any) => {
    if (tool.functionDeclarations && Array.isArray(tool.functionDeclarations)) {
      // 展开 functionDeclarations 数组
      return tool.functionDeclarations.map((fd: any) => ({
        type: 'function',
        function: {
          name: fd.name,
          description: fd.description,
          parameters: fd.parameters,
        },
      }));
    } else {
      // 兼容旧格式（直接是单个工具）
      return [{
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }];
    }
  });

  const requestBody: any = {
    model: modelConfig.modelId,
    messages,
    stream: false,
  };

  // 只在有 tools 时添加
  if (tools && tools.length > 0) {
    requestBody.tools = tools;
    requestBody.tool_choice = 'auto'; // 让模型自动决定是否调用工具
  }



  const controller = new AbortController();
  if (abortSignal) {
    abortSignal.addEventListener('abort', () => controller.abort());
  }

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, modelConfig.timeout || 300000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...modelConfig.headers,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    // 转换OpenAI响应为GenAI格式
    const choice = data.choices[0];
    const message = choice.message;

    // 构建 parts 数组
    const parts: any[] = [];

    // 添加文本内容
    if (message.content) {
      parts.push({ text: message.content });
    }

    // 处理 tool_calls (function calling)
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.type === 'function') {
          parts.push({
            functionCall: {
              name: toolCall.function.name,
              args: JSON.parse(toolCall.function.arguments || '{}'),
              id: toolCall.id, // 💾 保存 tool_call_id，用于后续 functionResponse
            },
          });
        }
      }
    }

    // 如果没有任何内容，添加空文本
    if (parts.length === 0) {
      parts.push({ text: '' });
    }

    const responseData: any = {
      candidates: [{
        content: {
          role: MESSAGE_ROLES.MODEL,
          parts: parts,
        },
        finishReason:
          choice.finish_reason === 'stop' ? FinishReason.STOP :
          choice.finish_reason === 'tool_calls' ? FinishReason.STOP :
          FinishReason.OTHER,
        index: 0,
      }],
      usageMetadata: {
        promptTokenCount: data.usage?.prompt_tokens || 0,
        candidatesTokenCount: data.usage?.completion_tokens || 0,
        totalTokenCount: data.usage?.total_tokens || 0,
      },
    };

    // 添加 functionCalls getter (兼容 GenAI SDK)
    const functionCalls = parts
      .filter(p => p.functionCall)
      .map(p => p.functionCall);

    Object.defineProperty(responseData, 'functionCalls', {
      get: function() {
        return functionCalls.length > 0 ? functionCalls : undefined;
      },
      enumerable: false,
      configurable: true
    });

    return responseData as GenerateContentResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Claude (Anthropic)格式的自定义模型调用
 */
export async function callAnthropicModel(
  modelConfig: CustomModelConfig,
  request: any,
  abortSignal?: AbortSignal
): Promise<GenerateContentResponse> {
  const baseUrl = resolveEnvVar(modelConfig.baseUrl).replace(/\/+$/, '');
  const apiKey = resolveEnvVar(modelConfig.apiKey);
  const url = `${baseUrl}/v1/messages`;

  // 转换消息格式为Anthropic格式
  const messages: any[] = [];
  let systemPrompt: string | undefined = undefined;

  for (const content of request.contents) {
    const parts = content.parts || [];

    // 🔍 Anthropic 特殊处理：system 角色要提取到独立的 system 参数
    if (content.role === 'system') {
      const systemTexts = parts
        .filter((p: any) => p.text)
        .map((p: any) => p.text)
        .join('\n');
      if (systemTexts.trim()) {
        systemPrompt = systemTexts;
      }
      continue; // 跳过，不添加到 messages
    }

    const role = content.role === MESSAGE_ROLES.MODEL ? 'assistant' : 'user';

    // 分类 parts
    const textParts: any[] = [];
    const toolUseParts: any[] = [];
    const toolResultParts: any[] = [];

    for (const part of parts) {
      // 🔍 只添加非空文本
      if (part.text !== undefined && part.text !== null) {
        const trimmedText = String(part.text).trim();
        if (trimmedText.length > 0) {
          textParts.push({ type: 'text', text: part.text });
        }
      }
      if (part.functionCall) {
        toolUseParts.push({
          type: 'tool_use',
          id: part.functionCall.id || `toolu_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: part.functionCall.name,
          input: part.functionCall.args || {},
        });
      }
      if (part.functionResponse) {
        toolResultParts.push({
          type: 'tool_result',
          tool_use_id: part.functionResponse.id || `toolu_${part.functionResponse.name}`,
          content: typeof part.functionResponse.response === 'string'
            ? part.functionResponse.response
            : JSON.stringify(part.functionResponse.response || {}),
        });
      }
    }

    // 构建消息
    if (role === 'assistant') {
      // assistant 消息：可能包含文本 + tool_use
      const anthropicContent = [...textParts, ...toolUseParts];
      if (anthropicContent.length > 0) {
        // 🔍 如果只有一个纯文本块，使用字符串格式（更简洁）
        if (anthropicContent.length === 1 && anthropicContent[0].type === 'text') {
          messages.push({ role: 'assistant', content: anthropicContent[0].text });
        } else {
          messages.push({ role: 'assistant', content: anthropicContent });
        }
      }
    } else {
      // user 消息：可能包含文本或 tool_result
      if (toolResultParts.length > 0) {
        // tool_result 必须用数组格式
        messages.push({ role: 'user', content: toolResultParts });
      } else if (textParts.length > 0) {
        // 🔍 如果只有一个纯文本块，使用字符串格式（更简洁）
        if (textParts.length === 1) {
          messages.push({ role: 'user', content: textParts[0].text });
        } else {
          messages.push({ role: 'user', content: textParts });
        }
      }
    }
  }

  // 🔍 Anthropic 要求：消息必须以 user 角色开始
  if (messages.length > 0 && messages[0].role === 'assistant') {
    messages.unshift({
      role: 'user',
      content: '...'  // 简单文本用字符串格式
    });
  }

  // 🔍 Anthropic 要求：不能有连续的相同角色消息
  const validMessages: any[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const prevMsg = validMessages[validMessages.length - 1];

    // 如果当前消息和上一条消息角色相同，合并内容
    if (prevMsg && prevMsg.role === msg.role) {
      // 将字符串转换为数组格式以便合并
      const prevContent = typeof prevMsg.content === 'string'
        ? [{ type: 'text', text: prevMsg.content }]
        : Array.isArray(prevMsg.content) ? prevMsg.content : [];
      const currentContent = typeof msg.content === 'string'
        ? [{ type: 'text', text: msg.content }]
        : Array.isArray(msg.content) ? msg.content : [];

      prevMsg.content = [...prevContent, ...currentContent];
    } else {
      validMessages.push(msg);
    }
  }

  // 转换 tools 为 Anthropic 格式
  // Anthropic 格式: { name, description, input_schema }
  // 🔍 关键：input_schema 必须符合 JSON Schema Draft 2020-12
  const cleanSchema = (schema: any): any => {
    if (!schema || typeof schema !== 'object') return schema;

    // 深拷贝并只保留 JSON Schema 标准字段
    const cleaned: any = {};

    // 标准的 JSON Schema 字段
    const validFields = [
      'type', 'properties', 'required', 'items', 'enum',
      'description', 'default', 'minimum', 'maximum',
      'minLength', 'maxLength', 'pattern', 'format',
      'minItems', 'maxItems', 'uniqueItems',
      'additionalProperties', 'anyOf', 'oneOf', 'allOf', 'not'
    ];

    for (const key of validFields) {
      if (schema[key] !== undefined) {
        // 🔍 特殊处理 type 字段：Google GenAI 用大写（STRING），Anthropic 要小写（string）
        if (key === 'type' && typeof schema[key] === 'string') {
          cleaned[key] = schema[key].toLowerCase();
        }
        // 🔍 数值字段必须是 number 类型，不能是字符串
        else if (['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems'].includes(key)) {
          const value = schema[key];
          // 如果是字符串，转换为数字
          if (typeof value === 'string') {
            const num = parseFloat(value);
            if (!isNaN(num)) {
              cleaned[key] = num;
            }
          } else if (typeof value === 'number') {
            cleaned[key] = value;
          }
        }
        // 递归清理嵌套对象
        else if (key === 'properties' && typeof schema[key] === 'object') {
          cleaned[key] = {};
          for (const propKey in schema[key]) {
            cleaned[key][propKey] = cleanSchema(schema[key][propKey]);
          }
        } else if (key === 'items') {
          cleaned[key] = cleanSchema(schema[key]);
        } else {
          cleaned[key] = schema[key];
        }
      }
    }

    return cleaned;
  };

  const tools = request.config?.tools?.flatMap((tool: any) => {
    if (tool.functionDeclarations && Array.isArray(tool.functionDeclarations)) {
      // 展开 functionDeclarations 数组
      return tool.functionDeclarations.map((fd: any) => {
        const originalSchema = fd.parameters || {};
        const cleanedSchema = cleanSchema(originalSchema);

        // 🔍 关键：必须包含 $schema 声明 JSON Schema Draft 2020-12
        const inputSchema = {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: cleanedSchema.properties || {},
          ...(cleanedSchema.required && Array.isArray(cleanedSchema.required) && { required: cleanedSchema.required }),
        };

        return {
          name: fd.name,
          description: fd.description || '',
          input_schema: inputSchema,
        };
      });
    } else {
      const originalSchema = tool.parameters || {};
      const cleanedSchema = cleanSchema(originalSchema);

      const inputSchema = {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: cleanedSchema.properties || {},
        ...(cleanedSchema.required && Array.isArray(cleanedSchema.required) && { required: cleanedSchema.required }),
      };

      return [{
        name: tool.name,
        description: tool.description || '',
        input_schema: inputSchema,
      }];
    }
  });

  const requestBody: any = {
    model: modelConfig.modelId,
    messages: validMessages,
    max_tokens: modelConfig.maxTokens || 4096,
  };

  // 🔍 添加 system 参数（如果有）
  if (systemPrompt) {
    requestBody.system = systemPrompt;
  }

  // 只在有 tools 时添加
  if (tools && tools.length > 0) {
    requestBody.tools = tools;
  }

  const controller = new AbortController();
  if (abortSignal) {
    abortSignal.addEventListener('abort', () => controller.abort());
  }

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, modelConfig.timeout || 300000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        ...modelConfig.headers,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    // 转换Anthropic响应为GenAI格式
    // Anthropic content 可以包含 text 和 tool_use
    const parts: any[] = [];

    for (const content of data.content) {
      if (content.type === 'text') {
        parts.push({ text: content.text || '' });
      } else if (content.type === 'tool_use') {
        // Anthropic tool_use 格式: { type: 'tool_use', id, name, input }
        // 转换为 GenAI functionCall 格式
        parts.push({
          functionCall: {
            name: content.name,
            args: content.input || {},
            id: content.id,
          },
        });
      }
    }

    // 如果没有任何内容，添加空文本（避免空数组）
    if (parts.length === 0) {
      parts.push({ text: '' });
    }

    const responseData: any = {
      candidates: [{
        content: {
          role: MESSAGE_ROLES.MODEL,
          parts: parts,
        },
        finishReason:
          data.stop_reason === 'end_turn' ? FinishReason.STOP :
          data.stop_reason === 'tool_use' ? FinishReason.STOP :
          data.stop_reason === 'max_tokens' ? FinishReason.MAX_TOKENS :
          FinishReason.OTHER,
        index: 0,
      }],
      usageMetadata: {
        promptTokenCount: data.usage?.input_tokens || 0,
        candidatesTokenCount: data.usage?.output_tokens || 0,
        totalTokenCount: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
    };

    // 添加 functionCalls getter (兼容 GenAI SDK)
    const functionCalls = parts
      .filter(p => p.functionCall)
      .map(p => p.functionCall);

    Object.defineProperty(responseData, 'functionCalls', {
      get: function() {
        return functionCalls.length > 0 ? functionCalls : undefined;
      },
      enumerable: false,
      configurable: true
    });

    return responseData as GenerateContentResponse;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 调用自定义模型的统一入口
 */
export async function callCustomModel(
  modelConfig: CustomModelConfig,
  request: any,
  abortSignal?: AbortSignal
): Promise<GenerateContentResponse> {
  console.log(`[CustomModel] Calling custom model: ${modelConfig.displayName} (${modelConfig.provider})`);

  switch (modelConfig.provider) {
    case 'openai':
      return callOpenAICompatibleModel(modelConfig, request, abortSignal);
    case 'anthropic':
      return callAnthropicModel(modelConfig, request, abortSignal);
    default:
      throw new Error(`Unsupported custom model provider: ${modelConfig.provider}`);
  }
}
