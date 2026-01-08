/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { handleAtCommand } from './atCommandProcessor.js';
import {
  Config,
  FileDiscoveryService,
  GlobTool,
  ReadManyFilesTool,
  ToolRegistry,
} from 'deepv-code-core';
import * as os from 'os';
import { ToolCallStatus } from '../types.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

describe('handleAtCommand', () => {
  let testRootDir: string;
  let mockConfig: Config;

  const mockAddItem: Mock<UseHistoryManagerReturn['addItem']> = vi.fn();
  const mockOnDebugMessage: Mock<(message: string) => void> = vi.fn();

  let abortController: AbortController;

  async function createTestFile(fullPath: string, fileContents: string) {
    await fsPromises.mkdir(path.dirname(fullPath), { recursive: true });
    await fsPromises.writeFile(fullPath, fileContents);
    return path.resolve(testRootDir, fullPath);
  }

  beforeEach(async () => {
    vi.resetAllMocks();

    testRootDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), 'folder-structure-test-'),
    );

    abortController = new AbortController();

    const getToolRegistry = vi.fn();

    mockConfig = {
      getToolRegistry,
      getTargetDir: () => testRootDir,
      isSandboxed: () => false,
      getFileService: () => new FileDiscoveryService(testRootDir),
      getFileFilteringRespectGitIgnore: () => true,
      getFileFilteringRespectGeminiIgnore: () => true,
      getFileFilteringOptions: () => ({
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      }),
      getEnableRecursiveFileSearch: vi.fn(() => true),
      getProjectSettingsManager: vi.fn().mockReturnValue({
        getConfigDirPath: vi.fn().mockReturnValue(path.join(testRootDir, '.deepv')),
      }),
    } as unknown as Config;

    const registry = new ToolRegistry(mockConfig);
    registry.registerTool(new ReadManyFilesTool(mockConfig));
    registry.registerTool(new GlobTool(mockConfig));
    getToolRegistry.mockReturnValue(registry);
  });

  afterEach(async () => {
    abortController.abort();
    await fsPromises.rm(testRootDir, { recursive: true, force: true });
  });

  it('should pass through query if no @ command is present', async () => {
    const query = 'regular user query';

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 123,
      signal: abortController.signal,
    });

    expect(result).toEqual({
      processedQuery: [{ text: query }],
      shouldProceed: true,
    });
    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: query },
      123,
    );
  });

  it('should pass through original query if only a lone @ symbol is present', async () => {
    const queryWithSpaces = '  @  ';

    const result = await handleAtCommand({
      query: queryWithSpaces,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 124,
      signal: abortController.signal,
    });

    expect(result).toEqual({
      processedQuery: [{ text: queryWithSpaces }], // code returns original query for lone @
      shouldProceed: true,
    });
    expect(mockAddItem).toHaveBeenCalledWith(
      { type: 'user', text: queryWithSpaces },
      124,
    );
    expect(mockOnDebugMessage).toHaveBeenCalledWith(
      'Lone @ detected, will be treated as text in the modified query.',
    );
  });

  it('should process a valid text file path', async () => {
    const fileContent = 'This is the file content.';
    const filePath = await createTestFile(
      path.join(testRootDir, 'path', 'to', 'file.txt'),
      fileContent,
    );
    const query = `@${filePath}`;

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 125,
      signal: abortController.signal,
    });

    expect(result.shouldProceed).toBe(true);
    expect(result.processedQuery![0]).toEqual({ text: `@${filePath}` });
    expect(result.processedQuery).toContainEqual({ text: '\n--- Content from referenced files ---' });
    expect(result.processedQuery).toContainEqual({ text: `\nContent from @${filePath}:\n` });
    expect(result.processedQuery).toContainEqual({ text: fileContent });
  });

  it('should skip directory path and provide feedback', async () => {
    const fileContent = 'This is the file content.';
    const filePath = await createTestFile(
      path.join(testRootDir, 'path', 'to', 'file.txt'),
      fileContent,
    );
    const dirPath = path.dirname(filePath);
    const query = `@${dirPath}`;

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 126,
      signal: abortController.signal,
    });

    expect(result.shouldProceed).toBe(true);
    expect(result.processedQuery).toEqual([{ text: query }]);
    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'info', text: expect.stringContaining('Skipped directories') }),
      126,
    );
  });

  it('should handle query with text before and after @command', async () => {
    const fileContent = 'Markdown content.';
    const filePath = await createTestFile(
      path.join(testRootDir, 'doc.md'),
      fileContent,
    );
    const textBefore = 'Explain this: ';
    const textAfter = ' in detail.';
    const query = `${textBefore}@${filePath}${textAfter}`;

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 128,
      signal: abortController.signal,
    });

    expect(result.shouldProceed).toBe(true);
    expect(result.processedQuery![0]).toEqual({ text: `${textBefore}@${filePath}${textAfter}`.trim() });
    expect(result.processedQuery).toContainEqual({ text: `\nContent from @${filePath}:\n` });
  });

  it('should correctly unescape paths with escaped spaces', async () => {
    const fileContent = 'This is the file content.';
    const filePath = await createTestFile(
      path.join(testRootDir, 'path', 'to', 'my file.txt'),
      fileContent,
    );
    const escapedpath = path.join(testRootDir, 'path', 'to', 'my\\ file.txt');
    const query = `@${escapedpath}`;

    const result = await handleAtCommand({
      query,
      config: mockConfig,
      addItem: mockAddItem,
      onDebugMessage: mockOnDebugMessage,
      messageId: 125,
      signal: abortController.signal,
    });

    expect(result.shouldProceed).toBe(true);
    expect(result.processedQuery![0]).toEqual({ text: `@${filePath}` });
  });

  describe('git-aware filtering', () => {
    beforeEach(async () => {
      await fsPromises.mkdir(path.join(testRootDir, '.git'), {
        recursive: true,
      });
    });

    it('should skip git-ignored files in @ commands', async () => {
      await createTestFile(
        path.join(testRootDir, '.gitignore'),
        'node_modules/',
      );
      const gitIgnoredFile = await createTestFile(
        path.join(testRootDir, 'node_modules', 'package.json'),
        'the file contents',
      );

      const query = `@${gitIgnoredFile}`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 200,
        signal: abortController.signal,
      });

      expect(result.shouldProceed).toBe(true);
      expect(result.processedQuery).toEqual([{ text: query }]);
    });

    it('should always ignore .git directory files', async () => {
      const gitFile = await createTestFile(
        path.join(testRootDir, '.git', 'config'),
        '[core]\n\trepositoryformatversion = 0\n',
      );
      const query = `@${gitFile}`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 203,
        signal: abortController.signal,
      });

      expect(result.shouldProceed).toBe(true);
      expect(result.processedQuery).toEqual([{ text: query }]);
    });
  });

  describe('gemini-ignore filtering', () => {
    it('should skip gemini-ignored files in @ commands', async () => {
      await createTestFile(
        path.join(testRootDir, '.deepvignore'),
        'build/output.js',
      );
      const geminiIgnoredFile = await createTestFile(
        path.join(testRootDir, 'build', 'output.js'),
        'console.log("Hello");',
      );
      const query = `@${geminiIgnoredFile}`;

      const result = await handleAtCommand({
        query,
        config: mockConfig,
        addItem: mockAddItem,
        onDebugMessage: mockOnDebugMessage,
        messageId: 204,
        signal: abortController.signal,
      });

      expect(result.shouldProceed).toBe(true);
      expect(result.processedQuery).toEqual([{ text: query }]);
    });
  });
});