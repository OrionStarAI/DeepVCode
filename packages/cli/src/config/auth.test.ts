/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from 'deepv-code-core';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateAuthMethod } from './auth.js';

vi.mock('./settings.js', () => ({
  loadEnvironment: vi.fn(),
}));

describe('validateAuthMethod', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {};
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return null for USE_PROXY_AUTH', () => {
    expect(validateAuthMethod(AuthType.USE_PROXY_AUTH)).toBeNull();
  });

  it('should return error for legacy auth methods', () => {
    const errorMsg = 'Invalid auth method selected. Only proxy server authentication is supported.';
    expect(validateAuthMethod(AuthType.LOGIN_WITH_GOOGLE)).toBe(errorMsg);
    expect(validateAuthMethod(AuthType.CLOUD_SHELL)).toBe(errorMsg);
    expect(validateAuthMethod(AuthType.USE_GEMINI)).toBe(errorMsg);
    expect(validateAuthMethod(AuthType.USE_VERTEX_AI)).toBe(errorMsg);
  });

  it('should return an error message for an invalid auth method', () => {
    expect(validateAuthMethod('completely-invalid-method')).toBe(
      'Invalid auth method selected. Only proxy server authentication is supported.',
    );
  });
});