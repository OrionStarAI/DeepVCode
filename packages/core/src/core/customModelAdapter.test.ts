/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callOpenAICompatibleModelStream, callAnthropicModelStream } from './customModelAdapter.js';
import { MESSAGE_ROLES } from '../config/messageRoles.js';

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

      // 关键测试：验证 functionCalls getter 存在
      expect(toolCallResponse?.functionCalls).toBeDefined();
      expect(toolCallResponse?.functionCalls?.[0]?.name).toBe('search');
    });
  });
});
