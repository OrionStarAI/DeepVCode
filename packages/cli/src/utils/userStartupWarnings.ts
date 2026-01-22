/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import * as os from 'os';
import path from 'path';
import { t } from '../ui/utils/i18n.js';
import { LoadedSettings } from '../config/settings.js';

type WarningCheck = {
  id: string;
  check: (workspaceRoot: string, settings: LoadedSettings) => Promise<string | null>;
};

// Individual warning checks
const homeDirectoryCheck: WarningCheck = {
  id: 'home-directory',
  check: async (workspaceRoot: string) => {
    try {
      const [workspaceRealPath, homeRealPath] = await Promise.all([
        fs.realpath(workspaceRoot),
        fs.realpath(os.homedir()),
      ]);

      if (workspaceRealPath === homeRealPath) {
        return t('startup.warning.home.directory');
      }
      return null;
    } catch (_err: unknown) {
      return t('startup.warning.filesystem.error');
    }
  },
};

const rootDirectoryCheck: WarningCheck = {
  id: 'root-directory',
  check: async (workspaceRoot: string) => {
    try {
      const workspaceRealPath = await fs.realpath(workspaceRoot);

      // Check for Unix root directory
      if (path.dirname(workspaceRealPath) === workspaceRealPath) {
        return t('startup.warning.root.directory');
      }

      return null;
    } catch (_err: unknown) {
      return t('startup.warning.filesystem.error');
    }
  },
};

const customProxyServerCheck: WarningCheck = {
  id: 'custom-proxy-server',
  check: async (_workspaceRoot: string, _settings: LoadedSettings) => {
    return null;
  },
};

// Note: lowCreditsCheck moved to App component for non-blocking startup
// See packages/cli/src/ui/hooks/useLowCreditsWarning.ts
// The credits check was causing 1-2 second delays due to network requests

// All warning checks
// Note: lowCreditsCheck removed - moved to App for non-blocking startup
const WARNING_CHECKS: readonly WarningCheck[] = [
  homeDirectoryCheck,
  rootDirectoryCheck,
  customProxyServerCheck,
];

export async function getUserStartupWarnings(
  workspaceRoot: string,
  settings: LoadedSettings,
): Promise<string[]> {
  const results = await Promise.all(
    WARNING_CHECKS.map((check) => check.check(workspaceRoot, settings)),
  );
  return results.filter((msg) => msg !== null);
}
