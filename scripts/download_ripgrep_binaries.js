/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import { createWriteStream, existsSync, mkdirSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Define platform targets based on @vscode/ripgrep postinstall.js
const platforms = {
  'darwin-x64': { target: 'x86_64-apple-darwin', binary: 'rg' },
  'darwin-arm64': { target: 'aarch64-apple-darwin', binary: 'rg' },
  'win32-x64': { target: 'x86_64-pc-windows-msvc', binary: 'rg.exe' },
  'win32-ia32': { target: 'i686-pc-windows-msvc', binary: 'rg.exe' },
  'win32-arm64': { target: 'aarch64-pc-windows-msvc', binary: 'rg.exe' },
  'linux-x64': { target: 'x86_64-unknown-linux-musl', binary: 'rg' },
  'linux-arm64': { target: 'aarch64-unknown-linux-musl', binary: 'rg' },
  'linux-arm': { target: 'arm-unknown-linux-gnueabihf', binary: 'rg' },
};

const VERSION = 'v13.0.0-13';
const MULTI_ARCH_LINUX_VERSION = 'v13.0.0-4';
const BASE_URL = 'https://github.com/microsoft/ripgrep-prebuilt/releases/download';

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 5000, // 5 seconds base delay
  maxDelayMs: 60000, // 1 minute max delay
};

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Download with exponential backoff retry
 * @param {string} url - URL to download
 * @param {string} filePath - Path to save the file
 * @param {string} platformKey - Platform identifier for logging
 */
async function downloadWithRetry(url, filePath, platformKey) {
  let lastError;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      await downloadFile(url, filePath);
      return; // Success
    } catch (error) {
      lastError = error;

      if (attempt < RETRY_CONFIG.maxRetries) {
        // Exponential backoff: 5s, 10s, 20s, ...
        const delayMs = Math.min(
          RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1),
          RETRY_CONFIG.maxDelayMs
        );
        console.warn(`⚠️  [${platformKey}] Attempt ${attempt}/${RETRY_CONFIG.maxRetries} failed: ${error.message}`);
        console.warn(`   Retrying in ${delayMs / 1000}s...`);
        await sleep(delayMs);
      }
    }
  }

  // All retries exhausted
  throw new Error(`Failed after ${RETRY_CONFIG.maxRetries} attempts: ${lastError.message}`);
}

async function downloadFile(url, filePath) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        return downloadFile(response.headers.location, filePath).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode} ${response.statusMessage}`));
        return;
      }

      const fileStream = createWriteStream(filePath);

      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        // Make binary executable on Unix-like systems
        if (path.extname(filePath) !== '.exe') {
          try {
            fs.chmodSync(filePath, 0o755);
          } catch (e) {
            console.warn(`Warning: Could not make ${filePath} executable:`, e.message);
          }
        }
        resolve();
      });

      fileStream.on('error', reject);
    });

    request.on('error', reject);
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error(`Download timeout for ${url}`));
    });
  });
}

function getDownloadUrl(target, version = VERSION) {
  const filename = `ripgrep-${version}-${target}${target.includes('windows') ? '.zip' : '.tar.gz'}`;
  return `${BASE_URL}/${version}/${filename}`;
}

function getBinaryPath(target, tempDir) {
  if (target.includes('windows')) {
    return path.join(tempDir, 'rg.exe');
  }
  return path.join(tempDir, 'rg');
}

async function extractBinary(archivePath, target, outputPath) {
  const { execSync } = await import('child_process');
  const tempDir = path.join(path.dirname(archivePath), 'temp_' + target.replace(/[^\w]/g, '_'));

  try {
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }

    if (target.includes('windows')) {
      // Extract zip file (requires unzip or equivalent)
      try {
        execSync(`unzip -q "${archivePath}" -d "${tempDir}"`, { stdio: 'pipe' });
      } catch (e) {
        // Try with Python if unzip is not available
        execSync(`python -m zipfile -e "${archivePath}" "${tempDir}"`, { stdio: 'pipe' });
      }
    } else {
      // Extract tar.gz file
      execSync(`tar -xzf "${archivePath}" -C "${tempDir}"`, { stdio: 'pipe' });
    }

    // Find the rg binary in the extracted content
    const files = fs.readdirSync(tempDir, { recursive: true });
    const binaryFile = files.find(file => {
      const basename = path.basename(file);
      return basename === 'rg' || basename === 'rg.exe';
    });

    if (!binaryFile) {
      throw new Error(`Could not find ripgrep binary in extracted archive for ${target}`);
    }

    const binaryPath = path.join(tempDir, binaryFile);
    fs.copyFileSync(binaryPath, outputPath);

    // Make executable on Unix-like systems
    if (!target.includes('windows')) {
      fs.chmodSync(outputPath, 0o755);
    }

    console.log(`✅ Extracted ${target} binary to ${outputPath}`);
  } finally {
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.unlinkSync(archivePath);
    } catch (e) {
      console.warn(`Warning: Could not clean up temp files:`, e.message);
    }
  }
}

async function downloadRipgrepBinaries(outputDir) {
  console.log('🚀 Downloading ripgrep binaries for all platforms...');

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const failedPlatforms = [];
  const successPlatforms = [];

  const downloadPromises = Object.entries(platforms).map(async ([platformKey, { target, binary }]) => {
    const version = target.includes('arm-unknown-linux') || target.includes('powerpc64le') ?
                   MULTI_ARCH_LINUX_VERSION : VERSION;

    const url = getDownloadUrl(target, version);
    const archiveExt = target.includes('windows') ? '.zip' : '.tar.gz';
    const archivePath = path.join(outputDir, `ripgrep-${version}-${target}${archiveExt}`);
    const binaryPath = path.join(outputDir, `${platformKey}-${binary}`);

    // Skip if binary already exists
    if (existsSync(binaryPath)) {
      console.log(`⏭️  Skipping ${platformKey} (already exists)`);
      successPlatforms.push(platformKey);
      return { platformKey, success: true, skipped: true };
    }

    try {
      console.log(`⬇️  Downloading ${platformKey} (${target})...`);
      await downloadWithRetry(url, archivePath, platformKey);
      await extractBinary(archivePath, target, binaryPath);
      console.log(`✅ Downloaded ${platformKey}`);
      successPlatforms.push(platformKey);
      return { platformKey, success: true, skipped: false };
    } catch (error) {
      console.error(`❌ Failed to download ${platformKey}:`, error.message);
      failedPlatforms.push({ platformKey, error: error.message });
      return { platformKey, success: false, error: error.message };
    }
  });

  await Promise.all(downloadPromises);

  // Check if any platform failed
  if (failedPlatforms.length > 0) {
    const failedList = failedPlatforms.map(p => `  - ${p.platformKey}: ${p.error}`).join('\n');
    const errorMessage = `❌ Ripgrep binary download failed for ${failedPlatforms.length} platform(s):\n${failedList}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  // Verify all platforms were downloaded
  const expectedPlatformCount = Object.keys(platforms).length;
  if (successPlatforms.length !== expectedPlatformCount) {
    const missingPlatforms = Object.keys(platforms).filter(p => !successPlatforms.includes(p));
    const errorMessage = `❌ Missing ripgrep binaries for platforms: ${missingPlatforms.join(', ')}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  console.log(`🎉 Ripgrep binary download completed! (${successPlatforms.length}/${expectedPlatformCount} platforms)`);
  return { success: true, platforms: successPlatforms };
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputDir = path.join(__dirname, '..', 'temp', 'ripgrep-binaries');
  downloadRipgrepBinaries(outputDir).catch(console.error);
}

export { downloadRipgrepBinaries };
