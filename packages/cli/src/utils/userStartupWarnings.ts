/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import * as os from 'os';
import path from 'path';
import { t, tp } from '../ui/utils/i18n.js';
import { LoadedSettings } from '../config/settings.js';
import { getCreditsService } from '../services/creditsService.js';

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

const lowCreditsCheck: WarningCheck = {
  id: 'low-credits',
  check: async (_workspaceRoot: string, _settings: LoadedSettings) => {
    try {
      // 异步获取积分信息，不阻塞启动
      const creditsService = getCreditsService();
      const creditsInfo = await creditsService.getCreditsInfo();

      if (creditsInfo) {
        const remainingPercentage = 100 - creditsInfo.usagePercentage;
        // 取整：5.99% -> 5%, 1.5% -> 1%
        const roundedPercentage = Math.floor(remainingPercentage);
        // 只在恰好 5% 或 1% 时显示警告，避免频繁打扰
        if (roundedPercentage === 5 || roundedPercentage === 1) {
          return tp('startup.warning.low.credits', { percentage: roundedPercentage });
        }
      }

      return null;
    } catch (_err: unknown) {
      // 积分获取失败不应该阻塞启动，静默处理
      return null;
    }
  },
};

// All warning checks
const WARNING_CHECKS: readonly WarningCheck[] = [
  homeDirectoryCheck,
  rootDirectoryCheck,
  customProxyServerCheck,
  lowCreditsCheck,
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
