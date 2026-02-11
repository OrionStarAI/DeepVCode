/*
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reportCommand } from './reportCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import * as versionUtils from '../../utils/version.js';
import * as commandUtils from '../utils/commandUtils.js';
import { AuthType } from 'deepv-code-core';

vi.mock('../../utils/version.js', () => ({
  getCliVersion: vi.fn(),
}));

vi.mock('../utils/commandUtils.js', () => ({
  copyToClipboard: vi.fn(),
}));

describe('reportCommand', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(versionUtils.getCliVersion).mockResolvedValue('test-version');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should copy report to clipboard by default', async () => {
    const context = createMockCommandContext({
      services: {
        config: {
          getProjectRoot: () => '/mock/root',
        },
        settings: {
          merged: {
            selectedAuthType: AuthType.USE_PROXY_AUTH,
          },
        },
      },
    });

    if (!reportCommand.action) {
      throw new Error('report command must have an action');
    }

    const result = await reportCommand.action(context, '');

    expect(commandUtils.copyToClipboard).toHaveBeenCalledTimes(1);
    const copied = vi.mocked(commandUtils.copyToClipboard).mock.calls[0]?.[0];
    expect(copied).toContain('DeepV Code Report');
    expect(copied).toContain('CLI version: test-version');
    expect(result?.type).toBe('message');
  });
});
