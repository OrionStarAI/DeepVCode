/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.dirname(__dirname);

function preparePublish() {
  const readmePath = path.join(rootDir, 'README.md');
  const publishFlagFile = path.join(rootDir, '.npm-publish-in-progress');

  console.log(chalk.cyan('\n📦 Preparing publication package...\n'));

  // 检查 README.md 文件是否存在
  if (!fs.existsSync(readmePath)) {
    console.error(chalk.red('❌ README.md not found'));
    process.exit(1);
  }

  console.log(chalk.green('✅ README.md check passed'));
  console.log(chalk.dim('   (No README replacement needed)\n'));

  // Create a flag file to signal that we're in publish mode
  // This prevents the prepare hook from running redundant builds
  try {
    fs.writeFileSync(publishFlagFile, Date.now().toString());
  } catch (err) {
    console.warn(chalk.yellow('⚠️  Failed to create publish flag file:', err.message));
  }
}

preparePublish();
