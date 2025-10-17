/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';

interface UserShellMessageProps {
  text: string;
  terminalWidth?: number;
}

export const UserShellMessage: React.FC<UserShellMessageProps> = ({ text, terminalWidth }) => {
  // Remove leading '!' if present, as App.tsx adds it for the processor.
  const commandToDisplay = text.startsWith('!') ? text.substring(1) : text;
  const userIndicator = '🧑💬'; // 小人 + 聊天emoji

  // 使用真实的终端宽度，加回被减去的padding
  const realTerminalWidth = (terminalWidth || 0) + 8;

  return (
    <Box flexDirection="row" width={realTerminalWidth}>
      <Box>
        <Text color={Colors.AccentCyan}>$ </Text>
        <Text>{commandToDisplay}</Text>
      </Box>
      {terminalWidth && (
        <Box flexGrow={1} justifyContent="flex-end" alignItems="center">
          <Text>{userIndicator}</Text>
        </Box>
      )}
    </Box>
  );
};
