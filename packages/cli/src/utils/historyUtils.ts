/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { GEMINI_DIR } from 'deepv-code-core';

/**
 * Get the history directory path
 */
export function getHistoryDir(): string {
  return path.join(os.homedir(), GEMINI_DIR, 'history');
}

/**
 * Calculate directory size recursively
 */
export async function getDirectorySize(dirPath: string): Promise<number> {
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
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Count projects (subdirectories) in history directory
 */
export async function countProjects(historyDir: string): Promise<number> {
  try {
    const entries = await fs.readdir(historyDir, { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory()).length;
  } catch {
    return 0;
  }
}
