/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Content } from '../types/extendedContent.js';
import { GeminiChat } from './geminiChat.js';
import { Config } from '../config/config.js';
import { ContentGenerator } from './contentGenerator.js';
import { MESSAGE_ROLES } from '../config/messageRoles.js';

// Mock dependencies
vi.mock('../config/config.js');
vi.mock('./contentGenerator.js');

describe('GeminiChat.fixRequestContents', () => {
  let geminiChat: GeminiChat;
  let mockConfig: Config;
  let mockContentGenerator: ContentGenerator;
  let consoleSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    // 创建完整的 mock Config 对象
    mockConfig = {
      getModel: vi.fn().mockReturnValue('gemini-2.0-flash'),
      getContentGeneratorConfig: vi.fn().mockReturnValue({ authType: 'oauth' }),
      getProjectRoot: vi.fn().mockReturnValue('/mock/path'),
      getSessionId: vi.fn().mockReturnValue('test-session-id'),
      flashFallbackHandler: undefined,
      getQuotaErrorOccurred: vi.fn().mockReturnValue(false),
      setModel: vi.fn()
    } as any;

    mockContentGenerator = {} as ContentGenerator;
    geminiChat = new GeminiChat(mockConfig, mockContentGenerator);

    // Spy on console.log to test logging
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy?.mockRestore();
  });

  // 使用反射访问私有方法进行测试
  const callFixRequestContents = (requestContents: Content[]): Content[] => {
    return (geminiChat as any).fixRequestContents(requestContents);
  };

  describe('单个 Function Call 场景', () => {
    it('应该为没有 response 的 function call 补全 user cancel', () => {
      const input: Content[] = [
        {
          role: MESSAGE_ROLES.MODEL,
          parts: [
            { text: '我来搜索一下' },
            { functionCall: { name: 'search', id: 'abc123', args: { query: '天气' } } }
          ]
        },
        {
          role: MESSAGE_ROLES.USER,
          parts: [{ text: '等等，不用搜索了' }]
        }
      ];

      const result = callFixRequestContents(input);

      expect(result).toHaveLength(3);
      // 检查插入的 function response 在位置 [1]
      expect(result[1]).toEqual({
        role: MESSAGE_ROLES.USER,
        parts: [{
          functionResponse: {
            name: 'search',
            id: 'abc123',
            response: { result: 'user cancel' }
          }
        }]
      });
      // 检查原始用户消息被推到位置 [2]
      expect(result[2]).toEqual({
        role: MESSAGE_ROLES.USER,
        parts: [{ text: '等等，不用搜索了' }]
      });
    });

    it('有正确 response 的 function call 不应该被补全', () => {
      const input: Content[] = [
        {
          role: MESSAGE_ROLES.MODEL,
          parts: [{ functionCall: { name: 'search', id: 'abc123', args: { query: '天气' } } }]
        },
        {
          role: MESSAGE_ROLES.USER,
          parts: [{ functionResponse: { name: 'search', id: 'abc123', response: { result: '晴天' } } }]
        }
      ];

      const result = callFixRequestContents(input);

      expect(result).toHaveLength(2);
      expect(result).toEqual(input);
    });

    it('ID 不匹配的 response 应该被认为是未匹配', () => {
      const input: Content[] = [
        {
          role: MESSAGE_ROLES.MODEL,
          parts: [{ functionCall: { name: 'search', id: 'abc123', args: { query: '天气' } } }]
        },
        {
          role: MESSAGE_ROLES.USER,
          parts: [{ functionResponse: { name: 'search', id: 'xyz789', response: { result: '晴天' } } }]
        }
      ];

      const result = callFixRequestContents(input);

      expect(result).toHaveLength(3);
      // 检查插入的补全 response 在位置 [1]
      expect(result[1]).toEqual({
        role: MESSAGE_ROLES.USER,
        parts: [{
          functionResponse: {
            name: 'search',
            id: 'abc123',
            response: { result: 'user cancel' }
          }
        }]
      });
      // 检查原用户消息被推到位置 [2]
      expect(result[2]).toEqual({
        role: MESSAGE_ROLES.USER,
        parts: [{ functionResponse: { name: 'search', id: 'xyz789', response: { result: '晴天' } } }]
      });
    });

    it('name 不匹配的 response 应该被认为是未匹配', () => {
      const input: Content[] = [
        {
          role: MESSAGE_ROLES.MODEL,
          parts: [{ functionCall: { name: 'search', id: 'abc123', args: { query: '天气' } } }]
        },
        {
          role: MESSAGE_ROLES.USER,
          parts: [{ functionResponse: { name: 'calculate', id: 'abc123', response: { result: '42' } } }]
        }
      ];

      const result = callFixRequestContents(input);

      expect(result).toHaveLength(3);
      // 检查插入的补全 response 在位置 [1]
      expect(result[1]).toEqual({
        role: MESSAGE_ROLES.USER,
        parts: [{
          functionResponse: {
            name: 'search',
            id: 'abc123',
            response: { result: 'user cancel' }
          }
        }]
      });
      // 检查原用户消息被推到位置 [2]
      expect(result[2]).toEqual({
        role: MESSAGE_ROLES.USER,
        parts: [{ functionResponse: { name: 'calculate', id: 'abc123', response: { result: '42' } } }]
      });
    });
  });

  describe('多个 Function Call 场景', () => {
    it('应该为所有未匹配的 function call 补全 response', () => {
      const input: Content[] = [
        {
          role: MESSAGE_ROLES.MODEL,
          parts: [
            { functionCall: { name: 'search', id: 'abc123', args: { query: '天气' } } },
            { functionCall: { name: 'calculate', id: 'def456', args: { expression: '2+2' } } }
          ]
        },
        {
          role: MESSAGE_ROLES.USER,
          parts: [{ text: '不需要这些功能' }]
        }
      ];

      const result = callFixRequestContents(input);

      expect(result).toHaveLength(3);
      // 检查插入的补全 responses 在位置 [1]
      expect(result[1]).toEqual({
        role: MESSAGE_ROLES.USER,
        parts: [
          {
            functionResponse: {
              name: 'search',
              id: 'abc123',
              response: { result: 'user cancel' }
            }
          },
          {
            functionResponse: {
              name: 'calculate',
              id: 'def456',
              response: { result: 'user cancel' }
            }
          }
        ]
      });
      // 检查原用户消息被推到位置 [2]
      expect(result[2]).toEqual({
        role: MESSAGE_ROLES.USER,
        parts: [{ text: '不需要这些功能' }]
      });
    });

    it('应该只为部分未匹配的 function call 补全 response', () => {
      const input: Content[] = [
        {
          role: MESSAGE_ROLES.MODEL,
          parts: [
            { functionCall: { name: 'search', id: 'abc123', args: { query: '天气' } } },
            { functionCall: { name: 'calculate', id: 'def456', args: { expression: '2+2' } } }
          ]
        },
        {
          role: MESSAGE_ROLES.USER,
          parts: [
            { functionResponse: { name: 'search', id: 'abc123', response: { result: '晴天' } } },
            { text: '搜索结果不错，但不需要计算' }
          ]
        }
      ];

      const result = callFixRequestContents(input);

      expect(result).toHaveLength(3);
      // 检查插入的补全 response 在位置 [1] (只为 calculate 补全)
      expect(result[1]).toEqual({
        role: MESSAGE_ROLES.USER,
        parts: [{
          functionResponse: {
            name: 'calculate',
            id: 'def456',
            response: { result: 'user cancel' }
          }
        }]
      });
      // 检查原用户消息被推到位置 [2]，并且由于有混合内容，function-response 被移到前面
      expect(result[2]).toEqual({
        role: MESSAGE_ROLES.USER,
        parts: [
          { functionResponse: { name: 'search', id: 'abc123', response: { result: '晴天' } } },
          { text: '搜索结果不错，但不需要计算' }
        ]
      });
    });

    it('所有 function call 都有匹配的 response 时不应该补全', () => {
      const input: Content[] = [
        {
          role: MESSAGE_ROLES.MODEL,
          parts: [
            { functionCall: { name: 'search', id: 'abc123', args: { query: '天气' } } },
            { functionCall: { name: 'calculate', id: 'def456', args: { expression: '2+2' } } }
          ]
        },
        {
          role: MESSAGE_ROLES.USER,
          parts: [
            { functionResponse: { name: 'search', id: 'abc123', response: { result: '晴天' } } },
            { functionResponse: { name: 'calculate', id: 'def456', response: { result: '4' } } }
          ]
        }
      ];

      const result = callFixRequestContents(input);

      expect(result).toHaveLength(2);
      expect(result).toEqual(input);
    });
  });

  describe('混合内容顺序调整', () => {
    it('应该将 function-response 移到 text 前面', () => {
      const input: Content[] = [
        {
          role: MESSAGE_ROLES.MODEL,
          parts: [{ functionCall: { name: 'search', id: 'abc123', args: { query: '天气' } } }]
        },
        {
          role: MESSAGE_ROLES.USER,
          parts: [
            { text: '搜索结果：' },
            { functionResponse: { name: 'search', id: 'abc123', response: { result: '晴天' } } },
            { text: '很好的天气！' }
          ]
        }
      ];

      const result = callFixRequestContents(input);

      expect(result).toHaveLength(2);
      expect(result[1].parts).toEqual([
        { functionResponse: { name: 'search', id: 'abc123', response: { result: '晴天' } } },
        { text: '搜索结果：' },
        { text: '很好的天气！' }
      ]);
    });

    it('只有 text 或只有 function-response 时不应该调整顺序', () => {
      const input1: Content[] = [
        {
          role: MESSAGE_ROLES.MODEL,
          parts: [{ functionCall: { name: 'search', id: 'abc123', args: { query: '天气' } } }]
        },
        {
          role: MESSAGE_ROLES.USER,
          parts: [{ text: '只有文本' }]
        }
      ];

      const input2: Content[] = [
        {
          role: MESSAGE_ROLES.MODEL,
          parts: [{ functionCall: { name: 'search', id: 'abc123', args: { query: '天气' } } }]
        },
        {
          role: MESSAGE_ROLES.USER,
          parts: [{ functionResponse: { name: 'search', id: 'abc123', response: { result: '晴天' } } }]
        }
      ];

      const result1 = callFixRequestContents(input1);
      const result2 = callFixRequestContents(input2);

      // input1 应该补全，input2 不应该改变顺序
      expect(result1).toHaveLength(3); // 补全了 user cancel
      expect(result2).toHaveLength(2); // 没有补全，顺序也没变
      expect(result2[1].parts).toEqual(input2[1].parts);
    });
  });

  describe('边界情况', () => {
    it('空数组应该返回空数组', () => {
      const result = callFixRequestContents([]);
      expect(result).toEqual([]);
    });

    it('没有 function call 的内容应该保持不变', () => {
      const input: Content[] = [
        { role: MESSAGE_ROLES.USER, parts: [{ text: '你好' }] },
        { role: MESSAGE_ROLES.MODEL, parts: [{ text: '你好！有什么可以帮你的吗？' }] }
      ];

      const result = callFixRequestContents(input);
      expect(result).toEqual(input);
    });

    it('function call 在最后一条消息时应该补全', () => {
      const input: Content[] = [
        { role: MESSAGE_ROLES.USER, parts: [{ text: '搜索天气' }] },
        {
          role: MESSAGE_ROLES.MODEL,
          parts: [{ functionCall: { name: 'search', id: 'abc123', args: { query: '天气' } } }]
        }
      ];

      const result = callFixRequestContents(input);

      expect(result).toHaveLength(3);
      expect(result[2]).toEqual({
        role: MESSAGE_ROLES.USER,
        parts: [{
          functionResponse: {
            name: 'search',
            id: 'abc123',
            response: { result: 'user cancel' }
          }
        }]
      });
    });

    it('没有 ID 的 function call 和 response 应该能够匹配', () => {
      const input: Content[] = [
        {
          role: MESSAGE_ROLES.MODEL,
          parts: [{ functionCall: { name: 'search', args: { query: '天气' } } }]
        },
        {
          role: MESSAGE_ROLES.USER,
          parts: [{ functionResponse: { name: 'search', response: { result: '晴天' } } }]
        }
      ];

      const result = callFixRequestContents(input);

      expect(result).toHaveLength(2);
      expect(result).toEqual(input);
    });

    it('一个有 ID 一个没有 ID 应该被认为不匹配', () => {
      const input: Content[] = [
        {
          role: MESSAGE_ROLES.MODEL,
          parts: [{ functionCall: { name: 'search', id: 'abc123', args: { query: '天气' } } }]
        },
        {
          role: MESSAGE_ROLES.USER,
          parts: [{ functionResponse: { name: 'search', response: { result: '晴天' } } }]
        }
      ];

      const result = callFixRequestContents(input);

      expect(result).toHaveLength(3);
      // 检查插入的补全 response 在位置 [1]
      expect(result[1]).toEqual({
        role: MESSAGE_ROLES.USER,
        parts: [{
          functionResponse: {
            name: 'search',
            id: 'abc123',
            response: { result: 'user cancel' }
          }
        }]
      });
      // 检查原用户消息被推到位置 [2]
      expect(result[2]).toEqual({
        role: MESSAGE_ROLES.USER,
        parts: [{ functionResponse: { name: 'search', response: { result: '晴天' } } }]
      });
    });
  });

  describe('复杂场景', () => {
    it('多轮对话中的 function call 修复', () => {
      const input: Content[] = [
        { role: MESSAGE_ROLES.USER, parts: [{ text: '搜索天气' }] },
        {
          role: MESSAGE_ROLES.MODEL,
          parts: [{ functionCall: { name: 'search', id: '1', args: { query: '天气' } } }]
        },
        {
          role: MESSAGE_ROLES.USER,
          parts: [{ functionResponse: { name: 'search', id: '1', response: { result: '晴天' } } }]
        },
        {
          role: MESSAGE_ROLES.MODEL,
          parts: [
            { text: '天气很好！还需要其他信息吗？' },
            { functionCall: { name: 'calculate', id: '2', args: { expression: '2+2' } } }
          ]
        },
        { role: MESSAGE_ROLES.USER, parts: [{ text: '不需要计算' }] }
      ];

      const result = callFixRequestContents(input);

      expect(result).toHaveLength(6);
      // 检查插入的补全 response 在位置 [4]（在最后一个用户消息的位置）
      expect(result[4]).toEqual({
        role: MESSAGE_ROLES.USER,
        parts: [{
          functionResponse: {
            name: 'calculate',
            id: '2',
            response: { result: 'user cancel' }
          }
        }]
      });
      // 检查原用户消息被推到位置 [5]
      expect(result[5]).toEqual({
        role: MESSAGE_ROLES.USER,
        parts: [{ text: '不需要计算' }]
      });
    });
  });

  describe('多余 functionResponse 检测', () => {
    it('应该检测并记录多余的 functionResponse（ID 不匹配）', () => {
      const input: Content[] = [
        {
          role: MESSAGE_ROLES.MODEL,
          parts: [{ functionCall: { name: 'search', id: 'correct_id', args: { query: '天气' } } }]
        },
        {
          role: MESSAGE_ROLES.USER,
          parts: [
            { functionResponse: { name: 'search', id: 'wrong_id', response: { result: '晴天' } } },
            { text: '这是用户输入' }
          ]
        }
      ];

      callFixRequestContents(input);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[fixRequestContents] 检测到第2条消息中有 1 个多余的 function response:'),
        expect.arrayContaining([
          expect.objectContaining({ name: 'search', id: 'wrong_id' })
        ])
      );
    });

    it('应该检测并记录多余的 functionResponse（name 不匹配）', () => {
      const input: Content[] = [
        {
          role: MESSAGE_ROLES.MODEL,
          parts: [{ functionCall: { name: 'search', id: 'abc123', args: { query: '天气' } } }]
        },
        {
          role: MESSAGE_ROLES.USER,
          parts: [
            { functionResponse: { name: 'calculate', id: 'abc123', response: { result: '42' } } }
          ]
        }
      ];

      callFixRequestContents(input);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[fixRequestContents] 检测到第2条消息中有 1 个多余的 function response:'),
        expect.arrayContaining([
          expect.objectContaining({ name: 'calculate', id: 'abc123' })
        ])
      );
    });

    it('应该检测并记录多个多余的 functionResponse', () => {
      const input: Content[] = [
        {
          role: MESSAGE_ROLES.MODEL,
          parts: [{ functionCall: { name: 'search', id: 'valid_id', args: { query: '天气' } } }]
        },
        {
          role: MESSAGE_ROLES.USER,
          parts: [
            { functionResponse: { name: 'search', id: 'valid_id', response: { result: '晴天' } } }, // 匹配的
            { functionResponse: { name: 'search', id: 'invalid_id1', response: { result: '多云' } } }, // 多余的
            { functionResponse: { name: 'calculate', id: 'invalid_id2', response: { result: '42' } } }, // 多余的
            { text: '用户文本' }
          ]
        }
      ];

      callFixRequestContents(input);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[fixRequestContents] 检测到第2条消息中有 2 个多余的 function response:'),
        expect.arrayContaining([
          expect.objectContaining({ name: 'search', id: 'invalid_id1' }),
          expect.objectContaining({ name: 'calculate', id: 'invalid_id2' })
        ])
      );
    });

    it('有匹配的 functionResponse 时不应该报告多余的', () => {
      const input: Content[] = [
        {
          role: MESSAGE_ROLES.MODEL,
          parts: [{ functionCall: { name: 'search', id: 'abc123', args: { query: '天气' } } }]
        },
        {
          role: MESSAGE_ROLES.USER,
          parts: [{ functionResponse: { name: 'search', id: 'abc123', response: { result: '晴天' } } }]
        }
      ];

      callFixRequestContents(input);

      // 确保没有多余 response 的日志
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[fixRequestContents] 检测到')
      );
    });

    it('没有 functionCall 的情况下所有 functionResponse 都应该被认为是多余的', () => {
      const input: Content[] = [
        { role: MESSAGE_ROLES.USER, parts: [{ text: '只是普通对话' }] },
        {
          role: MESSAGE_ROLES.USER,
          parts: [
            { functionResponse: { name: 'search', id: 'orphan_id', response: { result: '孤立响应' } } },
            { text: '用户消息' }
          ]
        }
      ];

      callFixRequestContents(input);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[fixRequestContents] 检测到第2条消息中有 1 个多余的 function response:'),
        expect.arrayContaining([
          expect.objectContaining({ name: 'search', id: 'orphan_id' })
        ])
      );
    });
  });

  describe('日志测试', () => {
    it('补全 function call 时应该记录日志', () => {
      const input: Content[] = [
        {
          role: MESSAGE_ROLES.MODEL,
          parts: [{ functionCall: { name: 'search', id: 'abc123', args: { query: '天气' } } }]
        },
        { role: MESSAGE_ROLES.USER, parts: [{ text: '不需要' }] }
      ];

      callFixRequestContents(input);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[fixRequestContents] 为第1条消息补全了 1 个未匹配的 function call')
      );
    });

    it('调整内容顺序时应该记录日志', () => {
      const input: Content[] = [
        {
          role: MESSAGE_ROLES.MODEL,
          parts: [{ functionCall: { name: 'search', id: 'abc123', args: { query: '天气' } } }]
        },
        {
          role: MESSAGE_ROLES.USER,
          parts: [
            { text: '结果：' },
            { functionResponse: { name: 'search', id: 'abc123', response: { result: '晴天' } } }
          ]
        }
      ];

      callFixRequestContents(input);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[fixRequestContents] 调整了第2条消息的内容顺序，function-response 在前')
      );
    });
  });
});
