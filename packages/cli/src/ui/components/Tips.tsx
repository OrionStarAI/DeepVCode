/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { type Config } from 'deepv-code-core';
import { t } from '../utils/i18n.js';

interface TipsProps {
  config: Config;
}

export const Tips: React.FC<TipsProps> = ({ config }) => {
  // 简化的提示信息 - 参考 Claude Code 风格
  return (
    <Box flexDirection="column" marginBottom={1} paddingLeft={1}>
      <Text dimColor>
        Try{' '}
        <Text color={Colors.AccentOrange}>
          "edit &lt;filepath&gt; to ..."
        </Text>
      </Text>
      <Text dimColor>
        Type{' '}
        <Text color={Colors.AccentOrange}>/help</Text> for more
      </Text>
    </Box>
  );
};
