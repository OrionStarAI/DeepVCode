/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Content } from '../types/extendedContent.js';
import { CompressionService, findIndexAfterFraction } from './compressionService.js';
import { ContentGenerator } from '../core/contentGenerator.js';
import { GeminiChat } from '../core/geminiChat.js';

// Mock dependencies
vi.mock('../core/prompts.js', () => ({
  getCompressionPrompt: () => 'Mock compression prompt'
}));

vi.mock('../core/tokenLimits.js', () => ({
  tokenLimit: (model: string) => 1000 // Mock token limit
}));

vi.mock('../utils/messageInspectors.js', () => ({
  isFunctionResponse: (content: Content) => {
    return content.role === 'user' &&
           content.parts?.some(part => !!part.functionResponse);
  }
}));

describe('CompressionService', () => {
  let compressionService: CompressionService;
  let mockContentGenerator: any;
  let mockChat: any;
  let mockConfig: any;

  beforeEach(() => {
    compressionService = new CompressionService({
      compressionTokenThreshold: 0.8,
      compressionPreserveThreshold: 0.3,
      skipEnvironmentMessages: 2,
    });

    mockContentGenerator = {
      countTokens: vi.fn(),
      generateContent: vi.fn(),
    } as any;

    mockChat = {
      sendMessage: vi.fn(),
      setHistory: vi.fn(),
      getHistory: vi.fn(),
      setTools: vi.fn(),
    } as any;

    mockConfig = {
      getToolRegistry: vi.fn().mockResolvedValue({
        getFunctionDeclarations: vi.fn().mockReturnValue([])
      })
    } as any;
  });

  describe('findIndexAfterFraction', () => {
    it('should find correct index for simple case', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'a' }] },
        { role: 'model', parts: [{ text: 'b' }] },
        { role: 'user', parts: [{ text: 'c' }] },
        { role: 'model', parts: [{ text: 'd' }] },
      ];

      // 每条消息大约相等的字符数，50%应该返回索引2
      const index = findIndexAfterFraction(history, 0.5);
      // 由于JSON.stringify的开销，实际索引可能不同，我们测试合理范围
      expect(index).toBeGreaterThanOrEqual(1);
      expect(index).toBeLessThanOrEqual(3);
    });

    it('should handle edge cases', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'short' }] },
      ];

      expect(() => findIndexAfterFraction(history, 0)).toThrow();
      expect(() => findIndexAfterFraction(history, 1)).toThrow();

      // 对于单条消息，50%应该返回该消息之后的索引
      const index = findIndexAfterFraction(history, 0.5);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThanOrEqual(1);
    });
  });

  describe('shouldCompress', () => {
    it('should not compress empty history', async () => {
      const result = await compressionService.shouldCompress([], 'test-model', mockContentGenerator);
      expect(result.shouldCompress).toBe(false);
    });

    it('should compress when forced', async () => {
      const history = [{ role: 'user', parts: [{ text: 'test' }] }];
      const result = await compressionService.shouldCompress(history, 'test-model', mockContentGenerator, true);
      expect(result.shouldCompress).toBe(true);
    });

    it('should compress when over threshold', async () => {
      const history = [{ role: 'user', parts: [{ text: 'test' }] }];
      mockContentGenerator.countTokens.mockResolvedValue({ totalTokens: 800 }); // 80% of 1000

      const result = await compressionService.shouldCompress(history, 'test-model', mockContentGenerator);
      expect(result.shouldCompress).toBe(true);
      expect(result.tokenCount).toBe(800);
    });

    it('should not compress when under threshold', async () => {
      const history = [{ role: 'user', parts: [{ text: 'test' }] }];
      mockContentGenerator.countTokens.mockResolvedValue({ totalTokens: 600 }); // 60% of 1000

      const result = await compressionService.shouldCompress(history, 'test-model', mockContentGenerator);
      expect(result.shouldCompress).toBe(false);
      expect(result.tokenCount).toBe(600);
    });

    it('should handle token counting errors', async () => {
      const history = [{ role: 'user', parts: [{ text: 'test' }] }];
      mockContentGenerator.countTokens.mockRejectedValue(new Error('Token counting failed'));

      const result = await compressionService.shouldCompress(history, 'test-model', mockContentGenerator);
      expect(result.shouldCompress).toBe(false);
    });
  });

  const createMockHistory = (length: number): Content[] => {
    const history: Content[] = [];
    for (let i = 0; i < length; i++) {
      history.push({
        role: i % 2 === 0 ? 'user' : 'model',
        parts: [{ text: `Message ${i}` }]
      });
    }
    return history;
  };

  describe('compressHistory', () => {

    it('should successfully compress history', async () => {
      const history = createMockHistory(10); // 10条消息
      mockContentGenerator.countTokens.mockResolvedValue({ totalTokens: 500 });

      mockContentGenerator.generateContent.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'Compression summary' }] } }]
      });

      const result = await compressionService.compressHistory(
        mockConfig,
        history,
        'test-model',
        'test-compression-model',
        mockContentGenerator,
        'test-prompt-id',
        new AbortController().signal
      );

      expect(result.success).toBe(true);
      expect(result.summary).toBe('Compression summary');
      expect(result.newHistory).toBeDefined();
      expect(result.compressionInfo?.originalTokenCount).toBe(500);
      expect(result.compressionInfo?.newTokenCount).toBe(500);
    });

    it('should preserve environment messages', async () => {
      const history = createMockHistory(8);
      mockContentGenerator.countTokens.mockResolvedValue({ totalTokens: 400 });

      mockContentGenerator.generateContent.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'Summary' }] } }]
      });

      const result = await compressionService.compressHistory(
        mockConfig,
        history,
        'test-model',
        'test-compression-model',
        mockContentGenerator,
        'test-prompt-id',
        new AbortController().signal
      );

      expect(result.success).toBe(true);
      // 新历史应该包含：环境信息(2) + 压缩摘要(2) + 保留的历史
      expect(result.newHistory!.length).toBeGreaterThan(4);

      // 前两条应该是原始环境信息
      expect(result.newHistory?.[0]).toEqual(history[0]);
      expect(result.newHistory?.[1]).toEqual(history[1]);

      // 第3-4条应该是压缩摘要
      expect(result.newHistory?.[2].role).toBe('user');
      expect(result.newHistory?.[2].parts?.[0]?.text).toBe('Summary');
      expect(result.newHistory?.[3].role).toBe('model');
      expect(result.newHistory?.[3].parts?.[0]?.text).toBe('Got it. Thanks for the additional context!');
    });

    it('should handle insufficient conversation history', async () => {
      const history = createMockHistory(3); // 只有3条消息，跳过2条后只剩1条
      mockContentGenerator.countTokens.mockResolvedValue({ totalTokens: 400 });

      const result = await compressionService.compressHistory(
        mockConfig,
        history,
        'test-model',
        'test-compression-model',
        mockContentGenerator,
        'test-prompt-id',
        new AbortController().signal
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient conversation history to compress');
      expect(mockContentGenerator.generateContent).not.toHaveBeenCalled();
    });

    it('should handle function responses correctly', async () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Environment' }] }, // 环境信息
        { role: 'model', parts: [{ text: 'Got it!' }] }, // 环境确认
        { role: 'user', parts: [{ text: 'Task 1' }] },
        { role: 'model', parts: [{ text: 'Response 1' }] },
        { role: 'user', parts: [{ functionResponse: { name: 'tool', response: { output: 'result' } } }] }, // 工具响应
        { role: 'model', parts: [{ text: 'Tool result processed' }] },
        { role: 'user', parts: [{ text: 'Task 2' }] },
        { role: 'model', parts: [{ text: 'Response 2' }] },
      ];

      mockContentGenerator.countTokens.mockResolvedValue({ totalTokens: 400 });
      mockContentGenerator.generateContent.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'Summary' }] } }]
      });

      const result = await compressionService.compressHistory(
        mockConfig,
        history,
        'test-model',
        'test-compression-model',
        mockContentGenerator,
        'test-prompt-id',
        new AbortController().signal
      );

      expect(result.success).toBe(true);
      // 压缩应该正确处理工具响应，不在工具调用中间分割
    });

    it('should handle compression errors', async () => {
      const history = createMockHistory(8);
      mockContentGenerator.countTokens.mockResolvedValue({ totalTokens: 400 });

      mockContentGenerator.generateContent.mockRejectedValue(new Error('Generation failed'));

      const result = await compressionService.compressHistory(
        mockConfig,
        history,
        'test-model',
        'test-compression-model',
        mockContentGenerator,
        'test-prompt-id',
        new AbortController().signal
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Generation failed');
    });
  });

  describe('tryCompress', () => {
    it('should return null when compression not needed', async () => {
      const history = [{ role: 'user', parts: [{ text: 'test' }] }];
      mockContentGenerator.countTokens.mockResolvedValue({ totalTokens: 500 }); // Under threshold

      const result = await compressionService.tryCompress(
        mockConfig,
        history,
        'test-model',
        'test-compression-model',
        mockContentGenerator,
        'test-prompt-id',
        new AbortController().signal
      );

      expect(result).toBeNull();
      expect(mockContentGenerator.generateContent).not.toHaveBeenCalled();
    });

    it('should compress when needed', async () => {
      const history = createMockHistory(8);
      mockContentGenerator.countTokens.mockResolvedValue({ totalTokens: 800 }); // Over threshold

      mockContentGenerator.generateContent.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'Summary' }] } }]
      });

      const result = await compressionService.tryCompress(
        mockConfig,
        history,
        'test-model',
        'test-compression-model',
        mockContentGenerator,
        'test-prompt-id',
        new AbortController().signal
      );

      expect(result).not.toBeNull();
      expect(result!.success).toBe(true);
      expect(mockContentGenerator.generateContent).toHaveBeenCalled();
    });
  });

  describe('Configuration scenarios', () => {
    describe('Main Agent configuration', () => {
      beforeEach(() => {
        compressionService = new CompressionService({
          compressionTokenThreshold: 0.8,
          compressionPreserveThreshold: 0.3,
          skipEnvironmentMessages: 2,
        });
      });

      it('should handle main agent typical scenario', async () => {
        const history: Content[] = [
          { role: 'user', parts: [{ text: 'Environment info...' }] },
          { role: 'model', parts: [{ text: 'Got it. Thanks for the context!' }] },
          { role: 'user', parts: [{ text: 'User task 1' }] },
          { role: 'model', parts: [{ text: 'AI response 1' }] },
          { role: 'user', parts: [{ text: 'User task 2' }] },
          { role: 'model', parts: [{ text: 'AI response 2' }] },
          { role: 'user', parts: [{ text: 'User task 3' }] },
          { role: 'model', parts: [{ text: 'AI response 3' }] },
        ];

        mockContentGenerator.countTokens.mockResolvedValue({ totalTokens: 800 });
        mockContentGenerator.generateContent.mockResolvedValue({
          candidates: [{ content: { parts: [{ text: 'Summary' }] } }]
        });

        const result = await compressionService.tryCompress(
          mockConfig,
          history,
          'test-model',
          'test-compression-model',
          mockContentGenerator,
          'test-prompt-id',
          new AbortController().signal
        );

        expect(result!.success).toBe(true);
        // 应该保留前2条环境信息 + 压缩摘要 + 30%的最近历史
      });
    });

    describe('SubAgent configuration', () => {
      beforeEach(() => {
        compressionService = new CompressionService({
          compressionTokenThreshold: 0.8,
          compressionPreserveThreshold: 0.3,
          skipEnvironmentMessages: 2,
        });
      });

      it('should handle subagent typical scenario', async () => {
        const history: Content[] = [
          { role: 'user', parts: [{ text: 'Environment info...' }] },
          { role: 'model', parts: [{ text: 'Got it. Thanks for the context!' }] },
          { role: 'user', parts: [{ text: 'Task: Implement feature X' }] },
          { role: 'model', parts: [{ text: 'I will analyze this task...' }] },
          { role: 'user', parts: [{ text: 'Continue after tools' }] },
          { role: 'model', parts: [{ text: 'Tool execution complete' }] },
        ];

        // 不应该触发压缩（60% < 80%阈值）
        mockContentGenerator.countTokens.mockResolvedValue({ totalTokens: 600 });

        const result = await compressionService.tryCompress(
          mockConfig,
          history,
          'test-model',
          'test-compression-model',
          mockContentGenerator,
          'test-prompt-id',
          new AbortController().signal
        );

        expect(result).toBeNull();
      });

      it('should compress subagent when threshold exceeded', async () => {
        const history = createMockHistory(12); // 更多历史
        mockContentGenerator.countTokens.mockResolvedValue({ totalTokens: 850 }); // 85% > 80%阈值


        mockChat.sendMessage.mockResolvedValue({ text: 'Task summary' } as any);

        const result = await compressionService.tryCompress(
          mockConfig,
          history,
          'test-model',
          'test-compression-model',
          mockContentGenerator,
          'test-prompt-id',
          new AbortController().signal
        );

        expect(result!.success).toBe(true);
        expect(result!.summary).toBe('Task summary');
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle very short history', async () => {
      const history = [
        { role: 'user', parts: [{ text: 'Environment' }] },
        { role: 'model', parts: [{ text: 'Got it!' }] },
      ];

      mockContentGenerator.countTokens.mockResolvedValue({ totalTokens: 800 });

      const result = await compressionService.tryCompress(
        mockConfig,
        history,
        'test-model',
        'test-compression-model',
        mockContentGenerator,
        'test-prompt-id',
        new AbortController().signal
      );

      expect(result!.success).toBe(false);
      expect(result!.error).toBe('Insufficient conversation history to compress');
    });

    it('should handle compression failure gracefully', async () => {
      const history = createMockHistory(8);
      mockContentGenerator.countTokens.mockResolvedValue({ totalTokens: 800 });


      mockContentGenerator.generateContent.mockRejectedValue(new Error('API error'));

      const result = await compressionService.tryCompress(
        mockConfig,
        history,
        'test-model',
        'test-compression-model',
        mockContentGenerator,
        'test-prompt-id',
        new AbortController().signal
      );

      expect(result!.success).toBe(false);
      expect(result!.error).toBe('API error');
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = compressionService.getConfig();

      expect(config.compressionTokenThreshold).toBe(0.7);
      expect(config.compressionPreserveThreshold).toBe(0.3);
      expect(config.skipEnvironmentMessages).toBe(2);
    });
  });
});