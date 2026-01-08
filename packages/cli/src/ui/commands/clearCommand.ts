/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { uiTelemetryService } from 'deepv-code-core';
import { CommandKind, SlashCommand } from './types.js';
import { t } from '../utils/i18n.js';

export const clearCommand: SlashCommand = {
  name: 'clear',
  description: t('command.clear.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context, _args) => {
    context.ui.setDebugMessage('Clearing terminal screen.');
    // Only clear the screen to reduce terminal rendering pressure and prevent flickering
    // Does NOT reset the conversation context
    context.ui.clear();
  },
};
