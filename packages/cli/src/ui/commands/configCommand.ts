/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, CommandContext, SlashCommandActionReturn, OpenDialogActionReturn, SlashCommand } from './types.js';
import { t, tp } from '../utils/i18n.js';
import { ApprovalMode, getCoreSystemPrompt } from 'deepv-code-core';
import type { AgentStyle } from 'deepv-code-core';
import { SettingScope } from '../../config/settings.js';
import { HistoryItemWithoutId } from '../types.js';

/**
 * 统一配置菜单命令 /config
 *
 * 功能：
 * - /config                  打开交互式设置面板（可用光标移动）
 * - /config theme            打开主题设置对话框
 * - /config editor           打开编辑器设置对话框
 * - /config model            打开模型选择对话框
 * - /config vim              切换Vim模式
 * - /config agent-style      切换Agent风格 (default/codex)
 * - /config yolo             切换YOLO自动批准模式
 * - /config healthy-use      切换健康使用提示
 * - /config language         设置偏好语言
 */
export const configCommand: SlashCommand = {
  name: 'config',
  altNames: ['settings', 'preferences'],
  description: t('command.config.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext, args: string): Promise<SlashCommandActionReturn> => {
    const { config, settings } = context.services;
    const trimmedArgs = args.trim().toLowerCase();

    if (!config || !settings) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('error.config.not.loaded'),
      };
    }

    // 无参数：打开交互式设置面板
    if (!trimmedArgs) {
      return {
        type: 'dialog',
        dialog: 'settings-menu',
      };
    }

    // 处理子命令
    const [subCommand, ...restArgs] = trimmedArgs.split(/\s+/);
    const subArgs = restArgs.join(' ');

    switch (subCommand) {
      case 'theme':
      case 't':
        return {
          type: 'dialog',
          dialog: 'theme',
        };

      case 'editor':
      case 'e':
        return {
          type: 'dialog',
          dialog: 'editor',
        };

      case 'model':
      case 'm':
        // 委托给 modelCommand 的逻辑
        return handleModelConfig(context, subArgs);

      case 'vim':
      case 'v':
        return await handleVimToggle(context);

      case 'agent-style':
      case 'agent':
      case 'a':
        return await handleAgentStyleConfig(context, subArgs);

      case 'yolo':
      case 'y':
        return handleYoloConfig(context, subArgs);

      case 'healthy-use':
      case 'healthy':
      case 'h':
        return handleHealthyUseConfig(context, subArgs);

      case 'language':
      case 'lang':
      case 'l':
        return await handleLanguageConfig(context, subArgs);

      case 'help':
        return displayConfigMenu(context);

      default:
        return {
          type: 'message',
          messageType: 'error',
          content: tp('command.config.unknown.subcommand', { subcommand: subCommand }) +
            '\n\n' + getConfigHelp(),
        };
    }
  },

  subCommands: [
    {
      name: 'theme',
      altNames: ['t'],
      description: t('theme.name'),
      kind: CommandKind.BUILT_IN,
      action: (): OpenDialogActionReturn => ({
        type: 'dialog',
        dialog: 'theme',
      }),
    },
    {
      name: 'editor',
      altNames: ['e'],
      description: t('command.editor.description'),
      kind: CommandKind.BUILT_IN,
      action: (): OpenDialogActionReturn => ({
        type: 'dialog',
        dialog: 'editor',
      }),
    },
    {
      name: 'model',
      altNames: ['m'],
      description: t('model.command.description'),
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext, args: string) =>
        handleModelConfig(context, args),
    },
    {
      name: 'vim',
      altNames: ['v'],
      description: t('command.vim.description'),
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext) =>
        handleVimToggle(context),
    },
    {
      name: 'agent-style',
      altNames: ['agent', 'a'],
      description: t('command.agentStyle.description'),
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext, args: string) =>
        handleAgentStyleConfig(context, args),
    },
    {
      name: 'yolo',
      altNames: ['y'],
      description: t('command.yolo.description'),
      kind: CommandKind.BUILT_IN,
      action: (context: CommandContext, args: string) =>
        handleYoloConfig(context, args),
    },
    {
      name: 'healthy-use',
      altNames: ['healthy', 'h'],
      description: t('command.healthyUse.description'),
      kind: CommandKind.BUILT_IN,
      action: (context: CommandContext, args: string) =>
        handleHealthyUseConfig(context, args),
    },
    {
      name: 'language',
      altNames: ['lang', 'l'],
      description: t('config.menu.language'),
      kind: CommandKind.BUILT_IN,
      action: async (context: CommandContext, args: string) =>
        handleLanguageConfig(context, args),
    },
  ],

  completion: async (_context, partialArg) => {
    const subCommands = [
      'theme', 'editor', 'model', 'vim', 'agent-style',
      'yolo', 'healthy-use', 'language', 'help',
      't', 'e', 'm', 'v', 'a', 'y', 'h', 'l'
    ];
    return subCommands.filter(cmd =>
      cmd.toLowerCase().startsWith(partialArg.toLowerCase())
    );
  },
};

