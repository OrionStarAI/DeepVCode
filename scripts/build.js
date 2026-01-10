/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Add support for --no-rebuild flag or DEEPV_SKIP_BUILD env var
const skipRebuild = process.argv.includes('--no-rebuild') || process.env.DEEPV_SKIP_BUILD === '1';

// --- UI Utilities (ANSI Colors) ---
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

const LOGO = `
${COLORS.cyan}${COLORS.bright}DeepV Code Build System${COLORS.reset}
`;

function printHeader(title) {
  console.log(`\n${COLORS.bright}${COLORS.blue}>>${COLORS.reset} ${COLORS.bright}${title}${COLORS.reset}`);
}

function printItem(status, name, info = '') {
  const icon = status === 'success' ? `${COLORS.green}✅${COLORS.reset}` : status === 'failed' ? `${COLORS.red}❌${COLORS.reset}` : `${COLORS.yellow}⚠${COLORS.reset}`;
  const label = info ? `${COLORS.dim}[${info}]${COLORS.reset}` : '';
  console.log(`  ${icon} ${COLORS.cyan}${name.padEnd(25)}${COLORS.reset} ${label}`);
}

const startTime = Date.now();
console.log(LOGO);
console.log(`${COLORS.dim}Root directory: ${root}${COLORS.reset}`);

// Check and install dependencies if needed
if (!existsSync(join(root, 'node_modules'))) {
  printHeader('Initializing dependencies');
  try {
    execSync('npm install', { stdio: 'inherit', cwd: root });
    printItem('success', 'NPM packages', 'Installed');
  } catch (error) {
    printItem('failed', 'NPM packages', 'Failed to install');
    process.exit(1);
  }
} else {
  printHeader('Environment check');
  printItem('success', 'Node modules', 'Verified');
}

// Build workspaces in specific order
const workspaces = [
  { path: 'packages/core', name: 'core' },
  { path: 'packages/cli', name: 'cli' },
  { path: 'packages/vscode-ui-plugin', name: 'vscode-ui-plugin' }
];

const results = [];

printHeader('Building workspaces');

if (skipRebuild) {
  console.log(`${COLORS.yellow}⏭️  Skipping build steps due to --no-rebuild flag${COLORS.reset}`);
  workspaces.forEach(workspace => {
    results.push({ ...workspace, status: 'SUCCESS' });
  });
} else {
  try {
    for (const workspace of workspaces) {
      console.log(`\n${COLORS.dim}─ Workspace: ${workspace.name} ─${COLORS.reset}`);
      try {
        execSync(`npm run build --workspace=${workspace.path}`, { stdio: 'inherit', cwd: root });
        results.push({ ...workspace, status: 'SUCCESS' });
      } catch (error) {
        results.push({ ...workspace, status: 'FAILED' });
        throw error;
      }
    }
  } catch (error) {
    printSummary(results);
    console.error(`\n${COLORS.red}${COLORS.bright}[!] Build process interrupted due to workspace failure.${COLORS.reset}`);
    process.exit(1);
  }
}

// Build container image if sandboxing is enabled
try {
  execSync('node scripts/sandbox_command.js -q', {
    stdio: 'inherit',
    cwd: root,
  });

  if (process.env.BUILD_SANDBOX === '1' || process.env.BUILD_SANDBOX === 'true') {
    printHeader('Building sandbox container');
    execSync('node scripts/build_sandbox.js -s', {
      stdio: 'inherit',
      cwd: root,
    });
    printItem('success', 'Docker Image', 'Sandbox ready');
  }
} catch {
  // Silent skip if sandbox not available
}

printSummary(results);

function printSummary(workspaceResults) {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n${COLORS.bright}${COLORS.blue}----------------------- Build Summary -----------------------${COLORS.reset}`);

  workspaceResults.forEach(res => {
    const statusColor = res.status === 'SUCCESS' ? COLORS.green : COLORS.red;
    const icon = res.status === 'SUCCESS' ? '✅' : '❌';
    const statusText = res.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED';
    console.log(`${icon} ${COLORS.cyan}${res.name.padEnd(35)}${COLORS.reset} [${statusColor}${statusText}${COLORS.reset}]`);
  });

  console.log(`${COLORS.bright}${COLORS.blue}-------------------------------------------------------------${COLORS.reset}`);
  console.log(`\n${COLORS.green}${COLORS.bright}Build process completed in ${duration}s.${COLORS.reset}\n`);
}

