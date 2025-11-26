/**
 * DeepV Code Skills Command
 *
 * Manages AI Skills: Marketplace → Plugin → Skill
 */

import { MessageType } from '../types.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';
import type { Suggestion } from '../components/SuggestionsDisplay.js';
import { t } from '../utils/i18n.js';
import {
  SettingsManager,
  MarketplaceManager,
  PluginInstaller,
  SkillLoader,
  SkillLoadLevel,
  type Marketplace,
  type Plugin,
  type Skill,
} from '../../services/skill/index.js';
import { clearSkillsContextCache } from '../../services/skill/skills-integration.js';

/**
 * 初始化 Skills 系统组件
 */
async function initSkillsSystem() {
  const settings = new SettingsManager();
  await settings.initialize();

  const marketplace = new MarketplaceManager(settings);
  const installer = new PluginInstaller(settings, marketplace);
  const loader = new SkillLoader(settings, marketplace);

  return { settings, marketplace, installer, loader };
}

/**
 * 格式化 Marketplace 信息
 */
function formatMarketplace(mp: Marketplace): string {
  const lines: string[] = [];
  lines.push(`📦 ${mp.name} (${mp.id})`);
  lines.push(`   Source: ${mp.source === 'git' ? mp.url : mp.path}`);
  lines.push(`   Plugins: ${mp.plugins.length}`);
  if (mp.description) {
    lines.push(`   Description: ${mp.description}`);
  }
  if (mp.official) {
    lines.push(`   ⭐ Official`);
  }
  return lines.join('\n');
}

/**
 * 格式化 Plugin 信息
 */
function formatPlugin(plugin: Plugin, installed = false): string {
  const lines: string[] = [];
  const status = installed ? '✅' : '❌';
  lines.push(`🔌 ${plugin.name} ${status}`);
  lines.push(`   ID: ${plugin.id}`);
  lines.push(`   Description: ${plugin.description}`);
  lines.push(`   Skills: ${plugin.skillPaths.length}`);
  return lines.join('\n');
}

/**
 * 格式化 Skill 信息
 */
function formatSkill(skill: Skill): string {
  const lines: string[] = [];
  lines.push(`⚡ ${skill.name}`);
  lines.push(`   ${skill.description}`);
  if (skill.metadata.allowedTools && skill.metadata.allowedTools.length > 0) {
    lines.push(`   Tools: ${skill.metadata.allowedTools.join(', ')}`);
  }
  return lines.join('\n');
}

