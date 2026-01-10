/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReadLintsTool, ReadLintsParams, LintDiagnostic } from './read-lints.js';
import { Config } from '../config/config.js';

describe('ReadLintsTool', () => {
  let tool: ReadLintsTool;
  let mockConfigInstance: Config;

  beforeEach(() => {
    mockConfigInstance = {
      getProjectRoot: () => '/test/project',
    } as unknown as Config;

    tool = new ReadLintsTool(mockConfigInstance);
  });

  it('should have correct name and description', () => {
    expect(tool.name).toBe('read_lints');
    expect(tool.displayName).toBe('ReadLints');
    expect(tool.description).toContain('Read and display linter errors');
  });

  it('should validate parameters correctly', () => {
    const validParams: ReadLintsParams = {};
    expect(tool.validateToolParams(validParams)).toBeNull();

    const validParamsWithPaths: ReadLintsParams = {
      paths: ['src/test.ts', 'src/components/']
    };
    expect(tool.validateToolParams(validParamsWithPaths)).toBeNull();

    const invalidParams = {
      paths: ['', '  ']
    } as ReadLintsParams;
    expect(tool.validateToolParams(invalidParams)).toContain('non-empty strings');
  });

  it('should return error when callback not set', async () => {
    // Ensure no callback is set
    ReadLintsTool.setCallback(null as any);

    const params: ReadLintsParams = {};
    const signal = new AbortController().signal;

    const result = await tool.execute(params, signal);

    expect(result.llmContent).toContain('ReadLints callback not initialized');
    expect(result.returnDisplay).toContain('This tool requires VSCode extension integration');
  });

  it('should execute callback when set', async () => {
    const mockDiagnostics: LintDiagnostic[] = [
      {
        file: 'src/test.ts',
        line: 10,
        column: 5,
        severity: 'error',
        message: 'Expected semicolon',
        source: 'eslint',
        code: 'semi'
      },
      {
        file: 'src/test.ts',
        line: 15,
        column: 12,
        severity: 'warning',
        message: 'Unused variable',
        source: 'typescript',
        code: '6133'
      }
    ];

    const mockCallback = vi.fn().mockResolvedValue(mockDiagnostics);
    ReadLintsTool.setCallback(mockCallback);

    const params: ReadLintsParams = {
      paths: ['src/test.ts']
    };
    const signal = new AbortController().signal;

    const result = await tool.execute(params, signal);

    expect(mockCallback).toHaveBeenCalledWith(['src/test.ts']);
    expect(result.llmContent).toContain('src/test.ts');
    expect(result.llmContent).toContain('Expected semicolon');
    expect(result.llmContent).toContain('Unused variable');
    expect(result.summary).toContain('1 errors, 1 warnings');
  });

  it('should handle no diagnostics found', async () => {
    const mockCallback = vi.fn().mockResolvedValue([]);
    ReadLintsTool.setCallback(mockCallback);

    const params: ReadLintsParams = {};
    const signal = new AbortController().signal;

    const result = await tool.execute(params, signal);

    expect(result.llmContent).toContain('No linter errors found');
    expect(result.summary).toContain('No linter errors found');
  });

  it('should handle callback errors gracefully', async () => {
    const mockCallback = vi.fn().mockRejectedValue(new Error('VSCode API error'));
    ReadLintsTool.setCallback(mockCallback);

    const params: ReadLintsParams = {};
    const signal = new AbortController().signal;

    const result = await tool.execute(params, signal);

    expect(result.llmContent).toContain('Error reading linter diagnostics');
    expect(result.returnDisplay).toContain('Operation failed');
  });

  it('should generate correct description', () => {
    const paramsWithPaths: ReadLintsParams = {
      paths: ['src/file1.ts', 'src/file2.ts']
    };
    expect(tool.getDescription(paramsWithPaths)).toBe('Read linter diagnostics for 2 specified paths');

    const paramsWithSinglePath: ReadLintsParams = {
      paths: ['src/file.ts']
    };
    expect(tool.getDescription(paramsWithSinglePath)).toBe('Read linter diagnostics for 1 specified path');

    const paramsWithoutPaths: ReadLintsParams = {};
    expect(tool.getDescription(paramsWithoutPaths)).toBe('Read linter diagnostics for all files in workspace');
  });
});