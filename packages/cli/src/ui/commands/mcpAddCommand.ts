/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import {
  SlashCommand,
  SlashCommandActionReturn,
  CommandContext,
  CommandKind,
} from './types.js';
import { MCPServerConfig } from 'deepv-code-core';
import { SettingScope } from '../../config/settings.js';
import {
  getTemplate,
  getTemplateNames,
  isValidTemplate,
  getAllTemplates,
  MCPTemplate
} from './mcpTemplates.js';
import { t, tp } from '../../ui/utils/i18n.js';

const COLOR_GREEN = '\u001b[32m';
const COLOR_YELLOW = '\u001b[33m';
const COLOR_RED = '\u001b[31m';
const COLOR_CYAN = '\u001b[36m';
const COLOR_BLUE = '\u001b[34m';
const COLOR_MAGENTA = '\u001b[35m';
const COLOR_GREY = '\u001b[90m';
const RESET_COLOR = '\u001b[0m';
const BOLD = '\u001b[1m';

function normalizeScope(scope: string): SettingScope | null {
  const normalizedInput = scope.toLowerCase().trim();
  switch (normalizedInput) {
    case 'user':
      return SettingScope.User;
    case 'workspace':
      return SettingScope.Workspace;
    case 'system':
      return SettingScope.System;
    default:
      return null;
  }
}

interface AddCommandOptions {
  scope?: SettingScope;
  template?: string;
  description?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  envFile?: string;
  cwd?: string;
  url?: string;
  httpUrl?: string;
  tcp?: string;
  headers?: Record<string, string>;
  oauth?: boolean;
  authProvider?: string;
  timeout?: number;
  trust?: boolean;
  includeTools?: string[];
  excludeTools?: string[];
}

function parseArguments(args: string): { serverName?: string; options: AddCommandOptions } {
  const parts = args.trim().split(/\s+/);
  if (parts.length === 0 || parts[0] === '') {
    return { options: {} };
  }

  let serverName: string | undefined;
  const options: AddCommandOptions = {};

  // If first argument doesn't start with --, it's the server name
  if (parts[0] && !parts[0].startsWith('--')) {
    serverName = parts[0];
    parts.shift();
  }

  // Parse options
  for (let i = 0; i < parts.length; i++) {
    const arg = parts[i];
    const nextArg = parts[i + 1];

    switch (arg) {
      case '--scope':
        if (nextArg && !nextArg.startsWith('--')) {
          // Validate and normalize scope value
          const normalizedScope = normalizeScope(nextArg);
          if (normalizedScope) {
            options.scope = normalizedScope;
          } else {
            throw new Error(`Invalid scope: ${nextArg}. Valid scopes are: user, workspace, system`);
          }
          i++;
        }
        break;
      case '--template':
        if (nextArg && !nextArg.startsWith('--')) {
          options.template = nextArg;
          i++;
        }
        break;
      case '--description':
        if (nextArg && !nextArg.startsWith('--')) {
          options.description = nextArg;
          i++;
        }
        break;
      case '--command':
        if (nextArg && !nextArg.startsWith('--')) {
          options.command = nextArg;
          i++;
        }
        break;
      case '--args':
        if (nextArg && !nextArg.startsWith('--')) {
          options.args = options.args || [];
          options.args.push(nextArg);
          i++;
        }
        break;
      case '--env':
        if (nextArg && !nextArg.startsWith('--')) {
          const [key, ...valueParts] = nextArg.split('=');
          if (key && valueParts.length > 0) {
            options.env = options.env || {};
            options.env[key] = valueParts.join('=');
          }
          i++;
        }
        break;
      case '--env-file':
        if (nextArg && !nextArg.startsWith('--')) {
          options.envFile = nextArg;
          i++;
        }
        break;
      case '--cwd':
        if (nextArg && !nextArg.startsWith('--')) {
          options.cwd = nextArg;
          i++;
        }
        break;
      case '--url':
        if (nextArg && !nextArg.startsWith('--')) {
          options.url = nextArg;
          i++;
        }
        break;
      case '--http-url':
        if (nextArg && !nextArg.startsWith('--')) {
          options.httpUrl = nextArg;
          i++;
        }
        break;
      case '--tcp':
        if (nextArg && !nextArg.startsWith('--')) {
          options.tcp = nextArg;
          i++;
        }
        break;
      case '--headers':
        if (nextArg && !nextArg.startsWith('--')) {
          const [key, ...valueParts] = nextArg.split('=');
          if (key && valueParts.length > 0) {
            options.headers = options.headers || {};
            options.headers[key] = valueParts.join('=');
          }
          i++;
        }
        break;
      case '--oauth':
        options.oauth = true;
        break;
      case '--auth-provider':
        if (nextArg && !nextArg.startsWith('--')) {
          options.authProvider = nextArg;
          i++;
        }
        break;
      case '--timeout':
        if (nextArg && !nextArg.startsWith('--')) {
          const timeout = parseInt(nextArg, 10);
          if (!isNaN(timeout)) {
            options.timeout = timeout;
          }
          i++;
        }
        break;
      case '--trust':
        options.trust = true;
        break;
      case '--include-tools':
        if (nextArg && !nextArg.startsWith('--')) {
          options.includeTools = nextArg.split(',').map(t => t.trim());
          i++;
        }
        break;
      case '--exclude-tools':
        if (nextArg && !nextArg.startsWith('--')) {
          options.excludeTools = nextArg.split(',').map(t => t.trim());
          i++;
        }
        break;
    }
  }

  return { serverName, options };
}

