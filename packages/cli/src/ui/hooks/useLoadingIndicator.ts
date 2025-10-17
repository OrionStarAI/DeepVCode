/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { StreamingState } from '../types.js';
import { useTimer } from './useTimer.js';
import { usePhraseCycler } from './usePhraseCycler.js';
import { isChineseLocale } from '../utils/i18n.js';
import { useState, useEffect, useRef } from 'react'; // Added useRef

export const useLoadingIndicator = (
  streamingState: StreamingState, 
  estimatedInputTokens?: number
) => {
  const [timerResetKey, setTimerResetKey] = useState(0);
  const isTimerActive = streamingState === StreamingState.Responding;

  const elapsedTimeFromTimer = useTimer(isTimerActive, timerResetKey);

  // 🎯 强化修复：确保在等待确认状态下完全停止短语循环
  const isPhraseCyclingActive = streamingState === StreamingState.Responding;
  const isWaiting = streamingState === StreamingState.WaitingForConfirmation;
  const currentLoadingPhrase = usePhraseCycler(
    isPhraseCyclingActive,
    isWaiting,
  );

  const [retainedElapsedTime, setRetainedElapsedTime] = useState(0);
  const prevStreamingStateRef = useRef<StreamingState | null>(null);

  useEffect(() => {
    if (
      prevStreamingStateRef.current === StreamingState.WaitingForConfirmation &&
      streamingState === StreamingState.Responding
    ) {
      setTimerResetKey((prevKey) => prevKey + 1);
      setRetainedElapsedTime(0); // Clear retained time when going back to responding
    } else if (
      streamingState === StreamingState.Idle &&
      prevStreamingStateRef.current === StreamingState.Responding
    ) {
      setTimerResetKey((prevKey) => prevKey + 1); // Reset timer when becoming idle from responding
      setRetainedElapsedTime(0);
    } else if (streamingState === StreamingState.WaitingForConfirmation) {
      // Capture the time when entering WaitingForConfirmation
      // elapsedTimeFromTimer will hold the last value from when isTimerActive was true.
      setRetainedElapsedTime(elapsedTimeFromTimer);
    }

    prevStreamingStateRef.current = streamingState;
  }, [streamingState, elapsedTimeFromTimer]);

  return {
    elapsedTime:
      streamingState === StreamingState.WaitingForConfirmation
        ? retainedElapsedTime
        : elapsedTimeFromTimer,
    // 🎯 额外保护：在返回值中再次确保等待状态下的静态消息
    currentLoadingPhrase: streamingState === StreamingState.WaitingForConfirmation
      ? (isChineseLocale() ? '等待用户确认...' : 'Waiting for user confirmation...')
      : currentLoadingPhrase,
    estimatedInputTokens,
  };
};
