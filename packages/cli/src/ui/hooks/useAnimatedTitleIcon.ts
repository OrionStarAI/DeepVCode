/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { StreamingState } from '../types.js';

const BUSY_ICONS = ['✦', '𝑉', '𝐕', '𝗩'];
const IDLE_ICON = '🚀';
const ANIMATION_INTERVAL_MS = 1000;

/**
 * Hook that provides animated title icon based on AI streaming state
 * - When AI is responding: cycles through busy icons every second
 * - When AI is idle: returns the rocket emoji
 */
export function useAnimatedTitleIcon(streamingState: StreamingState): string {
  const [iconIndex, setIconIndex] = useState(0);
  const isBusy = streamingState === StreamingState.Responding;

  useEffect(() => {
    if (!isBusy) {
      // AI is idle, reset to rocket icon
      setIconIndex(0);
      return;
    }

    // AI is busy, cycle through icons every second
    const interval = setInterval(() => {
      setIconIndex((prev) => (prev + 1) % BUSY_ICONS.length);
    }, ANIMATION_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isBusy]);

  return isBusy ? BUSY_ICONS[iconIndex] : IDLE_ICON;
}
