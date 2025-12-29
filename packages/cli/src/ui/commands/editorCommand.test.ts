/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { editorCommand } from './editorCommand.js';

describe('editorCommand', () => {
  it('should return a dialog action to open the editor dialog', async () => {
    const result = await editorCommand.action!({} as any, '');
    expect(result).toEqual({
      type: 'dialog',
      dialog: 'editor',
    });
  });

  it('should have the correct name and description', () => {
    expect(editorCommand.name).toBe('editor');
    expect(editorCommand.description).toBeTruthy();
  });
});