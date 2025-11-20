#!/usr/bin/env node
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { readdirSync, statSync, unlinkSync } from 'fs';
import { join, extname, basename } from 'path';
import ora from 'ora';
import chalk from 'chalk';

const sourceExtensions = ['.ts', '.tsx'];
const compiledExtensions = ['.js', '.js.map'];
const packagesToClean = ['packages/cli/src', 'packages/core/src'];

let totalCleaned = 0;
const cleanedFiles = [];

/**
 * 递归遍历目录，查找与 .ts/.tsx 文件同名的 .js/.js.map 文件
 */
function cleanDirectory(dir) {
  try {
    const files = readdirSync(dir);

    for (const file of files) {
      const fullPath = join(dir, file);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // 递归清理子目录
        cleanDirectory(fullPath);
      } else if (stat.isFile()) {
        const ext = extname(file);
        const nameWithoutExt = basename(file, ext);

        // 如果是 .js 或 .js.map 文件
        if (compiledExtensions.includes(ext) || file.endsWith('.js.map')) {
          // 检查是否存在对应的 .ts 或 .tsx 源文件
          const hasSourceFile = sourceExtensions.some(srcExt => {
            const sourcePath = join(dir, nameWithoutExt + srcExt);
            try {
              return statSync(sourcePath).isFile();
            } catch {
              return false;
            }
          });

          if (hasSourceFile) {
            try {
              unlinkSync(fullPath);
              totalCleaned++;
              cleanedFiles.push(fullPath);
            } catch (error) {
              console.error(chalk.red(`✘ Failed to delete: ${fullPath}`));
              console.error(chalk.red(`  Error: ${error.message}`));
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(chalk.red(`✘ Error reading directory: ${dir}`));
    console.error(chalk.red(`  Error: ${error.message}`));
  }
}

/**
 * 主函数
 */
function main() {
  const spinner = ora({
    text: chalk.cyan('Scanning and cleaning...'),
    spinner: 'dots',
  }).start();

  try {
    for (const pkg of packagesToClean) {
      cleanDirectory(pkg);
    }

    spinner.succeed(chalk.green(`✅ Cleaned ${totalCleaned} file(s)`));

    if (cleanedFiles.length > 0) {
      console.log(chalk.gray('\nDeleted files:'));
      cleanedFiles.forEach(file => {
        console.log(chalk.gray(`  • ${file}`));
      });
    } else {
      console.log(chalk.gray('No compiled files found to clean.'));
    }
  } catch (error) {
    spinner.fail(chalk.red('✘ Cleanup failed!'));
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

main();