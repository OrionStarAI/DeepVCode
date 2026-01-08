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
// Unless required by applicable law_or_agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { spawn, execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));

// Check for silent mode early (-p flag without -i flag)
const args = process.argv.slice(2);
const isPromptMode = args.includes('-p') || args.includes('--prompt');
const isInteractiveMode = args.includes('-i') || args.includes('--prompt-interactive');
const isHelpMode = args.includes('-h') || args.includes('--help');
const isVersionMode = args.includes('-v') || args.includes('--version');
const isListMode = args.includes('--list-extensions') || args.includes('--list-sessions');
// Only enable silent mode for actual -p usage, not help/version/list commands
const isSilentMode = isPromptMode && !isInteractiveMode && !isHelpMode && !isVersionMode && !isListMode;

// Load environment variables from .env files
const envFiles = [
  'packages/cli/.env.development',
  'packages/cli/.env.test', 
  'packages/cli/.env'
];

for (const envFile of envFiles) {
  const envPath = join(root, envFile);
  if (existsSync(envPath)) {
    // Suppress dotenv output in silent mode by temporarily redirecting console
    if (isSilentMode) {
      const originalLog = console.log;
      console.log = () => {};
      dotenv.config({ path: envPath });
      console.log = originalLog;
    } else {
      dotenv.config({ path: envPath });
    }
    break;
  }
}

// check build status, write warnings to file for app to display if needed
execSync('node ./scripts/check-build-status.js', {
  stdio: 'inherit',
  cwd: root,
});

const nodeArgs = [];
let sandboxCommand = undefined;
try {
  sandboxCommand = execSync('node scripts/sandbox_command.js', {
    cwd: root,
  })
    .toString()
    .trim();
} catch {
  // ignore
}
// if debugging is enabled and sandboxing is disabled, use --inspect-brk flag
// note with sandboxing this flag is passed to the binary inside the sandbox
// inside sandbox SANDBOX should be set and sandbox_command.js should fail
if (process.env.DEBUG && !sandboxCommand) {
  if (process.env.SANDBOX) {
    const port = process.env.DEBUG_PORT || '9229';
    nodeArgs.push(`--inspect-brk=0.0.0.0:${port}`);
  } else {
    nodeArgs.push('--inspect-brk');
  }
}

nodeArgs.push('./packages/cli');
nodeArgs.push(...process.argv.slice(2));

const env = {
  ...process.env,
  CLI_VERSION: pkg.version,
  DEV: 'true',
  // Set silent mode flag for CLI to detect
  DEEPV_SILENT_MODE: isSilentMode ? 'true' : 'false',
};

// Debug: log silent mode detection
// if (isSilentMode) {
//   console.log('DEBUG: Silent mode detected in start.js');
// }

if (process.env.DEBUG) {
  // If this is not set, the debugger will pause on the outer process rather
  // than the relaunched process making it harder to debug.
  env.GEMINI_CLI_NO_RELAUNCH = 'true';
}
const child = spawn('node', nodeArgs, { stdio: 'inherit', env });

child.on('close', (code) => {
  process.exit(code);
});
