/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, type SlashCommand } from './types.js';
import { t } from '../utils/i18n.js';

export const corgiCommand: SlashCommand = {
  name: 'corgi',
  description: t('command.corgi.description'),
  kind: CommandKind.BUILT_IN,
  action: (context, _args) => {
    context.ui.toggleCorgiMode();
  },
};
