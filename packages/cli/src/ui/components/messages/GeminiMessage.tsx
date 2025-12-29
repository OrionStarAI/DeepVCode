/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';
import { Colors } from '../../colors.js';
import { SafeMessageContainer } from '../shared/SafeMessageContainer.js';

interface GeminiMessageProps {
  text: string;
  isPending: boolean;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

export const GeminiMessage: React.FC<GeminiMessageProps> = ({
  text,
  isPending,
  availableTerminalHeight,
  terminalWidth,
}) => {
  const prefix = '● ';
  const prefixWidth = prefix.length;

  return (
    <SafeMessageContainer preventOverflow={true}>
      <Box flexDirection="row">
        <Box width={prefixWidth} flexShrink={0}>
          <Text color={Colors.Foreground}>{prefix}</Text>
        </Box>
        <Box flexGrow={1} flexDirection="column" flexShrink={1}>
          <MarkdownDisplay
            text={text}
            isPending={isPending}
            availableTerminalHeight={availableTerminalHeight}
            terminalWidth={terminalWidth - prefixWidth}
          />
        </Box>
      </Box>
    </SafeMessageContainer>
  );
};
