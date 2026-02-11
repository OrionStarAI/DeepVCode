/*
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { historyCommand } from './historyCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { t } from '../utils/i18n.js';

describe('historyCommand', () => {
  it('should show recent user history by default', async () => {
    const context = createMockCommandContext({
      ui: {
        history: [
          { id: 1, type: 'user', text: 'hello' },
          { id: 2, type: 'gemini', text: 'hi' },
        ],
      },
    });

    if (!historyCommand.action) {
      throw new Error('history command must have an action');
    }

    const result = await historyCommand.action(context, '');

    if (!result || result.type !== 'message') {
      throw new Error('Expected message result');
    }
    expect(result.content).toContain(t('command.history.header'));
    expect(result.content).toContain('[user] hello');
    expect(result.content).not.toContain('[gemini]');
  });

  it('should filter history by query', async () => {
    const context = createMockCommandContext({
      ui: {
        history: [
          { id: 1, type: 'user', text: 'alpha test' },
          { id: 2, type: 'user', text: 'beta item' },
        ],
      },
    });

    if (!historyCommand.action) {
      throw new Error('history command must have an action');
    }

    const result = await historyCommand.action(context, 'beta');

    if (!result || result.type !== 'message') {
      throw new Error('Expected message result');
    }
    expect(result.content).toContain('[user] beta item');
    expect(result.content).not.toContain('[user] alpha test');
  });
});
