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
import { writeFileSync } from 'fs';
import { join } from 'path';
import ora from 'ora';
import chalk from 'chalk';

// Fun programmer quotes for build process
const quotes = [
  "🚀 Compiling dreams into reality...",
  "⚡ Turning coffee into code...", 
  "🎯 Building the future, one line at a time...",
  "💻 Making magic happen...",
  "🔥 Cooking up some fresh code...",
  "⭐ Crafting digital excellence...",
  "🛠️ Assembling the pieces of genius...",
  "🌟 Weaving code into wonder..."
];

if (!process.cwd().includes('packages')) {
  console.error(chalk.red('❌ Error: Must be called from within a package directory'));
  console.error(chalk.yellow('💡 Hint: cd into packages/cli or packages/core first'));
  process.exit(1);
}

// Display a random quote
const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
console.log(chalk.cyan('\n' + randomQuote + '\n'));

// Build TypeScript files with spinner
const buildSpinner = ora({
  text: chalk.blue('🔨 Building TypeScript files...'),
  spinner: 'dots12'
}).start();

try {
  execSync('npx tsc --build', { stdio: 'pipe' });
  buildSpinner.succeed(chalk.green('✨ TypeScript compilation completed!'));
} catch (error) {
  buildSpinner.fail(chalk.red('💥 TypeScript compilation failed!'));
  console.error(error.message);
  process.exit(1);
}

// Copy files with spinner
const copySpinner = ora({
  text: chalk.blue('📁 Copying resource files...'),
  spinner: 'earth'
}).start();

try {
  execSync('node ../../scripts/copy_files.js', { stdio: 'pipe' });
  copySpinner.succeed(chalk.green('📦 Resource files copied successfully!'));
} catch (error) {
  copySpinner.fail(chalk.red('💥 Failed to copy resource files!'));
  console.error(error.message);
  process.exit(1);
}

// Create build timestamp
const timestampSpinner = ora({
  text: chalk.blue('⏰ Creating build timestamp...'),
  spinner: 'clock'
}).start();

try {
  writeFileSync(join(process.cwd(), 'dist', '.last_build'), '');
  timestampSpinner.succeed(chalk.green('⚡ Build timestamp created!'));
} catch (error) {
  timestampSpinner.fail(chalk.red('💥 Failed to create timestamp!'));
  console.error(error.message);
  process.exit(1);
}

console.log(chalk.bold.green('\n🎉 Package build completed successfully! Ready to rock! 🚀\n'));
process.exit(0);
