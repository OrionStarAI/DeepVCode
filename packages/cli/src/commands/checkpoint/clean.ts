/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { GEMINI_DIR } from 'deepv-code-core';
import { t, tp } from '../../ui/utils/i18n.js';

/**
 * Get the history directory path
 */
function getHistoryDir(): string {
  return path.join(os.homedir(), GEMINI_DIR, 'history');
}

/**
 * Calculate directory size recursively
 */
async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        totalSize += await getDirectorySize(entryPath);
      } else if (entry.isFile()) {
        const stats = await fs.stat(entryPath);
        totalSize += stats.size;
      }
    }
  } catch {
    // Ignore errors for inaccessible files/directories
  }

  return totalSize;
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Count projects (subdirectories) in history directory
 */
async function countProjects(historyDir: string): Promise<number> {
  try {
    const entries = await fs.readdir(historyDir, { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory()).length;
  } catch {
    return 0;
  }
}

export const cleanCommand: CommandModule = {
  command: 'clean',
  describe: t('checkpoint.clean.description'),
  builder: (yargs) =>
    yargs
      .option('force', {
        alias: 'f',
        type: 'boolean',
        description: t('checkpoint.clean.force.description'),
        default: false,
      })
      .option('dry-run', {
        type: 'boolean',
        description: t('checkpoint.clean.dryrun.description'),
        default: false,
      }),
  handler: async (argv) => {
    const historyDir = getHistoryDir();
    const force = argv.force as boolean;
    const dryRun = argv['dry-run'] as boolean;

    try {
      // Check if history directory exists
      try {
        await fs.access(historyDir);
      } catch {
        console.log(t('checkpoint.clean.no.history'));
        process.exit(0);
      }

      // Calculate size and count projects
      const size = await getDirectorySize(historyDir);
      const projectCount = await countProjects(historyDir);

      if (projectCount === 0) {
        console.log(t('checkpoint.clean.no.checkpoints'));
        process.exit(0);
      }

      // Show summary
      console.log(tp('checkpoint.clean.summary', {
        count: projectCount.toString(),
        size: formatBytes(size),
        path: historyDir
      }));

      if (dryRun) {
        console.log(t('checkpoint.clean.dryrun.notice'));
        process.exit(0);
      }

      // Confirm if not forced
      if (!force) {
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question(t('checkpoint.clean.confirm'), (ans) => {
            rl.close();
            resolve(ans.toLowerCase().trim());
          });
        });

        if (answer !== 'y' && answer !== 'yes') {
          console.log(t('checkpoint.clean.cancelled'));
          process.exit(0);
        }
      }

      // Delete the history directory
      console.log(t('checkpoint.clean.deleting'));
      await fs.rm(historyDir, { recursive: true, force: true });

      console.log(tp('checkpoint.clean.success', {
        size: formatBytes(size)
      }));
      process.exit(0);
    } catch (error) {
      console.error(tp('checkpoint.clean.error', {
        error: error instanceof Error ? error.message : String(error)
      }));
      process.exit(1);
    }
  },
};