/**
 * 显示配置菜单和当前设置状态
 */
async function displayConfigMenu(context: CommandContext): Promise<SlashCommandActionReturn> {
  const { config, settings } = context.services;

  if (!config || !settings) {
    return {
      type: 'message',
      messageType: 'error',
      content: t('error.config.not.loaded'),
    };
  }

  const vimEnabled = settings.merged.vimMode || false;
  const agentStyle = config.getAgentStyle();
  const approvalMode = config.getApprovalMode();
  const healthyUseEnabled = config.getHealthyUseEnabled();
  const preferredLanguage = settings.merged.preferredLanguage || t('config.value.default');

  const getStyleIcon = (style: AgentStyle) => {
    switch (style) {
      case 'codex': return '⚡';
      case 'cursor': return '↗️';
      case 'augment': return '🚀';
      case 'claude-code': return '✳️';
      case 'antigravity': return '🌈';
      case 'windsurf': return '🌊';
      default: return '𝓥';
    }
  };

  const content = `⚙️  ${t('command.config.description')}

${t('command.config.available.options')}:

  🎨 ${t('command.config.theme')}
    /config theme

  ✏️  ${t('command.config.editor')}
    /config editor

  🤖 ${t('command.config.model')}
    /config model

  ${vimEnabled ? '✅' : '❌'} ${t('command.config.vim')}
    /config vim

  ${getStyleIcon(agentStyle)} ${t('command.config.agent.style')}
    /config agent-style [default|codex|cursor|augment|...]

  ${approvalMode === ApprovalMode.YOLO ? '🚀' : '🛡️'} ${t('command.config.yolo')}
    /config yolo [on|off]

  ${healthyUseEnabled ? '✅' : '❌'} ${t('command.config.healthy.use')}
    /config healthy-use [on|off]

  🌐 ${t('config.menu.language')}
    /config language [name]  (${preferredLanguage})

${t('command.config.examples')}:
  /config theme           # ${t('command.config.open.theme')}
  /config model claude    # ${t('command.config.switch.model')}
  /config vim             # ${t('command.config.toggle.vim')}
  /config agent-style codex  # ${t('command.config.switch.style')}
  /config yolo on         # ${t('command.config.enable.yolo')}
`;

  return {
    type: 'message',
    messageType: 'info',
    content,
  };
}

/**
 * 处理模型配置
 */
