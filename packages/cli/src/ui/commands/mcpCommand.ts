/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SlashCommand,
  SlashCommandActionReturn,
  CommandContext,
  CommandKind,
  MessageActionReturn,
} from './types.js';
import { helpCommand } from './mcpHelpCommand.js';
import { addCommand } from './mcpAddCommand.js';
import {
  DiscoveredMCPPrompt,
  DiscoveredMCPTool,
  getMCPDiscoveryState,
  getMCPServerStatus,
  MCPDiscoveryState,
  MCPServerStatus,
  mcpServerRequiresOAuth,
  getErrorMessage,
  unloadMcpServer,
} from 'deepv-code-core';
import { t, tp } from '../utils/i18n.js';
import open from 'open';

const COLOR_GREEN = '\u001b[32m';
const COLOR_YELLOW = '\u001b[33m';
const COLOR_RED = '\u001b[31m';
const COLOR_CYAN = '\u001b[36m';
const COLOR_BLUE = '\u001b[34m';
const COLOR_MAGENTA = '\u001b[35m';
const COLOR_GREY = '\u001b[90m';
const RESET_COLOR = '\u001b[0m';
const BOLD = '\u001b[1m';

const getMcpStatus = async (
  context: CommandContext,
  showDescriptions: boolean,
  showSchema: boolean,
  showTips: boolean = false,
): Promise<SlashCommandActionReturn> => {
  const { config } = context.services;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: t('error.config.not.loaded'),
    };
  }

  const toolRegistry = await config.getToolRegistry();
  if (!toolRegistry) {
    return {
      type: 'message',
      messageType: 'error',
      content: t('error.tool.registry.unavailable'),
    };
  }

  const mcpServers = config.getMcpServers() || {};
  const serverNames = Object.keys(mcpServers);
  const blockedMcpServers = config.getBlockedMcpServers() || [];

  if (serverNames.length === 0 && blockedMcpServers.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content: `${COLOR_CYAN}${BOLD}${t('mcp.status.no.servers.title')}${RESET_COLOR}

${t('mcp.status.no.servers.description')}

${COLOR_GREEN}${t('mcp.status.quick.start')}${RESET_COLOR}

${COLOR_BLUE}${t('mcp.status.predefined.templates')}${RESET_COLOR}
   ${COLOR_CYAN}/mcp add github${RESET_COLOR}           # ${t('mcp.status.github.tools.desc')}
   ${COLOR_CYAN}/mcp add sqlite${RESET_COLOR}           # ${t('mcp.status.sqlite.tools.desc')}
   ${COLOR_CYAN}/mcp add filesystem${RESET_COLOR}       # ${t('mcp.status.filesystem.tools.desc')}
   ${COLOR_CYAN}/mcp add search${RESET_COLOR}           # ${t('mcp.status.search.tools.desc')}

${COLOR_BLUE}${t('mcp.status.interactive.wizard')}${RESET_COLOR}
   ${COLOR_CYAN}/mcp add${RESET_COLOR}                  # ${t('mcp.status.start.wizard.desc')}

${COLOR_BLUE}${t('mcp.status.custom.config')}${RESET_COLOR}
   ${COLOR_CYAN}/mcp add my-server --command "npx @my/server"${RESET_COLOR}

${COLOR_YELLOW}${t('mcp.status.get.help')}${RESET_COLOR}
   ${COLOR_CYAN}/mcp help${RESET_COLOR}                 # ${t('mcp.status.help.complete')}
   ${COLOR_CYAN}/mcp help add${RESET_COLOR}             # ${t('mcp.status.help.detailed')}
   ${COLOR_CYAN}/mcp help templates${RESET_COLOR}       # ${t('mcp.status.help.templates')}
   ${COLOR_CYAN}/mcp help examples${RESET_COLOR}        # ${t('mcp.status.help.examples')}

${COLOR_MAGENTA}${t('mcp.status.tip')}${RESET_COLOR} ${COLOR_GREY}${t('mcp.status.config.file')}${RESET_COLOR} ${t('mcp.status.run.after.config')}

 ${COLOR_CYAN}/mcp${RESET_COLOR} ${t('mcp.status.view.status')}`,
    };
  }

  // Check if any servers are still connecting
  const connectingServers = serverNames.filter(
    (name) => getMCPServerStatus(name) === MCPServerStatus.CONNECTING,
  );
  const discoveryState = getMCPDiscoveryState();

  let message = '';

  // Add overall discovery status message if needed
  if (
    discoveryState === MCPDiscoveryState.IN_PROGRESS ||
    connectingServers.length > 0
  ) {
    message += `${COLOR_YELLOW}${tp('mcp.status.starting', { count: connectingServers.length })}${RESET_COLOR}\n`;
    message += `${COLOR_CYAN}${t('mcp.first.start.hint')}${RESET_COLOR}\n\n`;
  }

  message += `${t('mcp.status.configured.servers')}\n\n`;

  const allTools = toolRegistry.getAllTools();
  for (const serverName of serverNames) {
    const serverTools = allTools.filter(
      (tool) =>
        tool instanceof DiscoveredMCPTool && tool.serverName === serverName,
    ) as DiscoveredMCPTool[];
    const promptRegistry = await config.getPromptRegistry();
    const serverPrompts = promptRegistry.getPromptsByServer(serverName) || [];

    const status = getMCPServerStatus(serverName);

    // Add status indicator with descriptive text
    let statusIndicator = '';
    let statusText = '';
    switch (status) {
      case MCPServerStatus.CONNECTED:
        statusIndicator = '🟢';
        statusText = t('mcp.status.ready');
        break;
      case MCPServerStatus.CONNECTING:
        statusIndicator = '🔄';
        statusText = t('mcp.starting.first.launch');
        break;
      case MCPServerStatus.DISCONNECTED:
      default:
        statusIndicator = '🔴';
        statusText = t('mcp.status.disconnected');
        break;
    }

    // Get server description if available
    const server = mcpServers[serverName];
    let serverDisplayName = serverName;
    if (server.extensionName) {
      serverDisplayName += ` ${tp('mcp.status.from.extension', { extensionName: server.extensionName })}`;
    }

    // Format server header with bold formatting and status
    message += `${statusIndicator} \u001b[1m${serverDisplayName}\u001b[0m - ${statusText}`;

    let needsAuthHint = mcpServerRequiresOAuth.get(serverName) || false;
    // Add OAuth status if applicable
    if (server?.oauth?.enabled) {
      needsAuthHint = true;
      try {
        const { MCPOAuthTokenStorage } = await import(
          'deepv-code-core'
        );
        const hasToken = await MCPOAuthTokenStorage.getToken(serverName);
        if (hasToken) {
          const isExpired = MCPOAuthTokenStorage.isTokenExpired(hasToken.token);
          if (isExpired) {
            message += ` ${COLOR_YELLOW}${t('mcp.status.oauth.token.expired')}${RESET_COLOR}`;
          } else {
            message += ` ${COLOR_GREEN}${t('mcp.status.oauth.authenticated')}${RESET_COLOR}`;
            needsAuthHint = false;
          }
        } else {
          message += ` ${COLOR_RED}${t('mcp.status.oauth.not.authenticated')}${RESET_COLOR}`;
        }
      } catch (_err) {
        // If we can't check OAuth status, just continue
      }
    }

    // Add tool count with conditional messaging
    if (status === MCPServerStatus.CONNECTED) {
      const parts = [];
      if (serverTools.length > 0) {
        parts.push(
          tp('mcp.status.tools.count', {
            count: serverTools.length,
            unit: serverTools.length === 1 ? t('mcp.status.tool.unit.singular') : t('mcp.status.tool.unit.plural')
          }),
        );
      }
      if (serverPrompts.length > 0) {
        parts.push(
          tp('mcp.status.prompts.count', {
            count: serverPrompts.length,
            unit: serverPrompts.length === 1 ? t('mcp.status.prompt.unit.singular') : t('mcp.status.prompt.unit.plural')
          }),
        );
      }
      if (parts.length > 0) {
        message += ` (${parts.join(', ')})`;
      } else {
        message += ` ${t('mcp.status.zero.tools')}`;
      }
    } else if (status === MCPServerStatus.CONNECTING) {
      message += ` ${t('mcp.status.tools.prompts.ready')}`;
    } else {
      message += ` ${tp('mcp.status.tools.cached.count', { count: serverTools.length })}`;
    }

    // Add server description with proper handling of multi-line descriptions
    if (showDescriptions && server?.description) {
      const descLines = server.description.trim().split('\n');
      if (descLines) {
        message += ':\n';
        for (const descLine of descLines) {
          message += `    ${COLOR_GREEN}${descLine}${RESET_COLOR}\n`;
        }
      } else {
        message += '\n';
      }
    } else {
      message += '\n';
    }

    // Reset formatting after server entry
    message += RESET_COLOR;

    if (serverTools.length > 0) {
      message += `  ${COLOR_CYAN}${t('mcp.status.tools.label')}${RESET_COLOR}\n`;
      serverTools.forEach((tool) => {
        if (showDescriptions && tool.description) {
          // Format tool name in cyan using simple ANSI cyan color
          message += `  - ${COLOR_CYAN}${tool.name}${RESET_COLOR}`;

          // Handle multi-line descriptions by properly indenting and preserving formatting
          const descLines = tool.description.trim().split('\n');
          if (descLines) {
            message += ':\n';
            for (const descLine of descLines) {
              message += `      ${COLOR_GREEN}${descLine}${RESET_COLOR}\n`;
            }
          } else {
            message += '\n';
          }
          // Reset is handled inline with each line now
        } else {
          // Use cyan color for the tool name even when not showing descriptions
          message += `  - ${COLOR_CYAN}${tool.name}${RESET_COLOR}\n`;
        }
        const parameters =
          tool.schema.parametersJsonSchema ?? tool.schema.parameters;
        if (showSchema && parameters) {
          // Prefix the parameters in cyan
          message += `    ${COLOR_CYAN}${t('mcp.status.parameters.label')}${RESET_COLOR}\n`;

          const paramsLines = JSON.stringify(parameters, null, 2)
            .trim()
            .split('\n');
          if (paramsLines) {
            for (const paramsLine of paramsLines) {
              message += `      ${COLOR_GREEN}${paramsLine}${RESET_COLOR}\n`;
            }
          }
        }
      });
    }
    if (serverPrompts.length > 0) {
      if (serverTools.length > 0) {
        message += '\n';
      }
      message += `  ${COLOR_CYAN}${t('mcp.status.prompts.label')}${RESET_COLOR}\n`;
      serverPrompts.forEach((prompt: DiscoveredMCPPrompt) => {
        if (showDescriptions && prompt.description) {
          message += `  - ${COLOR_CYAN}${prompt.name}${RESET_COLOR}`;
          const descLines = prompt.description.trim().split('\n');
          if (descLines) {
            message += ':\n';
            for (const descLine of descLines) {
              message += `      ${COLOR_GREEN}${descLine}${RESET_COLOR}\n`;
            }
          } else {
            message += '\n';
          }
        } else {
          message += `  - ${COLOR_CYAN}${prompt.name}${RESET_COLOR}\n`;
        }
      });
    }

    if (serverTools.length === 0 && serverPrompts.length === 0) {
      message += `  ${t('mcp.status.no.tools.prompts')}`;
      if (status === MCPServerStatus.DISCONNECTED && needsAuthHint) {
        message += `\n  ${tp('mcp.status.type.auth.command', { serverName })}`;
      }
      message += '\n';
    } else if (serverTools.length === 0) {
      message += `  ${t('mcp.status.no.tools.simple')}`;
      if (status === MCPServerStatus.DISCONNECTED && needsAuthHint) {
        message += `\n  ${tp('mcp.status.type.auth.command', { serverName })}`;
      }
      message += '\n';
    } else if (status === MCPServerStatus.DISCONNECTED && needsAuthHint) {
      // This case is for when serverTools.length > 0
      message += `\n  ${tp('mcp.status.type.auth.command', { serverName })}\n`;
    }
    message += '\n';
  }

  for (const server of blockedMcpServers) {
    let serverDisplayName = server.name;
    if (server.extensionName) {
      serverDisplayName += ` ${tp('mcp.status.from.extension', { extensionName: server.extensionName })}`;
    }
    message += `🔴 \u001b[1m${serverDisplayName}\u001b[0m - ${t('mcp.status.blocked.server')}\n\n`;
  }

  // Add helpful tips when no arguments are provided
  if (showTips) {
    message += '\n';
    message += `${COLOR_CYAN}${t('mcp.status.tips')}${RESET_COLOR}\n`;
    message += `  • ${t('mcp.status.tip.desc')}\n`;
    message += `  • ${t('mcp.status.tip.schema')}\n`;
    message += `  • ${t('mcp.status.tip.nodesc')}\n`;
    message += `  • ${t('mcp.status.tip.auth')}\n`;
    message += `  • ${t('mcp.status.tip.toggle')}\n`;
    message += '\n';
  }

  // Make sure to reset any ANSI formatting at the end to prevent it from affecting the terminal
  message += RESET_COLOR;

  return {
    type: 'message',
    messageType: 'info',
    content: message,
  };
};

