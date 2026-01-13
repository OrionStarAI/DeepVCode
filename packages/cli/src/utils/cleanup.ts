/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { getProjectTempDir } from 'deepv-code-core';

const cleanupFunctions: Array<() => void | Promise<void>> = [];

export function registerCleanup(fn: () => void | Promise<void>) {
  cleanupFunctions.push(fn);
}

let isCleaningUp = false;

export async function runExitCleanup() {
  if (isCleaningUp) return;
  isCleaningUp = true;

  // Create a copy of the functions to iterate over, in case the array is modified during cleanup
  const functionsToRun = [...cleanupFunctions];
  cleanupFunctions.length = 0; // Clear the array immediately to prevent re-execution

  for (const fn of functionsToRun) {
    try {
      await fn();
    } catch (_) {
      // Ignore errors during cleanup.
    }
  }
}

export async function cleanupCheckpoints() {
  const tempDir = getProjectTempDir(process.cwd());
  const checkpointsDir = join(tempDir, 'checkpoints');
  try {
    await fs.rm(checkpointsDir, { recursive: true, force: true });
  } catch {
    // Ignore errors if the directory doesn't exist or fails to delete.
  }
}
