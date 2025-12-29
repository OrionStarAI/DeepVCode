/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  discoverTools,
  discoverPrompts,
  createTransport,
  isEnabled,
} from './mcp-client.js';
import { MCPServerConfig } from '../config/config.js';
import { ToolRegistry } from './tool-registry.js';
import { PromptRegistry } from '../prompts/prompt-registry.js';
import { ResourceRegistry } from '../resources/resource-registry.js';
import {
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { FunctionDeclaration } from '@google/genai';

// vi.mock('@modelcontextprotocol/sdk/client/index.js');
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js');
vi.mock('@modelcontextprotocol/sdk/client/sse.js');

describe('mcp-client', () => {
  describe('discoverTools', () => {
    it.skip('should discover tools', async () => {
      const mockClient = {
        listTools: vi.fn().mockResolvedValue({
          tools: [{ name: 'tool1', description: 'desc1', inputSchema: {} }],
        }),
      };
      const mockRegistry = {
        registerTool: vi.fn(),
      };
      const mockConfig = new MCPServerConfig();

      await discoverTools('server1', mockConfig, mockClient as any);

      expect(mockClient.listTools).toHaveBeenCalled();
      expect(mockRegistry.registerTool).toHaveBeenCalled();
    });
  });

  describe('discoverPrompts', () => {
    it.skip('should discover and log prompts', async () => {
      const mockClient = {
        listPrompts: vi.fn().mockResolvedValue({
          prompts: [{ name: 'prompt1', description: 'desc1' }],
        }),
      };
      const mockPromptRegistry = {
        registerPrompt: vi.fn(),
      };

      await discoverPrompts('server1', mockClient as any, mockPromptRegistry as any);

      expect(mockClient.listPrompts).toHaveBeenCalled();
      expect(mockPromptRegistry.registerPrompt).toHaveBeenCalled();
    });

    it('should do nothing if no prompts are discovered', async () => {
      const mockClient = {
        listPrompts: vi.fn().mockResolvedValue({ prompts: [] }),
      };
      const mockPromptRegistry = { registerPrompt: vi.fn() };

      await discoverPrompts('server1', mockClient as any, mockPromptRegistry as any);

      expect(mockPromptRegistry.registerPrompt).not.toHaveBeenCalled();
    });

    it('should log an error if discovery fails', async () => {
      const mockClient = {
        listPrompts: vi.fn().mockRejectedValue(new Error('fail')),
      };
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await discoverPrompts('server1', mockClient as any, {} as any);

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('createTransport', () => {
    it('should connect via httpUrl > without headers', async () => {
      const config = new MCPServerConfig(undefined, undefined, undefined, undefined, undefined, 'http://test-server');
      await createTransport('server1', config, false);

      expect(StreamableHTTPClientTransport).toHaveBeenCalled();
    });

    it('should connect via httpUrl > with headers', async () => {
      const headers = { Authorization: 'Bearer token' };
      const config = new MCPServerConfig(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'http://test-server',
        headers,
      );
      await createTransport('server1', config, false);

      expect(StreamableHTTPClientTransport).toHaveBeenCalled();
    });

    it('should connect via url > without headers', async () => {
      const config = new MCPServerConfig(undefined, undefined, undefined, undefined, 'http://test-server');
      await createTransport('server1', config, false);

      expect(SSEClientTransport).toHaveBeenCalled();
    });

    it('should connect via url > with headers', async () => {
      const headers = { 'X-Custom': 'Value' };
      const config = new MCPServerConfig(
        undefined,
        undefined,
        undefined,
        undefined,
        'http://test-server',
        undefined,
        headers,
      );
      await createTransport('server1', config, false);

      expect(SSEClientTransport).toHaveBeenCalled();
    });

    it('should connect via command', async () => {
      const config = new MCPServerConfig('npx', ['serv']);
      const transport = await createTransport('server1', config, false);

      expect(transport).toBeDefined();
    });
  });

  describe('isEnabled', () => {
    it('should return true if no include or exclude lists are provided', () => {
      const funcDecl = { name: 'tool1' } as FunctionDeclaration;
      const config = new MCPServerConfig();
      expect(isEnabled(funcDecl, 'server1', config)).toBe(true);
    });

    it('should return false if the tool is in the exclude list', () => {
      const funcDecl = { name: 'tool1' } as FunctionDeclaration;
      const config = new MCPServerConfig(
        undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        undefined, ['tool1']
      );
      expect(isEnabled(funcDecl, 'server1', config)).toBe(false);
    });

    it('should return true if the tool is in the include list', () => {
      const funcDecl = { name: 'tool1' } as FunctionDeclaration;
      const config = new MCPServerConfig(
        undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        ['tool1']
      );
      expect(isEnabled(funcDecl, 'server1', config)).toBe(true);
    });

    it('should return true if the tool is in the include list with parentheses', () => {
      const funcDecl = { name: 'tool1' } as FunctionDeclaration;
      const config = new MCPServerConfig(
        undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        ['tool1()']
      );
      expect(isEnabled(funcDecl, 'server1', config)).toBe(true);
    });

    it('should return false if the include list exists but does not contain the tool', () => {
      const funcDecl = { name: 'tool1' } as FunctionDeclaration;
      const config = new MCPServerConfig(
        undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        ['tool2']
      );
      expect(isEnabled(funcDecl, 'server1', config)).toBe(false);
    });

    it('should return false if the tool is in both the include and exclude lists', () => {
      const funcDecl = { name: 'tool1' } as FunctionDeclaration;
      const config = new MCPServerConfig(
        undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        ['tool1'], ['tool1']
      );
      expect(isEnabled(funcDecl, 'server1', config)).toBe(false);
    });

    it('should return false if the function declaration has no name', () => {
      const funcDecl = {} as FunctionDeclaration;
      const config = new MCPServerConfig();
      expect(isEnabled(funcDecl, 'server1', config)).toBe(false);
    });
  });
});
