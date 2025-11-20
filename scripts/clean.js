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

import { rmSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { globSync } from 'glob';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Clean compiled .js files first (before we clean node_modules)
console.log('🧹 Cleaning compiled .js and .js.map files from source directories...');
try {
  execSync('node scripts/clean-compiled-js.js', { cwd: root, stdio: 'inherit' });
} catch (error) {
  console.error('⚠️  Warning: Failed to clean compiled JS files');
  console.error(error.message);
}

// Clean non-node_modules directories first (before we lose access to dependencies)
console.log('\n🧹 Cleaning project directories...');

rmSync(join(root, 'bundle'), { recursive: true, force: true });
console.log('✅ Cleaned bundle directory');

rmSync(join(root, 'packages/cli/src/generated/'), {
  recursive: true,
  force: true,
});
console.log('✅ Cleaned generated files');

const RMRF_OPTIONS = { recursive: true, force: true };
// Dynamically clean dist directories in all workspaces
console.log('🧹 Cleaning workspace dist directories...');
const rootPackageJson = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf-8'),
);
for (const workspace of rootPackageJson.workspaces) {
  const packages = globSync(join(workspace, 'package.json'), { cwd: root });
  for (const pkgPath of packages) {
    const pkgDir = dirname(join(root, pkgPath));
    rmSync(join(pkgDir, 'dist'), RMRF_OPTIONS);
    console.log(`✅ Cleaned ${pkgPath.replace('/package.json', '')}/dist`);
  }
}

// Clean all .tsbuildinfo files to force TypeScript recompilation
console.log('🧹 Cleaning TypeScript build info files...');
const tsbuildinfoFiles = globSync('**/tsconfig.tsbuildinfo', { cwd: root, ignore: ['node_modules/**'] });
for (const tsbuildinfoFile of tsbuildinfoFiles) {
  try {
    rmSync(join(root, tsbuildinfoFile), RMRF_OPTIONS);
    console.log(`✅ Cleaned ${tsbuildinfoFile}`);
  } catch (error) {
    // Silently skip if file doesn't exist (it might have already been deleted with dist)
  }
}
if (tsbuildinfoFiles.length === 0) {
  console.log('ℹ️  No .tsbuildinfo files to clean');
}

// Clean up vsix files in vscode-ide-companion
console.log('🧹 Cleaning vsix files...');
const vsixFiles = globSync('packages/vscode-ide-companion/*.vsix', {
  cwd: root,
});
for (const vsixFile of vsixFiles) {
  rmSync(join(root, vsixFile), RMRF_OPTIONS);
  console.log(`✅ Cleaned ${vsixFile}`);
}
if (vsixFiles.length === 0) {
  console.log('ℹ️  No vsix files to clean');
}



// Clean node_modules last (after we're done using dependencies)
console.log('🧹 Cleaning node_modules...');
rmSync(join(root, 'node_modules'), { recursive: true, force: true });
console.log('✅ Cleaned node_modules');

console.log('🎉 Clean completed successfully!');
