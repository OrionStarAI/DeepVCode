/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  type Mocked,
} from 'vitest';
import * as fs from 'fs';

// MOCKS
let callCount = 0;
const mockResponses: any[] = [];

let mockGenerateJson: any;
let mockStartChat: any;
let mockSendMessageStream: any;

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    statSync: vi.fn(),
  };
});

vi.mock('../core/client.js', () => ({
  GeminiClient: vi.fn().mockImplementation(function (
    this: any,
    _config: Config,
  ) {
    this.generateJson = (...params: any[]) => mockGenerateJson(...params);
    this.startChat = (...params: any[]) => mockStartChat(...params);
    this.sendMessageStream = (...params: any[]) =>
      mockSendMessageStream(...params);
    this.getContentGenerator = vi.fn().mockReturnValue({
      generateContent: vi.fn().mockImplementation((...params: any[]) => mockGenerateJson(...params))
    });
    // Mock getCurrentModel to return a non-custom model so tests use the default path
    this.getCurrentModel = vi.fn().mockReturnValue('gemini-2.0-flash');
    // Mock getConfiguration to return a minimal config object
    this.getConfiguration = vi.fn().mockReturnValue({
      getCustomModelConfig: vi.fn().mockReturnValue(null),
    });
    return this;
  }),
}));
// END MOCKS

import {
  countOccurrences,
  ensureCorrectEdit,
  ensureCorrectFileContent,
  unescapeStringForGeminiBug,
  resetEditCorrectorCaches_TEST_ONLY,
} from './editCorrector.js';
import { GeminiClient } from '../core/client.js';
import type { Config } from '../config/config.js';
import { ToolRegistry } from '../tools/tool-registry.js';

vi.mock('../tools/tool-registry.js');

