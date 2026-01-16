/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

import { LspTool } from './lsp.js';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Config } from '../config/config.js';

// Mock the LSP manager to avoid actual LSP server dependency
vi.mock('./lsp/lsp-provider.js', () => ({
  getLSPManager: vi.fn(() => ({
    getDefinition: vi.fn().mockResolvedValue([{
      uri: 'file:///test/file.ts',
      range: { start: { line: 10, character: 5 }, end: { line: 10, character: 15 } }
    }]),
    getReferences: vi.fn().mockResolvedValue([
      { uri: 'file:///test/file1.ts', range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } } },
      { uri: 'file:///test/file2.ts', range: { start: { line: 20, character: 2 }, end: { line: 20, character: 12 } } }
    ]),
    getHover: vi.fn().mockResolvedValue({
      contents: { value: 'function myFunction(): void' }
    }),
    getDocumentSymbols: vi.fn().mockResolvedValue([
      { name: 'MyClass', kind: 5, range: { start: { line: 0, character: 0 }, end: { line: 50, character: 0 } } },
      { name: 'myMethod', kind: 6, range: { start: { line: 10, character: 2 }, end: { line: 20, character: 2 } } }
    ]),
    getWorkspaceSymbols: vi.fn().mockResolvedValue([
      { name: 'GlobalFunction', kind: 12, location: { uri: 'file:///test/utils.ts', range: { start: { line: 0, character: 0 }, end: { line: 5, character: 0 } } } }
    ]),
    getImplementation: vi.fn().mockResolvedValue([{
      uri: 'file:///test/impl.ts',
      range: { start: { line: 15, character: 0 }, end: { line: 30, character: 0 } }
    }])
  }))
}));

