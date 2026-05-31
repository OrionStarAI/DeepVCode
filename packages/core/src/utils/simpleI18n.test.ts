/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { t } from './simpleI18n.js';

describe('simpleI18n t() parameter substitution (issue #33)', () => {
  it('substitutes all named parameters', () => {
    const out = t('shell.output.truncated', { maxLines: 5, totalLines: 10 });
    expect(out).toContain('5');
    expect(out).toContain('10');
    expect(out).not.toContain('{maxLines}');
    expect(out).not.toContain('{totalLines}');
  });

  it('produces identical output across repeated calls (cached global regex is reused safely)', () => {
    const params = { maxLines: 5, totalLines: 10 };
    const first = t('shell.output.truncated', params);
    const second = t('shell.output.truncated', params);
    const third = t('shell.output.truncated', params);

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(first).not.toContain('{maxLines}');
  });

  it('returns the translated text unchanged when no params are provided', () => {
    const out = t('task.execution.failed');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });
});
