/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Text, Box } from 'ink';
import { StatsDisplay } from './StatsDisplay.js';
import { t } from '../utils/i18n.js';
import { Config } from 'deepv-code-core';
import { getCreditsService } from '../../services/creditsService.js';
import { formatCreditsWithColor } from '../utils/creditsFormatter.js';

// 简单的加载动画
const loadingSpinners = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIndex = 0;

function getLoadingSpinner(): string {
  const spinner = loadingSpinners[spinnerIndex % loadingSpinners.length];
  spinnerIndex++;
  return spinner;
}

interface SessionSummaryDisplayProps {
  duration: string;
  credits?: number;
  config?: Config;
}

export const SessionSummaryDisplay: React.FC<SessionSummaryDisplayProps> = ({
  duration,
  credits,
  config,
}) => {
  const [latestCreditsInfo, setLatestCreditsInfo] = useState<string | null>(null);
  const [showLatestCredits, setShowLatestCredits] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [creditsLoadComplete, setCreditsLoadComplete] = useState(false);
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  useEffect(() => {
    // 🆕 立即开始加载积分，不要延迟 1 秒
    // 这样 "Exiting..." 消息会立即显示，同时后台加载积分
    setIsLoading(true);
    const loadCredits = async () => {
      try {
        const creditsService = getCreditsService();
        // 强制刷新，直接从服务器获取最新数据（不使用缓存）
        // 有5秒超时保护，不会让用户等太久
        const info = await creditsService.getCreditsInfo(true);
        if (info) {
          const creditsText = formatCreditsWithColor(
            info.totalCredits,
            info.usedCredits,
            info.usagePercentage
          );
          if (creditsText) {
            setLatestCreditsInfo(creditsText);
            setShowLatestCredits(true);
          }
        }
      } catch (error) {
        // 静默处理错误，不显示新数据
      } finally {
        setIsLoading(false);
        // 标记加载完成（无论成功还是失败），允许程序退出
        setCreditsLoadComplete(true);
      }
    };
    loadCredits();
  }, []);

  // 加载动画效果
  useEffect(() => {
    if (!isLoading) return;

    const animationInterval = setInterval(() => {
      setSpinnerFrame((prev) => (prev + 1) % loadingSpinners.length);
    }, 100);

    return () => clearInterval(animationInterval);
  }, [isLoading]);

  return (
    <>
      <StatsDisplay
        title={t('agent.powering.down')}
        duration={duration}
        totalCredits={credits}
        config={config}
      />
      <Box marginTop={1}>
        {/* 立即显示加载动画，完成后显示友好的告别消息 */}
        <Text>
          {isLoading ? loadingSpinners[spinnerFrame] : '👋'} {isLoading ? t('command.quit.exiting') : t('command.quit.goodbye')}
        </Text>
      </Box>
      {showLatestCredits && latestCreditsInfo ? (
        <Box marginTop={1}>
          <Text>{latestCreditsInfo}</Text>
        </Box>
      ) : null}
    </>
  );
};
