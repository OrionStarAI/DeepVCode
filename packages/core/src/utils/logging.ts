/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Centralized logging utilities for the core package.
 * Provides conditional logging based on silent mode configuration.
 */

let silentMode = false;

// Store original console methods
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  debug: console.debug,
};

/**
 * Sets the silent mode state for core logging
 */
export function setSilentMode(enabled: boolean): void {
  silentMode = enabled;
}

/**
 * Gets the current silent mode state
 */
export function isSilentMode(): boolean {
  return silentMode;
}

/**
 * Logs a message only if silent mode is disabled
 */
export function logIfNotSilent(level: 'log' | 'info' | 'warn' | 'debug', ...args: any[]): void {
  if (!silentMode) {
    originalConsole[level](...args);
  }
}

/**
 * Always logs an error message regardless of silent mode
 */
export function logError(...args: any[]): void {
  console.error(...args);
}