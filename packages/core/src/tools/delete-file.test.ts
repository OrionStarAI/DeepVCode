/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DeleteFileTool, DeleteFileToolParams } from './delete-file.js';
import { Config, ApprovalMode } from '../config/config.js';
import { ToolRegistry } from './tool-registry.js';

// Mock dependencies
vi.mock('../telemetry/metrics.js', () => ({
  recordFileOperationMetric: vi.fn(),
  FileOperation: {
    DELETE: 'delete',
  },
}));

// 使用 vi.mock 模拟 node:fs，但保留绝大部分真实功能
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
    unlinkSync: vi.fn(actual.unlinkSync),
  };
});

const rootDir = path.resolve(os.tmpdir(), 'delete-tool-test-root');

// Mock Config
const mockConfigInternal = {
  getTargetDir: () => rootDir,
  getApprovalMode: vi.fn(() => ApprovalMode.DEFAULT),
  setApprovalMode: vi.fn(),
  getApiKey: () => 'test-key',
  getModel: () => 'test-model',
  getSandbox: () => false,
  getDebugMode: () => false,
  getQuestion: () => undefined,
  getFullContext: () => false,
  getToolDiscoveryCommand: () => undefined,
  getToolCallCommand: () => undefined,
  getMcpServerCommand: () => undefined,
  getMcpServers: () => undefined,
  getUserAgent: () => 'test-agent',
  getUserMemory: () => '',
  setUserMemory: vi.fn(),
  getGeminiMdFileCount: () => 0,
  setGeminiMdFileCount: vi.fn(),
  getToolRegistry: () =>
    ({
      registerTool: vi.fn(),
      discoverTools: vi.fn(),
    }) as unknown as ToolRegistry,
};
const mockConfig = mockConfigInternal as unknown as Config;

