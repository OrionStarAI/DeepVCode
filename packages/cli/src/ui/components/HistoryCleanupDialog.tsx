/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { t, tp } from '../utils/i18n.js';

interface HistoryCleanupDialogProps {
  /** Formatted size of history directory */
  sizeFormatted: string;
  /** Callback when user confirms cleanup */
  onConfirm: () => void;
  /** Callback when user dismisses the dialog */
  onDismiss: () => void;
}

/**
 * A simple dialog prompting user to clean up large checkpoint history
 * This replaces the blocking readline prompt from gemini.tsx
 */
export const HistoryCleanupDialog: React.FC<HistoryCleanupDialogProps> = ({
  sizeFormatted,
  onConfirm,
  onDismiss,
}) => {
  useInput((input, key) => {
    if (input.toLowerCase() === 'y') {
      onConfirm();
    } else if (input.toLowerCase() === 'n' || key.escape) {
      onDismiss();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={Colors.AccentYellow}
      paddingX={2}
      paddingY={1}
      marginY={1}
    >
      <Box marginBottom={1}>
        <Text bold color={Colors.AccentYellow}>
          ⚠️ Large Checkpoint History
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>
          {tp('checkpoint.history.large.warning', { size: sizeFormatted })}
        </Text>
      </Box>

      <Box>
        <Text dimColor>
          {t('checkpoint.history.large.question')} (y/n)
        </Text>
      </Box>
    </Box>
  );
};
