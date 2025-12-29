#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Checking for build artifacts in src directory...');

try {
  // Run src clean check
  execSync('node scripts/check-src-clean.js', {
    stdio: 'inherit',
    cwd: __dirname + '/..'
  });

  console.log('✅ Pre-commit check passed!');
  process.exit(0);
} catch (error) {
  console.error('❌ Pre-commit check failed!');
  console.error('Build artifacts detected in src directory.');
  console.error('Please run "npm run clean:src" before committing.');
  process.exit(1);
}