describe('editCorrector', () => {
  describe('countOccurrences', () => {
    it('should return 0 for empty string', () => {
      expect(countOccurrences('', 'a')).toBe(0);
    });
    it('should return 0 for empty substring', () => {
      expect(countOccurrences('abc', '')).toBe(0);
    });
    it('should return 0 if substring is not found', () => {
      expect(countOccurrences('abc', 'd')).toBe(0);
    });
    it('should return 1 if substring is found once', () => {
      expect(countOccurrences('abc', 'b')).toBe(1);
    });
    it('should return correct count for multiple occurrences', () => {
      expect(countOccurrences('ababa', 'a')).toBe(3);
      expect(countOccurrences('ababab', 'ab')).toBe(3);
    });
    it('should count non-overlapping occurrences', () => {
      expect(countOccurrences('aaaaa', 'aa')).toBe(2);
      expect(countOccurrences('ababab', 'aba')).toBe(1);
    });
    it('should correctly count occurrences when substring is longer', () => {
      expect(countOccurrences('abc', 'abcdef')).toBe(0);
    });
    it('should be case-sensitive', () => {
      expect(countOccurrences('abcABC', 'a')).toBe(1);
      expect(countOccurrences('abcABC', 'A')).toBe(1);
    });
  });

  describe('unescapeStringForGeminiBug', () => {
    it('should unescape common sequences', () => {
      expect(unescapeStringForGeminiBug('\\\\n')).toBe('\n');
      expect(unescapeStringForGeminiBug('\\\\t')).toBe('\t');
      expect(unescapeStringForGeminiBug("\\\\'")).toBe("'");
      expect(unescapeStringForGeminiBug('\\\\"')).toBe('"');
      expect(unescapeStringForGeminiBug('\\\\`')).toBe('`');
    });
    it('should handle multiple escaped sequences', () => {
      expect(unescapeStringForGeminiBug('Hello\\\\nWorld\\\\tTest')).toBe(
        'Hello\nWorld\tTest',
      );
    });
    it('should not alter already correct sequences', () => {
      expect(unescapeStringForGeminiBug('\n')).toBe('\n');
      expect(unescapeStringForGeminiBug('Correct string')).toBe(
        'Correct string',
      );
    });
    it('should handle mixed correct and incorrect sequences', () => {
      expect(unescapeStringForGeminiBug('\\\\nCorrect\t\\\\`')).toBe(
        '\nCorrect\t`',
      );
    });
    it('should handle backslash followed by actual newline character', () => {
      expect(unescapeStringForGeminiBug('\\\\\n')).toBe('\n');
      expect(unescapeStringForGeminiBug('First line\\\\\nSecond line')).toBe(
        'First line\nSecond line',
      );
    });
    it('should handle multiple backslashes before an escapable character (aggressive unescaping)', () => {
      expect(unescapeStringForGeminiBug('\\\\\\\\n')).toBe('\n');
      expect(unescapeStringForGeminiBug('\\\\\\\\\\\\t')).toBe('\t');
      expect(unescapeStringForGeminiBug('\\\\\\\\\\\\\\\\`')).toBe('`');
    });
    it('should return empty string for empty input', () => {
      expect(unescapeStringForGeminiBug('')).toBe('');
    });
    it('should not alter strings with no targeted escape sequences', () => {
      expect(unescapeStringForGeminiBug('abc def')).toBe('abc def');
      // Input: C:\Folder\File (two single backslashes - path separators, not escape sequences)
      // Output should be unchanged since \F and \F are not targeted escape sequences
      const pathInput = 'C:\\Folder\\File';
      expect(unescapeStringForGeminiBug(pathInput)).toBe(pathInput);
    });
    it('should correctly process strings with some targeted escapes', () => {
      // Input has \\n which gets unescaped to \n (newline)
      // C:\Users becomes C:\Users (unchanged), \name has \n which becomes newline + "ame"
      const input = 'C:\\Users\\name';
      const result = unescapeStringForGeminiBug(input);
      // \n in \\name gets unescaped to newline
      expect(result).toBe('C:\\Users\name');
    });
    it('should handle complex cases with mixed slashes and characters', () => {
      // This test has complex escape sequences
      const input = '\\\\\\nLine1\\\\nLine2\\tTab\\\\`Tick\\"';
      const expected = '\nLine1\nLine2\tTab`Tick"';
      expect(unescapeStringForGeminiBug(input)).toBe(expected);
    });
    it('should handle escaped backslashes', () => {
      // \\\\ (two literal backslashes) -> \\ (one literal backslash)
      expect(unescapeStringForGeminiBug('\\\\')).toBe('\\');
      // C:\\\\ + Users -> C:\\ + Users = C:\Users
      expect(unescapeStringForGeminiBug('C:\\\\Users')).toBe('C:\\Users');
      // path\\to\\file - \t becomes tab, \\f is not a target so stays
      expect(unescapeStringForGeminiBug('path\\\\to\\\\file')).toBe('path\to\\file');
    });
    it('should handle escaped backslashes mixed with other escapes (aggressive unescaping)', () => {
      // \\\\n -> \n (aggressive unescaping)
      expect(unescapeStringForGeminiBug('line1\\\\\\nline2')).toBe('line1\nline2');
      // \\\\" -> ", \\\\n -> \n
      expect(unescapeStringForGeminiBug('quote\\\\"text\\\\nline')).toBe('quote"text\nline');
    });
  });

  /**
   * 🔧 2026-01: 修正逻辑已全局禁用
   *
   * ensureCorrectEdit 和 ensureCorrectFileContent 现在直接返回原始参数/内容，
   * 不做任何反转义或 LLM 修正。以下测试验证这一新行为。
   */
  describe('ensureCorrectEdit (correction disabled)', () => {
    let mockGeminiClientInstance: Mocked<GeminiClient>;
    let mockToolRegistry: Mocked<ToolRegistry>;
    let mockConfigInstance: Config;
    const abortSignal = new AbortController().signal;

    beforeEach(() => {
      mockToolRegistry = new ToolRegistry({} as Config) as Mocked<ToolRegistry>;
      const configParams = {
        apiKey: 'test-api-key',
        model: 'test-model',
        sandbox: false as boolean | string,
        targetDir: '/test',
        debugMode: false,
        question: undefined as string | undefined,
        fullContext: false,
        coreTools: undefined as string[] | undefined,
        toolDiscoveryCommand: undefined as string | undefined,
        toolCallCommand: undefined as string | undefined,
        mcpServerCommand: undefined as string | undefined,
        mcpServers: undefined as Record<string, any> | undefined,
        userAgent: 'test-agent',
        userMemory: '',
        geminiMdFileCount: 0,
        alwaysSkipModificationConfirmation: false,
      };
      mockConfigInstance = {
        ...configParams,
        getApiKey: vi.fn(() => configParams.apiKey),
        getModel: vi.fn(() => configParams.model),
        getSandbox: vi.fn(() => configParams.sandbox),
        getTargetDir: vi.fn(() => configParams.targetDir),
        getToolRegistry: vi.fn(() => mockToolRegistry),
        getDebugMode: vi.fn(() => configParams.debugMode),
        getQuestion: vi.fn(() => configParams.question),
        getFullContext: vi.fn(() => configParams.fullContext),
        getCoreTools: vi.fn(() => configParams.coreTools),
        getToolDiscoveryCommand: vi.fn(() => configParams.toolDiscoveryCommand),
        getToolCallCommand: vi.fn(() => configParams.toolCallCommand),
        getMcpServerCommand: vi.fn(() => configParams.mcpServerCommand),
        getMcpServers: vi.fn(() => configParams.mcpServers),
        getUserAgent: vi.fn(() => configParams.userAgent),
        getUserMemory: vi.fn(() => configParams.userMemory),
        setUserMemory: vi.fn((mem: string) => {
          configParams.userMemory = mem;
        }),
        getGeminiMdFileCount: vi.fn(() => configParams.geminiMdFileCount),
        setGeminiMdFileCount: vi.fn((count: number) => {
          configParams.geminiMdFileCount = count;
        }),
        getAlwaysSkipModificationConfirmation: vi.fn(
          () => configParams.alwaysSkipModificationConfirmation,
        ),
        setAlwaysSkipModificationConfirmation: vi.fn((skip: boolean) => {
          configParams.alwaysSkipModificationConfirmation = skip;
        }),
        getQuotaErrorOccurred: vi.fn().mockReturnValue(false),
        setQuotaErrorOccurred: vi.fn(),
        getProjectSettingsManager: vi.fn().mockReturnValue({
          getSettings: vi.fn().mockReturnValue({ autoTrimTrailingSpaces: true })
        }),
      } as unknown as Config;

      callCount = 0;
      mockResponses.length = 0;
      mockGenerateJson = vi
        .fn()
        .mockImplementation((_params, _scene) => {
          const response = mockResponses[callCount];
          callCount++;
          if (response === undefined) return Promise.resolve({});
          return Promise.resolve(response);
        });
      mockStartChat = vi.fn();
      mockSendMessageStream = vi.fn();

      mockGeminiClientInstance = new GeminiClient(
        mockConfigInstance,
      ) as Mocked<GeminiClient>;
      mockGeminiClientInstance.getHistory = vi.fn().mockResolvedValue([]);
      resetEditCorrectorCaches_TEST_ONLY();
    });

    it('should return original params unchanged when old_string matches', async () => {
      const currentContent = 'This is a test string to find me.';
      const originalParams = {
        file_path: '/test/file.txt',
        old_string: 'find me',
        new_string: 'replace with this',
      };
      const result = await ensureCorrectEdit(
        '/test/file.txt',
        currentContent,
        originalParams,
        mockGeminiClientInstance,
        abortSignal,
      );
      // 🔧 修正已禁用：不调用 LLM
      expect(mockGenerateJson).toHaveBeenCalledTimes(0);
      // 返回原始参数
      expect(result.params.new_string).toBe('replace with this');
      expect(result.params.old_string).toBe('find me');
      expect(result.occurrences).toBe(1);
    });

    it('should return original params unchanged even when old_string does not match', async () => {
      const currentContent = 'This is a test string to find me.';
      const originalParams = {
        file_path: '/test/file.txt',
        old_string: 'not found',
        new_string: 'replace with this',
      };
      const result = await ensureCorrectEdit(
        '/test/file.txt',
        currentContent,
        originalParams,
        mockGeminiClientInstance,
        abortSignal,
      );
      // 🔧 修正已禁用：不尝试 LLM 修正
      expect(mockGenerateJson).toHaveBeenCalledTimes(0);
      // 返回原始参数，occurrences 为 0
      expect(result.params.new_string).toBe('replace with this');
      expect(result.params.old_string).toBe('not found');
      expect(result.occurrences).toBe(0);
    });

    it('should not unescape escaped strings - returns original params as-is', async () => {
      const currentContent = 'This is a test string with "quotes".';
      const originalParams = {
        file_path: '/test/file.txt',
        old_string: 'with \\"quotes\\"',  // 过度转义的字符串
        new_string: 'replace with \\"this\\"',
      };
      const result = await ensureCorrectEdit(
        '/test/file.txt',
        currentContent,
        originalParams,
        mockGeminiClientInstance,
        abortSignal,
      );
      // 🔧 修正已禁用：不做反转义
      expect(mockGenerateJson).toHaveBeenCalledTimes(0);
      // 返回原始参数（不匹配，因为不做反转义）
      expect(result.params.old_string).toBe('with \\"quotes\\"');
      expect(result.params.new_string).toBe('replace with \\"this\\"');
      expect(result.occurrences).toBe(0);  // 因为没有反转义，所以找不到
    });

    it('should correctly count occurrences for multiple matches', async () => {
      const currentContent = 'test test test';
      const originalParams = {
        file_path: '/test/file.txt',
        old_string: 'test',
        new_string: 'replaced',
      };
      const result = await ensureCorrectEdit(
        '/test/file.txt',
        currentContent,
        originalParams,
        mockGeminiClientInstance,
        abortSignal,
      );
      expect(result.params.old_string).toBe('test');
      expect(result.occurrences).toBe(3);
    });

    it('should handle empty old_string', async () => {
      const currentContent = 'some content';
      const originalParams = {
        file_path: '/test/file.txt',
        old_string: '',
        new_string: 'new content',
      };
      const result = await ensureCorrectEdit(
        '/test/file.txt',
        currentContent,
        originalParams,
        mockGeminiClientInstance,
        abortSignal,
      );
      expect(result.params.old_string).toBe('');
      expect(result.occurrences).toBe(0);
    });
  });

  describe('ensureCorrectFileContent (correction disabled)', () => {
    let mockGeminiClientInstance: Mocked<GeminiClient>;
    let mockToolRegistry: Mocked<ToolRegistry>;
    let mockConfigInstance: Config;
    const abortSignal = new AbortController().signal;

    beforeEach(() => {
      mockToolRegistry = new ToolRegistry({} as Config) as Mocked<ToolRegistry>;
      const configParams = {
        apiKey: 'test-api-key',
        model: 'test-model',
        sandbox: false as boolean | string,
        targetDir: '/test',
        debugMode: false,
        question: undefined as string | undefined,
        fullContext: false,
        coreTools: undefined as string[] | undefined,
        toolDiscoveryCommand: undefined as string | undefined,
        toolCallCommand: undefined as string | undefined,
        mcpServerCommand: undefined as string | undefined,
        mcpServers: undefined as Record<string, any> | undefined,
        userAgent: 'test-agent',
        userMemory: '',
        geminiMdFileCount: 0,
        alwaysSkipModificationConfirmation: false,
      };
      mockConfigInstance = {
        ...configParams,
        getApiKey: vi.fn(() => configParams.apiKey),
        getModel: vi.fn(() => configParams.model),
        getSandbox: vi.fn(() => configParams.sandbox),
        getTargetDir: vi.fn(() => configParams.targetDir),
        getToolRegistry: vi.fn(() => mockToolRegistry),
        getDebugMode: vi.fn(() => configParams.debugMode),
        getQuestion: vi.fn(() => configParams.question),
        getFullContext: vi.fn(() => configParams.fullContext),
        getCoreTools: vi.fn(() => configParams.coreTools),
        getToolDiscoveryCommand: vi.fn(() => configParams.toolDiscoveryCommand),
        getToolCallCommand: vi.fn(() => configParams.toolCallCommand),
        getMcpServerCommand: vi.fn(() => configParams.mcpServerCommand),
        getMcpServers: vi.fn(() => configParams.mcpServers),
        getUserAgent: vi.fn(() => configParams.userAgent),
        getUserMemory: vi.fn(() => configParams.userMemory),
        setUserMemory: vi.fn((mem: string) => {
          configParams.userMemory = mem;
        }),
        getGeminiMdFileCount: vi.fn(() => configParams.geminiMdFileCount),
        setGeminiMdFileCount: vi.fn((count: number) => {
          configParams.geminiMdFileCount = count;
        }),
        getAlwaysSkipModificationConfirmation: vi.fn(
          () => configParams.alwaysSkipModificationConfirmation,
        ),
        setAlwaysSkipModificationConfirmation: vi.fn((skip: boolean) => {
          configParams.alwaysSkipModificationConfirmation = skip;
        }),
        getQuotaErrorOccurred: vi.fn().mockReturnValue(false),
        setQuotaErrorOccurred: vi.fn(),
        getProjectSettingsManager: vi.fn().mockReturnValue({
          getSettings: vi.fn().mockReturnValue({ autoTrimTrailingSpaces: true })
        }),
      } as unknown as Config;

      callCount = 0;
      mockResponses.length = 0;
      mockGenerateJson = vi
        .fn()
        .mockImplementation((_params, _scene) => {
          const response = mockResponses[callCount];
          callCount++;
          if (response === undefined) return Promise.resolve({});
          return Promise.resolve(response);
        });
      mockStartChat = vi.fn();
      mockSendMessageStream = vi.fn();

      mockGeminiClientInstance = new GeminiClient(
        mockConfigInstance,
      ) as Mocked<GeminiClient>;
      resetEditCorrectorCaches_TEST_ONLY();
    });

    it('should return content unchanged - no correction applied', async () => {
      const content = 'This is normal content without escaping issues';
      const result = await ensureCorrectFileContent(
        content,
        mockGeminiClientInstance,
        abortSignal,
      );
      expect(result).toBe(content);
      expect(mockGenerateJson).toHaveBeenCalledTimes(0);
    });

    it('should return potentially escaped content unchanged - no correction applied', async () => {
      const content = 'console.log(\\"Hello World\\");';
      const result = await ensureCorrectFileContent(
        content,
        mockGeminiClientInstance,
        abortSignal,
      );
      // 🔧 修正已禁用：直接返回原始内容，不做反转义
      expect(result).toBe(content);
      expect(mockGenerateJson).toHaveBeenCalledTimes(0);
    });

    it('should return content with escape sequences unchanged', async () => {
      const content = 'const message = \\"Hello\\\\nWorld\\";';
      const result = await ensureCorrectFileContent(
        content,
        mockGeminiClientInstance,
        abortSignal,
      );
      // 🔧 修正已禁用：直接返回原始内容
      expect(result).toBe(content);
      expect(mockGenerateJson).toHaveBeenCalledTimes(0);
    });

    it('should handle various escape sequences without correction', async () => {
      const content =
        'const obj = { name: \\"John\\", age: 30, bio: \\"Developer\\\\nEngineer\\" };';
      const result = await ensureCorrectFileContent(
        content,
        mockGeminiClientInstance,
        abortSignal,
      );
      // 🔧 修正已禁用：直接返回原始内容
      expect(result).toBe(content);
      expect(mockGenerateJson).toHaveBeenCalledTimes(0);
    });
  });
});
