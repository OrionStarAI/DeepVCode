/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { rmSync, readFileSync, existsSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { globSync } from 'glob';
import { execSync } from 'child_process';
import os from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

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
${COLORS.cyan}${COLORS.bright}DeepV Code Maintenance & Cleanup Utility${COLORS.reset}
`;

function printHeader(step, total, title) {
  console.log(`\n${COLORS.bright}${COLORS.blue}[${step}/${total}]${COLORS.reset} ${COLORS.bright}${title}${COLORS.reset}`);
}

function printItem(status, path, type) {
  const icon = status === 'success' ? `${COLORS.green}✅${COLORS.reset}` : `${COLORS.yellow}❌${COLORS.reset}`;
  const label = type ? `${COLORS.dim}[${type}]${COLORS.reset}` : '';
  const cleanPath = path.replace(/\\/g, '/');
  console.log(`  ${icon} ${label.padEnd(20)} ${COLORS.cyan}${cleanPath}${COLORS.reset}`);
}

const startTime = Date.now();
console.log(LOGO);
console.log(`${COLORS.dim}Root directory: ${root}${COLORS.reset}\n`);

const RMRF_OPTIONS = { recursive: true, force: true };
let stepCount = 1;
const totalSteps = 6;

// --- STEP 1: Compiled Files ---
printHeader(stepCount++, totalSteps, 'Cleaning compiled source files');
try {
  execSync('node scripts/clean-compiled-js.js', { cwd: root, stdio: 'pipe' });
  printItem('success', './src/**/*.js', 'JS Source Cache');
} catch (error) {
  console.log(`  ${COLORS.yellow}⚠  Note: Partial source cleanup or already clean${COLORS.reset}`);
}

// --- STEP 2: Workspace Artifacts ---
printHeader(stepCount++, totalSteps, 'Cleaning workspace artifacts');
const rootPackageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const workspaces = rootPackageJson.workspaces || [];

for (const workspacePattern of workspaces) {
  const packageDirs = globSync(workspacePattern, { cwd: root });
  for (const pkgDirRel of packageDirs) {
    const pkgDir = join(root, pkgDirRel);

    // Core artifacts
    const toClean = ['dist', 'build', 'coverage', 'out'];
    for (const dir of toClean) {
      const target = join(pkgDir, dir);
      if (existsSync(target)) {
        rmSync(target, RMRF_OPTIONS);
        printItem('success', join(pkgDirRel, dir), 'Build Artifact');
      }
    }

    // Dependencies (Workspace level)
    const nodeModules = join(pkgDir, 'node_modules');
    if (existsSync(nodeModules)) {
      rmSync(nodeModules, RMRF_OPTIONS);
      printItem('success', join(pkgDirRel, 'node_modules'), 'Dependencies');
    }

    // Webview special case
    if (pkgDirRel.includes('vscode-ui-plugin')) {
      const webviewDir = join(pkgDir, 'webview');
      ['build', 'node_modules', 'dist'].forEach(dir => {
        const target = join(webviewDir, dir);
        if (existsSync(target)) {
          rmSync(target, RMRF_OPTIONS);
          printItem('success', join(pkgDirRel, 'webview', dir), 'Webview Artifact');
        }
      });
    }
  }
}

// --- STEP 3: System Caches ---
printHeader(stepCount++, totalSteps, 'Cleaning system caches and build info');
const caches = [
  { glob: '**/tsconfig.tsbuildinfo', type: 'TS Build Cache' },
  { dir: join(os.tmpdir(), 'deepv-webview-webpack-cache'), type: 'Webpack Cache', manual: true }
];

// TS Build Info
globSync('**/tsconfig.tsbuildinfo', { cwd: root, ignore: ['node_modules/**'] }).forEach(file => {
  rmSync(join(root, file), RMRF_OPTIONS);
  printItem('success', file, 'TS Build Cache');
});

// Webpack
const webpackCache = join(os.tmpdir(), 'deepv-webview-webpack-cache');
if (existsSync(webpackCache)) {
  rmSync(webpackCache, RMRF_OPTIONS);
  printItem('success', '<System Temp>/deepv-webview-webpack-cache', 'Webpack Cache');
}

// Generated files
const generatedDir = join(root, 'packages/cli/src/generated/');
if (existsSync(generatedDir)) {
  rmSync(generatedDir, RMRF_OPTIONS);
  printItem('success', 'packages/cli/src/generated', 'Generated Source');
}

// --- STEP 4: Package Artifacts ---
printHeader(stepCount++, totalSteps, 'Cleaning distribution packages');
const pkgPatterns = [
  { pattern: '**/*.vsix', type: 'VSIX Package' },
  { pattern: '**/*.tgz', type: 'NPM Artifact' }
];

pkgPatterns.forEach(({ pattern, type }) => {
  globSync(pattern, { cwd: root, ignore: ['node_modules/**'] }).forEach(file => {
    rmSync(join(root, file), RMRF_OPTIONS);
    printItem('success', file, type);
  });
});

// --- STEP 5: Root Artifacts ---
printHeader(stepCount++, totalSteps, 'Cleaning root-level artifacts');
const rootDirs = [
  { dir: 'temp', type: 'Temporary Data' },
  { dir: 'bundle', type: 'Production Bundle' }
];

rootDirs.forEach(({ dir, type }) => {
  const target = join(root, dir);
  if (existsSync(target)) {
    rmSync(target, RMRF_OPTIONS);
    printItem('success', `./${dir}`, type);
  }
});

// --- STEP 6: Main Dependencies ---
printHeader(stepCount++, totalSteps, 'Cleaning main dependencies');
const rootNodeModules = join(root, 'node_modules');
if (existsSync(rootNodeModules)) {
  rmSync(rootNodeModules, RMRF_OPTIONS);
  printItem('success', './node_modules', 'Root Dependencies');
}

// --- FINAL SUMMARY ---
const duration = ((Date.now() - startTime) / 1000).toFixed(2);
console.log(`\n${COLORS.green}${COLORS.bright}Cleanup process completed successfully.${COLORS.reset}`);
console.log(`${COLORS.yellow}${COLORS.bright}Hint: Run 'npm install' to reinstall dependencies and start fresh.${COLORS.reset}`);
console.log(`${COLORS.dim}Total time: ${duration}s${COLORS.reset}\n`);