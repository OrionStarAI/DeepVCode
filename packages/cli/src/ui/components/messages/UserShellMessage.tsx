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

  return (
    <Box flexDirection="row" width="100%">
      <Box flexShrink={1}>
        <Text color={Colors.AccentCyan}>$ </Text>
        <Text>{commandToDisplay}</Text>
      </Box>
      {terminalWidth ? (
        <Box flexGrow={1} justifyContent="flex-end" alignItems="center">
          <Text>{userIndicator}</Text>
        </Box>
      ) : null}
    </Box>
  );
};
