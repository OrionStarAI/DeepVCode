/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { t } from '../utils/i18n.js';
import { cuteVLogo } from './AsciiArt.js';
import { getCreditsService, formatCredits, type UserCreditsInfo } from '../../services/creditsService.js';

interface HeaderProps {
  customAsciiArt?: string; // For user-defined ASCII art
  terminalWidth: number; // For responsive logo
  version: string;
  nightly: boolean;
  feishuServerPort?: number; // 飞书认证服务器端口号
}

export const Header: React.FC<HeaderProps> = ({
  customAsciiArt,
  terminalWidth,
  version,
  nightly,
  feishuServerPort,
}) => {
  const [creditsInfo, setCreditsInfo] = useState<UserCreditsInfo | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(true);

  // 异步获取积分信息
  useEffect(() => {
    const fetchCredits = async () => {
      try {
        const creditsService = getCreditsService();
        const info = await creditsService.getCreditsInfo();
        setCreditsInfo(info);
      } catch (error) {
        // 静默处理错误，不影响启动
      } finally {
        setCreditsLoading(false);
      }
    };

    // 异步获取，不阻塞渲染
    fetchCredits();
  }, []);

  // 如果用户自定义了 ASCII art，则使用它
  if (customAsciiArt) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text>{customAsciiArt}</Text>
      </Box>
    );
  }

  // 像素风格的机器人 logo + 版本信息 - 参考 Claude Code 风格
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row" paddingX={1}>
        <Box marginRight={2}>
          <Text color={Colors.AccentBlue}>{cuteVLogo}</Text>
        </Box>
        <Box flexDirection="column" justifyContent="center">
          <Text bold>
            DeepV Code v{version}
          </Text>
          <Text dimColor color={Colors.Gray}>
            Gemini · API Usage Billing
          </Text>
        </Box>
      </Box>

      {/* 积分信息显示 - 异步加载完成后显示 */}
      {!creditsLoading && creditsInfo && (
        <Box flexDirection="row" paddingX={1} marginTop={1}>
          <Text color={Colors.AccentCyan}>
            💳 Credits:{' '}
          </Text>
          <Text color={Colors.AccentBlue} bold>
            {formatCredits(creditsInfo.totalCredits)}
          </Text>
          <Text color={Colors.AccentCyan}>
            {' | Used: '}
          </Text>
          <Text color={creditsInfo.usagePercentage > 95 ? Colors.AccentRed : Colors.AccentOrange} bold>
            {formatCredits(creditsInfo.usedCredits)}
          </Text>
          <Text color={Colors.AccentCyan}>
            {' '}({creditsInfo.usagePercentage.toFixed(1)}%)
          </Text>
        </Box>
      )}
    </Box>
  );
};
