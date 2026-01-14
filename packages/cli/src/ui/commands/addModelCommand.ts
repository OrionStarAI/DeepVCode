/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, CommandContext, OpenDialogActionReturn, SlashCommand } from './types.js';
import { t } from '../utils/i18n.js';

export const addModelCommand: SlashCommand = {
  name: 'add-model',
  description: 'Launch wizard to add a custom model configuration',
  kind: CommandKind.BUILT_IN,
  action: (context: CommandContext): OpenDialogActionReturn => {
    return {
      type: 'dialog',
      dialog: 'customModelWizard',
    };
  },
};
