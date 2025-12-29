/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { t, tp } from '../ui/utils/i18n.js';

/**
 * Git error types that can be gracefully handled
 */
export type GitErrorType = 'old-version' | 'not-available' | 'init-failed';

/**
 * Git error information structure
 */
export interface GitErrorInfo {
  type: GitErrorType;
  error?: string;
  timestamp: string;
}

/**
 * Display a localized Git error message to the user
 */
export function displayGitErrorMessage(errorInfo: GitErrorInfo): void {
  console.log('\n' + '⚠️ '.repeat(20));
  
  switch (errorInfo.type) {
    case 'old-version':
      console.log(`🔴 ${t('git.error.old.version.title')}`);
      console.log(`📋 ${t('git.error.old.version.message')}`);
      console.log(`💥 ${t('git.error.old.version.impact')}`);
      console.log(`💡 ${t('git.error.old.version.solution')}`);
      console.log(`✅ ${t('git.error.old.version.continuing')}`);
      break;
      
    case 'not-available':
      console.log(`🔴 ${t('git.error.not.available.title')}`);
      console.log(`📋 ${t('git.error.not.available.message')}`);
      console.log(`💥 ${t('git.error.not.available.impact')}`);
      console.log(`💡 ${t('git.error.not.available.solution')}`);
      console.log(`✅ ${t('git.error.not.available.continuing')}`);
      break;
      
    case 'init-failed':
      console.log(`🔴 ${t('git.error.init.failed.title')}`);
      console.log(`📋 ${tp('git.error.init.failed.message', { error: errorInfo.error || 'Unknown error' })}`);
      console.log(`💥 ${t('git.error.init.failed.impact')}`);
      console.log(`💡 ${t('git.error.init.failed.solution')}`);
      console.log(`✅ ${t('git.error.init.failed.continuing')}`);
      break;
  }
  
  console.log('⚠️ '.repeat(20) + '\n');
}

/**
 * Monitor console output for Git service error messages and display user-friendly messages
 */
export function setupGitErrorMonitoring(): void {
  const originalConsoleError = console.error;
  
  console.error = (...args: any[]) => {
    // Check for Git service error messages
    const message = args.join(' ');
    const gitErrorMatch = message.match(/\[GIT_SERVICE_ERROR\]\s*({.*})/);
    
    if (gitErrorMatch) {
      try {
        const errorInfo: GitErrorInfo = JSON.parse(gitErrorMatch[1]);
        displayGitErrorMessage(errorInfo);
        return; // Don't show the original debug message to users
      } catch (parseError) {
        // If parsing fails, fall through to original console.error
      }
    }
    
    // For all other messages, use the original console.error
    originalConsoleError.apply(console, args);
  };
}

/**
 * Check if checkpointing can be safely disabled
 */
export function canDisableCheckpointing(): boolean {
  // For now, we always allow disabling checkpointing as it's not critical for basic CLI operation
  return true;
}

/**
 * Get advice for resolving Git version issues
 */
export function getGitVersionAdvice(): string {
  const platform = process.platform;
  
  switch (platform) {
    case 'win32':
      return 'Windows用户：访问 https://git-scm.com/download/win 下载最新版本';
    case 'darwin':
      return 'macOS用户：使用 "brew install git" 或访问 https://git-scm.com/download/mac';
    case 'linux':
      return 'Linux用户：使用包管理器更新Git，如 "sudo apt update && sudo apt install git"';
    default:
      return '请访问 https://git-scm.com/downloads 获取适合您系统的Git安装包';
  }
}