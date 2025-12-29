/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { authCommand } from './authCommand.js';

describe('authCommand', () => {
  it('should return a dialog action to open the auth dialog', async () => {
    const result = await authCommand.action!({} as any, '');
    expect(result).toEqual({
      type: 'dialog',
      dialog: 'auth',
    });
  });

  it('should have the correct name and description', () => {
    expect(authCommand.name).toBe('auth');
    expect(authCommand.description).toBeTruthy();
  });
});