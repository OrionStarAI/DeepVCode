/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * Global modal state to prevent ESC key conflicts
 * When a modal is open, other components should not process ESC
 */
let _backgroundTaskPanelOpen = false;

export function setBackgroundTaskPanelOpen(open: boolean): void {
  _backgroundTaskPanelOpen = open;
}

export function isBackgroundTaskPanelOpen(): boolean {
  return _backgroundTaskPanelOpen;
}
