/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { type Config, SessionManager, ProxyAuthManager } from 'deepv-code-core';
import { t } from '../utils/i18n.js';
import path from 'path';
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

// 每日技巧键名列表 - 从 i18n 中获取实际文本（只保留最有用的）
const DAILY_TIP_KEYS = [
  // 斜杠命令 - 最实用的
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

  // 特殊输入符号
  'tip.at.filepath',
  'tip.shell.command',
  'tip.shell.mode',

  // 快捷键 - 只保留最常用的
  'tip.ctrl.j',

  // CLI 启动参数
  'tip.cli.update',
  'tip.cli.cloud',
];

// 格式化相对时间
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffMs / 604800000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${diffWeeks}w ago`;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  config,
  version,
  customProxyUrl,
}) => {
  // 直接同步获取用户名，不使用 state
  const userName = useMemo(() => {
    const authManager = ProxyAuthManager.getInstance();
    const userInfo = authManager.getUserInfo();
    return userInfo?.name;
  }, []);

  // 获取当前模型和 credits 信息
  const modelInfo = useMemo(() => {
    const currentModel = config.getModel();
    const cloudModelInfo = config.getCloudModelInfo(currentModel);

    if (cloudModelInfo) {
      const credits = cloudModelInfo.creditsPerRequest;
      // 使用简化的模型名称（中等缩写）
      const shortName = getShortModelName(cloudModelInfo.displayName, true);
      return {
        displayName: shortName,
        creditsText: `${credits}x credits`,
      };
    }

    // 如果没有 cloud model info，使用基本信息
    const modelName = currentModel === 'auto' ? 'Gemini' : currentModel;
    const shortName = getShortModelName(modelName, true);
    return {
      displayName: shortName,
      creditsText: 'API Usage Billing',
    };
  }, [config]);

  const [recentSessions, setRecentSessions] = useState<RecentSessionDisplay[]>([]);

  // 获取最近会话
  useEffect(() => {
    const loadRecentSessions = async () => {
      try {
        const sessionManager = new SessionManager(config.getProjectRoot());
        const sessions = await sessionManager.listSessions();

        const recentDisplays: RecentSessionDisplay[] = sessions
          .slice(0, 4)
          .map(session => ({
            time: formatRelativeTime(new Date(session.lastActiveAt)),
            description: session.title || session.firstUserMessage?.slice(0, 30) || 'Untitled session',
          }));

        setRecentSessions(recentDisplays);
      } catch (error) {
        // 忽略错误，不显示历史
      }
    };

    loadRecentSessions();
  }, [config]);

  // 获取当前目录名称
  const currentDir = useMemo(() => {
    const fullPath = config.getProjectRoot();
    return path.basename(fullPath);
  }, [config]);

  // 获取完整路径
  const fullPath = config.getProjectRoot();

  // 随机选择一条每日技巧
  const dailyTip = useMemo(() => {
    const randomIndex = Math.floor(Math.random() * DAILY_TIP_KEYS.length);
    const tipKey = DAILY_TIP_KEYS[randomIndex];
    return t(tipKey as any); // 类型断言，因为技巧键是动态的
  }, []);

  // 友好的欢迎消息
  const welcomeMessage = userName ? `Welcome back, ${userName}!` : 'Welcome to DeepV Code!';

  return (
    <Box flexDirection="column" marginBottom={1} borderStyle="round" borderColor="gray" paddingX={1} minWidth={80}>
      {/* 顶部标题行 - 包含像素机器人 logo */}
      <Box flexDirection="row" marginBottom={1}>
        <Box marginRight={2}>
          <Text color={Colors.Foreground}>{cuteVLogo}</Text>
        </Box>
        <Box flexDirection="column" justifyContent="center">
          <Text>DeepV Code </Text>
          <Text dimColor>v{version}</Text>
          <Text dimColor>{modelInfo.displayName} · {modelInfo.creditsText}</Text>
        </Box>
      </Box>

      {/* 用户欢迎信息 */}
      <Box>
        <Text color={Colors.AccentGreen}>{welcomeMessage}</Text>
      </Box>

      {/* 主内容区 - 左对齐布局 */}
      <Box flexDirection="column">
        {/* 项目路径 */}
        <Box>
          <Text dimColor>{fullPath}</Text>
        </Box>

        {/* Custom server info */}
        {customProxyUrl && (
          <Box flexDirection="column" marginBottom={1}>
            <Text color={Colors.AccentOrange}>🔗 Custom server: {customProxyUrl}</Text>
            <Text color={Colors.AccentOrange}>   Please verify trustworthiness and monitor your API usage.</Text>
          </Box>
        )}

        {/* Recent activity */}
        {recentSessions.length > 0 && (
          <Box flexDirection="column">
            <Text color={Colors.AccentOrange}>Recent activity</Text>
            <Box flexDirection="column">
              {recentSessions.map((session, idx) => (
                <Box key={idx}>
                  <Text dimColor>{session.time.padEnd(10)}</Text>
                  <Text>{session.description.slice(0, 30)}</Text>
                </Box>
              ))}
              <Box>
                <Text dimColor>... /resume for more</Text>
              </Box>
            </Box>
          </Box>
        )}

        {/* 每日技巧 */}
        <Box flexDirection="column">
          <Text>💡 {t('welcome.daily.tip.title')}</Text>
          <Box flexDirection="column">
            <Text>{dailyTip}</Text>
            <Box>
              <Text dimColor>{t('welcome.daily.tip.more')}</Text>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};