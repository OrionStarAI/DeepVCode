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
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from 'fs';
import { join } from 'path';
import ora from 'ora';
import chalk from 'chalk';

// Get package name from local package.json
let packageName = 'Package';
try {
  const pkgJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));
  packageName = pkgJson.name || 'Package';
} catch (e) {
  // Fallback to folder name
  packageName = process.cwd().split(/[\\/]/).pop();
}

if (!process.cwd().includes('packages')) {
  console.error(chalk.red('[!] Error: Must be called from within a package directory'));
  console.error(chalk.yellow('    Hint: Change directory to packages/cli or packages/core first'));
  process.exit(1);
}



// Build TypeScript files with spinner
const buildSpinner = ora({
  text: chalk.blue('Compiling TypeScript sources...'),
  spinner: 'dots12'
}).start();

try {
  execSync('npx tsc --build', { stdio: 'pipe' });
  buildSpinner.succeed(chalk.green('TypeScript compilation completed successfully.'));
} catch (error) {
  buildSpinner.fail(chalk.red('TypeScript compilation failed.'));
  console.error(error.message);
  process.exit(1);
}

// Finalize CLI if applicable
if (packageName === 'deepv-code-cli') {
  const finalizeSpinner = ora({
    text: chalk.blue('Finalizing CLI distribution...'),
    spinner: 'dots12'
  }).start();

  try {
    // This ensures incremental build is 100% complete and ready
    execSync('npx tsc --build', { stdio: 'pipe' });
    finalizeSpinner.succeed(chalk.green('CLI distribution finalized.'));
  } catch (error) {
    finalizeSpinner.fail(chalk.red('Failed to finalize CLI distribution.'));
    console.error(error.message);
    process.exit(1);
  }
}

// Copy files with spinner
const copySpinner = ora({
  text: chalk.blue('Synchronizing resource files...'),
  spinner: 'dots12'
}).start();

try {
  execSync('node ../../scripts/copy_files.js', { stdio: 'pipe' });
  copySpinner.succeed(chalk.green('Resource files synchronized successfully.'));
} catch (error) {
  copySpinner.fail(chalk.red('Failed to synchronize resource files.'));
  console.error(error.message);
  process.exit(1);
}

// Special handling for deepv-code-core templates: sync to bundle directory for dev mode
if (packageName === 'deepv-code-core') {
  const templateSpinner = ora({
    text: chalk.blue('Syncing templates to bundle (dev mode)...'),
    spinner: 'dots12'
  }).start();

  try {
    const templateSrc = join(process.cwd(), 'src', 'auth', 'login', 'templates');
    // Assume we are in packages/core, so root is ../../
    const bundleDest = join(process.cwd(), '..', '..', 'bundle', 'login', 'templates');

    if (existsSync(templateSrc)) {
      if (!existsSync(bundleDest)) {
        mkdirSync(bundleDest, { recursive: true });
      }

      const files = readdirSync(templateSrc);
      let copiedCount = 0;
      for (const file of files) {
        if (file.endsWith('.html') || file.endsWith('.ico')) {
          copyFileSync(join(templateSrc, file), join(bundleDest, file));
          copiedCount++;
        }
      }
      templateSpinner.succeed(chalk.green(`Synced ${copiedCount} template files to bundle directory.`));
    } else {
      templateSpinner.info(chalk.yellow('Templates directory not found, skipping sync.'));
    }
  } catch (error) {
    templateSpinner.warn(chalk.yellow(`Failed to sync templates: ${error.message}`));
  }
}

// Create build timestamp
const timestampSpinner = ora({
  text: chalk.blue('Generating build metadata...'),
  spinner: 'dots12'
}).start();

try {
  writeFileSync(join(process.cwd(), 'dist', '.last_build'), '');
  timestampSpinner.succeed(chalk.green('Build metadata generated.'));
} catch (error) {
  timestampSpinner.fail(chalk.red('Failed to generate build metadata.'));
  console.error(error.message);
  process.exit(1);
}

console.log(chalk.bold.green(`\n✅ ${packageName} build completed successfully.\n`));
process.exit(0);
