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
      return {
        type: 'message',
        messageType: 'info',
        content:
          'A DEEPV.md file already exists in this directory. No changes were made.',
      };
    }

    // Create an empty DEEPV.md file
    fs.writeFileSync(deepvMdPath, '', 'utf8');

    context.ui.addItem(
      {
        type: 'info',
        text: 'Empty DEEPV.md created. Now analyzing the project to populate it.',
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