const authCommand: SlashCommand = {
  name: 'auth',
  description: t('command.mcp.auth.description'),
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<SlashCommandActionReturn> => {
    const serverName = args.trim();
    const { config } = context.services;

    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('error.config.not.loaded'),
      };
    }

    const mcpServers = config.getMcpServers() || {};

    if (!serverName) {
      // List servers that support OAuth
      const oauthServers = Object.entries(mcpServers)
        .filter(([_, server]) => server.oauth?.enabled)
        .map(([name, _]) => name);

      if (oauthServers.length === 0) {
        return {
          type: 'message',
          messageType: 'info',
          content: t('mcp.auth.no.oauth.servers'),
        };
      }

      return {
        type: 'message',
        messageType: 'info',
        content: tp('mcp.auth.oauth.servers.list', {
        servers: oauthServers.map((s) => `  - ${s}`).join('\n')
      }),
      };
    }

    const server = mcpServers[serverName];
    if (!server) {
      return {
        type: 'message',
        messageType: 'error',
        content: tp('mcp.auth.server.not.found', { serverName }),
      };
    }

    // Always attempt OAuth authentication, even if not explicitly configured
    // The authentication process will discover OAuth requirements automatically

    try {
      context.ui.addItem(
        {
          type: 'info',
          text: tp('mcp.auth.starting', { serverName }),
        },
        Date.now(),
      );

      context.ui.addItem(
        {
          type: 'info',
          text: tp('mcp.auth.opening.browser', {}),
        },
        Date.now(),
      );

      // Import dynamically to avoid circular dependencies
      const { MCPOAuthProvider } = await import('deepv-code-core');

      let oauthConfig = server.oauth;
      if (!oauthConfig) {
        oauthConfig = { enabled: false };
      }

      // Pass the MCP server URL for OAuth discovery
      const mcpServerUrl = server.httpUrl || server.url;
      await MCPOAuthProvider.authenticate(
        serverName,
        oauthConfig,
        mcpServerUrl,
        (output: string) => {
          context.ui.addItem(
            {
              type: 'info',
              text: output,
            },
            Date.now(),
          );
        },
      );

      context.ui.addItem(
        {
          type: 'info',
          text: tp('mcp.auth.success', { serverName }),
        },
        Date.now(),
      );

      // Trigger tool re-discovery to pick up authenticated server
      const toolRegistry = await config.getToolRegistry();
      if (toolRegistry) {
        context.ui.addItem(
          {
            type: 'info',
            text: tp('mcp.auth.rediscovering.tools', { serverName }),
          },
          Date.now(),
        );
        await toolRegistry.discoverToolsForServer(serverName);
      }
      // Update the client with the new tools
      const geminiClient = config.getGeminiClient();
      if (geminiClient) {
        await geminiClient.setTools();
      }

      // Display the updated MCP status to show newly discovered tools
      return getMcpStatus(context, false, false, false);
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: tp('mcp.auth.failed', { serverName, error: getErrorMessage(error) }),
      };
    }
  },
  completion: async (context: CommandContext, partialArg: string) => {
    const { config } = context.services;
    if (!config) return [];

    const mcpServers = config.getMcpServers() || {};
    return Object.keys(mcpServers).filter((name) =>
      name.startsWith(partialArg),
    );
  },
};

