/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, CommandContext, MessageActionReturn, SlashCommand } from './types.js';
import { t } from '../utils/i18n.js';

/**
 * 管理自动删除行末空格配置的斜杠命令
 */
export const trimSpacesCommand: SlashCommand = {
  name: 'trim-spaces',
  description: t('command.trim.description'),
  kind: CommandKind.BUILT_IN,
  action: (context: CommandContext, args: string): MessageActionReturn => {
    const { config } = context.services;
    const trimmedArgs = args.trim().toLowerCase();

    // 检查config是否可用
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: '配置未初始化，无法设置行末空格删除选项。',
      };
    }

    const projectSettingsManager = config.getProjectSettingsManager();
    const currentSetting = projectSettingsManager.getAutoTrimTrailingSpaces();

    // 如果没有参数，显示当前状态
    if (!trimmedArgs) {
      let statusText: string;
      let statusIcon: string;

      if (currentSetting === true) {
        statusText = '已启用';
        statusIcon = '✅';
      } else if (currentSetting === false) {
        statusText = '已禁用';
        statusIcon = '❌';
      } else {
        statusText = '使用语言默认设置';
        statusIcon = '🔧';
      }

      return {
        type: 'message',
        messageType: 'info',
        content: `${statusIcon} 自动删除行末空格当前${statusText}\n\n` +
                `配置说明：\n` +
                `• 启用：编辑C++、Python等源代码时自动删除行末空格\n` +
                `• 禁用：保留所有文件的原始行末空格\n` +
                `• 默认：使用各语言的默认处理方式\n\n` +
                `使用方法：\n` +
                `  /trim-spaces on       - 启用自动删除行末空格\n` +
                `  /trim-spaces off      - 禁用自动删除行末空格\n` +
                `  /trim-spaces default  - 使用语言默认设置\n\n` +
                `配置文件：.deepvcode/settings.json`,
      };
    }

    // 处理启用命令
    if (trimmedArgs === 'on' || trimmedArgs === 'enable' || trimmedArgs === 'true') {
      if (currentSetting === true) {
        return {
          type: 'message',
          messageType: 'info',
          content: '✅ 自动删除行末空格已经是启用状态。',
        };
      }

      try {
        projectSettingsManager.setAutoTrimTrailingSpaces(true);

        return {
          type: 'message',
          messageType: 'info',
          content: '✅ 已启用自动删除行末空格！\n\n' +
                  '📝 编辑C++、Python等源代码文件时，将自动删除行末空格。\n' +
                  '📁 配置已保存到 .deepvcode/settings.json',
        };
      } catch (error) {
        return {
          type: 'message',
          messageType: 'error',
          content: `❌ 启用自动删除行末空格失败：${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    // 处理禁用命令
    if (trimmedArgs === 'off' || trimmedArgs === 'disable' || trimmedArgs === 'false') {
      if (currentSetting === false) {
        return {
          type: 'message',
          messageType: 'info',
          content: '❌ 自动删除行末空格已经是禁用状态。',
        };
      }

      try {
        projectSettingsManager.setAutoTrimTrailingSpaces(false);

        return {
          type: 'message',
          messageType: 'info',
          content: '❌ 已禁用自动删除行末空格。\n\n' +
                  '📝 编辑任何文件时都会保留原始的行末空格。\n' +
                  '📁 配置已保存到 .deepvcode/settings.json',
        };
      } catch (error) {
        return {
          type: 'message',
          messageType: 'error',
          content: `❌ 禁用自动删除行末空格失败：${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    // 处理恢复默认命令
    if (trimmedArgs === 'default' || trimmedArgs === 'reset' || trimmedArgs === 'auto') {
      if (currentSetting === undefined) {
        return {
          type: 'message',
          messageType: 'info',
          content: '🔧 当前已经使用语言默认设置。',
        };
      }

      try {
        // 通过重新保存不包含此配置项的设置来"删除"它
        const currentSettings = projectSettingsManager.getSettings();
        const { autoTrimTrailingSpaces, ...otherSettings } = currentSettings;
        projectSettingsManager.save(otherSettings);

        return {
          type: 'message',
          messageType: 'info',
          content: '🔧 已恢复使用语言默认设置。\n\n' +
                  '📝 各语言将使用自己的默认行末空格处理方式：\n' +
                  '• C/C++: 删除行末空格\n' +
                  '• Python: 删除行末空格\n' +
                  '• JavaScript/TypeScript: 删除行末空格\n' +
                  '📁 配置已更新到 .deepvcode/settings.json',
        };
      } catch (error) {
        return {
          type: 'message',
          messageType: 'error',
          content: `❌ 恢复默认设置失败：${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    // 处理无效参数
    return {
      type: 'message',
      messageType: 'error',
      content: `❌ 无效的参数：${args}\n\n` +
              `有效用法：\n` +
              `  /trim-spaces          - 查看当前状态\n` +
              `  /trim-spaces on       - 启用自动删除行末空格\n` +
              `  /trim-spaces off      - 禁用自动删除行末空格\n` +
              `  /trim-spaces default  - 使用语言默认设置`,
    };
  },

  // 提供自动完成功能
  completion: async (_context, partialArg): Promise<string[]> => {
    const lowerPartial = partialArg.toLowerCase();
    const commands = ['on', 'off', 'enable', 'disable', 'true', 'false', 'default', 'reset', 'auto'];

    return commands.filter(cmd =>
      cmd.toLowerCase().includes(lowerPartial)
    );
  },
};