export const skillCommand: SlashCommand = {
  name: 'skill',
  description: 'Manage AI Skills (Marketplace → Plugin → Skill)',
  kind: CommandKind.BUILT_IN,

  action: async (context: CommandContext) => {
    // 显示帮助信息
    const helpText = `DeepV Code Skills System

Manage AI Skills with a three-tier architecture:
  Marketplace → Plugin → Skill

Commands:
  /skill marketplace list              - List all marketplaces
  /skill marketplace add <url> [alias] - Add a marketplace
  /skill marketplace update <name>     - Update marketplace
  /skill marketplace remove <name>     - Remove marketplace
  /skill marketplace browse <name>     - Browse plugins

  /skill plugin list [marketplace]     - List plugins
  /skill plugin install <mp> <name>    - Install a plugin
  /skill plugin uninstall <id>         - Uninstall a plugin
  /skill plugin enable <id>            - Enable a plugin
  /skill plugin disable <id>           - Disable a plugin
  /skill plugin info <id>              - Show plugin info

  /skill list                          - List all skills
  /skill info <id>                     - Show skill details
  /skill stats                         - Show statistics

Quick Start:
  1. Add official marketplace:
     /skill marketplace add https://github.com/anthropics/skills.git

  2. Browse plugins:
     /skill marketplace browse skills

  3. Install a plugin:
     /skill plugin install skills example-skills

  4. View skills:
     /skill list`;

    context.ui.addItem(
      {
        type: MessageType.INFO,
        text: helpText,
      },
      Date.now(),
    );
  },

  subCommands: [
    // ========================================================================
    // /skill marketplace
    // ========================================================================
    {
      name: 'marketplace',
      description: 'Manage Skills marketplaces',
      kind: CommandKind.BUILT_IN,

      action: async (context: CommandContext) => {
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: 'Usage: /skill marketplace <list|add|update|remove|browse>',
          },
          Date.now(),
        );
      },

      subCommands: [
        {
          name: 'list',
          description: 'List all marketplaces',
          kind: CommandKind.BUILT_IN,

          action: async (context: CommandContext) => {
            try {
              const { marketplace } = await initSkillsSystem();
              const marketplaces = await marketplace.listMarketplaces();

              if (marketplaces.length === 0) {
                context.ui.addItem(
                  {
                    type: MessageType.INFO,
                    text: 'No marketplaces installed.\n\nAdd one:\n  /skill marketplace add https://github.com/anthropics/anthropic-agent-skills.git',
                  },
                  Date.now(),
                );
                return;
              }

              const text = `Found ${marketplaces.length} marketplace(s):\n\n${
                marketplaces.map(formatMarketplace).join('\n\n')
              }`;

              context.ui.addItem(
                {
                  type: MessageType.INFO,
                  text,
                },
                Date.now(),
              );
            } catch (error) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: `Failed to list marketplaces: ${error instanceof Error ? error.message : String(error)}`,
                },
                Date.now(),
              );
            }
          },
        },

        {
          name: 'add',
          description: 'Add a marketplace from Git URL or local path',
          kind: CommandKind.BUILT_IN,

          action: async (context: CommandContext, args?: string) => {
            const location = args?.trim();

            if (!location) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: 'Usage: /skill marketplace add <url|path> [alias] [--name <name>]',
                },
                Date.now(),
              );
              return;
            }

            try {
              const { marketplace } = await initSkillsSystem();

              // Parse options
              const parts = location.split(/\s+/);
              const url = parts[0];

              let name: string | undefined;
              const nameIndex = parts.indexOf('--name');

              if (nameIndex !== -1 && parts[nameIndex + 1]) {
                name = parts[nameIndex + 1];
              } else if (parts.length > 1 && !parts[1].startsWith('--')) {
                // Support positional alias: /skill marketplace add <url> <alias>
                name = parts[1];
              }

              context.ui.addItem(
                {
                  type: MessageType.INFO,
                  text: `Adding marketplace from ${url}${name ? ` as ${name}` : ''}...`,
                },
                Date.now(),
              );

              let mp;
              if (url.startsWith('http://') || url.startsWith('https://')) {
                mp = await marketplace.addGitMarketplace(url, name);
              } else {
                mp = await marketplace.addLocalMarketplace(url, name);
              }

              // Clear Skills context cache to reload
              clearSkillsContextCache();

              context.ui.addItem(
                {
                  type: MessageType.INFO,
                  text: `✅ Successfully added: ${mp.name}\n   ID: ${mp.id}\n   Plugins: ${mp.plugins.length}`,
                },
                Date.now(),
              );
            } catch (error) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: `Failed to add marketplace: ${error instanceof Error ? error.message : String(error)}`,
                },
                Date.now(),
              );
            }
          },
        },

        {
          name: 'update',
          description: 'Update a marketplace (git pull)',
          kind: CommandKind.BUILT_IN,

          action: async (context: CommandContext, args?: string) => {
            const marketplaceId = args?.trim();

            if (!marketplaceId) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: 'Usage: /skill marketplace update <name>',
                },
                Date.now(),
              );
              return;
            }

            try {
              const { marketplace } = await initSkillsSystem();

              context.ui.addItem(
                {
                  type: MessageType.INFO,
                  text: `Updating marketplace ${marketplaceId}...`,
                },
                Date.now(),
              );

              const mp = await marketplace.updateMarketplace(marketplaceId);

              // Clear Skills context cache
              clearSkillsContextCache();

              context.ui.addItem(
                {
                  type: MessageType.INFO,
                  text: `✅ Successfully updated: ${mp.name}\n   Plugins: ${mp.plugins.length}`,
                },
                Date.now(),
              );
            } catch (error) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: `Failed to update marketplace: ${error instanceof Error ? error.message : String(error)}`,
                },
                Date.now(),
              );
            }
          },
        },

        {
          name: 'remove',
          description: 'Remove a marketplace',
          kind: CommandKind.BUILT_IN,

          completion: async (context: CommandContext, partialArg: string): Promise<Suggestion[]> => {
            try {
              const { marketplace } = await initSkillsSystem();
              const mps = await marketplace.listMarketplaces();
              return mps
                .filter(mp => mp.id.startsWith(partialArg))
                .map(mp => ({
                  label: mp.name,
                  value: mp.id,
                  description: mp.description || mp.url
                }));
            } catch (error) {
              return [];
            }
          },

          action: async (context: CommandContext, args?: string) => {
            const marketplaceId = args?.trim();

            try {
              const { marketplace } = await initSkillsSystem();

              if (!marketplaceId) {
                // List available marketplaces for removal
                const marketplaces = await marketplace.listMarketplaces();

                if (marketplaces.length === 0) {
                  context.ui.addItem(
                    {
                      type: MessageType.INFO,
                      text: 'No marketplaces installed.',
                    },
                    Date.now(),
                  );
                  return;
                }

                const text = `Please select a marketplace to remove:\n\n${
                  marketplaces.map(mp => `📦 ${mp.name} (${mp.id})\n   Usage: /skill marketplace remove ${mp.id}`).join('\n\n')
                }`;

                context.ui.addItem(
                  {
                    type: MessageType.INFO,
                    text,
                  },
                  Date.now(),
                );
                return;
              }

              const parts = marketplaceId.split(/\s+/);
              const id = parts[0];
              const deleteFiles = parts.includes('--delete-files');

              await marketplace.removeMarketplace(id, deleteFiles);

              // Clear Skills context cache
              clearSkillsContextCache();

              context.ui.addItem(
                {
                  type: MessageType.INFO,
                  text: `✅ Successfully removed: ${id}${deleteFiles ? '\n   Files deleted from disk' : ''}`,
                },
                Date.now(),
              );
            } catch (error) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: `Failed to remove marketplace: ${error instanceof Error ? error.message : String(error)}`,
                },
                Date.now(),
              );
            }
          },
        },

        {
          name: 'browse',
          description: 'Browse plugins in a marketplace',
          kind: CommandKind.BUILT_IN,

          completion: async (context: CommandContext, partialArg: string): Promise<Suggestion[]> => {
            try {
              const { marketplace } = await initSkillsSystem();
              const mps = await marketplace.listMarketplaces();
              return mps
                .filter(mp => mp.id.startsWith(partialArg))
                .map(mp => ({
                  label: mp.name,
                  value: mp.id,
                  description: mp.description || mp.url
                }));
            } catch (error) {
              return [];
            }
          },

          action: async (context: CommandContext, args?: string) => {
            const input = args?.trim();

            try {
              const { marketplace } = await initSkillsSystem();

              if (!input) {
                // List available marketplaces for browsing
                const marketplaces = await marketplace.listMarketplaces();

                if (marketplaces.length === 0) {
                  context.ui.addItem(
                    {
                      type: MessageType.INFO,
                      text: 'No marketplaces installed.\n\nAdd one:\n  /skill marketplace add https://github.com/anthropics/anthropic-agent-skills.git',
                    },
                    Date.now(),
                  );
                  return;
                }

                const text = `Please select a marketplace to browse:\n\n${
                  marketplaces.map(mp => `📦 ${mp.name} (${mp.id})\n   Usage: /skill marketplace browse ${mp.id}`).join('\n\n')
                }`;

                context.ui.addItem(
                  {
                    type: MessageType.INFO,
                    text,
                  },
                  Date.now(),
                );
                return;
              }

              const parts = input.split(/\s+/);
              const marketplaceId = parts[0];
              const query = parts.slice(1).join(' ');

              const plugins = await marketplace.browseMarketplace(marketplaceId, query);

              if (plugins.length === 0) {
                context.ui.addItem(
                  {
                    type: MessageType.INFO,
                    text: `No plugins found in ${marketplaceId}${query ? ` (query: "${query}")` : ''}`,
                  },
                  Date.now(),
                );
                return;
              }

              const text = `Found ${plugins.length} plugin(s) in ${marketplaceId}:\n\n${
                plugins.map(p => formatPlugin(p, p.installed)).join('\n\n')
              }`;

              context.ui.addItem(
                {
                  type: MessageType.INFO,
                  text,
                },
                Date.now(),
              );
            } catch (error) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: `Failed to browse marketplace: ${error instanceof Error ? error.message : String(error)}`,
                },
                Date.now(),
              );
            }
          },
        },
      ],
    },

    // ========================================================================
    // /skill plugin
    // ========================================================================
    {
      name: 'plugin',
      description: 'Manage Skills plugins',
      kind: CommandKind.BUILT_IN,

      action: async (context: CommandContext) => {
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: 'Usage: /skill plugin <list|install|uninstall|enable|disable|info>',
          },
          Date.now(),
        );
      },

      subCommands: [
        {
          name: 'list',
          description: 'List installed plugins or available plugins',
          kind: CommandKind.BUILT_IN,

          completion: async (context: CommandContext, partialArg: string): Promise<Suggestion[]> => {
            try {
              const { marketplace } = await initSkillsSystem();
              const mps = await marketplace.listMarketplaces();
              return mps
                .filter(mp => mp.id.startsWith(partialArg))
                .map(mp => ({
                  label: mp.name,
                  value: mp.id,
                  description: mp.description || mp.url
                }));
            } catch (error) {
              return [];
            }
          },

          action: async (context: CommandContext, args?: string) => {
            const marketplaceId = args?.trim();

            try {
              const { marketplace, installer } = await initSkillsSystem();

              if (marketplaceId) {
                // List available plugins in marketplace
                const plugins = await marketplace.getPlugins(marketplaceId);

                if (plugins.length === 0) {
                  context.ui.addItem(
                    {
                      type: MessageType.INFO,
                      text: `No plugins found in ${marketplaceId}`,
                    },
                    Date.now(),
                  );
                  return;
                }

                const text = `Available plugins in ${marketplaceId}:\n\n${
                  plugins.map(p => formatPlugin(p, p.installed)).join('\n\n')
                }`;

                context.ui.addItem(
                  {
                    type: MessageType.INFO,
                    text,
                  },
                  Date.now(),
                );
              } else {
                // List installed plugins
                const plugins = await installer.getInstalledPlugins();

                if (plugins.length === 0) {
                  context.ui.addItem(
                    {
                      type: MessageType.INFO,
                      text: 'No plugins installed.\n\nInstall one:\n  /skill plugin install <marketplace> <plugin-name>',
                    },
                    Date.now(),
                  );
                  return;
                }

                const lines = [`Installed plugins (${plugins.length}):\n`];
                for (const p of plugins) {
                  const status = p.enabled ? '✅ Enabled' : '❌ Disabled';
                  lines.push(`🔌 ${p.name} (${status})`);
                  lines.push(`   ID: ${p.id}`);
                  lines.push(`   Marketplace: ${p.marketplaceId}`);
                  lines.push(`   Skills: ${p.skillCount}`);
                  lines.push('');
                }

                context.ui.addItem(
                  {
                    type: MessageType.INFO,
                    text: lines.join('\n'),
                  },
                  Date.now(),
                );
              }
            } catch (error) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: `Failed to list plugins: ${error instanceof Error ? error.message : String(error)}`,
                },
                Date.now(),
              );
            }
          },
        },

        {
          name: 'install',
          description: 'Install a plugin from marketplace',
          kind: CommandKind.BUILT_IN,

          completion: async (context: CommandContext, partialArg: string): Promise<Suggestion[]> => {
            try {
              const { marketplace } = await initSkillsSystem();

              // Find the first space to separate marketplace ID from plugin name
              const firstSpaceIndex = partialArg.indexOf(' ');

              if (firstSpaceIndex === -1) {
                // Case 1: Typing Marketplace ID
                const input = partialArg.toLowerCase();
                const mps = await marketplace.listMarketplaces();
                return mps
                  .filter(mp => mp.id.toLowerCase().startsWith(input))
                  .map(mp => ({
                    label: mp.name,
                    value: mp.id + ' ', // Add space to auto-advance
                    description: mp.description || mp.url
                  }));
              } else {
                // Case 2: Typing Plugin Name (Marketplace ID is fixed)
                const marketplaceId = partialArg.substring(0, firstSpaceIndex);
                // Use trimStart to handle multiple spaces between args
                const pluginInput = partialArg.substring(firstSpaceIndex).trimStart().toLowerCase();

                try {
                  const plugins = await marketplace.getPlugins(marketplaceId);
                  return plugins
                    .filter(p => p.name.toLowerCase().includes(pluginInput))
                    .map(p => ({
                      label: p.name,
                      value: `${marketplaceId} ${p.name}`,
                      description: p.description
                    }));
                } catch (e) {
                  return [];
                }
              }
            } catch (error) {
              return [];
            }
          },

          action: async (context: CommandContext, args?: string) => {
            const input = args?.trim();

            if (!input) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: 'Usage: /skill plugin install <marketplace> <plugin-name>',
                },
                Date.now(),
              );
              return;
            }

            try {
              const parts = input.split(/\s+/);
              if (parts.length < 2) {
                throw new Error('Both marketplace and plugin name required');
              }

              const [marketplaceId, pluginName] = parts;

              const { installer } = await initSkillsSystem();

              context.ui.addItem(
                {
                  type: MessageType.INFO,
                  text: `Installing plugin ${pluginName} from ${marketplaceId}...`,
                },
                Date.now(),
              );

              const plugin = await installer.installPlugin(marketplaceId, pluginName);

              // Clear Skills context cache
              clearSkillsContextCache();

              context.ui.addItem(
                {
                  type: MessageType.INFO,
                  text: `✅ Successfully installed: ${plugin.name}\n   ID: ${plugin.id}\n   Skills: ${plugin.skillPaths.length}\n   Status: Enabled`,
                },
                Date.now(),
              );
            } catch (error) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: `Failed to install plugin: ${error instanceof Error ? error.message : String(error)}`,
                },
                Date.now(),
              );
            }
          },
        },

        {
          name: 'uninstall',
          description: 'Uninstall a plugin',
          kind: CommandKind.BUILT_IN,

          completion: async (context: CommandContext, partialArg: string): Promise<Suggestion[]> => {
            try {
              const { installer } = await initSkillsSystem();
              const plugins = await installer.getInstalledPlugins();
              const input = partialArg.trim().toLowerCase();

              return plugins
                .filter(p => p.id.toLowerCase().includes(input) || p.name.toLowerCase().includes(input))
                .map(p => ({
                  label: p.name,
                  value: p.id,
                  description: `${p.description} (${p.id})`
                }));
            } catch (error) {
              return [];
            }
          },

          action: async (context: CommandContext, args?: string) => {
            const pluginId = args?.trim();

            if (!pluginId) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: 'Usage: /skill plugin uninstall <plugin-id> [--delete-files]',
                },
                Date.now(),
              );
              return;
            }

            try {
              const { installer } = await initSkillsSystem();

              const parts = pluginId.split(/\s+/);
              const id = parts[0];
              const deleteFiles = parts.includes('--delete-files');

              await installer.uninstallPlugin(id, deleteFiles);

              // Clear Skills context cache
              clearSkillsContextCache();

              context.ui.addItem(
                {
                  type: MessageType.INFO,
                  text: `✅ Successfully uninstalled: ${id}${deleteFiles ? '\n   Files deleted from disk' : ''}`,
                },
                Date.now(),
              );
            } catch (error) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: `Failed to uninstall plugin: ${error instanceof Error ? error.message : String(error)}`,
                },
                Date.now(),
              );
            }
          },
        },

        {
          name: 'enable',
          description: 'Enable a plugin',
          kind: CommandKind.BUILT_IN,

          completion: async (context: CommandContext, partialArg: string): Promise<Suggestion[]> => {
            try {
              const { installer } = await initSkillsSystem();
              const plugins = await installer.getInstalledPlugins();
              const input = partialArg.trim().toLowerCase();

              return plugins
                .filter(p => p.id.toLowerCase().includes(input) || p.name.toLowerCase().includes(input))
                .map(p => ({
                  label: p.name,
                  value: p.id,
                  description: `${p.description} (${p.id})`
                }));
            } catch (error) {
              return [];
            }
          },

          action: async (context: CommandContext, args?: string) => {
            const pluginId = args?.trim();

            if (!pluginId) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: 'Usage: /skill plugin enable <plugin-id>',
                },
                Date.now(),
              );
              return;
            }

            try {
              const { installer } = await initSkillsSystem();
              await installer.enablePlugin(pluginId);

              // Clear Skills context cache
              clearSkillsContextCache();

              context.ui.addItem(
                {
                  type: MessageType.INFO,
                  text: `✅ Successfully enabled: ${pluginId}\n\nSkills from this plugin are now available.`,
                },
                Date.now(),
              );
            } catch (error) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: `Failed to enable plugin: ${error instanceof Error ? error.message : String(error)}`,
                },
                Date.now(),
              );
            }
          },
        },

        {
          name: 'disable',
          description: 'Disable a plugin',
          kind: CommandKind.BUILT_IN,

          completion: async (context: CommandContext, partialArg: string): Promise<Suggestion[]> => {
            try {
              const { installer } = await initSkillsSystem();
              const plugins = await installer.getInstalledPlugins();
              const input = partialArg.trim().toLowerCase();

              return plugins
                .filter(p => p.id.toLowerCase().includes(input) || p.name.toLowerCase().includes(input))
                .map(p => ({
                  label: p.name,
                  value: p.id,
                  description: `${p.description} (${p.id})`
                }));
            } catch (error) {
              return [];
            }
          },

          action: async (context: CommandContext, args?: string) => {
            const pluginId = args?.trim();

            if (!pluginId) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: 'Usage: /skill plugin disable <plugin-id>',
                },
                Date.now(),
              );
              return;
            }

            try {
              const { installer } = await initSkillsSystem();
              await installer.disablePlugin(pluginId);

              // Clear Skills context cache
              clearSkillsContextCache();

              context.ui.addItem(
                {
                  type: MessageType.INFO,
                  text: `✅ Successfully disabled: ${pluginId}\n\nSkills from this plugin are no longer available.`,
                },
                Date.now(),
              );
            } catch (error) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: `Failed to disable plugin: ${error instanceof Error ? error.message : String(error)}`,
                },
                Date.now(),
              );
            }
          },
        },

        {
          name: 'info',
          description: 'Show plugin information',
          kind: CommandKind.BUILT_IN,

          completion: async (context: CommandContext, partialArg: string): Promise<Suggestion[]> => {
            try {
              const { installer } = await initSkillsSystem();
              const plugins = await installer.getInstalledPlugins();
              const input = partialArg.trim().toLowerCase();

              return plugins
                .filter(p => p.id.toLowerCase().includes(input) || p.name.toLowerCase().includes(input))
                .map(p => ({
                  label: p.name,
                  value: p.id,
                  description: `${p.description} (${p.id})`
                }));
            } catch (error) {
              return [];
            }
          },

          action: async (context: CommandContext, args?: string) => {
            const pluginId = args?.trim();

            if (!pluginId) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: 'Usage: /skill plugin info <plugin-id>',
                },
                Date.now(),
              );
              return;
            }

            try {
              const { installer, marketplace } = await initSkillsSystem();

              const installedInfo = await installer.getPluginInfo(pluginId);

              if (!installedInfo) {
                context.ui.addItem(
                  {
                    type: MessageType.INFO,
                    text: `Plugin ${pluginId} is not installed.`,
                  },
                  Date.now(),
                );
                return;
              }

              const lines = [
                `Plugin: ${installedInfo.name}`,
                `ID: ${installedInfo.id}`,
                `Marketplace: ${installedInfo.marketplaceId}`,
                `Status: ${installedInfo.enabled ? '✅ Enabled' : '❌ Disabled'}`,
                `Skills: ${installedInfo.skillCount}`,
                `Installed: ${new Date(installedInfo.installedAt).toLocaleString()}`,
              ];

              if (installedInfo.version) {
                lines.push(`Version: ${installedInfo.version}`);
              }

              // Try to get full plugin details
              try {
                const [marketplaceId] = pluginId.split(':');
                const plugins = await marketplace.getPlugins(marketplaceId);
                const fullPlugin = plugins.find(p => p.id === pluginId);

                if (fullPlugin) {
                  lines.push('');
                  lines.push('Description:');
                  lines.push(`  ${fullPlugin.description}`);
                  lines.push('');
                  lines.push('Skills:');
                  for (const skillPath of fullPlugin.skillPaths) {
                    lines.push(`  - ${skillPath}`);
                  }
                }
              } catch {
                // Ignore if marketplace not available
              }

              context.ui.addItem(
                {
                  type: MessageType.INFO,
                  text: lines.join('\n'),
                },
                Date.now(),
              );
            } catch (error) {
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: `Failed to get plugin info: ${error instanceof Error ? error.message : String(error)}`,
                },
                Date.now(),
              );
            }
          },
        },
      ],
    },

    // ========================================================================
    // /skill list
    // ========================================================================
    {
      name: 'list',
      description: 'List all available skills',
      kind: CommandKind.BUILT_IN,

      action: async (context: CommandContext, args?: string) => {
        try {
          const { loader } = await initSkillsSystem();

          // Parse options
          const input = args?.trim() || '';
          const parts = input.split(/\s+/);

          let marketplaceFilter: string | undefined;
          let pluginFilter: string | undefined;
          let searchQuery: string | undefined;

          for (let i = 0; i < parts.length; i++) {
            if (parts[i] === '--marketplace' && parts[i + 1]) {
              marketplaceFilter = parts[i + 1];
              i++;
            } else if (parts[i] === '--plugin' && parts[i + 1]) {
              pluginFilter = parts[i + 1];
              i++;
            } else if (parts[i] === '--search' && parts[i + 1]) {
              searchQuery = parts[i + 1];
              i++;
            }
          }

          // Load skills
          let skills = await loader.loadEnabledSkills(SkillLoadLevel.METADATA);

          // Apply filters
          if (marketplaceFilter) {
            skills = skills.filter(s => s.marketplaceId === marketplaceFilter);
          }
          if (pluginFilter) {
            skills = skills.filter(s => s.pluginId === pluginFilter);
          }
          if (searchQuery) {
            skills = await loader.searchSkills(searchQuery);
          }

          if (skills.length === 0) {
            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: 'No skills found.\n\nInstall a plugin:\n  /skill plugin list',
              },
              Date.now(),
            );
            return;
          }

          // Group by marketplace and plugin
          const grouped = new Map<string, Map<string, Skill[]>>();
          for (const skill of skills) {
            let mpGroup = grouped.get(skill.marketplaceId);
            if (!mpGroup) {
              mpGroup = new Map();
              grouped.set(skill.marketplaceId, mpGroup);
            }

            let pluginGroup = mpGroup.get(skill.pluginId);
            if (!pluginGroup) {
              pluginGroup = [];
              mpGroup.set(skill.pluginId, pluginGroup);
            }

            pluginGroup.push(skill);
          }

          // Display grouped skills
          const lines = [`Available skills (${skills.length}):\n`];

          for (const [marketplaceId, plugins] of grouped) {
            lines.push(`📦 ${marketplaceId}`);
            lines.push('');

            for (const [pluginId, pluginSkills] of plugins) {
              const pluginName = pluginId.split(':')[1];
              lines.push(`  🔌 ${pluginName}`);
              lines.push('');

              for (const skill of pluginSkills) {
                lines.push(`    ${formatSkill(skill)}`);
                lines.push('');
              }
            }
          }

          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: lines.join('\n'),
            },
            Date.now(),
          );
        } catch (error) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Failed to list skills: ${error instanceof Error ? error.message : String(error)}`,
            },
            Date.now(),
          );
        }
      },
    },

    // ========================================================================
    // /skill info
    // ========================================================================
    {
      name: 'info',
      description: 'Show detailed skill information',
      kind: CommandKind.BUILT_IN,

      completion: async (context: CommandContext, partialArg: string): Promise<Suggestion[]> => {
        try {
          const { loader } = await initSkillsSystem();
          // Load metadata only for speed
          const skills = await loader.loadEnabledSkills(SkillLoadLevel.METADATA);
          const input = partialArg.trim().toLowerCase();

          return skills
            .filter(s => s.id.toLowerCase().includes(input) || s.name.toLowerCase().includes(input))
            .map(s => ({
              label: s.name,
              value: s.id,
              description: `${s.description} (${s.id})`
            }));
        } catch (error) {
          return [];
        }
      },

      action: async (context: CommandContext, args?: string) => {
        const skillId = args?.trim();

        if (!skillId) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: 'Usage: /skill info <skill-id>',
            },
            Date.now(),
          );
          return;
        }

        try {
          const { loader } = await initSkillsSystem();

          // Load skill with full content
          const skill = await loader.loadSkill(skillId, SkillLoadLevel.FULL);

          if (!skill) {
            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: `Skill ${skillId} not found.\n\nList all skills:\n  /skill list`,
              },
              Date.now(),
            );
            return;
          }

          const lines = [
            `Skill: ${skill.name}`,
            `ID: ${skill.id}`,
            `Description: ${skill.description}`,
            '',
            'Metadata:',
            `  Marketplace: ${skill.marketplaceId}`,
            `  Plugin: ${skill.pluginId}`,
          ];

          if (skill.metadata.license) {
            lines.push(`  License: ${skill.metadata.license}`);
          }
          if (skill.metadata.allowedTools && skill.metadata.allowedTools.length > 0) {
            lines.push(`  Allowed Tools: ${skill.metadata.allowedTools.join(', ')}`);
          }
          if (skill.metadata.dependencies && skill.metadata.dependencies.length > 0) {
            lines.push(`  Dependencies: ${skill.metadata.dependencies.join(', ')}`);
          }

          if (skill.content) {
            lines.push('');
            lines.push('Instructions:');
            lines.push('─'.repeat(60));
            lines.push(skill.content);
            lines.push('─'.repeat(60));
          }

          // Load resources
          const skillWithResources = await loader.loadSkill(skillId, SkillLoadLevel.RESOURCES);

          if (skillWithResources?.scripts && skillWithResources.scripts.length > 0) {
            lines.push('');
            lines.push('Scripts:');
            for (const script of skillWithResources.scripts) {
              lines.push(`  - ${script.name} (${script.type})`);
            }
          }

          if (skillWithResources?.references && skillWithResources.references.length > 0) {
            lines.push('');
            lines.push('Reference Documents:');
            for (const ref of skillWithResources.references) {
              const refName = ref.split('/').pop() || ref;
              lines.push(`  - ${refName}`);
            }
          }

          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: lines.join('\n'),
            },
            Date.now(),
          );
        } catch (error) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Failed to get skill info: ${error instanceof Error ? error.message : String(error)}`,
            },
            Date.now(),
          );
        }
      },
    },

    // ========================================================================
    // /skill stats
    // ========================================================================
    {
      name: 'stats',
      description: 'Show skills statistics',
      kind: CommandKind.BUILT_IN,

      action: async (context: CommandContext) => {
        try {
          const { loader } = await initSkillsSystem();
          const stats = await loader.getSkillStats();

          const lines = [
            'Skills Statistics:\n',
            `Total Skills: ${stats.total}`,
            '',
            'By Marketplace:',
          ];

          for (const [marketplaceId, count] of Object.entries(stats.byMarketplace)) {
            lines.push(`  ${marketplaceId}: ${count} skills`);
          }

          lines.push('');
          lines.push('By Plugin:');
          for (const [pluginId, count] of Object.entries(stats.byPlugin)) {
            const pluginName = pluginId.split(':').slice(1).join(':');
            lines.push(`  ${pluginName}: ${count} skills`);
          }

          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: lines.join('\n'),
            },
            Date.now(),
          );
        } catch (error) {
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Failed to get statistics: ${error instanceof Error ? error.message : String(error)}`,
            },
            Date.now(),
          );
        }
      },
    },
  ],
};