async function showInteractiveWizard(): Promise<SlashCommandActionReturn> {
  return {
    type: 'message',
    messageType: 'info',
    content: `${COLOR_CYAN}${BOLD}${t('mcp.wizard.title')}${RESET_COLOR}

${COLOR_YELLOW}${t('mcp.wizard.config.ways')}${RESET_COLOR}

${COLOR_CYAN}● ${t('mcp.wizard.predefined')}${RESET_COLOR} - ${t('mcp.wizard.predefined.desc')}
${COLOR_CYAN}● ${t('mcp.wizard.custom')}${RESET_COLOR} - ${t('mcp.wizard.custom.desc')}
${COLOR_CYAN}● ${t('mcp.wizard.view.templates')}${RESET_COLOR} - ${t('mcp.wizard.view.templates.desc')}

${COLOR_BLUE}${t('mcp.wizard.available.templates')}${RESET_COLOR}
${getAllTemplates().map((template, index) =>
  `  ${COLOR_GREEN}${template.name}${RESET_COLOR} - ${template.description}`
).join('\n')}

${COLOR_MAGENTA}${t('mcp.wizard.examples')}${RESET_COLOR}
  ${COLOR_CYAN}/mcp add github${RESET_COLOR}                   # 添加GitHub服务器
  ${COLOR_CYAN}/mcp add sqlite --args "./data.db"${RESET_COLOR}   # 添加SQLite服务器
  ${COLOR_CYAN}/mcp add custom --command "npx @my/server"${RESET_COLOR}

${COLOR_GREY}${t('mcp.wizard.help.hint')}${RESET_COLOR}`
  };
}

async function addFromTemplate(
  context: CommandContext,
  serverName: string,
  templateName: string,
  options: AddCommandOptions
): Promise<SlashCommandActionReturn> {
  const template = getTemplate(templateName);
  if (!template) {
    return {
      type: 'message',
      messageType: 'error',
      content: `${COLOR_RED}${tp('mcp.error.template.not.exist', {
        templateName,
        availableTemplates: getTemplateNames().join(', ')
      })}${RESET_COLOR}`
    };
  }

  // Check if server already exists
  const { config } = context.services;
  const existingServers = config?.getMcpServers() || {};
  if (existingServers[serverName]) {
    return {
      type: 'message',
      messageType: 'error',
      content: `${COLOR_RED}${tp('mcp.error.server.already.exists', { serverName })}${RESET_COLOR}`
    };
  }

  // Build configuration from template
  const serverConfig = new MCPServerConfig(
    template.config.command,
    options.args || template.config.args,
    { ...template.config.env, ...(options.env || {}) },
    options.cwd || template.config.cwd,
    options.url || template.config.url,
    options.httpUrl || template.config.httpUrl,
    { ...template.config.headers, ...(options.headers || {}) },
    options.tcp || template.config.tcp,
    options.timeout || template.config.timeout,
    options.trust || template.config.trust,
    options.description || template.config.description || template.description,
    options.includeTools || template.config.includeTools,
    options.excludeTools || template.config.excludeTools
  );

  // Save configuration
  try {
    const scope = options.scope || SettingScope.Workspace;
    const settings = context.services.settings;

    // Get current servers
    const currentServers = settings.forScope(scope).settings.mcpServers || {};

    // Add new server
    const updatedServers = {
      ...currentServers,
      [serverName]: serverConfig
    };

    // Save to settings
    settings.setValue(scope, 'mcpServers', updatedServers);

    // Update runtime config to enable hot reload
    if (context.services.config) {
      context.services.config.updateMcpServers(updatedServers);
    }

    // Check for missing environment variables
    const missingEnv = (template.requiredEnv || []).filter(envVar => !process.env[envVar]);

    let statusMessage = `${COLOR_GREEN}${tp('mcp.success.server.added', { serverName })}${RESET_COLOR}

${COLOR_BLUE}${t('mcp.success.config.location')}${RESET_COLOR} ${settings.forScope(scope).path}
${COLOR_BLUE}${t('mcp.success.template')}${RESET_COLOR} ${template.displayName}
${COLOR_BLUE}${t('mcp.success.description')}${RESET_COLOR} ${template.description}`;

    if (missingEnv.length > 0) {
      statusMessage += `

${COLOR_YELLOW}${t('mcp.warning.missing.env')}${RESET_COLOR}
${missingEnv.map(env => `  ${COLOR_RED}${env}${RESET_COLOR}`).join('\n')}

${COLOR_CYAN}${t('mcp.setup.instructions')}${RESET_COLOR}
${template.setup?.instructions?.map(instruction => `  ${instruction}`).join('\n') || t('mcp.setup.default.instruction')}`;
    }

    statusMessage += `

${COLOR_CYAN}${t('mcp.related.links')}${RESET_COLOR}
${template.setup?.links?.map(link => `  ${link}`).join('\n') || ''}

${COLOR_GREY}${t('mcp.success.config.effective')}${RESET_COLOR}`;

    return {
      type: 'message',
      messageType: 'info',
      content: statusMessage
    };

  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `${COLOR_RED}${tp('mcp.error.save.config.failed', {
        error: error instanceof Error ? error.message : String(error)
      })}${RESET_COLOR}`
    };
  }
}

