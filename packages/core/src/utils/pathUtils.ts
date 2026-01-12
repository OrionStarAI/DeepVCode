/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import * as path from 'path';

/**
 * The clipboard directory name
 */
export const CLIPBOARD_DIR = 'clipboard';

/**
 * Checks if a given path is within the clipboard directory
 * @param pathName The path to check (can be relative or absolute)
 * @param targetDir The target directory (workspace root)
 * @param configDirName The configuration directory name (default: '.deepvcode')
 * @returns true if the path is within the clipboard directory
 */
export function isClipboardPath(pathName: string, targetDir: string, configDirName: string): boolean {
  const fullClipboardPath = `${configDirName}/${CLIPBOARD_DIR}`;
  
  // Convert relative path to absolute path for comparison
  const absolutePath = path.resolve(targetDir, pathName);
  const expectedClipboardAbsolute = path.resolve(targetDir, fullClipboardPath);
  
  // Check if the absolute path starts with clipboard directory path
  if (absolutePath.startsWith(expectedClipboardAbsolute) || 
      absolutePath === expectedClipboardAbsolute ) {
    return true;
  }
  
  // Also check the original path patterns for direct matches
  return false;
}
