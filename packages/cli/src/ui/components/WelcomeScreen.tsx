/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import React, { useMemo, useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { type Config, SessionManager, ProxyAuthManager } from 'deepv-code-core';
import { t } from '../utils/i18n.js';
import { cuteVLogo } from './AsciiArt.js';
import { getShortModelName } from '../utils/footerUtils.js';

interface WelcomeScreenProps {
  config: Config;
  version: string;
  customProxyUrl?: string;
}

interface RecentSessionDisplay {
  time: string;
  description: string;
}

// 每日技巧键名列表 - 从 i18n 中获取
const DAILY_TIP_KEYS = [
  'tip.help',
  'tip.theme',
  'tip.auth',
  'tip.stats',
  'tip.memory',
  'tip.mcp',
  'tip.tools',
  'tip.init',
  'tip.model',
  'tip.plan',
  'tip.docs',
  'tip.session',
  'tip.restore',
  'tip.at.filepath',
  'tip.shell.command',
  'tip.shell.mode',
  'tip.ctrl.j',
  'tip.cli.update',
  'tip.cli.cloud',
];

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  config,
  version,
}) => {
  const userName = useMemo(() => {
    const authManager = ProxyAuthManager.getInstance();
    const userInfo = authManager.getUserInfo();
    return userInfo?.name;
  }, []);

  const modelInfo = useMemo(() => {
    const currentModel = config.getModel();
    const cloudModelInfo = config.getCloudModelInfo(currentModel);

    if (cloudModelInfo) {
      const credits = cloudModelInfo.creditsPerRequest;
      const shortName = getShortModelName(cloudModelInfo.displayName, true);
      return {
        displayName: shortName,
        creditsText: `${credits}x credits`,
      };
    }

    const modelName = currentModel === 'auto' ? 'Gemini' : currentModel;
    const shortName = getShortModelName(modelName, true);
    return {
      displayName: shortName,
      creditsText: 'API Usage Billing',
    };
  }, [config]);

  const [recentSessions, setRecentSessions] = useState<RecentSessionDisplay[]>([]);

  useEffect(() => {
    const loadRecentSessions = async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        const sessionManager = new SessionManager(config.getProjectRoot());
        const sessions = await sessionManager.listSessions();

        const recentDisplays: RecentSessionDisplay[] = sessions
          .slice(0, 1)
          .map(session => ({
            time: '',
            description: session.title || session.firstUserMessage?.slice(0, 30) || 'Untitled session',
          }));

        setRecentSessions(recentDisplays);
      } catch (error) {
        // 忽略错误
      }
    };

    loadRecentSessions();
  }, [config]);

  // 随机选择一条每日技巧
  const dailyTip = useMemo(() => {
    const randomIndex = Math.floor(Math.random() * DAILY_TIP_KEYS.length);
    const tipKey = DAILY_TIP_KEYS[randomIndex];
    const rawTip = t(tipKey as any);
    return rawTip
      .replace(/^Tip:\s*/i, '')
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .trim();
  }, []);

  const fullPath = config.getProjectRoot();
  const welcomeMessage = userName ? `Welcome back, ${userName}!` : 'Welcome back!';

  // 处理 Logo 字符串
  const trimmedLogo = cuteVLogo.trim();

  // 🎯 极致紧凑宽度
  const COMPACT_WIDTH = 68;

  return (
    <Box flexDirection="column" width={COMPACT_WIDTH} marginBottom={0}>
      {/* 顶部标题行 */}
      <Box justifyContent="space-between" paddingX={1}>
        <Text color={Colors.AccentBlue} bold>DeepV Code v{version}</Text>
        <Text dimColor wrap="truncate-middle">{fullPath}</Text>
      </Box>

      {/* 内容主体 */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="gray"
        paddingX={1}
        paddingY={0}
      >
        <Box flexDirection="row" paddingX={0}>
          {/* 左侧：Logo 区域收缩宽度，移除偏移，让整体更内敛 */}
          <Box flexDirection="column" width={18} justifyContent="center" alignItems="center">
            <Text color={Colors.AccentBlue}>{trimmedLogo}</Text>
          </Box>

          {/* 右侧：内容右对齐 */}
          <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="flex-end" paddingLeft={1}>
            <Box>
              <Text color={Colors.AccentBlue} bold wrap="truncate-end">{welcomeMessage}</Text>
            </Box>

            <Box>
              <Text dimColor wrap="truncate-end">{modelInfo.displayName}</Text>
            </Box>

            <Box>
              <Text color={Colors.AccentCyan} wrap="truncate-end">{dailyTip}</Text>
            </Box>

            {recentSessions.length > 0 && (
              <Box>
                <Text dimColor wrap="truncate-end">Last: {recentSessions[0].description}</Text>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
