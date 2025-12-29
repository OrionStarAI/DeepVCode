/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { mcpCommand } from './mcpCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import {
  MCPServerStatus,
  MCPDiscoveryState,
  getMCPServerStatus,
  getMCPDiscoveryState,
  DiscoveredMCPTool,
} from 'deepv-code-core';
import open from 'open';
import { MessageActionReturn } from './types.js';
import { Type, CallableTool } from '@google/genai';

// Mock external dependencies
vi.mock('open', () => ({
  default: vi.fn(),
}));

// Mock i18n to return key names for predictable testing
vi.mock('../utils/i18n.js', () => {
  return {
    isChineseLocale: () => false,
    t: (key: string) => key,
    tp: (key: string, params?: any) => {
      let result = key;
      if (params && typeof params === 'object') {
        for (const v of Object.values(params)) {
          if (typeof v === 'string' || typeof v === 'number') {
            result += ` ${v}`;
          }
        }
      }
      return result;
    },
    getLocalizedToolName: (name: string) => name,
  };
});

vi.mock('deepv-code-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('deepv-code-core')>();
  return {
    ...actual,
    getMCPServerStatus: vi.fn(),
    getMCPDiscoveryState: vi.fn(),
    MCPOAuthProvider: {
      authenticate: vi.fn(),
    },
    MCPOAuthTokenStorage: {
      getToken: vi.fn(),
      isTokenExpired: vi.fn(),
    },
  };
});

// Helper function to check if result is a message action
const isMessageAction = (result: unknown): result is MessageActionReturn =>
  result !== null &&
  typeof result === 'object' &&
  'type' in result &&
  result.type === 'message';

// Helper function to create a mock DiscoveredMCPTool
const createMockMCPTool = (
  name: string,
  serverName: string,
  description?: string,
) =>
  new DiscoveredMCPTool(
    {
      callTool: vi.fn(),
      tool: vi.fn(),
    } as unknown as CallableTool,
    serverName,
    name,
    description || `Description for ${name}`,
    { type: Type.OBJECT, properties: {} },
    name, // serverToolName same as name for simplicity
  );

