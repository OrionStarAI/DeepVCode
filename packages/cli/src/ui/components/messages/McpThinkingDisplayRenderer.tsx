/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../../colors.js';
import type { McpThinkingDisplay } from 'deepv-code-core';

/**
 * Render a McpThinkingDisplay structure with Ink, optimized for readability:
 * - Prominent display of the thought content (main focus)
 * - De-emphasized technical parameters
 * - Visual hierarchy with colors and formatting
 */
export const McpThinkingDisplayRenderer: React.FC<{ data: McpThinkingDisplay }> = ({ data }) => {
  // Build status indicator based on thinking state
  const getStatusIndicator = () => {
    if (data.isRevision) {
      return <Text color={Colors.AccentYellow}>🔄 修正思考</Text>;
    }
    if (data.branchId) {
      return <Text color={Colors.AccentBlue}>🌿 分支探索</Text>;
    }
    if (data.nextThoughtNeeded === false) {
      return <Text color={Colors.AccentGreen}>✓ 思考完成</Text>;
    }
    return <Text color={Colors.AccentBlue}>💭 思考中</Text>;
  };

  // Build progress indicator
  const progressText = data.thoughtNumber && data.totalThoughts
    ? `步骤 ${data.thoughtNumber}/${data.totalThoughts}`
    : data.thoughtNumber
    ? `步骤 ${data.thoughtNumber}`
    : '';

  return (
    <Box flexDirection="column">
      {/* Header with status and progress */}
      <Box>
        {getStatusIndicator()}
        {progressText && (
          <>
            <Text color={Colors.Gray}> · </Text>
            <Text color={Colors.Gray}>{progressText}</Text>
          </>
        )}
      </Box>

      {/* Main thought content - use gray color to be less distracting */}
      <Box marginTop={0} marginLeft={2}>
        <Text color={Colors.Gray} wrap="wrap">
          {data.thought}
        </Text>
      </Box>

      {/* Optional metadata - de-emphasized */}
      {(data.isRevision || data.branchId || data.needsMoreThoughts) && (
        <Box marginTop={0} marginLeft={2} flexDirection="column">
          {data.isRevision && data.revisesThought !== undefined && (
            <Text color={Colors.Gray} dimColor>
              ↪ 修正步骤 {data.revisesThought}
            </Text>
          )}
          {data.branchId && data.branchFromThought !== undefined && (
            <Text color={Colors.Gray} dimColor>
              ↪ 从步骤 {data.branchFromThought} 分支 ({data.branchId})
            </Text>
          )}
          {data.needsMoreThoughts && (
            <Text color={Colors.Gray} dimColor>
              ↪ 需要更多思考步骤
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
};
