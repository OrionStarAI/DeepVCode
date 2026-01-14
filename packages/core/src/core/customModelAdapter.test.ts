/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-nocheck - Disable strict type checking for test file due to complex GenAI types

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callCustomModel, callOpenAICompatibleModel } from './customModelAdapter.js';
import { CustomModelConfig } from '../types/customModel.js';
import { MESSAGE_ROLES } from '../config/messageRoles.js';
import { FinishReason } from '@google/genai';

// Mock fetch
global.fetch = vi.fn();

describe('customModelAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('callOpenAICompatibleModel', () => {
    const mockModelConfig: CustomModelConfig = {
      displayName: 'Test Model',
      provider: 'openai',
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      modelId: 'gpt-4',
      timeout: 30000,
      maxTokens: 4096,
      headers: {},
    };

    it('should convert DeepV tools to OpenAI format correctly', async () => {
      // Mock OpenAI API response
      const mockResponse = {
        choices: [{
          message: { content: 'Test response' },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      // DeepV 工具格式：1个元素，包含54个functionDeclarations
      const mockRequest = {
        contents: [{
          role: MESSAGE_ROLES.USER,
          parts: [{ text: 'Hello' }],
        }],
        config: {
          tools: [{
            functionDeclarations: [
              { name: 'list_directory', description: 'List directory', parameters: {} },
              { name: 'read_file', description: 'Read file', parameters: {} },
              { name: 'write_file', description: 'Write file', parameters: {} },
              { name: 'run_shell_command', description: 'Run shell', parameters: {} },
            ],
          }],
        },
      };

      await callOpenAICompatibleModel(mockModelConfig, mockRequest);

      // 验证 fetch 被调用
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // 获取实际发送的请求体
      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      // 🎯 关键验证：tools 应该被展开为 4 个独立的 OpenAI 工具
      expect(requestBody.tools).toBeDefined();
      expect(requestBody.tools).toHaveLength(4);

      // 验证每个工具的格式
      expect(requestBody.tools[0]).toEqual({
        type: 'function',
        function: {
          name: 'list_directory',
          description: 'List directory',
          parameters: {},
        },
      });

      expect(requestBody.tools[1]).toEqual({
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read file',
          parameters: {},
        },
      });

      expect(requestBody.tools[2]).toEqual({
        type: 'function',
        function: {
          name: 'write_file',
          description: 'Write file',
          parameters: {},
        },
      });

      expect(requestBody.tools[3]).toEqual({
        type: 'function',
        function: {
          name: 'run_shell_command',
          description: 'Run shell',
          parameters: {},
        },
      });
    });

    it('should handle large number of tools (54 tools)', async () => {
      const mockResponse = {
        choices: [{
          message: { content: 'I have access to all tools' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      // 模拟 54 个工具
      const functionDeclarations = Array.from({ length: 54 }, (_, i) => ({
        name: `tool_${i + 1}`,
        description: `Tool ${i + 1}`,
        parameters: { type: 'object', properties: {} },
      }));

      const mockRequest = {
        contents: [{
          role: MESSAGE_ROLES.USER,
          parts: [{ text: 'List all tools' }],
        }],
        config: {
          tools: [{ functionDeclarations }],
        },
      };

      await callOpenAICompatibleModel(mockModelConfig, mockRequest);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      // 🎯 验证所有 54 个工具都被正确转换
      expect(requestBody.tools).toHaveLength(54);
      expect(requestBody.tools[0].function.name).toBe('tool_1');
      expect(requestBody.tools[53].function.name).toBe('tool_54');
    });

    it('should handle empty tools array', async () => {
      const mockResponse = {
        choices: [{
          message: { content: 'No tools available' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const mockRequest = {
        contents: [{
          role: MESSAGE_ROLES.USER,
          parts: [{ text: 'Hello' }],
        }],
        config: {
          tools: [],
        },
      };

      await callOpenAICompatibleModel(mockModelConfig, mockRequest);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      // 空 tools 不应该被发送
      expect(requestBody.tools).toBeUndefined();
    });

    it('should handle undefined tools', async () => {
      const mockResponse = {
        choices: [{
          message: { content: 'No tools' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const mockRequest = {
        contents: [{
          role: MESSAGE_ROLES.USER,
          parts: [{ text: 'Hello' }],
        }],
        config: {},
      };

      await callOpenAICompatibleModel(mockModelConfig, mockRequest);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.tools).toBeUndefined();
    });

    it('should convert messages correctly', async () => {
      const mockResponse = {
        choices: [{
          message: { content: 'Response' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const mockRequest = {
        contents: [
          {
            role: MESSAGE_ROLES.USER,
            parts: [{ text: 'User message' }],
          },
          {
            role: MESSAGE_ROLES.MODEL,
            parts: [{ text: 'Model response' }],
          },
        ],
        config: {},
      };

      await callOpenAICompatibleModel(mockModelConfig, mockRequest);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.messages).toHaveLength(2);
      expect(requestBody.messages[0]).toEqual({
        role: 'user',
        content: 'User message',
      });
      expect(requestBody.messages[1]).toEqual({
        role: 'assistant',
        content: 'Model response',
      });
    });

    it('should handle function calls in messages', async () => {
      const mockResponse = {
        choices: [{
          message: { content: 'Tool called' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const mockRequest = {
        contents: [{
          role: MESSAGE_ROLES.MODEL,
          parts: [{
            functionCall: {
              name: 'list_directory',
              args: { path: '/test' },
            },
          }],
        }],
        config: {},
      };

      await callOpenAICompatibleModel(mockModelConfig, mockRequest);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.messages[0].role).toBe('assistant');
      expect(requestBody.messages[0].tool_calls).toBeDefined();
      expect(requestBody.messages[0].tool_calls[0].function.name).toBe('list_directory');
    });

    it('should handle function responses in messages', async () => {
      const mockResponse = {
        choices: [{
          message: { content: 'Tool result received' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const mockRequest = {
        contents: [{
          role: MESSAGE_ROLES.USER,
          parts: [{
            functionResponse: {
              id: 'call_123',
              name: 'list_directory',
              response: { files: ['file1.txt', 'file2.txt'] },
            },
          }],
        }],
        config: {},
      };

      await callOpenAICompatibleModel(mockModelConfig, mockRequest);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.messages[0].role).toBe('tool');
      expect(requestBody.messages[0].tool_call_id).toBe('call_123');
      expect(requestBody.messages[0].content).toContain('file1.txt');
    });

    it('should parse tool_calls from OpenAI response', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call_456',
              type: 'function',
              function: {
                name: 'read_file',
                arguments: JSON.stringify({ path: '/test.txt' }),
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const mockRequest = {
        contents: [{
          role: MESSAGE_ROLES.USER,
          parts: [{ text: 'Read /test.txt' }],
        }],
        config: {},
      };

      const response = await callOpenAICompatibleModel(mockModelConfig, mockRequest);

      // 验证转换为 GenAI 格式
      expect(response.candidates).toBeDefined();
      expect(response.candidates).toHaveLength(1);

      const candidate = response.candidates![0];
      expect(candidate).toBeDefined();
      expect(candidate.content).toBeDefined();
      expect(candidate.content.parts).toBeDefined();
      expect(candidate.content.parts).toHaveLength(1);

      const parts = (candidate.content as any).parts;
      const functionCall = parts[0].functionCall;
      expect(functionCall).toEqual({
        name: 'read_file',
        args: { path: '/test.txt' },
        id: 'call_456', // 保留 tool_call_id
      });

      expect(response.functionCalls).toBeDefined();
      expect(response.functionCalls).toHaveLength(1);
      expect(response.functionCalls![0].name).toBe('read_file');
      expect(response.functionCalls![0].id).toBe('call_456');
    });

    it('should handle API errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      });

      const mockRequest = {
        contents: [{
          role: MESSAGE_ROLES.USER,
          parts: [{ text: 'Hello' }],
        }],
        config: {},
      };

      await expect(
        callOpenAICompatibleModel(mockModelConfig, mockRequest)
      ).rejects.toThrow('OpenAI API error (429): Rate limit exceeded');
    });

    it('should handle timeout', async () => {
      const shortTimeoutConfig = { ...mockModelConfig, timeout: 100 };

      // 模拟慢响应
      (global.fetch as any).mockImplementationOnce(
        () => new Promise(resolve => setTimeout(resolve, 200))
      );

      const mockRequest = {
        contents: [{
          role: MESSAGE_ROLES.USER,
          parts: [{ text: 'Hello' }],
        }],
        config: {},
      };

      await expect(
        callOpenAICompatibleModel(shortTimeoutConfig, mockRequest)
      ).rejects.toThrow();
    });

    it('should resolve environment variables in config', async () => {
      process.env.TEST_API_KEY = 'env-api-key';
      process.env.TEST_BASE_URL = 'https://env.api.com';

      const mockResponse = {
        choices: [{
          message: { content: 'Test' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const envModelConfig: CustomModelConfig = {
        ...mockModelConfig,
        baseUrl: '${TEST_BASE_URL}',
        apiKey: '${TEST_API_KEY}',
      };

      const mockRequest = {
        contents: [{
          role: MESSAGE_ROLES.USER,
          parts: [{ text: 'Hello' }],
        }],
        config: {},
      };

      await callOpenAICompatibleModel(envModelConfig, mockRequest);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const url = fetchCall[0];
      const headers = fetchCall[1].headers;

      expect(url).toBe('https://env.api.com/chat/completions');
      expect(headers.Authorization).toBe('Bearer env-api-key');

      delete process.env.TEST_API_KEY;
      delete process.env.TEST_BASE_URL;
    });
  });

  describe('callCustomModel', () => {
    it('should route to OpenAI adapter for openai provider', async () => {
      const mockResponse = {
        choices: [{
          message: { content: 'Test' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const config: CustomModelConfig = {
        displayName: 'OpenAI Model',
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        modelId: 'gpt-4',
        timeout: 30000,
        maxTokens: 4096,
        headers: {},
      };

      const mockRequest = {
        contents: [{
          role: MESSAGE_ROLES.USER,
          parts: [{ text: 'Hello' }],
        }],
        config: {},
      };

      const response = await callCustomModel(config, mockRequest);

      expect(response).toBeDefined();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should throw error for unsupported provider', async () => {
      const config: CustomModelConfig = {
        displayName: 'Unsupported Model',
        provider: 'unknown' as any,
        baseUrl: 'https://api.unknown.com',
        apiKey: 'test-key',
        modelId: 'model-1',
        timeout: 30000,
        maxTokens: 4096,
        headers: {},
      };

      const mockRequest = {
        contents: [{
          role: MESSAGE_ROLES.USER,
          parts: [{ text: 'Hello' }],
        }],
        config: {},
      };

      await expect(
        callCustomModel(config, mockRequest)
      ).rejects.toThrow('Unsupported custom model provider: unknown');
    });
  });

  describe('Regression Tests', () => {
    it('should NOT only take the first tool (Bug #2025-01-14)', async () => {
      // 回归测试：确保不会重现"只有1个工具"的bug
      const mockResponse = {
        choices: [{
          message: { content: 'I can see all tools' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const config: CustomModelConfig = {
        displayName: 'Test Model',
        provider: 'openai',
        baseUrl: 'https://api.test.com',
        apiKey: 'test-key',
        modelId: 'gpt-4',
        timeout: 30000,
        maxTokens: 4096,
        headers: {},
      };

      // 模拟真实场景：1个元素包含多个functionDeclarations
      const mockRequest = {
        contents: [{
          role: MESSAGE_ROLES.USER,
          parts: [{ text: 'What tools do you have?' }],
        }],
        config: {
          tools: [{
            functionDeclarations: [
              { name: 'list_directory', description: 'List dir', parameters: {} },
              { name: 'read_file', description: 'Read file', parameters: {} },
              { name: 'write_file', description: 'Write file', parameters: {} },
              { name: 'delete_file', description: 'Delete file', parameters: {} },
              { name: 'run_shell_command', description: 'Run shell', parameters: {} },
            ],
          }],
        },
      };

      await callCustomModel(config, mockRequest);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      // 🎯 关键断言：必须是5个工具，而不是1个！
      expect(requestBody.tools).toHaveLength(5);
      expect(requestBody.tools.map((t: any) => t.function.name)).toEqual([
        'list_directory',
        'read_file',
        'write_file',
        'delete_file',
        'run_shell_command',
      ]);
    });
  });

  describe('callAnthropicModel - Tool Support', () => {
    it('should convert DeepV tools to Anthropic format correctly', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'I have these tools available.' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 20 },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const config: CustomModelConfig = {
        displayName: 'Claude Model',
        provider: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'test-key',
        modelId: 'claude-sonnet-4-5',
        timeout: 30000,
        maxTokens: 4096,
        headers: {},
      };

      const mockRequest = {
        contents: [{
          role: MESSAGE_ROLES.USER,
          parts: [{ text: 'What tools do you have?' }],
        }],
        config: {
          tools: [{
            functionDeclarations: [
              { name: 'list_directory', description: 'List directory', parameters: { type: 'object', properties: {} } },
              { name: 'read_file', description: 'Read file', parameters: { type: 'object', properties: {} } },
              { name: 'write_file', description: 'Write file', parameters: { type: 'object', properties: {} } },
            ],
          }],
        },
      };

      await callCustomModel(config, mockRequest);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      // 验证 tools 被正确转换为 Anthropic 格式
      expect(requestBody.tools).toBeDefined();
      expect(requestBody.tools).toHaveLength(3);

      // Anthropic 格式: { name, description, input_schema }
      expect(requestBody.tools[0]).toEqual({
        name: 'list_directory',
        description: 'List directory',
        input_schema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: {}
        },
      });
    });

    it('should expand all 54 tools for Anthropic (not just 2)', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'I have access to all 54 tools' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 20 },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const config: CustomModelConfig = {
        displayName: 'Claude Model',
        provider: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'test-key',
        modelId: 'claude-sonnet-4-5',
        timeout: 30000,
        maxTokens: 4096,
        headers: {},
      };

      // 模拟 54 个工具
      const functionDeclarations = Array.from({ length: 54 }, (_, i) => ({
        name: `tool_${i + 1}`,
        description: `Tool ${i + 1}`,
        parameters: { type: 'object', properties: {} },
      }));

      const mockRequest = {
        contents: [{
          role: MESSAGE_ROLES.USER,
          parts: [{ text: 'List all tools' }],
        }],
        config: {
          tools: [{ functionDeclarations }],
        },
      };

      await callCustomModel(config, mockRequest);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      // 🎯 关键断言：必须是 54 个工具，而不是 2 个！
      expect(requestBody.tools).toHaveLength(54);
      expect(requestBody.tools[0].name).toBe('tool_1');
      expect(requestBody.tools[53].name).toBe('tool_54');
    });

    it('should handle Anthropic tool_use response', async () => {
      const mockResponse = {
        content: [
          { type: 'text', text: 'Let me read that file for you.' },
          {
            type: 'tool_use',
            id: 'toolu_12345',
            name: 'read_file',
            input: { path: '/test.txt' },
          },
        ],
        stop_reason: 'tool_use',
        usage: { input_tokens: 50, output_tokens: 30 },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const config: CustomModelConfig = {
        displayName: 'Claude Model',
        provider: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'test-key',
        modelId: 'claude-sonnet-4-5',
        timeout: 30000,
        maxTokens: 4096,
        headers: {},
      };

      const mockRequest = {
        contents: [{
          role: MESSAGE_ROLES.USER,
          parts: [{ text: 'Read /test.txt' }],
        }],
        config: {},
      };

      const response = await callCustomModel(config, mockRequest);

      // 验证转换为 GenAI 格式
      expect(response.candidates).toBeDefined();
      expect(response.candidates).toHaveLength(1);

      const candidate = response.candidates![0];
      const parts = (candidate.content as any).parts;

      expect(parts).toHaveLength(2);
      expect(parts[0].text).toBe('Let me read that file for you.');

      // 第二个 part 是 functionCall
      expect(parts[1].functionCall).toEqual({
        name: 'read_file',
        args: { path: '/test.txt' },
        id: 'toolu_12345',
      });

      // 验证 functionCalls getter
      expect(response.functionCalls).toBeDefined();
      expect(response.functionCalls).toHaveLength(1);
      expect(response.functionCalls![0].name).toBe('read_file');
    });

    it('should convert functionResponse to tool_result format', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'The file contains...' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 60, output_tokens: 25 },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const config: CustomModelConfig = {
        displayName: 'Claude Model',
        provider: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'test-key',
        modelId: 'claude-sonnet-4-5',
        timeout: 30000,
        maxTokens: 4096,
        headers: {},
      };

      const mockRequest = {
        contents: [
          {
            role: MESSAGE_ROLES.USER,
            parts: [{ text: 'Read /test.txt' }],
          },
          {
            role: MESSAGE_ROLES.MODEL,
            parts: [{
              functionCall: {
                name: 'read_file',
                args: { path: '/test.txt' },
                id: 'toolu_12345',
              },
            }],
          },
          {
            role: MESSAGE_ROLES.USER,
            parts: [{
              functionResponse: {
                name: 'read_file',
                response: { content: 'Hello World' },
                id: 'toolu_12345',
              },
            }],
          },
        ],
        config: {},
      };

      await callCustomModel(config, mockRequest);

      const fetchCall = (global.fetch as any).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      // 验证消息格式
      expect(requestBody.messages).toHaveLength(3);

      // 第二条消息（模型的 tool_use）
      const assistantMsg = requestBody.messages[1];
      expect(assistantMsg.role).toBe('assistant');
      expect(assistantMsg.content[0].type).toBe('tool_use');
      expect(assistantMsg.content[0].name).toBe('read_file');

      // 第三条消息（用户的 tool_result）
      const toolResultMsg = requestBody.messages[2];
      expect(toolResultMsg.role).toBe('user');
      expect(toolResultMsg.content[0].type).toBe('tool_result');
      expect(toolResultMsg.content[0].tool_use_id).toBe('toolu_12345');
      expect(toolResultMsg.content[0].content).toBe('{"content":"Hello World"}');
    });
  });
});
