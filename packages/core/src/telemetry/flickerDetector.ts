/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Config } from '../config/config.js';

interface FlickerFrameRecord {
  timestamp: number;
  count: number;
}

const flickerFrames: FlickerFrameRecord[] = [];
const MAX_FLICKER_RECORDS = 100;

/**
 * Records a flicker frame event.
 * This helps us track when the UI renders taller than the terminal,
 * which indicates a rendering issue that should be fixed.
 *
 * @param config The config object used to access debug mode and other settings.
 */
export function recordFlickerFrame(config: Config): void {
  const now = Date.now();
  const lastRecord = flickerFrames[flickerFrames.length - 1];

  if (lastRecord && now - lastRecord.timestamp < 100) {
    lastRecord.count++;
  } else {
    flickerFrames.push({ timestamp: now, count: 1 });
    if (flickerFrames.length > MAX_FLICKER_RECORDS) {
      flickerFrames.shift();
    }
  }

  if (config.getDebugMode()) {
    console.debug('[DEBUG] Flicker detected:', {
      timestamp: now,
      totalRecords: flickerFrames.length,
    });
  }
}

/**
 * Gets the flicker frame records.
 * Useful for diagnostics and telemetry.
 */
export function getFlickerFrameRecords(): FlickerFrameRecord[] {
  return [...flickerFrames];
}

/**
 * Clears the flicker frame records.
 */
export function clearFlickerFrameRecords(): void {
  flickerFrames.length = 0;
}