const listCommand: SlashCommand = {
  name: 'list',
  description: t('command.mcp.list.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext, args: string) => {
    const lowerCaseArgs = args.toLowerCase().split(/\s+/).filter(Boolean);

    const hasDesc =
      lowerCaseArgs.includes('desc') || lowerCaseArgs.includes('descriptions');
    const hasNodesc =
      lowerCaseArgs.includes('nodesc') ||
      lowerCaseArgs.includes('nodescriptions');
    const showSchema = lowerCaseArgs.includes('schema');

    // Show descriptions if `desc` or `schema` is present,
    // but `nodesc` takes precedence and disables them.
    const showDescriptions = !hasNodesc && (hasDesc || showSchema);

    // Show tips only when no arguments are provided
    const showTips = lowerCaseArgs.length === 0;

    return getMcpStatus(context, showDescriptions, showSchema, showTips);
  },
};

const refreshCommand: SlashCommand = {
  name: 'refresh',
  description: t('command.mcp.refresh.description'),
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
  ): Promise<SlashCommandActionReturn> => {
    const { config } = context.services;
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('error.config.not.loaded'),
      };
    }

    const toolRegistry = await config.getToolRegistry();
    if (!toolRegistry) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('error.tool.registry.unavailable'),
      };
    }

    context.ui.addItem(
      {
        type: 'info',
        text: t('mcp.refresh.starting'),
      },
      Date.now(),
    );

    await toolRegistry.discoverMcpTools();

    // Update the client with the new tools
    const geminiClient = config.getGeminiClient();
    if (geminiClient) {
      await geminiClient.setTools();
    }

    return getMcpStatus(context, false, false, false);
  },
};

