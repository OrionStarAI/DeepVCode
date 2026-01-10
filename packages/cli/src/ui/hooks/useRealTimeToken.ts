/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { useState, useEffect } from 'react';
import { realTimeTokenEventManager, type RealTimeTokenData } from 'deepv-code-core';

export interface RealTimeTokenState {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  timestamp?: number;
}

/**
 * Hook for managing real-time token display during request processing
 */
export const useRealTimeToken = () => {
  const [realTimeToken, setRealTimeToken] = useState<RealTimeTokenState | null>(null);

  useEffect(() => {
    const handleRealTimeToken = (tokenData: RealTimeTokenData) => {
      setRealTimeToken({
        inputTokens: tokenData.inputTokens,
        outputTokens: tokenData.outputTokens,
        totalTokens: tokenData.totalTokens,
        timestamp: tokenData.timestamp,
      });
    };

    const handleClearRealTimeToken = () => {
      setRealTimeToken(null);
    };

    // 订阅实时token事件
    realTimeTokenEventManager.onRealTimeToken(handleRealTimeToken);
    realTimeTokenEventManager.onClearRealTimeToken(handleClearRealTimeToken);

    // 清理函数
    return () => {
      realTimeTokenEventManager.offRealTimeToken(handleRealTimeToken);
      realTimeTokenEventManager.offClearRealTimeToken(handleClearRealTimeToken);
    };
  }, []);

  return realTimeToken;
};