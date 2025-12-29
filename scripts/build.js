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
import ora from 'ora';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Fun build quotes
const buildQuotes = [
  "🚀 Building the future, one byte at a time...",
  "⚡ Transforming coffee into code...",
  "🎯 Assembling digital masterpiece...",
  "💻 Compiling dreams into reality...",
  "🔥 Forging the perfect codebase...",
  "⭐ Crafting software excellence...",
  "🛠️ Engineering digital magic...",
  "🌟 Creating computational wonders..."
];

console.log(chalk.cyan('\n' + buildQuotes[Math.floor(Math.random() * buildQuotes.length)] + '\n'));

// Check and install dependencies if needed
const dependencySpinner = ora({
  text: chalk.cyan('🔍 Checking dependencies...'),
  spinner: 'dots'
}).start();

if (!existsSync(join(root, 'node_modules'))) {
  dependencySpinner.text = chalk.cyan('📦 Installing dependencies...');
  try {
    execSync('npm install', { stdio: 'pipe', cwd: root });
    dependencySpinner.succeed(chalk.green('✅ Dependencies installed!'));
  } catch (error) {
    dependencySpinner.fail(chalk.red('💥 Failed to install dependencies!'));
    throw error;
  }
} else {
  dependencySpinner.succeed(chalk.green('✅ Dependencies check passed!'));
}

// Generate files
const generateSpinner = ora({
  text: chalk.cyan('⚙️ Generating project files...'),
  spinner: 'earth'
}).start();

try {
  execSync('npm run generate', { stdio: 'pipe', cwd: root });
  generateSpinner.succeed(chalk.green('✨ File generation completed!'));
} catch (error) {
  generateSpinner.fail(chalk.red('💥 File generation failed!'));
  throw error;
}

// Build workspaces (exclude vscode-ui-plugin by default for faster builds, include only if INCLUDE_VSCODE_PLUGIN is set)
const shouldIncludeVscodePlugin = process.env.INCLUDE_VSCODE_PLUGIN === 'true' || process.env.INCLUDE_VSCODE_PLUGIN === '1';
const workspaceCommand = shouldIncludeVscodePlugin
  ? 'npm run build --workspaces'
  : 'npm run build --workspace=packages/cli --workspace=packages/core';

const workspaceSpinner = ora({
  text: chalk.cyan(shouldIncludeVscodePlugin
    ? '🏗️ Building all workspaces (including vscode-ui-plugin)...'
    : '🏗️ Building core workspaces (vscode-ui-plugin excluded for faster builds)...'),
  spinner: 'bouncingBall'
}).start();

try {
  execSync(workspaceCommand, { stdio: 'pipe', cwd: root });
  workspaceSpinner.succeed(chalk.green(shouldIncludeVscodePlugin
    ? '🎉 All workspaces built successfully!'
    : '🎉 Core workspaces built successfully! (vscode-ui-plugin excluded for faster builds)'));
} catch (error) {
  workspaceSpinner.fail(chalk.red('💥 Workspace build failed!'));
  throw error;
}

// Ensure CLI package is up to date
const cliSpinner = ora({
  text: chalk.cyan('🔧 Ensuring CLI package is up to date...'),
  spinner: 'clock'
}).start();

try {
  execSync('cd packages/cli && npx tsc --build ', { stdio: 'pipe', cwd: root });
  cliSpinner.succeed(chalk.green('⚡ CLI package updated!'));
} catch (error) {
  cliSpinner.fail(chalk.red('💥 CLI package update failed!'));
  throw error;
}

// Build container image if sandboxing is enabled
const sandboxSpinner = ora({
  text: chalk.cyan('🐳 Checking sandbox configuration...'),
  spinner: 'dots'
}).start();

try {
  execSync('node scripts/sandbox_command.js -q', {
    stdio: 'pipe',
    cwd: root,
  });

  if (process.env.BUILD_SANDBOX === '1' || process.env.BUILD_SANDBOX === 'true') {
    sandboxSpinner.text = chalk.cyan('🐳 Building sandbox container...');
    execSync('node scripts/build_sandbox.js -s', {
      stdio: 'pipe',
      cwd: root,
    });
    sandboxSpinner.succeed(chalk.green('🐳 Sandbox container built!'));
  } else {
    sandboxSpinner.info(chalk.cyan('ℹ️ Sandbox build skipped (not enabled)'));
  }
} catch {
  sandboxSpinner.info(chalk.cyan('ℹ️ Sandbox not available'));
}

console.log(chalk.bold.green('\n🎉 Build completed successfully! Ready to deploy! 🚀\n'));