const unloadCommand: SlashCommand = {
  name: 'unload',
  description: t('command.mcp.unload.description'),
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<SlashCommandActionReturn> => {
    const serverName = args.trim();
    const { config } = context.services;

    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('error.config.not.loaded'),
      };
    }

    if (!serverName) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('command.mcp.unload.usage'),
      };
    }

    const mcpServers = config.getMcpServers() || {};
    if (!mcpServers[serverName]) {
      return {
        type: 'message',
        messageType: 'error',
        content: tp('command.mcp.unload.server.not.found', { serverName }),
      };
    }

    try {
      const toolRegistry = await config.getToolRegistry();
      await unloadMcpServer(
        serverName,
        toolRegistry,
        config.getPromptRegistry(),
        config.getResourceRegistry(),
      );

      // Update the client with the new tools (so AI forgets the unloaded ones)
      const geminiClient = config.getGeminiClient();
      if (geminiClient) {
        await geminiClient.setTools();
      }

      return {
        type: 'message',
        messageType: 'info',
        content: tp('command.mcp.unload.success', { serverName }),
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: tp('command.mcp.unload.failed', {
          serverName,
          error: getErrorMessage(error),
        }),
      };
    }
  },
  completion: async (context: CommandContext, partialArg: string) => {
    const { config } = context.services;
    if (!config) return [];

    const mcpServers = config.getMcpServers() || {};
    return Object.keys(mcpServers).filter((name) =>
      name.startsWith(partialArg),
    );
  },
};

