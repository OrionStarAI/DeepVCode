/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import ora from 'ora';
import chalk from 'chalk';
import cliProgress from 'cli-progress';

/**
 * 🚀 New Package Script - Simplified Reliable Version
 * Features:
 * 1. Auto-increment patch version (modify root package.json only)
 * 2. Use standard build commands for reliability
 * 3. Package and generate tgz
 * 4. Optional installation (--install)
 */

// Fun programmer quotes for the packaging process
const packagingQuotes = [
  "🚀 Launching into the packaging stratosphere...",
  "⚡ Compressing dreams into reality...",
  "🎯 Building the ultimate deployment package...",
  "💻 Wrapping code with love and care...",
  "🔥 Creating digital magic in a box...",
  "⭐ Packaging excellence for the world...",
  "🛠️ Crafting the perfect software bundle...",
  "🌟 Making deployment dreams come true..."
];

function run(command, options = {}) {
  console.log(chalk.cyan(`\n🔧 Executing: ${command}`));
  try {
    return execSync(command, { stdio: 'inherit', ...options });
  } catch (error) {
    console.error(chalk.red(`❌ Command failed: ${command}`));
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

function getCurrentVersion() {
  const rootPackageJsonPath = resolve(process.cwd(), 'package.json');
  const packageJson = JSON.parse(readFileSync(rootPackageJsonPath, 'utf-8'));
  return packageJson.version;
}

function incrementPatchVersion(version) {
  const parts = version.split('.');
  const patch = parseInt(parts[2]) + 1;
  return `${parts[0]}.${parts[1]}.${patch}`;
}

function updateRootPackageVersion(newVersion) {
  const rootPackageJsonPath = resolve(process.cwd(), 'package.json');
  const packageJson = JSON.parse(readFileSync(rootPackageJsonPath, 'utf-8'));
  packageJson.version = newVersion;
  writeFileSync(rootPackageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
}

function updateAllPackageVersions(newVersion) {
  const packagesToUpdate = [
    'packages/cli/package.json',
    'packages/cli/src/package.json',
    'packages/core/package.json',
    'packages/vscode-ide-companion/package.json'
  ];

  console.log(chalk.blue('   📦 Syncing version numbers across all sub-projects:'));

  packagesToUpdate.forEach(packagePath => {
    const fullPath = resolve(process.cwd(), packagePath);
    try {
      const packageJson = JSON.parse(readFileSync(fullPath, 'utf-8'));
      const oldVersion = packageJson.version;
      packageJson.version = newVersion;
      writeFileSync(fullPath, JSON.stringify(packageJson, null, 2) + '\n');
      console.log(chalk.green(`   ✅ ${packagePath}: ${oldVersion} → ${newVersion}`));
    } catch (error) {
      console.log(chalk.yellow(`   ⚠️  Skipped ${packagePath} (file not found or unreadable)`));
    }
  });
}

function main() {
  // Display a random packaging quote
  const randomQuote = packagingQuotes[Math.floor(Math.random() * packagingQuotes.length)];
  console.log(chalk.bold.cyan('\n' + randomQuote + '\n'));

  console.log(chalk.bold.magenta('🚀 DeepV Code New Packaging Flow (Simplified Reliable Version)'));
  console.log(chalk.gray('═══════════════════════════════════════════════════════════════'));
  console.log(chalk.blue('📋 Process Overview:'));
  console.log(chalk.white('   1. Check current version'));
  console.log(chalk.white('   2. Auto-increment version number (patch +1)'));
  console.log(chalk.white('   3. Smart build and package (npm pack auto-executes prepare hook)'));
  console.log(chalk.white('   4. Optional installation and testing'));
  console.log(chalk.gray('═══════════════════════════════════════════════════════════════\n'));

  // Check if installation is needed (supports multiple methods)
  const args = process.argv.slice(2);
  const npmConfigArgv = process.env.npm_config_argv ? JSON.parse(process.env.npm_config_argv) : null;
  const allArgs = [...args, ...(npmConfigArgv?.original || [])];

  const shouldInstall = allArgs.includes('--install');

  if (shouldInstall) {
    console.log(chalk.green('🔧 Mode: Full workflow (build + install + test)'));
  } else {
    console.log(chalk.blue('🔧 Mode: Build only (no installation)'));
  }
  console.log('');

  try {
    // Create progress bar for the overall process
    const progressBar = new cliProgress.SingleBar({
      format: chalk.cyan('Progress') + ' |' + chalk.cyan('{bar}') + '| {percentage}% | {value}/{total} Steps | {step}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    progressBar.start(shouldInstall ? 4 : 3, 0, { step: 'Starting...' });

    progressBar.update(0, { step: '📋 Step 1: Checking current version' });
    const currentVersion = getCurrentVersion();
    console.log(chalk.blue(`\n   Current version: ${currentVersion}`));
    progressBar.increment({ step: 'Version check complete' });

    progressBar.update(1, { step: '📈 Step 2: Auto-incrementing version number' });
    console.log(chalk.blue('\n   Description: Updating root directory and all sub-project version numbers (patch +1)'));
    const newVersion = incrementPatchVersion(currentVersion);
    updateRootPackageVersion(newVersion);
    console.log(chalk.green(`   ✅ Root directory version updated: ${currentVersion} → ${newVersion}`));
    updateAllPackageVersions(newVersion);
    console.log(chalk.blue(`   📦 Will generate file: deepv-code-${newVersion}.tgz`));
    progressBar.increment({ step: 'Version increment complete' });

    progressBar.update(2, { step: '🔨 Step 3: Building and packaging' });
    console.log(chalk.blue('\n   Description: npm pack will auto-execute all build steps via prepare hook'));
    console.log(chalk.blue('   📋 prepare hook executes: npm run bundle (includes build and package)'));

    const tgzFileName = `deepv-code-${newVersion}.tgz`;
    const packingSpinner = ora({
      text: chalk.cyan('📦 Executing: npm pack (auto-build + package)'),
      spinner: 'bouncingBall'
    }).start();

    try {
      run('npm pack');
      packingSpinner.succeed(chalk.green(`✨ Build and packaging completed: ${tgzFileName}`));
      console.log(chalk.blue(`   📋 Final version: ${newVersion}`));
      progressBar.increment({ step: 'Build and package complete' });
    } catch (error) {
      packingSpinner.fail(chalk.red('💥 Build and packaging failed!'));
      throw error;
    }

    // Optional: Global installation
    if (shouldInstall) {
      progressBar.update(3, { step: '🌐 Step 4: Global installation and testing' });
      console.log(chalk.blue('\n   Description: Uninstall old version → Install new version → Reset auth → Test startup'));

      // Uninstall old version first (ignore errors)
      const uninstallSpinner = ora('🗑️ Uninstalling old version...').start();
      try {
        run('npm uninstall -g deepv-code', { stdio: 'pipe' });
        uninstallSpinner.succeed(chalk.green('✅ Old version uninstalled'));
      } catch (error) {
        uninstallSpinner.info(chalk.cyan('ℹ️ No previously installed version found'));
      }

      // Install new version
      const installSpinner = ora('📦 Installing new version...').start();
      try {
        run(`npm install -g ./${tgzFileName}`);
        installSpinner.succeed(chalk.green('✅ Global installation completed!'));
      } catch (error) {
        installSpinner.fail(chalk.red('💥 Installation failed!'));
        throw error;
      }

      // Reset authentication (choose script based on OS)
      const authSpinner = ora('🔄 Resetting authentication config...').start();
      try {
        const isWindows = process.platform === 'win32';
        const resetScript = isWindows ? './reset_auth_win.ps1' : './reset_auth.sh';
        const command = isWindows ? `powershell -ExecutionPolicy Bypass -File ${resetScript}` : resetScript;

        run(command);
        authSpinner.succeed(chalk.green('✅ Authentication reset'));
      } catch (error) {
        authSpinner.info(chalk.cyan('ℹ️ Skipped auth reset (script not found or execution failed)'));
      }

      // Test dvcode startup
      const testSpinner = ora('🚀 Testing new version startup...').start();
      try {
        run('dvcode --version');
        testSpinner.succeed(chalk.green('✅ dvcode startup successful!'));
      } catch (error) {
        testSpinner.warn(chalk.yellow('⚠️ dvcode startup failed, please test manually'));
      }

      progressBar.increment({ step: 'Installation and testing complete' });
    } else {
      console.log(chalk.cyan('\n💡 Skipping installation step'));
      console.log(chalk.yellow('   Tip: Use --install parameter for automatic global installation'));
      console.log(chalk.white(`   Manual install command: npm install -g ./${tgzFileName}`));
    }

    progressBar.stop();

    console.log(chalk.bold.green('\n🎉 New packaging workflow completed!'));
    console.log(chalk.gray('═══════════════════════════════════════════════════════════════'));
    console.log(chalk.cyan(`📦 Generated file: ${tgzFileName}`));
    console.log(chalk.cyan(`📋 Final version: ${newVersion}`));
    if (shouldInstall) {
      console.log(chalk.green('✅ Completed: Build → Install → Test'));
      console.log(chalk.magenta('💡 You can now use the dvcode command'));
    } else {
      console.log(chalk.green('✅ Completed: Build and packaging'));
      console.log(chalk.yellow(`💡 Install command: npm install -g ./${tgzFileName}`));
    }
    console.log(chalk.gray('═══════════════════════════════════════════════════════════════'));

  } catch (error) {
    console.error(chalk.red('\n❌ Packaging workflow failed!'));
    console.error(chalk.gray('═══════════════════════════════════════════════════════════════'));
    console.error(chalk.red(`Error message: ${error.message}`));
    console.error(chalk.gray('═══════════════════════════════════════════════════════════════'));
    process.exit(1);
  }
}

// Display help information
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(chalk.cyan(`
🚀 New Package Script Usage Guide (Simplified Reliable Version)

Usage:
  npm run newpack [options]

Options:
  --install     Auto global install after packaging
  --help, -h    Show help information

Features:
  ✅ Auto-increment patch version (modify root package.json only)
  ✅ Standard build workflow (build → bundle → pack)
  ✅ Generate tgz file (deepv-code-{new-version}.tgz)
  ✅ Optional global install + auth reset + startup test

Examples:
  npm run newpack              # Package only, no install
  npm run newpack:install      # Package and global install (recommended)
  npm run newpack --install    # Package and global install (compatible)

Build Workflow:
  1. Version auto-increment (patch +1)
  2. npm pack (auto-executes all build steps via prepare hook)
     - prepare hook auto-executes: npm run bundle
     - bundle includes: generate + build + esbuild + resource copying

Notes:
  - Version number auto-increments every run
  - npm pack auto-executes build via prepare hook, avoiding duplicate builds
  - Using --install will auto-uninstall old version and install new one
  - Generated tgz file can be used for manual installation or publishing
`));
  process.exit(0);
}

main();
