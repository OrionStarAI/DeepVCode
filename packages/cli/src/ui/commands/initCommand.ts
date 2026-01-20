/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  CommandContext,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import { INIT_COMMAND_PROMPT } from './prompts/initPrompt.js';
import { t } from '../utils/i18n.js';

export const initCommand: SlashCommand = {
  name: 'init',
  description: t('command.init.description'),
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
    _args: string,
  ): Promise<SlashCommandActionReturn> => {
    if (!context.services.config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }
    const targetDir = context.services.config.getTargetDir();
    const deepvMdPath = path.join(targetDir, 'DEEPV.md');

    if (fs.existsSync(deepvMdPath)) {
      const stats = fs.statSync(deepvMdPath);
      const fileSizeKB = Math.round(stats.size / 1024 * 100) / 100;

      // If file size is 0, treat it as empty and proceed with init
      if (stats.size === 0) {
        context.ui.addItem(
          {
            type: 'info',
            text: t('command.init.emptyFileDetected'),
          },
          Date.now(),
        );

        // 延迟100毫秒后清屏，避免显示长提示词
        setTimeout(() => {
          context.ui.clear();
        }, 100);

        return {
          type: 'submit_prompt',
          content: INIT_COMMAND_PROMPT,
        };
      }

      // File exists and is not empty - show choice dialog
      const fileContent = fs.readFileSync(deepvMdPath, 'utf8');
      const lineCount = fileContent.split('\n').length - (fileContent.endsWith('\n') ? 1 : 0);

      return {
        type: 'dialog',
        dialog: 'init-choice',
        metadata: {
          filePath: deepvMdPath,
          fileSize: fileSizeKB,
          lineCount: lineCount,
        },
      };
    }

    // File doesn't exist - create it and proceed with init
    fs.writeFileSync(deepvMdPath, '', 'utf8');

    context.ui.addItem(
      {
        type: 'info',
        text: t('command.init.fileCreating'),
      },
      Date.now(),
    );

    // 延迟100毫秒后清屏，避免显示长提示词
    setTimeout(() => {
      context.ui.clear();
    }, 100);

    return {
      type: 'submit_prompt',
      content: INIT_COMMAND_PROMPT,
    };
  },
};