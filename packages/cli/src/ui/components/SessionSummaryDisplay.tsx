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

  useEffect(() => {
    // 🆕 立即开始加载积分，不要延迟 1 秒
    // 这样 "Exiting..." 消息会立即显示，同时后台加载积分
    setIsLoading(true);
    const loadCredits = async () => {
      try {
        const creditsService = getCreditsService();
        // 🎯 优化：不再总是强制刷新。
        // getCreditsInfo 默认带有 1 分钟缓存。
        // 如果用户刚按过一次 Ctrl+C，这里的 getCreditsInfo 将直接使用缓存。
        const info = await creditsService.getCreditsInfo();
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

  return (
    <>
      <Box flexDirection="column" marginBottom={1}>
        {/* 立即显示退出消息 */}
        <Text>
          {isLoading ? '•' : '👋'} {isLoading ? t('command.quit.exiting') : t('command.quit.goodbye')}
        </Text>

        {showLatestCredits && latestCreditsInfo ? (
          <Box marginTop={0}>
            <Text>{latestCreditsInfo}</Text>
          </Box>
        ) : null}
      </Box>

      <StatsDisplay
        title={t('agent.powering.down')}
        duration={duration}
        totalCredits={credits}
        config={config}
      />
    </>
  );
};
