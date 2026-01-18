/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';

// 直接测试 filterHistoryForRefine 函数的逻辑
// 由于该函数是模块内部函数，我们通过模拟相同的逻辑来测试

/**
 * 过滤历史记录，移除包含工具调用（functionCall）和工具响应（functionResponse）的消息
 * 这是 refineCommand.ts 中 filterHistoryForRefine 函数的副本，用于测试
 */
function filterHistoryForRefine(history: any[]): any[] {
  if (!Array.isArray(history)) return [];

  return history.filter(content => {
    // 检查消息中是否包含工具调用或工具响应
    if (!content.parts || !Array.isArray(content.parts)) return true;

    const hasToolCall = content.parts.some((part: any) =>
      part.functionCall !== undefined || part.functionResponse !== undefined
    );

    // 如果消息包含工具调用/响应，过滤掉整条消息
    if (hasToolCall) return false;

    // 只保留有有效文本内容的消息
    const hasTextContent = content.parts.some((part: any) =>
      part.text !== undefined && part.text.trim() !== ''
    );

    return hasTextContent;
  });
}

describe('filterHistoryForRefine', () => {
  it('should return empty array for non-array input', () => {
    expect(filterHistoryForRefine(null as any)).toEqual([]);
    expect(filterHistoryForRefine(undefined as any)).toEqual([]);
    expect(filterHistoryForRefine('string' as any)).toEqual([]);
  });

  it('should keep messages with only text content', () => {
    const history = [
      {
        role: 'user',
        parts: [{ text: 'Hello, how are you?' }]
      },
      {
        role: 'model',
        parts: [{ text: 'I am doing well, thank you!' }]
      }
    ];

    const filtered = filterHistoryForRefine(history);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].parts[0].text).toBe('Hello, how are you?');
    expect(filtered[1].parts[0].text).toBe('I am doing well, thank you!');
  });

  it('should filter out messages with functionCall', () => {
    const history = [
      {
        role: 'user',
        parts: [{ text: 'Please read file.txt' }]
      },
      {
        role: 'model',
        parts: [
          { text: 'I will read the file for you.' },
          {
            functionCall: {
              name: 'read_file',
              args: { path: 'file.txt' }
            }
          }
        ]
      },
      {
        role: 'user',
        parts: [{ text: 'Thanks!' }]
      }
    ];

    const filtered = filterHistoryForRefine(history);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].parts[0].text).toBe('Please read file.txt');
    expect(filtered[1].parts[0].text).toBe('Thanks!');
  });

  it('should filter out messages with functionResponse', () => {
    const history = [
      {
        role: 'user',
        parts: [{ text: 'What is in the file?' }]
      },
      {
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: 'read_file',
              response: { output: 'File content here' }
            }
          }
        ]
      },
      {
        role: 'model',
        parts: [{ text: 'The file contains: File content here' }]
      }
    ];

    const filtered = filterHistoryForRefine(history);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].parts[0].text).toBe('What is in the file?');
    expect(filtered[1].parts[0].text).toBe('The file contains: File content here');
  });

  it('should filter out messages with empty text', () => {
    const history = [
      {
        role: 'user',
        parts: [{ text: '' }]
      },
      {
        role: 'user',
        parts: [{ text: '   ' }]
      },
      {
        role: 'user',
        parts: [{ text: 'Valid message' }]
      }
    ];

    const filtered = filterHistoryForRefine(history);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].parts[0].text).toBe('Valid message');
  });

  it('should handle messages without parts array', () => {
    const history = [
      { role: 'user' },
      { role: 'user', parts: null },
      { role: 'user', parts: [{ text: 'Valid' }] }
    ];

    const filtered = filterHistoryForRefine(history);
    // Messages without proper parts array are kept (returns true for non-array check)
    // But only the valid one has actual text content
    expect(filtered).toHaveLength(3);
  });

  it('should handle complex history with mixed content', () => {
    const history = [
      // User asks a question
      { role: 'user', parts: [{ text: 'Create a new file' }] },
      // Model responds with text and tool call
      {
        role: 'model',
        parts: [
          { text: 'Creating file...' },
          { functionCall: { name: 'write_file', args: { path: 'test.txt', content: 'hello' } } }
        ]
      },
      // Tool response
      {
        role: 'function',
        parts: [{ functionResponse: { name: 'write_file', response: { success: true } } }]
      },
      // Model confirms
      { role: 'model', parts: [{ text: 'File created successfully!' }] },
      // User thanks
      { role: 'user', parts: [{ text: 'Great, thanks!' }] }
    ];

    const filtered = filterHistoryForRefine(history);
    expect(filtered).toHaveLength(3);
    expect(filtered[0].parts[0].text).toBe('Create a new file');
    expect(filtered[1].parts[0].text).toBe('File created successfully!');
    expect(filtered[2].parts[0].text).toBe('Great, thanks!');
  });

  it('should handle OpenAI-style tool calls that caused the original error', () => {
    // This simulates the error case from the bug report:
    // "No tool output found for function call call_ZHIQ1haYXU84V1X2zaTU5VAw"
    const history = [
      { role: 'user', parts: [{ text: 'Help me with something' }] },
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              id: 'call_ZHIQ1haYXU84V1X2zaTU5VAw',
              name: 'some_tool',
              args: { param: 'value' }
            }
          }
        ]
      },
      // Missing functionResponse - this was causing the error!
      { role: 'user', parts: [{ text: 'Continue...' }] }
    ];

    const filtered = filterHistoryForRefine(history);
    // Should only keep text-only messages, filtering out the problematic tool call
    expect(filtered).toHaveLength(2);
    expect(filtered[0].parts[0].text).toBe('Help me with something');
    expect(filtered[1].parts[0].text).toBe('Continue...');
    // The tool call message should be filtered out, preventing the API error
  });
});
