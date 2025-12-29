/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { corgiCommand } from './corgiCommand.js';

describe('corgiCommand', () => {
  it('should call the toggleCorgiMode function on the UI context', async () => {
    const mockContext = {
      ui: {
        toggleCorgiMode: vi.fn(),
      },
    } as any;
    await corgiCommand.action!(mockContext, '');
    expect(mockContext.ui.toggleCorgiMode).toHaveBeenCalled();
  });

  it('should have the correct name and description', () => {
    expect(corgiCommand.name).toBe('corgi');
    expect(corgiCommand.description).toBeTruthy();
  });
});