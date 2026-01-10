/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';
import type { TodoDisplay } from 'deepv-code-core';

/**
 * Render a TodoDisplay structure with Ink, matching the screenshot style:
 * - Leading green dot before the title
 * - Tree-like connectors (├─ / └─)
 * - Checkbox-like icons
 * - Blue highlight for in-progress, green for completed, gray/foreground for pending
 */
export const TodoDisplayRenderer: React.FC<{ data: TodoDisplay } & { titleEmphasis?: 'normal' | 'strong' }> = ({ data, titleEmphasis = 'strong' }) => {
  const items = data.items || [];

  const getColorForStatus = (status: 'pending' | 'in_progress' | 'completed') => {
    if (status === 'completed') return Colors.AccentGreen;
    if (status === 'in_progress') return Colors.AccentBlue; // 蓝色高亮
    return Colors.Foreground;
  };

  const getCheckboxForStatus = (status: 'pending' | 'in_progress' | 'completed') => {
    return status === 'completed' ? '☒' : '□'; // 完成项使用方框+X
  };

  return (
    <Box flexDirection="column">
      {/* Title with green dot */}
      <Box>
        <Text color={Colors.AccentGreen}>● </Text>
        <Text bold={titleEmphasis === 'strong'}>{data.title || 'Update Todos'}</Text>
      </Box>

      {/* Items */}
      <Box flexDirection="column" marginTop={0}>
        {items.map((t, idx) => {
          const isLast = idx === items.length - 1;
          const connector = isLast ? '└' : '├';
          const color = getColorForStatus(t.status);
          const checkbox = getCheckboxForStatus(t.status);
          return (
            <Box key={t.id}>
              <Text>  {connector} </Text>
              <Text color={color} strikethrough={t.status === 'completed'}>
                {checkbox} {t.content}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

