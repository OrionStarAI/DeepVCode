/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Silent mode utilities for non-interactive CLI usage.
 * When enabled, suppresses all debug and informational output except errors.
 */

let isSilentMode = false;

// Store original console methods
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  debug: console.debug,
};

/**
 * Enables silent mode - suppresses all console output except errors
 */
export function enableSilentMode(): void {
  isSilentMode = true;
  
  // Override console methods to suppress output
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  console.debug = () => {};
}

/**
 * Disables silent mode - restores normal console output
 */
export function disableSilentMode(): void {
  isSilentMode = false;
  
  // Restore original console methods
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.debug = originalConsole.debug;
}

/**
 * Returns whether silent mode is currently enabled
 */
export function isSilentModeEnabled(): boolean {
  return isSilentMode;
}

/**
 * Logs a message only if silent mode is disabled
 * Use this for optional informational messages
 */
export function logIfNotSilent(level: 'log' | 'info' | 'warn' | 'debug', ...args: any[]): void {
  if (!isSilentMode) {
    originalConsole[level](...args);
  }
}

/**
 * Always logs an error message regardless of silent mode
 * Errors are always shown as they indicate problems
 */
export function logError(...args: any[]): void {
  console.error(...args);
}