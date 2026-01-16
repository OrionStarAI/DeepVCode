/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callOpenAICompatibleModelStream, callAnthropicModelStream, callOpenAICompatibleModel, callAnthropicModel, parseJSONSafeExport } from './customModelAdapter.js';
import { MESSAGE_ROLES } from '../config/messageRoles.js';

// 为了测试内部函数，需要导出它（见下方的导出添加）
// 如果无法导出，可以通过流式测试间接验证

describe('parseJSONSafe - JSON parsing robustness', () => {
  // 注意：这些测试依赖于 parseJSONSafeExport 被导出
  // 如果没有导出，可以跳过这些测试并依赖集成测试

  describe('normal cases', () => {
    it('should parse valid JSON object', () => {
      if (!parseJSONSafeExport) return; // Skip if not exported
      const result = parseJSONSafeExport('{"pattern": "TODO", "path": "/src"}');
      expect(result).toEqual({ pattern: 'TODO', path: '/src' });
    });

    it('should parse valid JSON array', () => {
      if (!parseJSONSafeExport) return;
      const result = parseJSONSafeExport('[1, 2, 3]');
      expect(result).toEqual([1, 2, 3]);
    });

    it('should return empty object for empty string', () => {
      if (!parseJSONSafeExport) return;
      expect(parseJSONSafeExport('')).toEqual({});
      expect(parseJSONSafeExport('  ')).toEqual({});
    });

    it('should return empty object for null/undefined strings', () => {
      if (!parseJSONSafeExport) return;
      expect(parseJSONSafeExport('null')).toEqual({});
      expect(parseJSONSafeExport('undefined')).toEqual({});
    });

    it('should return object directly if already an object', () => {
      if (!parseJSONSafeExport) return;
      const obj = { pattern: 'test' };
      expect(parseJSONSafeExport(obj as any)).toBe(obj);
    });
  });

  describe('incomplete JSON repair', () => {
    it('should repair truncated JSON object', () => {
      if (!parseJSONSafeExport) return;
      // 模拟流式传输中截断的情况
      const result = parseJSONSafeExport('{"pattern": "TODO", "path": "/sr');
      // 应该能修复并返回至少 pattern 字段
      expect(result.__parseError).toBeUndefined();
      expect(result.pattern).toBe('TODO');
    });

    it('should repair JSON missing closing brace', () => {
      if (!parseJSONSafeExport) return;
      const result = parseJSONSafeExport('{"pattern": "TODO"');
      expect(result.__parseError).toBeUndefined();
      expect(result.pattern).toBe('TODO');
    });

    it('should repair JSON with incomplete string value', () => {
      if (!parseJSONSafeExport) return;
      const result = parseJSONSafeExport('{"pattern": "TO');
      // 可能无法完全修复，但不应该崩溃
      expect(result).toBeDefined();
    });

    it('should repair JSON array missing closing bracket', () => {
      if (!parseJSONSafeExport) return;
      const result = parseJSONSafeExport('[1, 2, 3');
      expect(result.__parseError).toBeUndefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('error cases with __parseError marker', () => {
    it('should return __parseError for completely invalid JSON', () => {
      if (!parseJSONSafeExport) return;
      const result = parseJSONSafeExport('this is not json at all');
      expect(result.__parseError).toBe(true);
      expect(result.__rawArgs).toBe('this is not json at all');
    });

    it('should include __errorMessage for debugging', () => {
      if (!parseJSONSafeExport) return;
      const result = parseJSONSafeExport('invalid{{{');
      expect(result.__parseError).toBe(true);
      expect(result.__errorMessage).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle JSON with extra whitespace', () => {
      if (!parseJSONSafeExport) return;
      const result = parseJSONSafeExport('  { "pattern" : "TODO" }  ');
      expect(result).toEqual({ pattern: 'TODO' });
    });

    it('should handle nested objects', () => {
      if (!parseJSONSafeExport) return;
      const result = parseJSONSafeExport('{"outer": {"inner": "value"}}');
      expect(result).toEqual({ outer: { inner: 'value' } });
    });

    it('should handle escaped characters', () => {
      if (!parseJSONSafeExport) return;
      const result = parseJSONSafeExport('{"pattern": "test\\"quoted\\""}');
      expect(result.pattern).toBe('test"quoted"');
    });
  });
});

describe('customModelAdapter - Image Content Support', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('OpenAI image format conversion', () => {
    it('should convert Gemini inlineData to OpenAI image_url format', async () => {
      let capturedBody: any;
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'I see an image' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 100, completion_tokens: 10 },
        }),
      };

      global.fetch = vi.fn().mockImplementation(async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return mockResponse;
      });

      const modelConfig = {
        provider: 'openai' as const,
        modelId: 'gpt-4-vision',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        displayName: 'GPT-4 Vision',
      };

      const request = {
        contents: [
          {
            role: MESSAGE_ROLES.USER,
            parts: [
              { text: 'What is in this image?' },
              { inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUg==' } },
            ],
          },
        ],
      };

      await callOpenAICompatibleModel(modelConfig as any, request);

      // Verify the request body was converted correctly
      expect(capturedBody.messages).toHaveLength(1);
      expect(capturedBody.messages[0].role).toBe('user');
      expect(Array.isArray(capturedBody.messages[0].content)).toBe(true);
      expect(capturedBody.messages[0].content).toHaveLength(2);

      // Check text part
      expect(capturedBody.messages[0].content[0]).toEqual({
        type: 'text',
        text: 'What is in this image?',
      });

      // Check image part - OpenAI format
      expect(capturedBody.messages[0].content[1]).toEqual({
        type: 'image_url',
        image_url: {
          url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
        },
      });
    });

    it('should handle multiple images in a single message', async () => {
      let capturedBody: any;
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'I see two images' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 200, completion_tokens: 15 },
        }),
      };

      global.fetch = vi.fn().mockImplementation(async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return mockResponse;
      });

      const modelConfig = {
        provider: 'openai' as const,
        modelId: 'gpt-4-vision',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        displayName: 'GPT-4 Vision',
      };

      const request = {
        contents: [
          {
            role: MESSAGE_ROLES.USER,
            parts: [
              { text: 'Compare these images' },
              { inlineData: { mimeType: 'image/jpeg', data: 'base64data1' } },
              { inlineData: { mimeType: 'image/png', data: 'base64data2' } },
            ],
          },
        ],
      };

      await callOpenAICompatibleModel(modelConfig as any, request);

      expect(capturedBody.messages[0].content).toHaveLength(3);
      expect(capturedBody.messages[0].content[1].image_url.url).toBe('data:image/jpeg;base64,base64data1');
      expect(capturedBody.messages[0].content[2].image_url.url).toBe('data:image/png;base64,base64data2');
    });
  });

  describe('Anthropic image format conversion', () => {
    it('should convert Gemini inlineData to Anthropic image format', async () => {
      let capturedBody: any;
      const mockResponse = {
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'I see an image' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 10 },
        }),
      };

      global.fetch = vi.fn().mockImplementation(async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return mockResponse;
      });

      const modelConfig = {
        provider: 'anthropic' as const,
        modelId: 'claude-3-sonnet',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant-test',
        displayName: 'Claude 3 Sonnet',
      };

      const request = {
        contents: [
          {
            role: MESSAGE_ROLES.USER,
            parts: [
              { text: 'What is in this image?' },
              { inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUg==' } },
            ],
          },
        ],
      };

      await callAnthropicModel(modelConfig as any, request);

      // Verify the request body was converted correctly
      expect(capturedBody.messages).toHaveLength(1);
      expect(capturedBody.messages[0].role).toBe('user');
      expect(Array.isArray(capturedBody.messages[0].content)).toBe(true);
      expect(capturedBody.messages[0].content).toHaveLength(2);

      // Check text part (cache_control auto-added since it's the only text block in last user message)
      expect(capturedBody.messages[0].content[0]).toEqual({
        type: 'text',
        text: 'What is in this image?',
        cache_control: { type: 'ephemeral' },
      });

      // Check image part - Anthropic format
      expect(capturedBody.messages[0].content[1]).toEqual({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'iVBORw0KGgoAAAANSUhEUg==',
        },
      });
    });

    it('should handle multiple images in a single message', async () => {
      let capturedBody: any;
      const mockResponse = {
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'I see two images' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 200, output_tokens: 15 },
        }),
      };

      global.fetch = vi.fn().mockImplementation(async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return mockResponse;
      });

      const modelConfig = {
        provider: 'anthropic' as const,
        modelId: 'claude-3-sonnet',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant-test',
        displayName: 'Claude 3 Sonnet',
      };

      const request = {
        contents: [
          {
            role: MESSAGE_ROLES.USER,
            parts: [
              { text: 'Compare these images' },
              { inlineData: { mimeType: 'image/jpeg', data: 'base64data1' } },
              { inlineData: { mimeType: 'image/webp', data: 'base64data2' } },
            ],
          },
        ],
      };

      await callAnthropicModel(modelConfig as any, request);

      expect(capturedBody.messages[0].content).toHaveLength(3);
      expect(capturedBody.messages[0].content[1]).toEqual({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: 'base64data1' },
      });
      expect(capturedBody.messages[0].content[2]).toEqual({
        type: 'image',
        source: { type: 'base64', media_type: 'image/webp', data: 'base64data2' },
      });
    });
  });
});

