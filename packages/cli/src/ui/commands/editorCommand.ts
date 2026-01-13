/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CommandKind,
  type OpenDialogActionReturn,
  type SlashCommand,
} from './types.js';
import { t } from '../utils/i18n.js';

export const editorCommand: SlashCommand = {
  name: 'editor',
  description: t('command.editor.description'),
  kind: CommandKind.BUILT_IN,
  hidden: true,
  action: (): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'editor',
  }),
};
