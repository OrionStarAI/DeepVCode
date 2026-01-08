/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { privacyCommand } from './privacyCommand.js';

describe('privacyCommand', () => {
  it('should return a dialog action to open the privacy dialog', async () => {
    const result = await privacyCommand.action!({} as any, '');
    expect(result).toEqual({
      type: 'dialog',
      dialog: 'privacy',
    });
  });

  it('should have the correct name and description', () => {
    expect(privacyCommand.name).toBe('privacy');
    expect(privacyCommand.description).toBeTruthy();
  });
});