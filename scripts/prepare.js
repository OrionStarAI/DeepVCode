#!/usr/bin/env node

import { execSync } from 'child_process';

const buildEnv = process.env.BUILD_ENV;

// 默认使用production模式，除非明确指定development
if (buildEnv === 'development') {
  console.log('Running development bundle...');
  execSync('npm run bundle', { stdio: 'inherit' });
} else {
  console.log('Running production bundle...');
  execSync('npm run bundle:prod', { stdio: 'inherit' });
}