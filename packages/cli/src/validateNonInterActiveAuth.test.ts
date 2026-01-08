/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateNonInteractiveAuth,
} from './validateNonInterActiveAuth.js';
import { AuthType } from 'deepv-code-core';

// Define NonInteractiveConfig type for testing
interface NonInteractiveConfig {
  refreshAuth: (authType: AuthType) => Promise<unknown>;
}

describe('validateNonInterActiveAuth', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let refreshAuthMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code: any) => {
      throw new Error(`process.exit(${code}) called`);
    }) as any;
    refreshAuthMock = vi.fn().mockResolvedValue('refreshed');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses USE_PROXY_AUTH by default even if no env vars set', async () => {
    const nonInteractiveConfig: NonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };
    await validateNonInteractiveAuth(undefined, nonInteractiveConfig as any);
    expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.USE_PROXY_AUTH);
  });

  it('uses configuredAuthType if provided', async () => {
    const nonInteractiveConfig: NonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };
    await validateNonInteractiveAuth(AuthType.USE_PROXY_AUTH, nonInteractiveConfig as any);
    expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.USE_PROXY_AUTH);
  });

  it('exits if validateAuthMethod returns error for invalid type', async () => {
    // Note: Any type other than USE_PROXY_AUTH currently returns error in validateAuthMethod
    const nonInteractiveConfig: NonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };
    try {
      await validateNonInteractiveAuth(
        'invalid-type' as any,
        nonInteractiveConfig as any,
      );
      expect.fail('Should have exited');
    } catch (e) {
      expect((e as Error).message).toContain('process.exit(1) called');
    }
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});