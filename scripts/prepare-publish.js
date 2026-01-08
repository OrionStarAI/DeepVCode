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
  const whitepaperPath = path.join(rootDir, 'DeepV_Code_Whitepaper.md');
  const backupPath = path.join(rootDir, '.publish-backup');

  console.log(chalk.cyan('\n📦 Preparing publication package...\n'));

  // 检查文件是否存在
  if (!fs.existsSync(readmePath)) {
    console.error(chalk.red('❌ README.md not found'));
    process.exit(1);
  }

  if (!fs.existsSync(whitepaperPath)) {
    console.error(chalk.red('❌ DeepV_Code_Whitepaper.md not found'));
    process.exit(1);
  }

  try {
    // 读取原始 README 和白皮书内容
    const readmeBackup = fs.readFileSync(readmePath, 'utf-8');
    const whitepaper = fs.readFileSync(whitepaperPath, 'utf-8');

    // 保存备份
    fs.writeFileSync(backupPath, readmeBackup);

    // 替换 README 为白皮书内容
    fs.writeFileSync(readmePath, whitepaper);

    console.log(chalk.green('✅ README.md replaced with whitepaper content'));
    console.log(chalk.dim(`   (Original backed up at ${backupPath})\n`));
  } catch (error) {
    console.error(chalk.red('❌ Error during prepare-publish:'), error.message);
    process.exit(1);
  }
}

preparePublish();
