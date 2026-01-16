/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

import { LSTool, LSToolParams, FileEntry } from './ls.js';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { Config, DEFAULT_FILE_FILTERING_OPTIONS } from '../config/config.js';

describe('LSTool', () => {
  let tempRootDir: string;
  let lsTool: LSTool;
  const abortSignal = new AbortController().signal;

  // Mock config for testing
  let mockConfig: Config;

  beforeEach(async () => {
    // Create a unique root directory for each test run
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ls-tool-root-'));

    // Create mock config
    mockConfig = {
      getFileService: () => new FileDiscoveryService(tempRootDir),
      getFileFilteringOptions: () => DEFAULT_FILE_FILTERING_OPTIONS,
      getTargetDir: () => tempRootDir,
    } as unknown as Config;

    lsTool = new LSTool(mockConfig);

    // Create test directory structure
    // Top-level files
    await fs.writeFile(path.join(tempRootDir, 'file1.txt'), 'content1');
    await fs.writeFile(path.join(tempRootDir, 'file2.md'), 'content2');
    await fs.writeFile(path.join(tempRootDir, 'script.js'), 'console.log("hello")');

    // Subdirectories
    await fs.mkdir(path.join(tempRootDir, 'src'));
    await fs.mkdir(path.join(tempRootDir, 'docs'));
    await fs.mkdir(path.join(tempRootDir, 'empty_dir'));

    // Files in subdirectories
    await fs.writeFile(path.join(tempRootDir, 'src', 'index.ts'), 'export {}');
    await fs.writeFile(path.join(tempRootDir, 'docs', 'README.md'), '# Docs');
  });

  afterEach(async () => {
    // Clean up the temporary root directory
    await fs.rm(tempRootDir, { recursive: true, force: true });
  });

  describe('validateToolParams', () => {
    it('should return null for valid params with absolute path', () => {
      const params: LSToolParams = { path: tempRootDir };
      expect(lsTool.validateToolParams(params)).toBeNull();
    });

    it('should return error for relative path', () => {
      const params: LSToolParams = { path: 'relative/path' };
      expect(lsTool.validateToolParams(params)).toContain('Path must be absolute');
    });

    it('should return error for path outside root directory', () => {
      const params: LSToolParams = { path: '/some/other/path' };
      expect(lsTool.validateToolParams(params)).toContain('Path must be within the root directory');
    });

    it('should return error when params is not an object', () => {
      const params = 'invalid string params' as unknown as LSToolParams;
      const error = lsTool.validateToolParams(params);
      expect(error).toContain('params must be an object');
      expect(error).toContain('list_directory');
      expect(error).toContain('CORRECT FORMAT');
    });

    it('should return error when params is null', () => {
      const params = null as unknown as LSToolParams;
      const error = lsTool.validateToolParams(params);
      expect(error).toContain('params must be an object');
      expect(error).toContain('null');
    });

    it('should accept valid params with ignore patterns', () => {
      const params: LSToolParams = {
        path: tempRootDir,
        ignore: ['*.txt', 'node_modules'],
      };
      expect(lsTool.validateToolParams(params)).toBeNull();
    });

    it('should accept valid params with file_filtering_options', () => {
      const params: LSToolParams = {
        path: tempRootDir,
        file_filtering_options: {
          respect_git_ignore: false,
          respect_gemini_ignore: true,
        },
      };
      expect(lsTool.validateToolParams(params)).toBeNull();
    });
  });

  describe('execute', () => {
    it('should list files and directories in the root directory', async () => {
      const params: LSToolParams = { path: tempRootDir };
      const result = await lsTool.execute(params, abortSignal);

      expect(result.llmContent).toContain('Directory listing for');
      expect(result.llmContent).toContain('[DIR] docs');
      expect(result.llmContent).toContain('[DIR] empty_dir');
      expect(result.llmContent).toContain('[DIR] src');
      expect(result.llmContent).toContain('file1.txt');
      expect(result.llmContent).toContain('file2.md');
      expect(result.llmContent).toContain('script.js');
      expect(result.returnDisplay).toContain('Listed');
      expect(result.returnDisplay).toContain('item(s)');
    });

    it('should list files in a subdirectory', async () => {
      const params: LSToolParams = { path: path.join(tempRootDir, 'src') };
      const result = await lsTool.execute(params, abortSignal);

      expect(result.llmContent).toContain('index.ts');
      expect(result.returnDisplay).toBe('Listed 1 item(s).');
    });

    it('should return message for empty directory', async () => {
      const params: LSToolParams = { path: path.join(tempRootDir, 'empty_dir') };
      const result = await lsTool.execute(params, abortSignal);

      expect(result.llmContent).toContain('is empty');
      expect(result.returnDisplay).toContain('empty');
    });

    it('should ignore files matching ignore patterns', async () => {
      const params: LSToolParams = {
        path: tempRootDir,
        ignore: ['*.txt', '*.md'],
      };
      const result = await lsTool.execute(params, abortSignal);

      expect(result.llmContent).not.toContain('file1.txt');
      expect(result.llmContent).not.toContain('file2.md');
      expect(result.llmContent).toContain('script.js');
      expect(result.llmContent).toContain('[DIR] src');
    });

    it('should return error for non-existent directory', async () => {
      const params: LSToolParams = { path: path.join(tempRootDir, 'nonexistent') };
      const result = await lsTool.execute(params, abortSignal);

      expect(result.llmContent).toContain('Error');
      expect(result.returnDisplay).toContain('Error');
    });

    it('should return error when path is a file, not a directory', async () => {
      const params: LSToolParams = { path: path.join(tempRootDir, 'file1.txt') };
      const result = await lsTool.execute(params, abortSignal);

      expect(result.llmContent).toContain('not a directory');
      expect(result.returnDisplay).toContain('not a directory');
    });

    it('should sort directories before files', async () => {
      const params: LSToolParams = { path: tempRootDir };
      const result = await lsTool.execute(params, abortSignal);

      const content = result.llmContent as string;
      const lines = content.split('\n');

      // Find first directory and first file positions
      let firstDirIndex = -1;
      let firstFileIndex = -1;

      lines.forEach((line, index) => {
        if (line.includes('[DIR]') && firstDirIndex === -1) {
          firstDirIndex = index;
        }
        if (!line.includes('[DIR]') && !line.includes('Directory listing') && line.trim() && firstFileIndex === -1) {
          firstFileIndex = index;
        }
      });

      // Directories should come before files (excluding header line)
      expect(firstDirIndex).toBeLessThan(firstFileIndex);
    });

    it('should return validation error message for invalid params', async () => {
      const params: LSToolParams = { path: 'relative/path' };
      const result = await lsTool.execute(params, abortSignal);

      expect(result.llmContent).toContain('Error');
      expect(result.llmContent).toContain('Invalid parameters');
      expect(result.llmContent).toContain('Path must be absolute');
    });
  });

  describe('getDescription', () => {
    it('should return shortened path description', () => {
      const params: LSToolParams = { path: tempRootDir };
      const description = lsTool.getDescription(params);

      expect(typeof description).toBe('string');
      expect(description.length).toBeGreaterThan(0);
    });
  });
});
