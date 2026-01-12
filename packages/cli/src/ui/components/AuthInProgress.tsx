/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { Colors } from '../colors.js';
import { isChineseLocale } from '../utils/i18n.js';

interface AuthInProgressProps {
  onTimeout: () => void;
  stage?: 'auth' | 'environment';
}

export function AuthInProgress({
  onTimeout,
  stage = 'auth',
}: AuthInProgressProps): React.JSX.Element {
  const [timedOut, setTimedOut] = useState(false);

  // 🔧 移除 useInput 以避免与 InputPrompt 冲突
  // 认证期间不需要处理按键输入

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimedOut(true);
      onTimeout();
    }, 180000);

    return () => clearTimeout(timer);
  }, [onTimeout]);

  const getStageMessage = () => {
    const isChinese = isChineseLocale();
    
    if (stage === 'environment') {
      return isChinese 
        ? '正在准备最佳环境...'
        : 'Preparing optimal environment...';
    }
    
    return isChinese
      ? '正在认证和准备环境...'
      : 'Authenticating and preparing environment...';
  };

  const getTimeoutMessage = () => {
    const isChinese = isChineseLocale();
    
    if (stage === 'environment') {
      return isChinese 
        ? '环境准备超时，请重试。'
        : 'Environment preparation timed out. Please try again.';
    }
    
    return isChinese 
      ? '认证超时，请重试。'
      : 'Authentication timed out. Please try again.';
  };

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      {timedOut ? (
        <Text color={Colors.AccentRed}>
          {getTimeoutMessage()}
        </Text>
      ) : (
        <Box>
          <Text>
            <Spinner type="dots" /> {getStageMessage()}
          </Text>
        </Box>
      )}
    </Box>
  );
}
