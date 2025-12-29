#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 🔧 Cross-platform Binary Permissions Fix Script
 * 
 * Problem:
 * - When packaging on Windows, Unix binary files in zip archives lose execute permissions
 * - This prevents ripgrep binaries and Sharp native modules from executing on macOS/Linux after extraction
 * 
 * Solution:
 * - Automatically detect and fix execute permissions for all binary files after installation
 * - Supports ripgrep binary files
 * - Can run as npm postinstall hook or manually
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fixBinaryPermissions() {
  // Only execute on Unix-like systems
  if (process.platform === 'win32') {
    console.log('🔧 Windows system - binary permissions fix not needed');
    return;
  }

  console.log('🔧 Detecting and fixing binary file execute permissions...');

  const fixes = [];
  const bundleDir = path.resolve(__dirname, '..', 'bundle');
  
  // Binary file path patterns that need permission fixes
  const binaryPaths = [
    // Ripgrep binary files
    'node_modules/@vscode/ripgrep/bin/rg',
    'node_modules/@vscode/ripgrep/bin/darwin-x64-rg',
    'node_modules/@vscode/ripgrep/bin/darwin-arm64-rg',
    'node_modules/@vscode/ripgrep/bin/linux-x64-rg',
    'node_modules/@vscode/ripgrep/bin/linux-arm64-rg',
    'node_modules/@vscode/ripgrep/bin/linux-arm-rg',
    
    
  ];

  for (const relativePath of binaryPaths) {
    const fullPath = path.join(bundleDir, relativePath);
    
    if (fs.existsSync(fullPath)) {
      try {
        const stats = fs.statSync(fullPath);
        const currentMode = stats.mode;
        const expectedMode = 0o755; // rwxr-xr-x
        
        // Check if execute permissions already exist
        if ((currentMode & 0o111) === 0) {
          // No execute permissions, needs fix
          fs.chmodSync(fullPath, expectedMode);
          fixes.push(relativePath);
          console.log(`  ✅ Fixed: ${relativePath}`);
        } else {
          console.log(`  ✓ Permissions correct: ${relativePath}`);
        }
      } catch (error) {
        console.warn(`  ⚠️  Unable to fix ${relativePath}: ${error.message}`);
      }
    }
  }

  if (fixes.length > 0) {
    console.log(`🎉 Successfully fixed execute permissions for ${fixes.length} binary files`);
  } else {
    console.log('✅ All binary file permissions are correct');
  }
}

// Recursively search and fix all binary file permissions
function fixAllBinaryPermissions(dir = null) {
  if (process.platform === 'win32') {
    console.log('🔧 Windows system - binary permissions fix not needed');
    return;
  }

  const searchDir = dir || path.resolve(__dirname, '..', 'bundle');
  
  if (!fs.existsSync(searchDir)) {
    console.log(`⚠️  Directory does not exist: ${searchDir}`);
    return;
  }

  console.log(`🔧 Recursively searching and fixing binary file permissions in ${searchDir}...`);

  const fixes = [];

  function walkDir(currentDir) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively process subdirectories
          walkDir(fullPath);
        } else if (entry.isFile()) {
          // Check if it's a binary file (no extension or excluding .exe)
          const ext = path.extname(entry.name);
          const basename = path.basename(entry.name);
          
          // Conditions for identifying binary files:
          // 1. No extension and not common text files
          // 2. Filename contains 'rg' and not .exe
          // 3. Executable files in bin/ directory
          const isBinary = (
            (ext === '' && !['README', 'LICENSE', 'CHANGELOG'].includes(basename.toUpperCase())) ||
            (basename.includes('rg') && ext !== '.exe') ||
            (currentDir.includes('/bin') && ext === '')
          );
          
          if (isBinary) {
            try {
              const stats = fs.statSync(fullPath);
              const currentMode = stats.mode;
              
              // Check if execute permissions already exist
              if ((currentMode & 0o111) === 0) {
                // No execute permissions, needs fix
                const expectedMode = 0o755; // rwxr-xr-x
                fs.chmodSync(fullPath, expectedMode);
                
                const relativePath = path.relative(searchDir, fullPath);
                fixes.push(relativePath);
                console.log(`  ✅ Fixed: ${relativePath}`);
              }
            } catch (error) {
              console.warn(`  ⚠️  Unable to process ${fullPath}: ${error.message}`);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`  ⚠️  Unable to read directory ${currentDir}: ${error.message}`);
    }
  }

  walkDir(searchDir);

  if (fixes.length > 0) {
    console.log(`🎉 Successfully fixed execute permissions for ${fixes.length} binary files`);
    fixes.forEach(file => console.log(`    - ${file}`));
  } else {
    console.log('✅ All binary file permissions are correct or no fixes needed');
  }
}

// Main function
function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🔧 Binary File Permissions Fix Tool

Usage:
  node fix-binary-permissions.js [options]

Options:
  --all, -a     Recursively search and fix all binary file permissions
  --dir <path>  Specify directory to search (use with --all)
  --help, -h    Show help information

Default behavior:
  Fix permissions for known ripgrep binary files

Description:
  This script solves the issue of lost Unix execute permissions when packaging on Windows.
  Automatically restores binary file execute permissions after installation on Unix systems.
  Supports ripgrep search tools.
  No operations performed on Windows systems.

Examples:
  node fix-binary-permissions.js          # Fix known binary files (ripgrep)
  node fix-binary-permissions.js --all    # Recursively fix all binary files
  node fix-binary-permissions.js --all --dir /path/to/bundle
`);
    return;
  }

  try {
    if (args.includes('--all') || args.includes('-a')) {
      const dirIndex = args.indexOf('--dir');
      const customDir = dirIndex !== -1 && args[dirIndex + 1] ? args[dirIndex + 1] : null;
      fixAllBinaryPermissions(customDir);
    } else {
      fixBinaryPermissions();
    }
  } catch (error) {
    console.error('❌ Error occurred while fixing permissions:', error.message);
    process.exit(1);
  }
}

// If this script is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { fixBinaryPermissions, fixAllBinaryPermissions };