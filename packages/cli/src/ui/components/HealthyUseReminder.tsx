/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { t, tp } from '../utils/i18n.js';

interface HealthyUseReminderProps {
  onDismiss: () => void;
}

export function HealthyUseReminder({ onDismiss }: HealthyUseReminderProps): React.JSX.Element {
  const [countdown, setCountdown] = useState(300); // 300秒倒计时
  const [canDismiss, setCanDismiss] = useState(false);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    } else {
      setCanDismiss(true);
    }
  }, [countdown]);

  // 监听输入，当倒计时结束且用户按下特定键（如空格或回车）时关闭
  useInput((input, key) => {
    if (canDismiss && (key.return || input === ' ')) {
      onDismiss();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={Colors.AccentGreen}
      padding={1}
      marginX={2}
      marginY={1}
    >
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color={Colors.AccentGreen}>
          🌙 {t('healthy.reminder.title') || '夜深了，该休息了'}
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text>
          {t('healthy.reminder.content') || '工作固然重要，但您的身体健康更珍贵。'}
        </Text>
        <Text>
          {t('healthy.reminder.suggestion') || '现在已经是深夜时段，建议您保存进度，早点休息。'}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text dimColor>
          ⚡ {t('healthy.reminder.agentRunning') || 'Agent 正在后台处理任务，不会受此提醒影响。'}
        </Text>
      </Box>

      <Box justifyContent="center">
        {!canDismiss ? (
          <Text color={Colors.AccentYellow}>
            {tp('healthy.reminder.waiting', { seconds: countdown }) || `请在 ${countdown} 秒后尝试确认...`}
          </Text>
        ) : (
          <Text color={Colors.AccentGreen} bold inverse>
            {" "}{t('healthy.reminder.dismiss') || ' 按 [回车] 或 [空格] 稍后提醒 '}{" "}
          </Text>
        )}
      </Box>
    </Box>
  );
}
