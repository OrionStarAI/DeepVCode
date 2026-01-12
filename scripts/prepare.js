#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publishFlagFile = join(root, '.npm-publish-in-progress');

const buildEnv = process.env.BUILD_ENV;

// Skip build during npm publish (prepublishOnly will handle it)
if (process.env.SKIP_PREPARE === '1' || existsSync(publishFlagFile)) {
  console.log('⏭️  Skipping prepare build (handled by prepublishOnly or explicitly disabled)');

  // Clean up the flag file if it exists (prepare is the last hook in publish flow)
  if (existsSync(publishFlagFile)) {
    try {
      unlinkSync(publishFlagFile);
    } catch (err) {
      // Ignore errors in cleanup
    }
  }

  process.exit(0);
}

// 默认使用production模式，除非明确指定development
if (buildEnv === 'development') {
  console.log('Running development bundle...');
  execSync('npm run bundle', { stdio: 'inherit' });
} else {
  console.log('Running production bundle...');
  execSync('npm run bundle:prod', { stdio: 'inherit' });
}