describe('DeleteFileTool', () => {
  let tool: DeleteFileTool;
  let tempDir: string;
  let testFilePath: string;
  const testFileContent = 'Hello, World!\nThis is a test file.\n';

  beforeEach(() => {
    vi.clearAllMocks();
    tool = new DeleteFileTool(mockConfig);

    // Create a temporary directory for testing
    tempDir = rootDir;
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    testFilePath = path.join(tempDir, 'test-file.txt');
  });

  afterEach(() => {
    // Clean up test files and directory
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn('Failed to clean up test directory:', error);
    }
  });

  describe('validateToolParams', () => {
    it('should return null for valid parameters', () => {
      // Create test file
      fs.writeFileSync(testFilePath, testFileContent);

      const params: DeleteFileToolParams = {
        file_path: testFilePath,
      };

      const result = tool.validateToolParams(params);
      expect(result).toBeNull();
    });

    it('should return error for relative path', () => {
      const params: DeleteFileToolParams = {
        file_path: 'relative/path.txt',
      };

      const result = tool.validateToolParams(params);
      expect(result).toContain('File path must be absolute');
    });

    it('should return error for non-existent file', () => {
      const params: DeleteFileToolParams = {
        file_path: path.join(tempDir, 'non-existent.txt'),
      };

      const result = tool.validateToolParams(params);
      expect(result).toContain('File does not exist');
    });

    it('should return error for directory path', () => {
      const dirPath = path.join(tempDir, 'test-dir');
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath);
      }

      const params: DeleteFileToolParams = {
        file_path: dirPath,
      };

      const result = tool.validateToolParams(params);
      expect(result).toContain('Path is a directory');
    });

    it('should return error for file outside target directory', () => {
      const outsidePath = path.join(os.tmpdir(), 'outside-file.txt');

      const params: DeleteFileToolParams = {
        file_path: outsidePath,
      };

      const result = tool.validateToolParams(params);
      expect(result).toContain('File path must be within the root directory');
    });
  });

  describe('getDescription', () => {
    it('should return descriptive text with file path', () => {
      const params: DeleteFileToolParams = {
        file_path: testFilePath,
        reason: 'cleanup',
      };

      const description = tool.getDescription(params);
      expect(description).toContain('test-file.txt');
      expect(description).toContain('cleanup');
    });

    it('should handle missing file_path gracefully', () => {
      const params = {} as DeleteFileToolParams;

      const description = tool.getDescription(params);
      expect(description).toContain('Model did not provide valid parameters');
    });
  });

  describe('execute', () => {
    it('should successfully delete existing file and preserve content', async () => {
      // Create test file
      fs.writeFileSync(testFilePath, testFileContent);
      expect(fs.existsSync(testFilePath)).toBe(true);

      const params: DeleteFileToolParams = {
        file_path: testFilePath,
        reason: 'test deletion',
      };

      const abortSignal = new AbortController().signal;
      const result = await tool.execute(params, abortSignal);

      // File should be deleted
      expect(fs.existsSync(testFilePath)).toBe(false);

      // Result should show deletion confirmation
      expect(result.llmContent).toContain('Successfully deleted file');
      expect(result.llmContent).toContain('test deletion');
      expect(result.returnDisplay).toBe('File deleted: test-file.txt');
    });

    it('should return error for invalid parameters', async () => {
      const params: DeleteFileToolParams = {
        file_path: 'relative-path.txt',
      };

      const abortSignal = new AbortController().signal;
      const result = await tool.execute(params, abortSignal);

      expect(result.llmContent).toContain('Error: Invalid parameters');
      expect(result.returnDisplay).toContain('Error');
    });

    it('should handle read error before deletion', async () => {
      // Create test file
      fs.writeFileSync(testFilePath, testFileContent);

      // 模拟 fs.readFileSync 抛出错误
      vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
        throw new Error('Permission denied');
      });

      const params: DeleteFileToolParams = {
        file_path: testFilePath,
      };

      const abortSignal = new AbortController().signal;
      const result = await tool.execute(params, abortSignal);

      expect(result.llmContent).toContain('Error reading file before deletion');
    });

    it('should handle deletion error while preserving content', async () => {
      // Create test file
      fs.writeFileSync(testFilePath, testFileContent);

      // 模拟 fs.unlinkSync 抛出错误
      vi.mocked(fs.unlinkSync).mockImplementationOnce(() => {
        throw new Error('Permission denied for deletion');
      });

      const params: DeleteFileToolParams = {
        file_path: testFilePath,
      };

      const abortSignal = new AbortController().signal;
      const result = await tool.execute(params, abortSignal);

      expect(result.llmContent).toContain('Error deleting file');
      expect(result.returnDisplay).toContain('Error deleting file');
    });
  });

  describe('toolLocations', () => {
    it('should return the file path as location', () => {
      const params: DeleteFileToolParams = {
        file_path: testFilePath,
      };

      const locations = tool.toolLocations(params);
      expect(locations).toHaveLength(1);
      expect(locations[0].path).toBe(testFilePath);
    });
  });

  describe('shouldConfirmExecute', () => {
    it('should return confirmation details for valid file', async () => {
      // Create test file
      fs.writeFileSync(testFilePath, testFileContent);

      const params: DeleteFileToolParams = {
        file_path: testFilePath,
        reason: 'test confirmation',
      };

      const abortSignal = new AbortController().signal;
      const result = await tool.shouldConfirmExecute(params, abortSignal);

      expect(result).toBeTruthy();
      if (result) {
        expect(result.type).toBe('delete');
        expect(result.title).toContain('Confirm Delete');
        expect((result as any).fileName).toBe('test-file.txt');
        expect((result as any).filePath).toBe(testFilePath);
        expect((result as any).fileContent).toBe(testFileContent);
        expect((result as any).reason).toBe('test confirmation');
      }
    });

    it('should return false for invalid parameters', async () => {
      const params: DeleteFileToolParams = {
        file_path: 'invalid-relative-path.txt',
      };

      const abortSignal = new AbortController().signal;
      const result = await tool.shouldConfirmExecute(params, abortSignal);

      expect(result).toBe(false);
    });
  });
});
