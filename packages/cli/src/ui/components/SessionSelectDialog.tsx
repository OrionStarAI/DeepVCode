/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { t } from '../utils/i18n.js';
import { SessionOption } from '../commands/types.js';

interface SessionSelectDialogProps {
  sessions: SessionOption[];
  onSelect: (sessionId: string | undefined) => void;
}

export function SessionSelectDialog({
  sessions,
  onSelect,
}: SessionSelectDialogProps): React.JSX.Element {
  // Format items for RadioButtonSelect
  const items = useMemo(() => sessions.map(session => {
    const date = new Date(session.lastActiveAt);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    const checkpoint = session.hasCheckpoint ? ' [📍]' : '';

    // Create label with details
    // Format: "Title [Checkpoint] (Date) - Preview"
    let label = `\u001b[36m${session.title}${checkpoint}\u001b[0m \u001b[90m(${dateStr})\u001b[0m`;

    // Add truncated preview if available
    if (session.firstUserMessage) {
        const preview = session.firstUserMessage.slice(0, 40).replace(/\n/g, ' ');
        const ellipsis = session.firstUserMessage.length > 40 ? '...' : '';
        label += ` - 💭 "${preview}${ellipsis}"`;
    }

    return {
      label,
      value: session.sessionId,
    };
  }), [sessions]);

  useInput((input, key) => {
    if (key.escape) {
      onSelect(undefined);
    }
  });

  const handleSelect = useCallback((value: string) => {
    onSelect(value);
  }, [onSelect]);

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={1}
      paddingRight={1}
      width="100%"
    >
      <Text bold>{t('session.list.selectSession')}</Text>
      <Box marginTop={1}>
        <RadioButtonSelect
          items={items}
          onSelect={handleSelect}
          isFocused={true}
          maxItemsToShow={10}
          showScrollArrows={true}
          showNumbers={true}
        />
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.Gray}>Use ↑/↓ to navigate, Enter to select, Esc to cancel</Text>
      </Box>
    </Box>
  );
}