function handleModelConfig(context: CommandContext, args: string): SlashCommandActionReturn {
  const { settings, config } = context.services;

  if (!settings) {
    return {
      type: 'message',
      messageType: 'error',
      content: t('error.config.not.loaded'),
    };
  }

  const trimmedArgs = args.trim();

  // 如果没有参数，打开模型选择对话框
  if (!trimmedArgs) {
    return {
      type: 'dialog',
      dialog: 'model',
    };
  }

  // 如果有参数，异步处理模型切换（复用modelCommand的逻辑）
  (async () => {
    try {
      const { getAvailableModels, getModelNameFromDisplayName, getModelDisplayName } =
        await import('./modelCommand.js');

      const { modelNames, modelInfos } = await getAvailableModels(settings, config || undefined);

      if (modelNames.length === 0) {
        const errorMsg: HistoryItemWithoutId = {
          type: 'error',
          text: `${t('model.command.not.logged.in')}\n\n${t('model.command.please.login')}`,
        };
        if (context.ui?.addItem) {
          context.ui.addItem(errorMsg, Date.now());
        }
        return;
      }

      const actualModelName = getModelNameFromDisplayName(trimmedArgs, modelInfos);
      const availableModelNames = ['auto', ...modelInfos.map(m => m.name)];

      if (!availableModelNames.includes(actualModelName)) {
        const availableModelsList = modelNames
          .map((m: string) => {
            const displayName = getModelDisplayName(m, config);
            let line = `  - ${displayName}`;
            if (m !== 'auto' && modelInfos.length > 0) {
              const modelInfo = modelInfos.find((model: any) => model.name === m);
              if (modelInfo?.creditsPerRequest) {
                line += ` - ${modelInfo.creditsPerRequest}x credits`;
              }
            }
            return line;
          })
          .join('\n');

        const errorMsg: HistoryItemWithoutId = {
          type: 'error',
          text: `Invalid model: ${trimmedArgs}\n\nAvailable models:\n${availableModelsList}`,
        };
        if (context.ui?.addItem) {
          context.ui.addItem(errorMsg, Date.now());
        }
        return;
      }

      // 设置模型
      settings.setValue(SettingScope.User, 'preferredModel', actualModelName);

      if (config) {
        const geminiClient = config.getGeminiClient();
        if (geminiClient) {
          await geminiClient.waitForChatInitialized();
          const switchResult = await geminiClient.switchModel(
            actualModelName,
            new AbortController().signal
          );

          if (!switchResult.success) {
            const errorMsg: HistoryItemWithoutId = {
              type: 'error',
              text: `Failed to switch to model ${actualModelName}. ${switchResult.error || ''}`,
            };
            if (context.ui?.addItem) {
              context.ui.addItem(errorMsg, Date.now());
            }
            return;
          }
        }

        const { appEvents, AppEvent } = await import('../../utils/events.js');
        appEvents.emit(AppEvent.ModelChanged, actualModelName);
      }

      const displayName = getModelDisplayName(actualModelName, config);
      const successMsg: HistoryItemWithoutId = {
        type: 'info',
        text: `✅ Model switched to ${displayName}`,
      };
      if (context.ui?.addItem) {
        context.ui.addItem(successMsg, Date.now());
      }
    } catch (error) {
      const errorMsg: HistoryItemWithoutId = {
        type: 'error',
        text: `Failed to switch model: ${error instanceof Error ? error.message : String(error)}`,
      };
      if (context.ui?.addItem) {
        context.ui.addItem(errorMsg, Date.now());
      }
    }
  })().catch(error => {
    console.error('[ConfigCommand] Model config failed:', error);
  });

  // 返回空，避免显示加载消息
  return undefined as any;
}

/**
 * 处理 Vim 模式切换
 */
async function handleVimToggle(context: CommandContext): Promise<SlashCommandActionReturn> {
  const newVimState = await context.ui.toggleVimEnabled();
  const message = newVimState
    ? 'Entered Vim mode. Run /config vim again to exit.'
    : 'Exited Vim mode.';

  return {
    type: 'message',
    messageType: 'info',
    content: `${newVimState ? '✅' : '❌'} ${message}`,
  };
}

/**
 * 处理 Agent 风格配置
 */
