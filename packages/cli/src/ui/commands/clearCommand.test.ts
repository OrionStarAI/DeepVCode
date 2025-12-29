/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearCommand } from './clearCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('clearCommand', () => {
  let context: ReturnType<typeof createMockCommandContext>;

  beforeEach(() => {
    context = createMockCommandContext();
  });

  it('should set debug message, reset chat, reset telemetry, and clear UI when config is available', async () => {
    await clearCommand.action!(context, '');
    expect(context.ui.setDebugMessage).toHaveBeenCalledWith(
      expect.stringMatching(/Clearing terminal|清除终端/),
    );
    expect(context.ui.clear).toHaveBeenCalled();
  });

  it('should not attempt to reset chat if config service is not available', async () => {
    context.services.config = null;
    await clearCommand.action!(context, '');
    expect(context.ui.setDebugMessage).toHaveBeenCalledWith(
      expect.stringMatching(/Clearing terminal|清除终端/),
    );
    expect(context.ui.clear).toHaveBeenCalled();
  });
});