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

function restoreReadme() {
  const readmePath = path.join(rootDir, 'README.md');
  const backupPath = path.join(rootDir, '.publish-backup');

  console.log(chalk.cyan('\n🔄 Restoring README.md after publish...\n'));

  if (!fs.existsSync(backupPath)) {
    console.log(chalk.yellow('⚠️  No backup found, skipping restore'));
    return;
  }

  try {
    const backup = fs.readFileSync(backupPath, 'utf-8');
    fs.writeFileSync(readmePath, backup);
    fs.unlinkSync(backupPath);
    console.log(chalk.green('✅ README.md restored successfully\n'));
  } catch (error) {
    console.error(chalk.red('❌ Error during restore:'), error.message);
    process.exit(1);
  }
}

restoreReadme();
