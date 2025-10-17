/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { ConsoleMessageItem } from '../types.js';

interface PaginatedDebugConsoleProps {
  messages: ConsoleMessageItem[];
  currentPage: number;
  pageSize: number;
  width: number;
  isManuallyBrowsing: boolean;
}

export const PaginatedDebugConsole: React.FC<PaginatedDebugConsoleProps> = ({
  messages,
  currentPage,
  pageSize,
  width,
  isManuallyBrowsing,
}) => {
  const startIndex = currentPage * pageSize;
  const pageMessages = messages.slice(startIndex, startIndex + pageSize);
  const totalPages = Math.ceil(messages.length / pageSize) || 1;

  const borderAndPadding = 4;

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="round"
      borderColor={Colors.Gray}
      paddingX={1}
      width={width}
      height={pageSize + 3} // +3 for header and page indicator
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color={Colors.Foreground}>
          Debug Console <Text color={Colors.Gray}>(ctrl+o to close, ctrl+s to exit paging)</Text>
        </Text>
      </Box>

      {/* Page indicator */}
      <Box marginBottom={1}>
        <Text color={Colors.Gray}>
          Page {currentPage + 1}/{totalPages} - {messages.length} total messages
        </Text>
        <Text color={Colors.Gray}>
          Navigation: PgUp/PgDown | Home (first) | End (latest)
          {currentPage === totalPages - 1 && !isManuallyBrowsing && (
            <Text color={Colors.AccentGreen}> [LIVE]</Text>
          )}
          {isManuallyBrowsing && (
            <Text color={Colors.AccentYellow}> [BROWSING]</Text>
          )}
        </Text>
      </Box>

      {/* Fixed height message area */}
      <Box flexDirection="column" height={pageSize}>
        {pageMessages.length === 0 ? (
          <Box>
            <Text color={Colors.Gray}>No messages on this page</Text>
          </Box>
        ) : (
          pageMessages.map((msg, index) => {
            let textColor = Colors.Foreground;
            let icon = '\u2139'; // Information source (ℹ)

            switch (msg.type) {
              case 'warn':
                textColor = Colors.AccentYellow;
                icon = '\u26A0'; // Warning sign (⚠)
                break;
              case 'error':
                textColor = Colors.AccentRed;
                icon = '\u2716'; // Heavy multiplication x (✖)
                break;
              case 'debug':
                textColor = Colors.Gray;
                icon = '\u1F50D'; // Left-pointing magnifying glass (🔍)
                break;
              case 'log':
              default:
                // Default textColor and icon are already set
                break;
            }

            return (
              <Box key={startIndex + index} flexDirection="row">
                <Text color={textColor}>{icon} </Text>
                <Text
                  color={textColor}
                  wrap="wrap"
                >
                  {msg.content}
                  {msg.count && msg.count > 1 && (
                    <Text color={Colors.Gray}> (x{msg.count})</Text>
                  )}
                </Text>
              </Box>
            );
          })
        )}

        {/* Fill remaining space to maintain fixed height */}
        {Array.from({ length: Math.max(0, pageSize - pageMessages.length) }, (_, i) => (
          <Box key={`empty-${i}`}>
            <Text> </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
};