async function addCustomServer(
  context: CommandContext,
  serverName: string,
  options: AddCommandOptions
): Promise<SlashCommandActionReturn> {
  // Validate required parameters
  if (!options.command && !options.url && !options.httpUrl && !options.tcp) {
    return {
      type: 'message',
      messageType: 'error',
      content: `${COLOR_RED}${t('mcp.error.missing.connection.params')}${RESET_COLOR}`
    };
  }

  // Check if server already exists
  const { config } = context.services;
  const existingServers = config?.getMcpServers() || {};
  if (existingServers[serverName]) {
    return {
      type: 'message',
      messageType: 'error',
      content: `${COLOR_RED}${tp('mcp.error.server.already.exists', { serverName })}${RESET_COLOR}`
    };
  }

  // Build configuration
  const serverConfig = new MCPServerConfig(
    options.command,
    options.args,
    options.env,
    options.cwd,
    options.url,
    options.httpUrl,
    options.headers,
    options.tcp,
    options.timeout,
    options.trust,
    options.description,
    options.includeTools,
    options.excludeTools
  );

  // Save configuration
  try {
    const scope = options.scope || SettingScope.Workspace;
    const settings = context.services.settings;

    // Get current servers
    const currentServers = settings.forScope(scope).settings.mcpServers || {};

    // Add new server
    const updatedServers = {
      ...currentServers,
      [serverName]: serverConfig
    };

    // Save to settings
    settings.setValue(scope, 'mcpServers', updatedServers);

    // Update runtime config to enable hot reload
    if (context.services.config) {
      context.services.config.updateMcpServers(updatedServers);
    }

    const statusMessage = `${COLOR_GREEN}${tp('mcp.success.server.added', { serverName })}${RESET_COLOR}

${COLOR_BLUE}${t('mcp.success.config.location')}${RESET_COLOR} ${settings.forScope(scope).path}
${COLOR_BLUE}${t('mcp.success.connection.method')}${RESET_COLOR} ${options.command ? tp('mcp.success.command', { command: options.command }) :
                                      options.url ? tp('mcp.success.sse', { url: options.url }) :
                                      options.httpUrl ? tp('mcp.success.http', { url: options.httpUrl }) :
                                      options.tcp ? tp('mcp.success.tcp', { tcp: options.tcp }) : t('mcp.success.unknown')}
${options.description ? `${COLOR_BLUE}${t('mcp.success.description')}${RESET_COLOR} ${options.description}` : ''}

${COLOR_GREY}${t('mcp.success.config.effective')}${RESET_COLOR}`;

    return {
      type: 'message',
      messageType: 'info',
      content: statusMessage
    };

  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `${COLOR_RED}${tp('mcp.error.save.config.failed', {
        error: error instanceof Error ? error.message : String(error)
      })}${RESET_COLOR}`
    };
  }
}

// Add command implementation
const addCommand: SlashCommand = {
  name: 'add',
  description: t('mcp.add.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext, args: string): Promise<SlashCommandActionReturn> => {
    try {
      const { serverName, options } = parseArguments(args);

      // If no server name provided, show interactive wizard
      if (!serverName) {
        return showInteractiveWizard();
      }

      // If server name is a valid template, use template-based configuration
      if (isValidTemplate(serverName)) {
        return addFromTemplate(context, serverName, serverName, options);
      }

      // If template option is specified, use it
      if (options.template && isValidTemplate(options.template)) {
        return addFromTemplate(context, serverName, options.template, options);
      }

      // Otherwise, use custom configuration
      return addCustomServer(context, serverName, options);
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `${COLOR_RED}❌ ${error instanceof Error ? error.message : String(error)}${RESET_COLOR}`
      };
    }
  },

  completion: async (context: CommandContext, partialArg: string) => {
    // Provide template name completions
    const templates = getTemplateNames();
    return templates.filter(name => name.startsWith(partialArg.toLowerCase()));
  }
};

export { addCommand };