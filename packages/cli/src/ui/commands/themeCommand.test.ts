/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { themeCommand } from './themeCommand.js';

describe('themeCommand', () => {
  it('should return a dialog action to open the theme dialog', async () => {
    const result = await themeCommand.action!({} as any, '');
    expect(result).toEqual({
      type: 'dialog',
      dialog: 'theme',
    });
  });

  it('should have the correct name and description', () => {
    expect(themeCommand.name).toBe('theme');
    expect(themeCommand.description).toBeTruthy();
  });
});