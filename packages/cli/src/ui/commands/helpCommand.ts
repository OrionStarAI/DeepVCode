/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, OpenDialogActionReturn, SlashCommand } from './types.js';
import { t } from '../utils/i18n.js';

export const helpCommand: SlashCommand = {
  name: 'help',
  altNames: ['?'],
  description: t('command.help.description'),
  kind: CommandKind.BUILT_IN,
  action: (_context, _args): OpenDialogActionReturn => {
    console.debug('Opening help UI ...');
    return {
      type: 'dialog',
      dialog: 'help',
    };
  },
};
