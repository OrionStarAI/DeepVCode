/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isCodeFile, formatLintResults, formatLintStatus, performAutoLintCheck } from './autoLintChecker.js';
import { ReadLintsTool, LintDiagnostic } from '../read-lints.js';
import { Config } from '../../config/config.js';

describe('autoLintChecker', () => {
  describe('isCodeFile', () => {
    it('should identify TypeScript files as code files', () => {
      expect(isCodeFile('test.ts')).toBe(true);
      expect(isCodeFile('test.tsx')).toBe(true);
    });

    it('should identify JavaScript files as code files', () => {
      expect(isCodeFile('test.js')).toBe(true);
      expect(isCodeFile('test.jsx')).toBe(true);
    });

    it('should identify other code files', () => {
      expect(isCodeFile('test.py')).toBe(true);
      expect(isCodeFile('test.css')).toBe(true);
      expect(isCodeFile('test.json')).toBe(true);
    });

    it('should not identify non-code files', () => {
      expect(isCodeFile('test.txt')).toBe(false);
      expect(isCodeFile('test.md')).toBe(false);
      expect(isCodeFile('test.png')).toBe(false);
    });
  });

  describe('formatLintResults', () => {
    it('should format no errors correctly', () => {
      const result = formatLintResults([], 'test.ts');
      expect(result).toBe('✅ **Lint Check**: No errors found in test.ts');
    });

    it('should format errors and warnings correctly', () => {
      const diagnostics: LintDiagnostic[] = [
        {
          file: 'test.ts',
          line: 10,
          column: 5,
          severity: 'error',
          message: 'Type error',
          source: 'typescript',
          code: 'TS2345'
        },
        {
          file: 'test.ts',
          line: 15,
          column: 10,
          severity: 'warning',
          message: 'Unused variable',
          source: 'eslint',
          code: 'no-unused-vars'
        }
      ];

      const result = formatLintResults(diagnostics, 'test.ts');
      expect(result).toContain('🔍 **Lint Check Results** for test.ts');
      expect(result).toContain('❌ **1 Error**');
      expect(result).toContain('⚠️ **1 Warning**');
      expect(result).toContain('Line 10:5: Type error [typescript]');
      expect(result).toContain('Line 15:10: Unused variable [eslint]');
    });
  });

  describe('formatLintStatus', () => {
    it('should format no errors status', () => {
      const result = formatLintStatus([]);
      expect(result).toBe('✅ No lint errors');
    });

    it('should format error status', () => {
      const diagnostics: LintDiagnostic[] = [
        {
          file: 'test.ts',
          line: 10,
          column: 5,
          severity: 'error',
          message: 'Error',
          source: 'typescript'
        }
      ];
      const result = formatLintStatus(diagnostics);
      expect(result).toBe('❌ 1 error');
    });

    it('should format warning status', () => {
      const diagnostics: LintDiagnostic[] = [
        {
          file: 'test.ts',
          line: 10,
          column: 5,
          severity: 'warning',
          message: 'Warning',
          source: 'eslint'
        }
      ];
      const result = formatLintStatus(diagnostics);
      expect(result).toBe('⚠️ 1 warning');
    });
  });

  describe('performAutoLintCheck', () => {
    let mockConfig: Config;

    beforeEach(() => {
      mockConfig = {
        getVsCodePluginMode: vi.fn(),
      } as any;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should skip check if not in VS Code environment', async () => {
      vi.mocked(mockConfig.getVsCodePluginMode).mockReturnValue(false);

      const result = await performAutoLintCheck('test.ts', mockConfig);

      expect(result.shouldAppend).toBe(false);
      expect(result.lintMessage).toBe('');
      expect(result.lintStatus).toBe('');
    });

    it('should skip check if not a code file', async () => {
      vi.mocked(mockConfig.getVsCodePluginMode).mockReturnValue(true);

      const result = await performAutoLintCheck('test.txt', mockConfig);

      expect(result.shouldAppend).toBe(false);
      expect(result.lintMessage).toBe('');
      expect(result.lintStatus).toBe('');
    });

    it('should perform check for VS Code environment with code file', async () => {
      vi.mocked(mockConfig.getVsCodePluginMode).mockReturnValue(true);

      const mockCallback = vi.fn().mockResolvedValue([
        {
          file: 'test.ts',
          line: 10,
          column: 5,
          severity: 'error' as const,
          message: 'Type error',
          source: 'typescript'
        }
      ]);

      vi.spyOn(ReadLintsTool, 'getCallback').mockReturnValue(mockCallback);

      const result = await performAutoLintCheck('test.ts', mockConfig);

      expect(result.shouldAppend).toBe(true);
      expect(result.lintMessage).toContain('❌ **1 Error**');
      expect(result.lintStatus).toBe('❌ 1 error');
      expect(result.diagnostics).toHaveLength(1);
      expect(mockCallback).toHaveBeenCalledWith(['test.ts']);
    });

    it('should handle callback not available', async () => {
      vi.mocked(mockConfig.getVsCodePluginMode).mockReturnValue(true);
      vi.spyOn(ReadLintsTool, 'getCallback').mockReturnValue(null);

      const result = await performAutoLintCheck('test.ts', mockConfig);

      expect(result.shouldAppend).toBe(false);
    });
  });
});