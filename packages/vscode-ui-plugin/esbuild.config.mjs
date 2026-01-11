/**
 * esbuild configuration for VSCode Extension
 *
 * This replaces webpack for building the extension, providing:
 * - Much faster build times (10-100x)
 * - Simpler configuration
 * - Proper handling of import.meta.url (computed at runtime, not build-time)
 * - Cross-platform compatibility for CI/CD builds
 *
 * Note: Webview is still built separately using its own webpack config,
 * as it targets the browser and needs different handling (CSS, React, etc.)
 */

import esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const isWatch = args.includes('--watch');
const isProduction = args.includes('--production') || process.env.NODE_ENV === 'production';
const shouldMinify = args.includes('--minify') || process.env.MINIMIZE === 'true';

console.log(`\n🚀 DeepV Code VSCode Extension - esbuild`);
console.log(`   Mode: ${isProduction ? 'production' : 'development'}`);
console.log(`   Minify: ${shouldMinify}`);
console.log(`   Watch: ${isWatch}\n`);

// Common esbuild options
const commonOptions = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs', // VSCode extensions need CommonJS
  sourcemap: true,
  // Handle import.meta.url at runtime, not build-time
  // This is the key fix for cross-platform builds
  banner: {
    js: `
// Runtime polyfills for ESM compatibility in CommonJS bundle
const { createRequire } = require('module');
const { fileURLToPath } = require('url');
const { dirname } = require('path');

// Make import.meta.url work - computed at RUNTIME, not build-time
// This fixes cross-platform build issues (built on Linux, run on Windows)
if (typeof globalThis.__filename === 'undefined') {
  globalThis.__filename = __filename;
}
if (typeof globalThis.__dirname === 'undefined') {
  globalThis.__dirname = __dirname;
}
`.trim(),
  },
  external: [
    // VSCode API - provided at runtime
    'vscode',
    // Native Node.js modules - no need to bundle
    'fs',
    'path',
    'crypto',
    'http',
    'https',
    'url',
    'util',
    'stream',
    'events',
    'buffer',
    'child_process',
    'os',
    'net',
    'tls',
    'zlib',
    'assert',
    'constants',
    'module',
    'worker_threads',
    'perf_hooks',
    'async_hooks',
    'v8',
    'vm',
    'cluster',
    // Optional native modules that may not be present
    'fsevents',
    'utf-8-validate',
    'bufferutil',
  ],
  // Alias 'open' package to our stub (it uses import.meta.url internally)
  alias: {
    'open': path.resolve(__dirname, 'src/stubs/open-stub.ts'),
  },
  loader: {
    '.ts': 'ts',
    '.tsx': 'tsx',
  },
  logLevel: 'info',
};

// Extension bundle configuration
const extensionConfig = {
  ...commonOptions,
  entryPoints: [path.resolve(__dirname, 'src/extension.ts')],
  outfile: path.resolve(__dirname, 'dist/extension.bundle.js'),
  minify: shouldMinify,
  // Define constants
  define: {
    'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
  },
};

// Core bundle configuration (bundles deepv-code-core)
const coreConfig = {
  ...commonOptions,
  entryPoints: [path.resolve(__dirname, '../core/dist/index.js')],
  outfile: path.resolve(__dirname, 'dist/bundled/deepv-code-core.js'),
  minify: shouldMinify,
  // Core might have additional external modules
  external: [
    ...commonOptions.external,
    // sharp is optional and platform-specific
    'sharp',
    '@vscode/ripgrep',
  ],
};

/**
 * Copy template files (HTML, icons, etc.) to dist
 */
function copyTemplateFiles() {
  const srcDir = path.resolve(__dirname, '../core/dist/src/auth/login/templates');
  const destDir = path.resolve(__dirname, 'dist/bundled/auth/login/templates');

  if (!fs.existsSync(srcDir)) {
    console.log('⚠️  Template source directory not found, skipping copy');
    return;
  }

  // Create destination directory
  fs.mkdirSync(destDir, { recursive: true });

  // Copy only specific file types (no JS files)
  const allowedExtensions = ['.html', '.ico', '.png', '.svg', '.md'];

  const files = fs.readdirSync(srcDir);
  let copied = 0;

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      const srcPath = path.join(srcDir, file);
      const destPath = path.join(destDir, file);
      fs.copyFileSync(srcPath, destPath);
      copied++;
    }
  }

  console.log(`📁 Copied ${copied} template files to dist/bundled/auth/login/templates`);
}

/**
 * Build webview using its webpack config
 */
async function buildWebview() {
  console.log('\n📦 Building webview...');
  try {
    execSync('npm run build', {
      cwd: path.resolve(__dirname, 'webview'),
      stdio: 'inherit',
    });
    console.log('✅ Webview build completed\n');
  } catch (error) {
    console.error('❌ Webview build failed');
    throw error;
  }
}

/**
 * Clean dist directory
 */
function cleanDist() {
  const distDir = path.resolve(__dirname, 'dist');
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
    console.log('🧹 Cleaned dist directory');
  }
}

/**
 * Main build function
 */
async function build() {
  const startTime = Date.now();

  try {
    // Clean dist
    cleanDist();

    // Build webview first (uses webpack)
    await buildWebview();

    // Build extension bundle
    console.log('📦 Building extension bundle...');
    await esbuild.build(extensionConfig);
    console.log('✅ Extension bundle completed');

    // Build core bundle
    console.log('📦 Building core bundle...');
    await esbuild.build(coreConfig);
    console.log('✅ Core bundle completed');

    // Copy template files
    copyTemplateFiles();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n🎉 Build completed in ${elapsed}s\n`);

  } catch (error) {
    console.error('\n❌ Build failed:', error.message);
    process.exit(1);
  }
}

/**
 * Watch mode
 */
async function watch() {
  console.log('👀 Starting watch mode...\n');

  // Build webview once (it has its own watch mode if needed)
  await buildWebview();

  // Copy template files
  copyTemplateFiles();

  // Create esbuild contexts for watching
  const extensionCtx = await esbuild.context(extensionConfig);
  const coreCtx = await esbuild.context(coreConfig);

  // Start watching
  await extensionCtx.watch();
  await coreCtx.watch();

  console.log('\n👀 Watching for changes... Press Ctrl+C to stop.\n');
}

// Run
if (isWatch) {
  watch();
} else {
  build();
}
