/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, type MockInstance, type Mock } from 'vitest';
import { handleInstall, installCommand } from './install.js';
import yargs from 'yargs';
import { debugLogger } from '../../utils/errors.js';
import { type GeminiCLIExtension } from 'deepv-code-core';
import type { ExtensionManager } from '../../config/extension-manager.js';
import type { requestConsentNonInteractive } from '../../config/extensions/consent.js';
import type * as fs from 'node:fs/promises';
import type { Stats } from 'node:fs';

const mockInstallOrUpdateExtension: Mock<
  typeof ExtensionManager.prototype.installOrUpdateExtension
> = vi.hoisted(() => vi.fn());
const mockRequestConsentNonInteractive: Mock<
  typeof requestConsentNonInteractive
> = vi.hoisted(() => vi.fn());
const mockStat: Mock<typeof fs.stat> = vi.hoisted(() => vi.fn());

vi.mock('../../config/extensions/consent.js', () => ({
  requestConsentNonInteractive: mockRequestConsentNonInteractive,
}));

vi.mock('../../config/extension-manager.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../config/extension-manager.js')>();
  return {
    ...actual,
    ExtensionManager: vi.fn().mockImplementation(() => ({
      installOrUpdateExtension: mockInstallOrUpdateExtension,
      loadExtensions: vi.fn(),
    })),
  };
});

vi.mock('../../utils/errors.js', () => ({
  getErrorMessage: vi.fn((error: Error) => error.message),
  debugLogger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('node:fs/promises', () => ({
  stat: mockStat,
  default: {
    stat: mockStat,
  },
}));

describe('extensions install command', () => {
  it('should fail if no source is provided', () => {
    const validationParser = yargs([]).command(installCommand).fail(false);
    expect(() => validationParser.parse('install')).toThrow(
      'Not enough non-option arguments: got 0, need at least 1',
    );
  });
});

describe('handleInstall', () => {
  let processSpy: MockInstance;

  beforeEach(() => {
    processSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    mockInstallOrUpdateExtension.mockClear();
    mockRequestConsentNonInteractive.mockClear();
    mockStat.mockClear();
    vi.clearAllMocks();
  });

  it('should install an extension from a http source', async () => {
    mockInstallOrUpdateExtension.mockResolvedValue({
      name: 'http-extension',
    } as unknown as GeminiCLIExtension);

    await handleInstall({
      source: 'http://google.com',
    });

    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('http-extension'),
    );
  });

  it('should install an extension from a https source', async () => {
    mockInstallOrUpdateExtension.mockResolvedValue({
      name: 'https-extension',
    } as unknown as GeminiCLIExtension);

    await handleInstall({
      source: 'https://google.com',
    });

    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('https-extension'),
    );
  });

  it('should install an extension from a git source', async () => {
    mockInstallOrUpdateExtension.mockResolvedValue({
      name: 'git-extension',
    } as unknown as GeminiCLIExtension);

    await handleInstall({
      source: 'git@some-url',
    });

    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('git-extension'),
    );
  });

  it('throws an error from an unknown source', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT: no such file or directory'));
    await handleInstall({
      source: 'test://google.com',
    });

    expect(debugLogger.error).toHaveBeenCalledWith(expect.stringContaining('Install source not found'));
    expect(processSpy).toHaveBeenCalledWith(1);
  });

  it('should install an extension from a sso source', async () => {
    mockInstallOrUpdateExtension.mockResolvedValue({
      name: 'sso-extension',
    } as unknown as GeminiCLIExtension);

    await handleInstall({
      source: 'sso://google.com',
    });

    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('sso-extension'),
    );
  });

  it('should install an extension from a local path', async () => {
    mockInstallOrUpdateExtension.mockResolvedValue({
      name: 'local-extension',
    } as unknown as GeminiCLIExtension);
    mockStat.mockResolvedValue({} as Stats);
    await handleInstall({
      source: '/some/path',
    });

    expect(debugLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('local-extension'),
    );
  });

  it('should throw an error if install extension fails', async () => {
    mockInstallOrUpdateExtension.mockRejectedValue(
      new Error('Install extension failed'),
    );

    await handleInstall({ source: 'git@some-url' });

    expect(debugLogger.error).toHaveBeenCalledWith('Install extension failed');
    expect(processSpy).toHaveBeenCalledWith(1);
  });
});
