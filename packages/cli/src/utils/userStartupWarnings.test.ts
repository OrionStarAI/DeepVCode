/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getUserStartupWarnings } from './userStartupWarnings.js';
import * as os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { LoadedSettings } from '../config/settings.js';

// Mock os.homedir to control the home directory in tests
vi.mock('os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof os>();
  return {
    ...actualOs,
    homedir: vi.fn(),
  };
});

// Mock creditsService to avoid ProxyAuthManager initialization errors
vi.mock('../services/creditsService.js', () => ({
  getCreditsService: vi.fn(() => ({
    getCreditsInfo: vi.fn().mockResolvedValue(null),
    isCreditsLow: vi.fn().mockReturnValue(false),
  })),
}));

describe('getUserStartupWarnings', () => {
  let testRootDir: string;
  let homeDir: string;
  let emptySettings: LoadedSettings;

  beforeEach(async () => {
    testRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'warnings-test-'));
    homeDir = path.join(testRootDir, 'home');
    await fs.mkdir(homeDir, { recursive: true });
    vi.mocked(os.homedir).mockReturnValue(homeDir);

    // Empty settings without custom proxy server
    emptySettings = {
      user: { path: '', settings: {} },
      workspace: { path: '', settings: {} },
      system: { path: '', settings: {} },
    };
  });

  afterEach(async () => {
    await fs.rm(testRootDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe('home directory check', () => {
    it('should return a warning when running in home directory', async () => {
      const warnings = await getUserStartupWarnings(homeDir, emptySettings);
      expect(warnings).toContainEqual(
        expect.stringContaining('home directory'),
      );
    });

    it('should not return a warning when running in a project directory', async () => {
      const projectDir = path.join(testRootDir, 'project');
      await fs.mkdir(projectDir);
      const warnings = await getUserStartupWarnings(projectDir, emptySettings);
      expect(warnings).not.toContainEqual(
        expect.stringContaining('home directory'),
      );
    });
  });

  describe('root directory check', () => {
    it('should return a warning when running in a root directory', async () => {
      const rootDir = path.parse(testRootDir).root;
      const warnings = await getUserStartupWarnings(rootDir, emptySettings);
      expect(warnings).toContainEqual(
        expect.stringContaining('root directory'),
      );
      expect(warnings).toContainEqual(
        expect.stringContaining('folder structure will be used'),
      );
    });

    it('should not return a warning when running in a non-root directory', async () => {
      const projectDir = path.join(testRootDir, 'project');
      await fs.mkdir(projectDir);
      const warnings = await getUserStartupWarnings(projectDir, emptySettings);
      expect(warnings).not.toContainEqual(
        expect.stringContaining('root directory'),
      );
    });
  });

  describe.skip('custom proxy server check', () => {
    it('should return a warning when custom proxy server URL is configured in user settings', async () => {
      const settings: LoadedSettings = {
        user: { path: '', settings: { customProxyServerUrl: 'https://custom.proxy.com' } },
        workspace: { path: '', settings: {} },
        system: { path: '', settings: {} },
      };
      const projectDir = path.join(testRootDir, 'project');
      await fs.mkdir(projectDir);
      const warnings = await getUserStartupWarnings(projectDir, settings);
      expect(warnings).toContainEqual(
        expect.stringContaining('Custom proxy server'),
      );
      expect(warnings).toContainEqual(
        expect.stringContaining('https://custom.proxy.com'),
      );
    });

    it('should not return a warning when custom proxy server URL is not configured', async () => {
      const projectDir = path.join(testRootDir, 'project');
      await fs.mkdir(projectDir);
      const warnings = await getUserStartupWarnings(projectDir, emptySettings);
      expect(warnings).not.toContainEqual(
        expect.stringContaining('Custom proxy server'),
      );
    });
  });

  describe('error handling', () => {
    it('should handle errors when checking directory', async () => {
      const nonExistentPath = path.join(testRootDir, 'non-existent');
      const warnings = await getUserStartupWarnings(nonExistentPath, emptySettings);
      const expectedWarning =
        'Could not verify the current directory due to a file system error.';
      expect(warnings).toEqual([expectedWarning, expectedWarning]);
    });
  });
});
