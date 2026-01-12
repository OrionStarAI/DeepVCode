#!/usr/bin/env node

import { execSync } from 'child_process';

const buildEnv = process.env.BUILD_ENV;

// Skip build during npm publish (prepublishOnly will handle it)
if (process.env.npm_lifecycle_event === 'publish' || process.env.SKIP_PREPARE === '1') {
  console.log('⏭️  Skipping prepare build (handled by prepublishOnly or explicitly disabled)');
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