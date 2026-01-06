/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';

/**
 * Global signal manager for background mode requests
 * When user presses Ctrl+B during shell execution, this signal is set
 */
class BackgroundModeSignalManager extends EventEmitter {
  private _backgroundModeRequested = false;
  private _currentCallId: string | null = null;

  /**
   * Request background mode for the current shell execution
   */
  requestBackgroundMode(callId?: string): void {
    console.log('[BackgroundModeSignal] 🎯 Background mode requested for callId:', callId);
    this._backgroundModeRequested = true;
    this._currentCallId = callId || null;
    this.emit('background-requested', { callId });
  }

  /**
   * Check if background mode has been requested
   */
  isBackgroundModeRequested(): boolean {
    return this._backgroundModeRequested;
  }

  /**
   * Get the current call ID (if any)
   */
  getCurrentCallId(): string | null {
    return this._currentCallId;
  }

  /**
   * Clear the background mode request (after handling)
   */
  clearBackgroundMode(): void {
    console.log('[BackgroundModeSignal] Clearing background mode');
    this._backgroundModeRequested = false;
    this._currentCallId = null;
  }

  /**
   * Wait for background mode to be requested
   * Returns a promise that resolves when Ctrl+B is pressed
   */
  waitForBackgroundRequest(signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this._backgroundModeRequested) {
        resolve();
        return;
      }

      const handler = () => {
        cleanup();
        resolve();
      };

      const abortHandler = () => {
        cleanup();
        reject(new Error('Aborted'));
      };

      const cleanup = () => {
        this.removeListener('background-requested', handler);
        signal.removeEventListener('abort', abortHandler);
      };

      this.once('background-requested', handler);
      signal.addEventListener('abort', abortHandler);
    });
  }
}

// Global singleton instance
let _instance: BackgroundModeSignalManager | null = null;

export function getBackgroundModeSignal(): BackgroundModeSignalManager {
  if (!_instance) {
    _instance = new BackgroundModeSignalManager();
  }
  return _instance;
}

export { BackgroundModeSignalManager };
