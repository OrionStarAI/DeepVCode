/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface GitHubUrl {
  owner: string;
  repo: string;
}

export function tryParseGithubUrl(url: string): GitHubUrl | null {
  // Parse GitHub URLs like https://github.com/owner/repo
  const match = url.match(/github\.com[/:]([\w-]+)\/([\w-]+?)(\.git)?$/i);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }
  return null;
}

export async function cloneFromGit(
  source: string,
  targetDir: string,
  ref?: string,
): Promise<void> {
  const refArg = ref ? `--branch ${ref}` : '';
  const command = `git clone ${refArg} "${source}" "${targetDir}"`;

  try {
    execSync(command, { stdio: 'pipe' });
  } catch (error) {
    throw new Error(`Failed to clone extension from ${source}`);
  }
}

export async function downloadFromGitHubRelease(
  owner: string,
  repo: string,
  targetDir: string,
  allowPreRelease: boolean = false,
): Promise<string> {
  // For now, just throw - actual GitHub release download would need proper implementation
  throw new Error('GitHub release download not yet implemented');
}
