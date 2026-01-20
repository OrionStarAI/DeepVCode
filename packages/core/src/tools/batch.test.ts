/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchTool } from './batch.js';
import { Config } from '../config/config.js';

describe('BatchTool', () => {
  let mockConfig: Config;
  let batchTool: BatchTool;

  beforeEach(() => {
    mockConfig = {
      getToolRegistry: vi.fn(),
    } as unknown as Config;
    batchTool = new BatchTool(mockConfig);
  });

  describe('getDescription', () => {
    it('should return "No tools" for empty tool_calls', () => {
      const result = batchTool.getDescription({ tool_calls: [] });
      expect(result).toBe('No tools');
    });

    it('should return description for single tool call', () => {
      const result = batchTool.getDescription({
        tool_calls: [{ tool: 'read_file', parameters: {} }],
      });
      expect(result).toBe('1 tool: read_file');
    });

    it('should return description for multiple tool calls', () => {
      const result = batchTool.getDescription({
        tool_calls: [
          { tool: 'read_file', parameters: {} },
          { tool: 'write_file', parameters: {} },
          { tool: 'run_shell_command', parameters: {} },
        ],
      });
      expect(result).toBe('3 tools: read_file, write_file, run_shell_command');
    });

    it('should truncate long tool names list', () => {
      const result = batchTool.getDescription({
        tool_calls: [
          { tool: 'search_file_content', parameters: {} },
          { tool: 'run_shell_command', parameters: {} },
          { tool: 'write_file', parameters: {} },
          { tool: 'read_many_files', parameters: {} },
        ],
      });
      // Total tool names: "search_file_content, run_shell_command, write_file, read_many_files"
      // Length is 68, which exceeds 60, so it should be truncated
      expect(result).toContain('4 tools:');
      expect(result).toContain('...');
      expect(result.length).toBeLessThanOrEqual(80); // "4 tools: " (9) + truncated (57) + "..." (3) = 69 max
    });

    it('should handle undefined tool_calls', () => {
      const result = batchTool.getDescription({ tool_calls: undefined as any });
      expect(result).toBe('No tools');
    });

    it('should handle tool name aliases (robustness)', () => {
      const result = batchTool.getDescription({
        tool_calls: [
          { tool: '', parameters: {}, name: 'read_file' } as any,
          { tool: '', parameters: {}, function: 'write_file' } as any,
          { tool: '', parameters: {}, tool_name: 'glob' } as any,
        ],
      });
      expect(result).toBe('3 tools: read_file, write_file, glob');
    });

    it('should handle missing tool names', () => {
        const result = batchTool.getDescription({
          tool_calls: [{ tool: '', parameters: {} } as any],
        });
        expect(result).toBe('1 tool: Unknown');
    });

    it('should handle stringified JSON tool calls (LLM hallucination)', () => {
        const result = batchTool.getDescription({
            tool_calls: [
                '{"tool": "read_file", "parameters": {}}',
                '{"tool": "write_file", "parameters": {}}'
            ] as any
        });
        expect(result).toBe('2 tools: read_file, write_file');
    });
  });

  describe('execute', () => {
    it('should handle tool name aliases during execution', async () => {
      const mockTool = { execute: vi.fn().mockResolvedValue({ llmContent: 'success' }) };
      const mockRegistry = { getTool: vi.fn().mockReturnValue(mockTool) };
      (mockConfig.getToolRegistry as any).mockResolvedValue(mockRegistry);

      const params = {
        tool_calls: [
            { tool: '', parameters: { path: 'a' }, name: 'read_file' } as any
        ]
      };

      const result = await batchTool.execute(params, new AbortController().signal);

      expect(mockRegistry.getTool).toHaveBeenCalledWith('read_file');
      expect(mockTool.execute).toHaveBeenCalled();
      expect(result.llmContent).toContain('1/1 succeeded');
    });

    it('should handle stringified JSON tool calls during execution', async () => {
        const mockTool = { execute: vi.fn().mockResolvedValue({ llmContent: 'success' }) };
        const mockRegistry = { getTool: vi.fn().mockReturnValue(mockTool) };
        (mockConfig.getToolRegistry as any).mockResolvedValue(mockRegistry);

        const params = {
          tool_calls: [
              '{"tool": "read_file", "parameters": {"path": "a"}}'
          ] as any
        };

        const result = await batchTool.execute(params, new AbortController().signal);

        expect(mockRegistry.getTool).toHaveBeenCalledWith('read_file');
        expect(mockTool.execute).toHaveBeenCalled();
        expect(result.llmContent).toContain('1/1 succeeded');
      });
  });

  describe('validateToolParams', () => {
    it('should return error for empty tool_calls', () => {
      const result = batchTool.validateToolParams({ tool_calls: [] });
      expect(result).toBe('At least one tool call is required.');
    });

    it('should return error for too many tool calls', () => {
      const toolCalls = Array.from({ length: 21 }, (_, i) => ({
        tool: `tool_${i}`,
        parameters: {},
      }));
      const result = batchTool.validateToolParams({ tool_calls: toolCalls });
      expect(result).toBe('Maximum 20 tool calls allowed in batch.');
    });

    it('should return null for valid tool_calls', () => {
      const result = batchTool.validateToolParams({
        tool_calls: [{ tool: 'read_file', parameters: {} }],
      });
      expect(result).toBeNull();
    });
  });
});
