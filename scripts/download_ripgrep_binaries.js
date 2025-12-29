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
      return;
    }

    try {
      console.log(`⬇️  Downloading ${platformKey} (${target})...`);
      await downloadFile(url, archivePath);
      await extractBinary(archivePath, target, binaryPath);
      console.log(`✅ Downloaded ${platformKey}`);
    } catch (error) {
      console.error(`❌ Failed to download ${platformKey}:`, error.message);
      // Don't throw, continue with other platforms
    }
  });

  await Promise.allSettled(downloadPromises);
  console.log('🎉 Ripgrep binary download completed!');
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputDir = path.join(__dirname, '..', 'temp', 'ripgrep-binaries');
  downloadRipgrepBinaries(outputDir).catch(console.error);
}

export { downloadRipgrepBinaries };
