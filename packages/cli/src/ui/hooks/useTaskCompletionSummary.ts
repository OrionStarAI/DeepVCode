/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { StreamingState } from '../types.js';

/**
 * Hook to manage task completion summary
 * Shows summary when transitioning from Responding to Idle with a valid elapsed time
 */
export const useTaskCompletionSummary = (
  streamingState: StreamingState,
  elapsedTimeBeforeIdle: number,
) => {
  const [shouldShowSummary, setShouldShowSummary] = useState(false);
  const [completionElapsedTime, setCompletionElapsedTime] = useState(0);
  const prevStreamingStateRef = useRef<StreamingState | null>(null);

  useEffect(() => {
    const prevState = prevStreamingStateRef.current;

    // Detect transition from Responding to Idle with valid elapsed time
    if (
      prevState === StreamingState.Responding &&
      streamingState === StreamingState.Idle &&
      elapsedTimeBeforeIdle > 0
    ) {
      // Show completion summary
      setShouldShowSummary(true);
      setCompletionElapsedTime(elapsedTimeBeforeIdle);

      // Reset after a short delay to avoid showing it again
      const timeout = setTimeout(() => {
        setShouldShowSummary(false);
      }, 50);

      return () => clearTimeout(timeout);
    }

    prevStreamingStateRef.current = streamingState;
  }, [streamingState, elapsedTimeBeforeIdle]);

  return { shouldShowSummary, completionElapsedTime };
};