const loadCommand: SlashCommand = {
  name: 'load',
  description: t('command.mcp.load.description'),
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<SlashCommandActionReturn> => {
    const serverName = args.trim();
    const { config } = context.services;

    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('error.config.not.loaded'),
      };
    }

    if (!serverName) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('command.mcp.load.usage'),
      };
    }

    const mcpServers = config.getMcpServers() || {};
    if (!mcpServers[serverName]) {
      return {
        type: 'message',
        messageType: 'error',
        content: tp('mcp.auth.server.not.found', { serverName }),
      };
    }

    try {
      context.ui.addItem(
        {
          type: 'info',
          text: tp('mcp.starting', { count: 1 }),
        },
        Date.now(),
      );

      const toolRegistry = await config.getToolRegistry();
      await toolRegistry.discoverToolsForServer(serverName);

      // Update the client with the new tools
      const geminiClient = config.getGeminiClient();
      if (geminiClient) {
        await geminiClient.setTools();
      }

      return {
        type: 'message',
        messageType: 'info',
        content: tp('command.mcp.load.success', { serverName }),
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: tp('command.mcp.load.failed', {
          serverName,
          error: getErrorMessage(error),
        }),
      };
    }
  },
  completion: async (context: CommandContext, partialArg: string) => {
    const { config } = context.services;
    if (!config) return [];

    const mcpServers = config.getMcpServers() || {};
    return Object.keys(mcpServers).filter((name) =>
      name.startsWith(partialArg),
    );
  },
};

export const mcpCommand: SlashCommand = {
  name: 'mcp',
  description: t('command.mcp.description'),
  kind: CommandKind.BUILT_IN,
  subCommands: [listCommand, addCommand, authCommand, refreshCommand, unloadCommand, loadCommand, helpCommand],
  // Default action when no subcommand is provided
  action: async (context: CommandContext, args: string) =>
    // If no subcommand, run the list command
    listCommand.action!(context, args),
};