describe('mcpCommand', () => {
  let mockContext: ReturnType<typeof createMockCommandContext>;
  let mockConfig: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up default mock environment
    delete process.env.SANDBOX;

    // Default mock implementations
    vi.mocked(getMCPServerStatus).mockReturnValue(MCPServerStatus.CONNECTED);
    vi.mocked(getMCPDiscoveryState).mockReturnValue(
      MCPDiscoveryState.COMPLETED,
    );

    // Create mock config with all necessary methods
    mockConfig = {
      getToolRegistry: vi.fn().mockResolvedValue({
        getAllTools: vi.fn().mockReturnValue([]),
      }),
      getMcpServers: vi.fn().mockReturnValue({}),
      getBlockedMcpServers: vi.fn().mockReturnValue([]),
      getPromptRegistry: vi.fn().mockResolvedValue({
        getAllPrompts: vi.fn().mockReturnValue([]),
        getPromptsByServer: vi.fn().mockReturnValue([]),
      }),
      getGeminiClient: vi.fn().mockReturnValue({
        setTools: vi.fn(),
      }),
    };

    mockContext = createMockCommandContext({
      services: {
        config: mockConfig,
      },
    });
  });

  describe('basic functionality', () => {
    it('should show an error if config is not available', async () => {
      const contextWithoutConfig = createMockCommandContext({
        services: {
          config: null,
        },
      });

      const result = await mcpCommand.action!(contextWithoutConfig, '');

      expect(result).toMatchObject({
        type: 'message',
        messageType: 'error',
        content: 'error.config.not.loaded',
      });
    });

    it('should show an error if tool registry is not available', async () => {
      mockConfig.getToolRegistry = vi.fn().mockResolvedValue(undefined);

      const result = await mcpCommand.action!(mockContext, '');

      expect(result).toMatchObject({
        type: 'message',
        messageType: 'error',
        content: 'error.tool.registry.unavailable',
      });
    });
  });

  describe('no MCP servers configured', () => {
    beforeEach(() => {
      mockConfig.getToolRegistry = vi.fn().mockResolvedValue({
        getAllTools: vi.fn().mockReturnValue([]),
      });
      mockConfig.getMcpServers = vi.fn().mockReturnValue({});
    });

    it('should display help content when no MCP servers are configured', async () => {
      const result = await mcpCommand.action!(mockContext, '');

      expect(result.type).toBe('message');
      expect(result.messageType).toBe('info');
      expect(result.content).toContain('mcp.status.no.servers.title');
    });
  });

  describe('with configured MCP servers', () => {
    beforeEach(() => {
      const mockMcpServers = {
        server1: { command: 'cmd1' },
        server2: { command: 'cmd2' },
        server3: { command: 'cmd3' },
      };

      mockConfig.getMcpServers = vi.fn().mockReturnValue(mockMcpServers);
    });

    it('should display configured MCP servers with status indicators and their tools', async () => {
      // Setup getMCPServerStatus mock implementation
      vi.mocked(getMCPServerStatus).mockImplementation((serverName) => {
        if (serverName === 'server1') return MCPServerStatus.CONNECTED;
        if (serverName === 'server2') return MCPServerStatus.CONNECTED;
        return MCPServerStatus.DISCONNECTED; // server3
      });

      const allTools = [
        createMockMCPTool('server1_tool1', 'server1'),
        createMockMCPTool('server2_tool1', 'server2'),
        createMockMCPTool('server3_tool1', 'server3'),
      ];

      mockConfig.getToolRegistry = vi.fn().mockResolvedValue({
        getAllTools: vi.fn().mockReturnValue(allTools),
      });

      const result = await mcpCommand.action!(mockContext, '');

      expect(result.type).toBe('message');
      expect(result.messageType).toBe('info');
      expect(result.content).toContain('mcp.status.configured.servers');
      expect(result.content).toContain('server1');
      expect(result.content).toContain('server2');
      expect(result.content).toContain('server3');
    });

    it('should display tool descriptions when desc argument is used', async () => {
      const mockMcpServers = {
        server1: {
          command: 'cmd1',
          description: 'This is a server description',
        },
      };

      mockConfig.getMcpServers = vi.fn().mockReturnValue(mockMcpServers);

      const mockServerTools = [
        createMockMCPTool('tool1', 'server1', 'This is tool 1 description'),
      ];

      mockConfig.getToolRegistry = vi.fn().mockResolvedValue({
        getAllTools: vi.fn().mockReturnValue(mockServerTools),
      });

      const result = await mcpCommand.action!(mockContext, 'desc');

      expect(result.type).toBe('message');
      expect(result.content).toContain('mcp.status.configured.servers');
      expect(result.content).toContain('tool1');
      expect(result.content).toContain('This is tool 1 description');
    });

    it('should show startup indicator when servers are connecting', async () => {
      const mockMcpServers = {
        server1: { command: 'cmd1' },
        server2: { command: 'cmd2' },
      };

      mockConfig.getMcpServers = vi.fn().mockReturnValue(mockMcpServers);

      vi.mocked(getMCPServerStatus).mockImplementation((serverName) => {
        if (serverName === 'server1') return MCPServerStatus.CONNECTED;
        if (serverName === 'server2') return MCPServerStatus.CONNECTING;
        return MCPServerStatus.DISCONNECTED;
      });

      vi.mocked(getMCPDiscoveryState).mockReturnValue(
        MCPDiscoveryState.IN_PROGRESS,
      );

      const mockServerTools = [
        createMockMCPTool('server1_tool1', 'server1'),
        createMockMCPTool('server2_tool1', 'server2'),
      ];

      mockConfig.getToolRegistry = vi.fn().mockResolvedValue({
        getAllTools: vi.fn().mockReturnValue(mockServerTools),
      });

      const result = await mcpCommand.action!(mockContext, '');

      if (isMessageAction(result)) {
        const message = result.content;
        expect(message).toContain('mcp.status.starting');
        expect(message).toContain('mcp.first.start.hint');

        // Check server statuses
        expect(message).toContain('server1');
        expect(message).toContain('server2');
      }
    });
  });

  describe('auth subcommand', () => {
    it('should list OAuth-enabled servers when no server name is provided', async () => {
      mockConfig.getMcpServers.mockReturnValue({
        'oauth-server': { oauth: { enabled: true } },
        'regular-server': {},
      });

      const authCommand = mcpCommand.subCommands?.find(
        (cmd) => cmd.name === 'auth',
      );

      const result = await authCommand!.action!(mockContext, '');
      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        expect(result.content).toContain('mcp.auth.oauth.servers.list');
        expect(result.content).toContain('oauth-server');
      }
    });

    it('should show message when no OAuth servers are configured', async () => {
      mockConfig.getMcpServers.mockReturnValue({
        'regular-server': {},
      });

      const authCommand = mcpCommand.subCommands?.find(
        (cmd) => cmd.name === 'auth',
      );
      const result = await authCommand!.action!(mockContext, '');

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        expect(result.content).toBe('mcp.auth.no.oauth.servers');
      }
    });

    it('should authenticate with a specific server', async () => {
      const mockToolRegistry = {
        discoverToolsForServer: vi.fn(),
        getAllTools: vi.fn().mockReturnValue([]),
      };

      mockConfig.getMcpServers.mockReturnValue({
        'test-server': {
          url: 'http://localhost:3000',
          oauth: { enabled: true },
        },
      });
      mockConfig.getToolRegistry.mockResolvedValue(mockToolRegistry);

      const authCommand = mcpCommand.subCommands?.find(
        (cmd) => cmd.name === 'auth',
      );
      const result = await authCommand!.action!(mockContext, 'test-server');

      const { MCPOAuthProvider } = await import('deepv-code-core');
      expect(MCPOAuthProvider.authenticate).toHaveBeenCalled();
      expect(mockToolRegistry.discoverToolsForServer).toHaveBeenCalledWith(
        'test-server',
      );

      expect(isMessageAction(result)).toBe(true);
    });
  });

  describe('refresh subcommand', () => {
    it('should refresh the list of tools and display the status', async () => {
      const mockToolRegistry = {
        discoverMcpTools: vi.fn(),
        getAllTools: vi.fn().mockReturnValue([]),
      };

      mockConfig.getToolRegistry.mockResolvedValue(mockToolRegistry);
      // Ensure getMcpServers returns something so getMcpStatus shows configured servers
      mockConfig.getMcpServers.mockReturnValue({
        'server1': { command: 'cmd1' }
      });

      const refreshCommand = mcpCommand.subCommands?.find(
        (cmd) => cmd.name === 'refresh',
      );
      const result = await refreshCommand!.action!(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          text: 'mcp.refresh.starting',
        }),
        expect.any(Number),
      );
      expect(mockToolRegistry.discoverMcpTools).toHaveBeenCalled();

      expect(isMessageAction(result)).toBe(true);
      if (isMessageAction(result)) {
        expect(result.content).toContain('mcp.status.configured.servers');
      }
    });
  });
});