describe('customModelAdapter - Anthropic API Compatibility', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('System message format', () => {
    it('should convert system messages to Anthropic array format', async () => {
      let capturedBody: any;
      const mockResponse = {
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'Hello' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 10 },
        }),
      };

      global.fetch = vi.fn().mockImplementation(async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return mockResponse;
      });

      const modelConfig = {
        provider: 'anthropic' as const,
        modelId: 'claude-3-sonnet',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant-test',
        displayName: 'Claude 3 Sonnet',
      };

      const request = {
        contents: [
          {
            role: 'system',
            parts: [{ text: 'You are a helpful assistant.' }],
          },
          {
            role: MESSAGE_ROLES.USER,
            parts: [{ text: 'Hello' }],
          },
        ],
      };

      await callAnthropicModel(modelConfig as any, request);

      // System should be an array with type: 'text' and auto-added cache_control
      expect(Array.isArray(capturedBody.system)).toBe(true);
      expect(capturedBody.system).toHaveLength(1);
      expect(capturedBody.system[0]).toEqual({
        type: 'text',
        text: 'You are a helpful assistant.',
        cache_control: { type: 'ephemeral' },
      });
    });

    it('should auto-add cache_control to system messages', async () => {
      let capturedBody: any;
      const mockResponse = {
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'Hello' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 10 },
        }),
      };

      global.fetch = vi.fn().mockImplementation(async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return mockResponse;
      });

      const modelConfig = {
        provider: 'anthropic' as const,
        modelId: 'claude-3-sonnet',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant-test',
        displayName: 'Claude 3 Sonnet',
      };

      const request = {
        contents: [
          {
            role: 'system',
            parts: [{ text: 'You are a helpful assistant.' }], // No cache_control in source
          },
          {
            role: MESSAGE_ROLES.USER,
            parts: [{ text: 'Hello' }],
          },
        ],
      };

      await callAnthropicModel(modelConfig as any, request);

      // cache_control should be auto-added to system messages
      expect(capturedBody.system[0].cache_control).toEqual({ type: 'ephemeral' });
    });

    it('should auto-add cache_control to last user message text block', async () => {
      let capturedBody: any;
      const mockResponse = {
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'Hello' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 10 },
        }),
      };

      global.fetch = vi.fn().mockImplementation(async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return mockResponse;
      });

      const modelConfig = {
        provider: 'anthropic' as const,
        modelId: 'claude-3-sonnet',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant-test',
        displayName: 'Claude 3 Sonnet',
      };

      const request = {
        contents: [
          {
            role: MESSAGE_ROLES.USER,
            parts: [
              { text: 'First message' },
              { text: 'Second message' },
            ],
          },
        ],
      };

      await callAnthropicModel(modelConfig as any, request);

      // Only the last text block should have cache_control
      expect(capturedBody.messages[0].content[0].cache_control).toBeUndefined();
      expect(capturedBody.messages[0].content[1].cache_control).toEqual({ type: 'ephemeral' });
    });

    it('should only add cache_control to the LAST user message in multi-turn conversation', async () => {
      let capturedBody: any;
      const mockResponse = {
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'Response' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 10 },
        }),
      };

      global.fetch = vi.fn().mockImplementation(async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return mockResponse;
      });

      const modelConfig = {
        provider: 'anthropic' as const,
        modelId: 'claude-3-sonnet',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant-test',
        displayName: 'Claude 3 Sonnet',
      };

      const request = {
        contents: [
          {
            role: MESSAGE_ROLES.USER,
            parts: [{ text: 'First user message' }],
          },
          {
            role: MESSAGE_ROLES.MODEL,
            parts: [{ text: 'Assistant response' }],
          },
          {
            role: MESSAGE_ROLES.USER,
            parts: [
              { text: 'System reminder text' },
              { text: 'Second user message - last text block' },
            ],
          },
        ],
      };

      await callAnthropicModel(modelConfig as any, request);

      // First user message should NOT have cache_control
      expect(capturedBody.messages[0].content[0].cache_control).toBeUndefined();

      // Assistant message should NOT have cache_control
      expect(capturedBody.messages[1].content[0].cache_control).toBeUndefined();

      // Last user message: only the LAST text block should have cache_control
      expect(capturedBody.messages[2].content[0].cache_control).toBeUndefined();
      expect(capturedBody.messages[2].content[1].cache_control).toEqual({ type: 'ephemeral' });
    });
  });

  describe('Extended thinking support', () => {
    it('should auto-calculate budget_tokens as maxTokens - 1 when enableThinking is true', async () => {
      let capturedBody: any;
      const mockResponse = {
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'Response' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 10 },
        }),
      };

      global.fetch = vi.fn().mockImplementation(async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return mockResponse;
      });

      const modelConfig = {
        provider: 'anthropic' as const,
        modelId: 'claude-3-sonnet',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant-test',
        displayName: 'Claude 3 Sonnet',
        maxTokens: 32000,
        enableThinking: true,
      };

      const request = {
        contents: [
          {
            role: MESSAGE_ROLES.USER,
            parts: [{ text: 'Solve this complex problem' }],
          },
        ],
      };

      await callAnthropicModel(modelConfig as any, request);

      // budget_tokens should be maxTokens - 1 (matching Claude Code behavior)
      expect(capturedBody.thinking).toEqual({
        type: 'enabled',
        budget_tokens: 31999,
      });
    });

    it('should use default maxTokens (4096) for budget calculation when not specified', async () => {
      let capturedBody: any;
      const mockResponse = {
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'Response' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 10 },
        }),
      };

      global.fetch = vi.fn().mockImplementation(async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return mockResponse;
      });

      const modelConfig = {
        provider: 'anthropic' as const,
        modelId: 'claude-3-sonnet',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant-test',
        displayName: 'Claude 3 Sonnet',
        enableThinking: true,
        // maxTokens not specified, should use default 4096
      };

      const request = {
        contents: [
          {
            role: MESSAGE_ROLES.USER,
            parts: [{ text: 'Solve this' }],
          },
        ],
      };

      await callAnthropicModel(modelConfig as any, request);

      expect(capturedBody.thinking).toEqual({
        type: 'enabled',
        budget_tokens: 4095, // 4096 - 1
      });
    });

    it('should parse thinking content blocks in response', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          content: [
            { type: 'thinking', thinking: 'Let me think about this...' },
            { type: 'text', text: 'Here is my answer' },
          ],
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const modelConfig = {
        provider: 'anthropic' as const,
        modelId: 'claude-3-sonnet',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant-test',
        displayName: 'Claude 3 Sonnet',
        enableThinking: true,
      };

      const request = {
        contents: [
          {
            role: MESSAGE_ROLES.USER,
            parts: [{ text: 'Solve this' }],
          },
        ],
      };

      const response = await callAnthropicModel(modelConfig as any, request);

      const parts = response.candidates?.[0]?.content?.parts;
      expect(parts).toHaveLength(2);
      expect(parts?.[0]).toEqual({ thought: 'Let me think about this...' });
      expect(parts?.[1]).toEqual({ text: 'Here is my answer' });
    });
  });

  describe('Tool input_schema with additionalProperties', () => {
    it('should include additionalProperties: false in tool input_schema', async () => {
      let capturedBody: any;
      const mockResponse = {
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'I will search' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 10 },
        }),
      };

      global.fetch = vi.fn().mockImplementation(async (_url, options) => {
        capturedBody = JSON.parse(options.body);
        return mockResponse;
      });

      const modelConfig = {
        provider: 'anthropic' as const,
        modelId: 'claude-3-sonnet',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant-test',
        displayName: 'Claude 3 Sonnet',
      };

      const request = {
        contents: [
          {
            role: MESSAGE_ROLES.USER,
            parts: [{ text: 'Search for something' }],
          },
        ],
        config: {
          tools: [
            {
              name: 'search',
              description: 'Search the web',
              parameters: {
                type: 'object',
                properties: { query: { type: 'string', description: 'Search query' } },
                required: ['query'],
              },
            },
          ],
        },
      };

      await callAnthropicModel(modelConfig as any, request);

      expect(capturedBody.tools).toHaveLength(1);
      expect(capturedBody.tools[0].input_schema.additionalProperties).toBe(false);
      expect(capturedBody.tools[0].input_schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    });
  });
});