async function handleAgentStyleConfig(
  context: CommandContext,
  args: string
): Promise<SlashCommandActionReturn> {
  const { config } = context.services;
  const trimmedArgs = args.trim().toLowerCase();

  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: t('agentStyle.error.config.unavailable'),
    };
  }

  const currentStyle = config.getAgentStyle();

  const getStyleInfo = (style: AgentStyle) => {
    switch (style) {
      case 'codex': return { icon: '⚡', label: t('agentStyle.style.codex.label'), desc: t('agentStyle.style.codex.description') };
      case 'cursor': return { icon: '↗️', label: t('agentStyle.style.cursor.label'), desc: t('agentStyle.style.cursor.description') };
      case 'augment': return { icon: '🚀', label: t('agentStyle.style.augment.label'), desc: t('agentStyle.style.augment.description') };
      case 'claude-code': return { icon: '✳️', label: t('agentStyle.style.claudeCode.label'), desc: t('agentStyle.style.claudeCode.description') };
      case 'antigravity': return { icon: '🌈', label: t('agentStyle.style.antigravity.label'), desc: t('agentStyle.style.antigravity.description') };
      case 'windsurf': return { icon: '🌊', label: t('agentStyle.style.windsurf.label'), desc: t('agentStyle.style.windsurf.description') };
      default: return { icon: '𝓥', label: t('agentStyle.style.default.label'), desc: t('agentStyle.style.default.description') };
    }
  };

  // 无参数或 status: 显示当前状态
  if (!trimmedArgs || trimmedArgs === 'status') {
    const { icon, label, desc } = getStyleInfo(currentStyle);

    return {
      type: 'message',
      messageType: 'info',
      content: `${icon} ${tp('agentStyle.status.current', { style: label })}

${desc}

${t('agentStyle.usage.title')}
  /config agent-style default      - ${t('agentStyle.usage.default')}
  /config agent-style codex        - ${t('agentStyle.usage.codex')}
  /config agent-style cursor       - ${t('agentStyle.usage.cursor')}
  /config agent-style augment      - ${t('agentStyle.usage.augment')}
  /config agent-style claude-code  - ${t('agentStyle.usage.claudeCode')}
  /config agent-style antigravity  - ${t('agentStyle.usage.antigravity')}
  /config agent-style windsurf     - ${t('agentStyle.usage.windsurf')}`,
    };
  }

  // 切换样式
  const switchStyle = async (newStyle: AgentStyle): Promise<SlashCommandActionReturn> => {
    try {
      config.setAgentStyle(newStyle);

      // Codex 模式自动启用 YOLO
      if (newStyle === 'codex') {
        config.setApprovalModeWithProjectSync(ApprovalMode.YOLO, true);
      } else {
        config.setApprovalModeWithProjectSync(ApprovalMode.DEFAULT, true);
      }

      // 刷新 system prompt
      const geminiClient = await config.getGeminiClient();
      if (geminiClient) {
        const chat = geminiClient.getChat();
        if (chat) {
          const isVSCode = config.getVsCodePluginMode();
          const userMemory = config.getUserMemory();
          const updatedSystemPrompt = getCoreSystemPrompt(
            userMemory,
            isVSCode,
            undefined,
            newStyle,
            undefined, // modelId
            config.getPreferredLanguage()
          );
          chat.setSystemInstruction(updatedSystemPrompt);
        }
      }

      const { icon, label } = getStyleInfo(newStyle);
      const yoloNote = newStyle === 'codex'
        ? `\n${t('agentStyle.codex.yolo.enabled')}`
        : '';

      return {
        type: 'message',
        messageType: 'info',
        content: `${icon} ${tp('agentStyle.switched.success', { style: label })}${yoloNote}`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `❌ ${t('agentStyle.error.switch.failed')}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  };

  const styleMap: Record<string, AgentStyle> = {
    'default': 'default',
    'claude': 'default',
    'codex': 'codex',
    'fast': 'codex',
    'cursor': 'cursor',
    'augment': 'augment',
    'claude-code': 'claude-code',
    'antigravity': 'antigravity',
    'windsurf': 'windsurf',
    'wave': 'windsurf',
  };

  if (styleMap[trimmedArgs]) {
    const newStyle = styleMap[trimmedArgs];
    if (currentStyle === newStyle) {
      const { icon } = getStyleInfo(newStyle);
      return {
        type: 'message',
        messageType: 'info',
        content: `${icon} ${tp('agentStyle.already.using', { style: trimmedArgs })}`,
      };
    }
    return switchStyle(newStyle);
  }

  return {
    type: 'message',
    messageType: 'error',
    content: `❌ ${t('agentStyle.usage.error')}\n\n${getConfigHelp()}`,
  };
}

/**
 * 处理 YOLO 配置
 */
function handleYoloConfig(context: CommandContext, args: string): SlashCommandActionReturn {
  const { config } = context.services;
  const trimmedArgs = args.trim().toLowerCase();

  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: t('error.config.not.loaded'),
    };
  }

  const currentMode = config.getApprovalMode();
  const isCurrentlyYolo = currentMode === ApprovalMode.YOLO;

  // 无参数：显示当前状态
  if (!trimmedArgs) {
    const statusText = isCurrentlyYolo ? 'enabled' : 'disabled';
    const statusIcon = isCurrentlyYolo ? '✅' : '❌';

    return {
      type: 'message',
      messageType: 'info',
      content: `${statusIcon} YOLO ${statusText}

Auto-approve mode for tool calls

Usage:
  /config yolo on   - Enable YOLO mode
  /config yolo off  - Disable YOLO mode`,
    };
  }

  // 开启
  if (trimmedArgs === 'on' || trimmedArgs === 'enable' || trimmedArgs === '1') {
    if (isCurrentlyYolo) {
      return {
        type: 'message',
        messageType: 'info',
        content: `✅ YOLO mode is already enabled`,
      };
    }

    try {
      config.setApprovalModeWithProjectSync(ApprovalMode.YOLO, true);
      return {
        type: 'message',
        messageType: 'info',
        content: `🚀 YOLO mode enabled!\n\n⚠️  All tool calls will be auto-approved without confirmation.`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `❌ Failed to enable YOLO mode: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  // 关闭
  if (trimmedArgs === 'off' || trimmedArgs === 'disable' || trimmedArgs === '0') {
    if (!isCurrentlyYolo) {
      return {
        type: 'message',
        messageType: 'info',
        content: `✅ YOLO mode is already disabled`,
      };
    }

    try {
      config.setApprovalModeWithProjectSync(ApprovalMode.DEFAULT, true);
      return {
        type: 'message',
        messageType: 'info',
        content: `🛡️ YOLO mode disabled. Tool calls now require manual confirmation.`,
      };
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `❌ Failed to disable YOLO mode: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  return {
    type: 'message',
    messageType: 'error',
    content: `❌ Invalid argument: ${args}\n\n${getConfigHelp()}`,
  };
}

/**
 * 处理 Healthy Use 配置
 */
function handleHealthyUseConfig(context: CommandContext, args: string): SlashCommandActionReturn {
  const { config, settings } = context.services;
  const trimmedArgs = args.trim().toLowerCase();

  if (!config || !settings) {
    return {
      type: 'message',
      messageType: 'error',
      content: t('error.config.not.loaded'),
    };
  }

  const isEnabled = config.getHealthyUseEnabled();

  // 无参数：显示当前状态
  if (!trimmedArgs) {
    const statusText = isEnabled ? 'enabled' : 'disabled';
    const statusIcon = isEnabled ? '✅' : '❌';

    return {
      type: 'message',
      messageType: 'info',
      content: `${statusIcon} Healthy Use ${statusText}

Receive reminders for late night work

Usage:
  /config healthy-use on   - Enable healthy use reminders
  /config healthy-use off  - Disable healthy use reminders`,
    };
  }

  // 开启
  if (trimmedArgs === 'on' || trimmedArgs === 'enable' || trimmedArgs === '1') {
    if (isEnabled) {
      return {
        type: 'message',
        messageType: 'info',
        content: `✅ Healthy use reminders are already enabled`,
      };
    }

    settings.setValue(SettingScope.User, 'healthyUse', true);
    (config as any).healthyUse = true;

    return {
      type: 'message',
      messageType: 'info',
      content: `🚀 Healthy use reminders enabled!`,
    };
  }

  // 关闭
  if (trimmedArgs === 'off' || trimmedArgs === 'disable' || trimmedArgs === '0') {
    if (!isEnabled) {
      return {
        type: 'message',
        messageType: 'info',
        content: `✅ Healthy use reminders are already disabled`,
      };
    }

    settings.setValue(SettingScope.User, 'healthyUse', false);
    (config as any).healthyUse = false;

    return {
      type: 'message',
      messageType: 'info',
      content: `🛡️ Healthy use reminders disabled.`,
    };
  }

  return {
    type: 'message',
    messageType: 'error',
    content: `❌ Invalid argument: ${args}\n\n${getConfigHelp()}`,
  };
}

/**
 * 处理语言配置
 */
async function handleLanguageConfig(context: CommandContext, args: string): Promise<SlashCommandActionReturn> {
  const { settings, config } = context.services;
  const trimmedArgs = args.trim();

  if (!settings) {
    return {
      type: 'message',
      messageType: 'error',
      content: t('error.config.not.loaded'),
    };
  }

  // 无参数：打开交互式设置面板 (由于 language 目前在 settings-menu 中是文本输入)
  // 如果是 /config language，我们也可以直接提示当前设置并提供修改方式
  if (!trimmedArgs) {
    const currentLang = settings.merged.preferredLanguage || t('config.value.default');
    return {
      type: 'message',
      messageType: 'info',
      content: `🌐 ${t('config.menu.language')}: ${currentLang}

Usage:
  /config language <name>    - Set preferred language (e.g., English, 中文)
  /config language default   - Clear preference (AI decided)`,
    };
  }

  // 设置语言
  const newLang = (trimmedArgs.toLowerCase() === 'default' || trimmedArgs.toLowerCase() === 'none')
    ? undefined
    : trimmedArgs;

  settings.setValue(SettingScope.User, 'preferredLanguage', newLang);

  // 刷新 system prompt 以立即生效
  if (config) {
    const geminiClient = await config.getGeminiClient();
    if (geminiClient) {
      const chat = geminiClient.getChat();
      if (chat) {
        const isVSCode = config.getVsCodePluginMode();
        const userMemory = config.getUserMemory();
        const agentStyle = config.getAgentStyle();
        const updatedSystemPrompt = getCoreSystemPrompt(
          userMemory,
          isVSCode,
          undefined,
          agentStyle,
          undefined,
          newLang
        );
        chat.setSystemInstruction(updatedSystemPrompt);
      }
    }
  }

  return {
    type: 'message',
    messageType: 'info',
    content: newLang
      ? tp('config.status.language.updated', { language: newLang })
      : t('config.status.language.cleared'),
  };
}

/**
 * 获取配置帮助信息
 */
function getConfigHelp(): string {
  return `Available subcommands:
  /config theme              - Open theme settings
  /config editor             - Open editor settings
  /config model [name]       - Set AI model
  /config vim                - Toggle Vim mode
  /config agent-style [style] - Set agent style (default|codex|cursor|augment|...)
  /config yolo [on|off]      - Toggle YOLO mode
  /config healthy-use [on|off] - Toggle healthy use mode
  /config language [name]    - Set preferred response language`;
}
