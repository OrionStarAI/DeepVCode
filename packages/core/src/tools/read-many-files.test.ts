/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReadManyFilesTool } from './read-many-files.js';
import path from 'path';
import fsp from 'fs/promises';
import fs from 'fs';
import os from 'os';
import { Config } from '../config/config.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { type PartListUnion } from '@google/genai';

describe('ReadManyFilesTool', () => {
  let tempRootDir: string;
  let tool: ReadManyFilesTool;
  const abortSignal = new AbortController().signal;

  beforeEach(async () => {
    tempRootDir = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'read-many-files-root-'),
    );

    const mockConfigInstance = {
      getFileService: () => new FileDiscoveryService(tempRootDir),
      getTargetDir: () => tempRootDir,
      getUsageStatisticsEnabled: () => false,
      getFileFilteringOptions: () => ({
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      }),
    } as unknown as Config;
    tool = new ReadManyFilesTool(mockConfigInstance);
  });

  afterEach(async () => {
    if (fs.existsSync(tempRootDir)) {
      await fsp.rm(tempRootDir, { recursive: true, force: true });
    }
  });

  async function createTestFile(filePath: string, content: string) {
    const fullPath = path.join(tempRootDir, filePath);
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, content, 'utf-8');
    return fullPath;
  }

  async function createBinaryFile(filePath: string, content: Buffer) {
    const fullPath = path.join(tempRootDir, filePath);
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, content);
    return fullPath;
  }

  describe('execute', () => {
    it('should read multiple text files', async () => {
      const path1 = await createTestFile('file1.txt', 'content1');
      const path2 = await createTestFile('file2.txt', 'content2');

      const params = { paths: ['*.txt'] };
      const result = await tool.execute(params, abortSignal);

      expect(Array.isArray(result.llmContent)).toBe(true);
      expect((result.llmContent as any[]).length).toBe(2);
      expect((result.llmContent as any[])[0]).toContain('file1.txt');
      expect((result.llmContent as any[])[0]).toContain('content1');
      expect((result.llmContent as any[])[1]).toContain('file2.txt');
      expect((result.llmContent as any[])[1]).toContain('content2');
      expect(result.returnDisplay).toContain('Successfully read');
      expect(result.returnDisplay).toContain('2 file(s)');
    });

    it('should handle binary files by including a skip message in content', async () => {
      await createBinaryFile('app.exe', Buffer.from([0, 1, 2]));
      await createTestFile('notes.txt', 'some notes');

      const params = { paths: ['*'], useDefaultExcludes: false };
      const result = await tool.execute(params, abortSignal);

      expect(Array.isArray(result.llmContent)).toBe(true);
      expect((result.llmContent as any[]).length).toBe(2);
      expect((result.llmContent as any[]).some((c: any) => c.includes('notes.txt'))).toBe(true);
      expect((result.llmContent as any[]).some((c: any) => c.includes('Cannot display content of binary file'))).toBe(true);
      expect(result.returnDisplay).toContain('2 file(s)');
    });

    it('should respect glob patterns in paths', async () => {
      await createTestFile('src/main.ts', 'main code');
      await createTestFile('src/utils.ts', 'utils code');
      await createTestFile('tests/test.ts', 'test code');

      const params = { paths: ['src/**/*.ts'] };
      const result = await tool.execute(params, abortSignal);

      expect(Array.isArray(result.llmContent)).toBe(true);
      expect((result.llmContent as any[]).length).toBe(2);
      expect(result.returnDisplay).toContain('2 file(s)');
      expect(result.returnDisplay).toContain('main.ts');
      expect(result.returnDisplay).toContain('utils.ts');
      expect(result.returnDisplay).not.toContain('test.ts');
    });

    it('should handle exclude patterns', async () => {
      await createTestFile('file1.ts', 'content1');
      await createTestFile('file2.test.ts', 'content2');

      const params = { paths: ['*.ts'], exclude: ['*.test.ts'] };
      const result = await tool.execute(params, abortSignal);

      expect(Array.isArray(result.llmContent)).toBe(true);
      expect((result.llmContent as any[]).length).toBe(1);
      expect((result.llmContent as any[])[0]).toContain('file1.ts');
      expect(result.returnDisplay).not.toContain('file2.test.ts');
    });

    it('should handle no matches found', async () => {
      const params = { paths: ['*.nonexistent'] };
      const result = await tool.execute(params, abortSignal);

      expect(result.llmContent).toEqual([
        'No files matching the criteria were found or all were skipped.',
      ] as unknown as PartListUnion);
      expect(result.returnDisplay).toContain('No files were read');
    });

    it('should return error if search pattern is empty', async () => {
      const params = { paths: [] };
      const result = await tool.execute(params, abortSignal);
      expect(result.llmContent).toContain('Error: Invalid parameters');
    });

    describe('with .deepvignore', () => {
      beforeEach(async () => {
        await fsp.writeFile(
          path.join(tempRootDir, '.deepvignore'),
          ['foo.bar', 'baz/'].join('\n'),
        );
      });

      it('should return error if path is ignored by a .deepvignore pattern', async () => {
        await createTestFile('foo.bar', 'content');
        await createTestFile('bar.ts', 'content');
        await createTestFile('foo.quux', 'content');

        const params = { paths: ['foo.bar', 'bar.ts', 'foo.quux'] };
        const result = await tool.execute(params, abortSignal);

        // It should skip ignored files
        expect(result.returnDisplay).not.toContain('foo.bar');
        expect(result.returnDisplay).toContain('bar.ts');
        expect(result.returnDisplay).toContain('gemini ignored');
      });
    });
  });
});