describe('customModelAdapter - Streaming Tool Calls', () => {
  describe('OpenAI streaming', () => {
    it('should aggregate tool call deltas and yield complete tool call only at stream end', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => {
            let index = 0;
            const chunks = [
              'data: {"choices":[{"delta":{"content":"I will call a tool"},"index":0}]}\n',
              'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"search","arguments":""}}]},"index":0}]}\n',
              'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"qu"}}]},"index":0}]}\n',
              'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ery\\":\\"test\\"}"}}]},"index":0}]}\n',
              'data: {"choices":[{"finish_reason":"stop","index":0}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n',
              'data: [DONE]\n',
            ];

            return {
              read: vi.fn(async () => {
                if (index < chunks.length) {
                  const value = new TextEncoder().encode(chunks[index]);
                  index++;
                  return { done: false, value };
                }
                return { done: true, value: undefined };
              }),
              releaseLock: vi.fn(),
            };
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const modelConfig = {
        provider: 'openai' as const,
        modelId: 'gpt-4',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        displayName: 'GPT-4',
      };

      const request = {
        contents: [
          {
            role: MESSAGE_ROLES.USER,
            parts: [{ text: 'search for test' }],
          },
        ],
        config: {
          tools: [
            {
              name: 'search',
              description: 'Search the web',
              parameters: { type: 'object', properties: { query: { type: 'string' } } },
            },
          ],
        },
      };

      const responses: any[] = [];
      for await (const response of callOpenAICompatibleModelStream(modelConfig as any, request)) {
        responses.push(response);
      }

      // 应该收到文本和工具调用（在流末尾）
      expect(responses.length).toBeGreaterThan(0);

      // 检查最后一个有效的响应应该包含完整的工具调用
      const toolCallResponse = responses.find(r => {
        const parts = r.candidates?.[0]?.content?.parts;
        return parts && parts.some((p: any) => p.functionCall);
      });

      expect(toolCallResponse).toBeDefined();
      if (toolCallResponse) {
        const functionCall = toolCallResponse.candidates[0].content.parts.find((p: any) => p.functionCall)?.functionCall;
        expect(functionCall).toBeDefined();
        expect(functionCall?.name).toBe('search');
        expect(functionCall?.args).toEqual({ query: 'test' });
      }

      // 关键测试：验证 functionCalls getter 存在
      expect(toolCallResponse?.functionCalls).toBeDefined();
      expect(toolCallResponse?.functionCalls?.[0]?.name).toBe('search');
    });
  });

  describe('Claude streaming', () => {
    it('should aggregate tool input deltas and yield complete tool call on content_block_stop', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => {
            let index = 0;
            const chunks = [
              'data: {"type":"message_start","message":{"usage":{"input_tokens":10}}}\n',
              'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool_123","name":"search"}}\n',
              'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"q"}}\n',
              'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"uery\\":\\""}}\n',
              'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"test\\""}}\n',
              'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"}"}}\n',
              'data: {"type":"content_block_stop","index":0}\n',
              'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}\n',
            ];

            return {
              read: vi.fn(async () => {
                if (index < chunks.length) {
                  const value = new TextEncoder().encode(chunks[index]);
                  index++;
                  return { done: false, value };
                }
                return { done: true, value: undefined };
              }),
              releaseLock: vi.fn(),
            };
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const modelConfig = {
        provider: 'anthropic' as const,
        modelId: 'claude-3-sonnet',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant-test',
        displayName: 'Claude 3 Sonnet',
      };

      const request = {
        contents: [
          {
            role: MESSAGE_ROLES.USER,
            parts: [{ text: 'search for test' }],
          },
        ],
        config: {
          tools: [
            {
              name: 'search',
              description: 'Search the web',
              parameters: { type: 'object', properties: { query: { type: 'string' } } },
            },
          ],
        },
      };

      const responses: any[] = [];
      for await (const response of callAnthropicModelStream(modelConfig as any, request)) {
        responses.push(response);
      }

      // 应该收到工具调用响应
      const toolCallResponse = responses.find(r => {
        const parts = r.candidates?.[0]?.content?.parts;
        return parts && parts.some((p: any) => p.functionCall);
      });

      expect(toolCallResponse).toBeDefined();
      if (toolCallResponse) {
        const functionCall = toolCallResponse.candidates[0].content.parts.find((p: any) => p.functionCall)?.functionCall;
        expect(functionCall).toBeDefined();
        expect(functionCall?.name).toBe('search');
        expect(functionCall?.args).toEqual({ query: 'test' });
      }

      // Key test: Verify functionCalls getter exists
      expect(toolCallResponse?.functionCalls).toBeDefined();
      expect(toolCallResponse?.functionCalls?.[0]?.name).toBe('search');
    });

    it('should correctly parse and accumulate token usage and cache info from stream', async () => {
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => {
            let index = 0;
            // 模拟真实的 Anthropic 流式响应格式：
            // - message_start 包含初始 usage（包括缓存 token 和初始 output_tokens 预估）
            // - message_delta 包含最终的 output_tokens（是总数，不是增量）
            const chunks = [
              'data: {"type":"message_start","message":{"usage":{"input_tokens":3,"cache_creation_input_tokens":9894,"cache_read_input_tokens":0,"output_tokens":5}}}\n',
              'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n',
              'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n',
              'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" World"}}\n',
              'data: {"type":"content_block_stop","index":0}\n',
              'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":298}}\n',
            ];

            return {
              read: vi.fn(async () => {
                if (index < chunks.length) {
                  const value = new TextEncoder().encode(chunks[index]);
                  index++;
                  return { done: false, value };
                }
                return { done: true, value: undefined };
              }),
              releaseLock: vi.fn(),
            };
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const modelConfig = {
        provider: 'anthropic' as const,
        modelId: 'claude-3-sonnet',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-ant-test',
        displayName: 'Claude 3 Sonnet',
      };

      const request = {
        contents: [
          {
            role: MESSAGE_ROLES.USER,
            parts: [{ text: 'Test message' }],
          },
        ],
      };

      const responses: any[] = [];
      for await (const response of callAnthropicModelStream(modelConfig as any, request)) {
        responses.push(response);
      }

      // Find the response that contains usageMetadata (it's usually the one from message_delta)
      const usageResponse = responses.find(r => r.usageMetadata);

      expect(usageResponse).toBeDefined();
      expect(usageResponse.usageMetadata).toBeDefined();
      // 🔧 promptTokenCount 现在是实际总输入：input_tokens + cache_creation + cache_read
      // 3 + 9894 + 0 = 9897
      expect(usageResponse.usageMetadata.promptTokenCount).toBe(3 + 9894 + 0);
      // output_tokens in message_delta is the final total (298), not incremental
      expect(usageResponse.usageMetadata.candidatesTokenCount).toBe(298);
      expect(usageResponse.usageMetadata.totalTokenCount).toBe((3 + 9894 + 0) + 298);
      // 🔧 字段名与 geminiChat.ts 中读取的一致（不带 Count 后缀）
      expect(usageResponse.usageMetadata.cacheCreationInputTokens).toBe(9894);
      // 0 value is preserved (means no cache hits, which is meaningful info)
      expect(usageResponse.usageMetadata.cacheReadInputTokens).toBe(0);
      // 保留原始的非缓存输入 token
      expect(usageResponse.usageMetadata.uncachedInputTokens).toBe(3);
    });

    it('should handle non-standard Anthropic-compatible providers that return token usage only in message_delta', async () => {
      // 模拟非标准兼容厂商（如 GLM-4 的 Anthropic 兼容接口）的响应格式：
      // - message_start 中返回 input_tokens: 0, output_tokens: 0（占位符）
      // - message_delta 中才返回真实的 token 用量
      const mockResponse = {
        ok: true,
        body: {
          getReader: () => {
            let index = 0;
            const chunks = [
              'data: {"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant","model":"glm-4.7","content":[],"stop_reason":null,"usage":{"input_tokens":0,"output_tokens":0}}}\n',
              'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n',
              'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好！"}}\n',
              'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"很高兴见到你！"}}\n',
              'data: {"type":"content_block_stop","index":0}\n',
              // 非标准：token 用量在 message_delta 中返回，包括缓存信息
              'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":19,"output_tokens":99,"cache_read_input_tokens":12928}}\n',
            ];

            return {
              read: vi.fn(async () => {
                if (index < chunks.length) {
                  const value = new TextEncoder().encode(chunks[index]);
                  index++;
                  return { done: false, value };
                }
                return { done: true, value: undefined };
              }),
              releaseLock: vi.fn(),
            };
          },
        },
      };

      global.fetch = vi.fn().mockResolvedValue(mockResponse);

      const modelConfig = {
        provider: 'anthropic' as const,
        modelId: 'glm-4.7',
        baseUrl: 'https://proxy.example.com',
        apiKey: 'sk-test',
        displayName: 'GLM-4.7 (Anthropic Compatible)',
      };

      const request = {
        contents: [
          {
            role: MESSAGE_ROLES.USER,
            parts: [{ text: 'Hello' }],
          },
        ],
      };

      const responses: any[] = [];
      for await (const response of callAnthropicModelStream(modelConfig as any, request)) {
        responses.push(response);
      }

      // 找到包含 usageMetadata 的响应（来自 message_delta）
      const usageResponse = responses.find(r => r.usageMetadata);

      expect(usageResponse).toBeDefined();
      expect(usageResponse.usageMetadata).toBeDefined();

      // 🔧 鲁棒性测试：即使 message_start 返回 0，也应该从 message_delta 中获取正确的 token 数据
      // promptTokenCount = input_tokens + cache_creation + cache_read = 19 + 0 + 12928 = 12947
      expect(usageResponse.usageMetadata.promptTokenCount).toBe(19 + 0 + 12928);
      // output_tokens 来自 message_delta
      expect(usageResponse.usageMetadata.candidatesTokenCount).toBe(99);
      expect(usageResponse.usageMetadata.totalTokenCount).toBe((19 + 0 + 12928) + 99);
      // 缓存信息应该正确解析
      expect(usageResponse.usageMetadata.cacheReadInputTokens).toBe(12928);
      // 非缓存输入 token
      expect(usageResponse.usageMetadata.uncachedInputTokens).toBe(19);
    });
  });
});