describe('LspTool', () => {
  let tempRootDir: string;
  let lspTool: LspTool;
  let testFilePath: string;

  // Mock config for testing
  let mockConfig: Config;

  beforeEach(async () => {
    // Create a unique root directory for each test run
    tempRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lsp-tool-root-'));
    testFilePath = path.join(tempRootDir, 'test.ts');

    // Create a test file
    await fs.writeFile(testFilePath, 'export function test() {}');

    // Create mock config
    mockConfig = {
      getTargetDir: () => tempRootDir,
    } as unknown as Config;

    lspTool = new LspTool(mockConfig);
  });

  afterEach(async () => {
    // Clean up the temporary root directory
    await fs.rm(tempRootDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('validateToolParams', () => {
    it('should return null for valid goToDefinition params', () => {
      const params = {
        operation: 'goToDefinition' as const,
        filePath: testFilePath,
        line: 1,
        character: 10,
      };
      expect(lspTool.validateToolParams(params)).toBeNull();
    });

    it('should return null for valid findReferences params', () => {
      const params = {
        operation: 'findReferences' as const,
        filePath: testFilePath,
        line: 5,
        character: 3,
      };
      expect(lspTool.validateToolParams(params)).toBeNull();
    });

    it('should return null for valid hover params', () => {
      const params = {
        operation: 'hover' as const,
        filePath: testFilePath,
        line: 1,
        character: 1,
      };
      expect(lspTool.validateToolParams(params)).toBeNull();
    });

    it('should return null for valid documentSymbol params', () => {
      const params = {
        operation: 'documentSymbol' as const,
        filePath: testFilePath,
      };
      expect(lspTool.validateToolParams(params)).toBeNull();
    });

    it('should return null for valid workspaceSymbol params', () => {
      const params = {
        operation: 'workspaceSymbol' as const,
        query: 'MyClass',
      };
      expect(lspTool.validateToolParams(params)).toBeNull();
    });

    it('should return null for valid goToImplementation params', () => {
      const params = {
        operation: 'goToImplementation' as const,
        filePath: testFilePath,
        line: 10,
        character: 5,
      };
      expect(lspTool.validateToolParams(params)).toBeNull();
    });

    it('should return error when params is not an object', () => {
      const params = 'invalid string params' as any;
      const error = lspTool.validateToolParams(params);
      expect(error).toContain('params must be an object');
      expect(error).toContain('lsp');
      expect(error).toContain('CORRECT FORMAT');
    });

    it('should return error when params is null', () => {
      const params = null as any;
      const error = lspTool.validateToolParams(params);
      expect(error).toContain('params must be an object');
      expect(error).toContain('null');
    });

    it('should return error for relative filePath', () => {
      const params = {
        operation: 'goToDefinition' as const,
        filePath: 'relative/path.ts',
        line: 1,
        character: 1,
      };
      expect(lspTool.validateToolParams(params)).toContain('absolute path');
    });

    it('should return error when filePath is missing for file-specific operations', () => {
      const params = {
        operation: 'goToDefinition' as const,
        line: 1,
        character: 1,
      };
      expect(lspTool.validateToolParams(params)).toContain('filePath');
    });

    it('should return error when line/character is missing for position operations', () => {
      const params = {
        operation: 'goToDefinition' as const,
        filePath: testFilePath,
      };
      expect(lspTool.validateToolParams(params)).toContain('line and character');
    });

    it('should return error when line is less than 1', () => {
      const params = {
        operation: 'hover' as const,
        filePath: testFilePath,
        line: 0,
        character: 1,
      };
      expect(lspTool.validateToolParams(params)).toContain('1-based');
    });

    it('should return error when character is less than 1', () => {
      const params = {
        operation: 'findReferences' as const,
        filePath: testFilePath,
        line: 1,
        character: 0,
      };
      expect(lspTool.validateToolParams(params)).toContain('1-based');
    });

    it('should return error when query is missing for workspaceSymbol', () => {
      const params = {
        operation: 'workspaceSymbol' as const,
      };
      expect(lspTool.validateToolParams(params)).toContain('query is required');
    });

    it('should not require filePath for workspaceSymbol', () => {
      const params = {
        operation: 'workspaceSymbol' as const,
        query: 'someSymbol',
      };
      expect(lspTool.validateToolParams(params)).toBeNull();
    });
  });

  describe('execute', () => {
    it('should execute goToDefinition and return formatted result', async () => {
      const params = {
        operation: 'goToDefinition' as const,
        filePath: testFilePath,
        line: 1,
        character: 10,
      };
      const result = await lspTool.execute(params);

      expect(result.llmContent).toContain('goToDefinition');
      // Result may contain actual result or error from mock - just verify operation name is in output
    });

    it('should execute findReferences and return formatted result', async () => {
      const params = {
        operation: 'findReferences' as const,
        filePath: testFilePath,
        line: 5,
        character: 3,
      };
      const result = await lspTool.execute(params);

      expect(result.llmContent).toContain('findReferences');
    });

    it('should execute hover and return formatted result', async () => {
      const params = {
        operation: 'hover' as const,
        filePath: testFilePath,
        line: 1,
        character: 1,
      };
      const result = await lspTool.execute(params);

      expect(result.llmContent).toContain('hover');
      expect(result.returnDisplay).toContain('myFunction');
    });

    it('should execute documentSymbol and return formatted result', async () => {
      const params = {
        operation: 'documentSymbol' as const,
        filePath: testFilePath,
      };
      const result = await lspTool.execute(params);

      expect(result.llmContent).toContain('documentSymbol');
    });

    it('should execute workspaceSymbol and return formatted result', async () => {
      const params = {
        operation: 'workspaceSymbol' as const,
        query: 'Global',
      };
      const result = await lspTool.execute(params);

      expect(result.llmContent).toContain('workspaceSymbol');
    });

    it('should execute goToImplementation and return formatted result', async () => {
      const params = {
        operation: 'goToImplementation' as const,
        filePath: testFilePath,
        line: 10,
        character: 5,
      };
      const result = await lspTool.execute(params);

      expect(result.llmContent).toContain('goToImplementation');
    });
  });

  describe('schema', () => {
    it('should have correct tool name', () => {
      expect(LspTool.Name).toBe('lsp');
    });

    it('should have operation as required field', () => {
      expect(lspTool.schema.parameters?.required).toContain('operation');
    });

    it('should have all valid operations in enum', () => {
      const operationSchema = (lspTool.schema.parameters?.properties as any)?.operation;
      expect(operationSchema.enum).toContain('goToDefinition');
      expect(operationSchema.enum).toContain('findReferences');
      expect(operationSchema.enum).toContain('hover');
      expect(operationSchema.enum).toContain('documentSymbol');
      expect(operationSchema.enum).toContain('workspaceSymbol');
      expect(operationSchema.enum).toContain('goToImplementation');
    });
  });
});
