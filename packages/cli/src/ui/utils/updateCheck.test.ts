/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { checkForUpdates } from './updateCheck.js';

const getPackageJson = vi.hoisted(() => vi.fn());
vi.mock('../../utils/package.js', () => ({
  getPackageJson,
}));

// Mock fs and os properly for Vitest 3
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn().mockRejectedValue({ code: 'ENOENT' }),
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
    }
  };
});

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: vi.fn().mockReturnValue('/tmp/home'),
  };
});

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('checkForUpdates', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Clear DEV environment variable before each test
    delete process.env.DEV;
    // Mock successful package.json
    getPackageJson.mockResolvedValue({
      name: 'deepv-code-cli',
      version: '1.0.0',
    });
  });

  it('should return null when running from source (DEV=true)', async () => {
    process.env.DEV = 'true';
    const result = await checkForUpdates();
    expect(result).toBeNull();
    expect(getPackageJson).not.toHaveBeenCalled();
  });

  it('should return null if package.json is missing', async () => {
    getPackageJson.mockResolvedValue(null);
    const result = await checkForUpdates();
    expect(result).toBeNull();
  });

  it('should return null if there is no update', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        hasUpdate: false,
      }),
    });

    const result = await checkForUpdates(false, true);
    expect(result).toBeNull();
  });

  it('should return a message if a newer version is available and showProgress is true', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        hasUpdate: true,
        latestVersion: '1.1.0',
        updateCommand: 'npm install -g deepv-code-cli',
      }),
    });

    const result = await checkForUpdates(true, true);
    expect(result).not.toBeNull();
    expect(result).toContain('UPDATE_AVAILABLE:1.1.0');
    expect(result).toContain('1.0.0');
    expect(result).toContain('1.1.0');
  });

  it('should return null if newer version available but showProgress is false and not forced update', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        hasUpdate: true,
        latestVersion: '1.1.0',
        updateCommand: 'npm install -g deepv-code-cli',
      }),
    });

    const result = await checkForUpdates(false, true);
    expect(result).toBeNull();
  });

  it('should return a FORCE_UPDATE message if forceUpdate is true', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        hasUpdate: true,
        forceUpdate: true,
        latestVersion: '1.1.0',
        updateCommand: 'npm install -g deepv-code-cli',
      }),
    });

    const result = await checkForUpdates(false, true);
    expect(result).not.toBeNull();
    expect(result).toContain('FORCE_UPDATE:1.1.0');
  });

  it('should handle fetch errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    const result = await checkForUpdates(false, true);
    expect(result).toBeNull();
  });

  it('should handle HTTP error status gracefully', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });
    const result = await checkForUpdates(false, true);
    expect(result).toBeNull();
  });
});