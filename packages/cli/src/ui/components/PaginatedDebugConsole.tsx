/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
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

function PaginatedDebugConsoleComponent({
  messages,
  currentPage,
  pageSize,
  width,
  isManuallyBrowsing,
}: PaginatedDebugConsoleProps) {
  const startIndex = currentPage * pageSize;
  const pageMessages = messages.slice(startIndex, startIndex + pageSize);
  const totalPages = Math.ceil(messages.length / pageSize) || 1;
  const errorCount = messages.filter((msg) => msg.type === 'error').length;
  const errorMessages = messages.filter((msg) => msg.type === 'error');

  // Reserve space for error panel: 1 line for header + up to 3 error lines
  const errorPanelHeight = errorCount > 0 ? Math.min(4, errorCount + 1) : 0;
  const scrollableHeight = Math.max(5, pageSize - errorPanelHeight);

  const borderAndPadding = 4;
  const scrollPageMessages = messages.slice(startIndex, startIndex + scrollableHeight);

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
      <Box marginBottom={1} justifyContent="space-between">
        <Text bold color={Colors.Foreground}>
          Debug Console <Text color={Colors.Gray}>(ctrl+o to toggle, ctrl+s to expand, exit paging with Esc)</Text>
        </Text>
        <Text color={errorCount > 0 ? Colors.AccentRed : Colors.Gray}>
          Errors: {errorCount}
        </Text>
      </Box>

      {/* Page indicator */}
      <Box marginBottom={1}>
        <Text color={Colors.Gray}>
          {`Page ${currentPage + 1}/${totalPages} - ${messages.length} total messages`}
        </Text>
      </Box>

      {/* Scrollable message area */}
      <Box flexDirection="column" height={scrollableHeight}>
        {scrollPageMessages.length === 0 ? (
          <Box>
            <Text color={Colors.Gray}>No messages on this page</Text>
          </Box>
        ) : (
          scrollPageMessages.map((msg, index) => {
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
              <Box key={`${currentPage}-${msg.type}-${index}`} flexDirection="row">
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
        {Array.from({ length: Math.max(0, scrollableHeight - scrollPageMessages.length) }, (_, i) => (
          <Box key={`empty-${i}`}>
            <Text> </Text>
          </Box>
        ))}
      </Box>

      {/* Fixed error panel at the bottom */}
      {errorCount > 0 && (
        <Box
          flexDirection="column"
          marginTop={1}
          paddingTop={1}
          height={errorPanelHeight}
        >
          <Text bold color={Colors.AccentRed}>
            ━━ ✖ Recent Errors ({errorCount} total):
          </Text>
          {errorMessages.slice(-3).map((msg, index) => (
            <Box key={`error-${index}`} flexDirection="row">
              <Text color={Colors.AccentRed}>  • </Text>
              <Text color={Colors.AccentRed} wrap="wrap">
                {msg.content}
                {msg.count && msg.count > 1 && (
                  <Text color={Colors.Gray}> (x{msg.count})</Text>
                )}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export const PaginatedDebugConsole = React.memo(
  PaginatedDebugConsoleComponent,
  (prevProps, nextProps) => {
    // Return true if props are equal (no re-render), false to re-render
    return (
      prevProps.messages.length === nextProps.messages.length &&
      prevProps.currentPage === nextProps.currentPage &&
      prevProps.pageSize === nextProps.pageSize &&
      prevProps.width === nextProps.width &&
      prevProps.isManuallyBrowsing === nextProps.isManuallyBrowsing
    );
  }
);