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
 *
 * Critical: The summary display is deliberately ephemeral (very short duration) to prevent
 * rendering conflicts when new prompts are immediately queued. The summary should flash
 * briefly and disappear to make room for queued prompt display.
 */
export const useTaskCompletionSummary = (
  streamingState: StreamingState,
  elapsedTimeBeforeIdle: number,
) => {
  const [shouldShowSummary, setShouldShowSummary] = useState(false);
  const [completionElapsedTime, setCompletionElapsedTime] = useState(0);
  const prevStreamingStateRef = useRef<StreamingState | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const summaryDisplayStartTimeRef = useRef<number | null>(null);

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
      summaryDisplayStartTimeRef.current = Date.now();

      // Reset after a short delay to avoid showing it again
      // Using 300ms to ensure clear visibility of the completion summary
      // before it disappears, giving queued prompts space to render without conflicts
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setShouldShowSummary(false);
        summaryDisplayStartTimeRef.current = null;
        timeoutRef.current = null;
      }, 300);
    } else if (streamingState === StreamingState.Responding) {
      // If we start responding again, immediately hide the summary
      // to prevent overlap with new response display
      if (summaryDisplayStartTimeRef.current !== null) {
        setShouldShowSummary(false);
        summaryDisplayStartTimeRef.current = null;
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }
    }

    // Always update the previous state reference to track state transitions correctly
    prevStreamingStateRef.current = streamingState;

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [streamingState, elapsedTimeBeforeIdle]);

  return { shouldShowSummary, completionElapsedTime };
};
