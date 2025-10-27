/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { IndividualToolCallDisplay, ToolCallStatus } from '../../types.js';
import { DiffRenderer } from './DiffRenderer.js';
import { TodoDisplayRenderer } from './TodoDisplayRenderer.js';
import { SubAgentDisplayRenderer } from './SubAgentDisplayRenderer.js';
import { McpThinkingDisplayRenderer } from './McpThinkingDisplayRenderer.js';
import { Colors } from '../../colors.js';
import { MarkdownDisplay } from '../../utils/MarkdownDisplay.js';
import { GeminiRespondingSpinner } from '../GeminiRespondingSpinner.js';
import { MaxSizedBox } from '../shared/MaxSizedBox.js';
import { getLocalizedToolName, isChineseLocale } from '../../utils/i18n.js';
import { useSmallWindowOptimization, WindowSizeLevel } from '../../hooks/useSmallWindowOptimization.js';
import stringWidth from 'string-width';

const STATIC_HEIGHT = 1;
const RESERVED_LINE_COUNT = 5; // for tool name, status, padding etc.
const STATUS_INDICATOR_WIDTH = 3;
const MIN_LINES_SHOWN = 2; // show at least this many lines

// Large threshold to ensure we don't cause performance issues for very large
// outputs that will get truncated further MaxSizedBox anyway.
const MAXIMUM_RESULT_DISPLAY_CHARACTERS = 1000000;

/**
 * 分析diff内容，提取统计信息
 */
interface DiffStats {
  linesAdded: number;
  linesRemoved: number;
  linesChanged: number;
  isNewFile: boolean;
  isDeletedFile: boolean;
}

function analyzeDiffStats(diffContent: string): DiffStats {
  const lines = diffContent.split('\n');
  let linesAdded = 0;
  let linesRemoved = 0;
  let isNewFile = false;
  let isDeletedFile = false;

  // 检查文件状态
  if (diffContent.includes('new file mode')) {
    isNewFile = true;
  } else if (diffContent.includes('deleted file mode') ||
             (diffContent.includes('--- a/') && diffContent.includes('+++ /dev/null'))) {
    isDeletedFile = true;
  }

  // 统计增删行数
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      linesAdded++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      linesRemoved++;
    }
  }

  // 计算修改行数（取增删中的较小值作为修改，剩余的作为纯增/删）
  const linesChanged = Math.min(linesAdded, linesRemoved);

  return {
    linesAdded: linesAdded - linesChanged,
    linesRemoved: linesRemoved - linesChanged,
    linesChanged,
    isNewFile,
    isDeletedFile
  };
}

/**
 * 生成简化的diff统计显示
 */
function renderSimplifiedDiffStats(stats: DiffStats, fileName: string): React.ReactNode {
  if (stats.isNewFile) {
    return (
      <Box>
        <Text color={Colors.AccentGreen}>📄 新建文件</Text>
        <Text color={Colors.Gray}> {fileName}</Text>
        {stats.linesAdded > 0 && (
          <Text color={Colors.AccentGreen}> (+{stats.linesAdded} 行)</Text>
        )}
      </Box>
    );
  }

  if (stats.isDeletedFile) {
    return (
      <Box>
        <Text color={Colors.AccentRed}>🗑️ 删除文件</Text>
        <Text color={Colors.Gray}> {fileName}</Text>
        {stats.linesRemoved > 0 && (
          <Text color={Colors.AccentRed}> (-{stats.linesRemoved} 行)</Text>
        )}
      </Box>
    );
  }

  const parts: React.ReactNode[] = [
    <Text key="file" color={Colors.Gray}>📝 {fileName}</Text>
  ];

  if (stats.linesAdded > 0) {
    parts.push(
      <Text key="added" color={Colors.AccentGreen}> +{stats.linesAdded}</Text>
    );
  }

  if (stats.linesRemoved > 0) {
    parts.push(
      <Text key="removed" color={Colors.AccentRed}> -{stats.linesRemoved}</Text>
    );
  }

  if (stats.linesChanged > 0) {
    parts.push(
      <Text key="changed" color={Colors.AccentYellow}> M {stats.linesChanged}</Text>
    );
  }

  if (stats.linesAdded === 0 && stats.linesRemoved === 0 && stats.linesChanged === 0) {
    parts.push(
      <Text key="no-change" color={Colors.Gray}> (无变更)</Text>
    );
  }

  return <Box>{parts}</Box>;
}
export type TextEmphasis = 'high' | 'medium' | 'low';

export interface ToolMessageProps extends IndividualToolCallDisplay {
  availableTerminalHeight?: number;
  terminalWidth: number;
  emphasis?: TextEmphasis;
  renderOutputAsMarkdown?: boolean;
  forceMarkdown?: boolean;
}

export const ToolMessage: React.FC<ToolMessageProps> = ({
  name,
  description,
  resultDisplay,
  status,
  confirmationDetails,
  availableTerminalHeight,
  terminalWidth,
  emphasis = 'medium',
  renderOutputAsMarkdown = true,
  forceMarkdown = false,
}) => {
  const smallWindowConfig = useSmallWindowOptimization();
  const shouldSimplifyDiff = smallWindowConfig.sizeLevel === WindowSizeLevel.SMALL ||
                           smallWindowConfig.sizeLevel === WindowSizeLevel.TINY;

  const availableHeight = availableTerminalHeight
    ? Math.max(
        availableTerminalHeight - STATIC_HEIGHT - RESERVED_LINE_COUNT,
        MIN_LINES_SHOWN + 1, // enforce minimum lines shown
      )
    : undefined;

  // Long tool call response in MarkdownDisplay doesn't respect availableTerminalHeight properly,
  // we're forcing it to not render as markdown when the response is too long, it will fallback
  // to render as plain text, which is contained within the terminal using MaxSizedBox
  // However, if forceMarkdown is true, we skip this override
  if (availableHeight && !forceMarkdown) {
    renderOutputAsMarkdown = false;
  }

  const childWidth = terminalWidth - 3; // account for padding.

  // Special handling for Sequential thinking - convert to mcp_thinking_display
  const normalizedToolName = name?.toLowerCase().replace(/[_-]/g, '');
  let thinkingDisplayData: any = null;

  if (normalizedToolName?.includes('sequentialthinking')) {
    // Try to parse thinking data from description
    try {
      const parsedDescription = JSON.parse(description);
      if (parsedDescription && parsedDescription.thought !== undefined) {
        thinkingDisplayData = {
          type: 'mcp_thinking_display' as const,
          thought: parsedDescription.thought || '',
          thoughtNumber: parsedDescription.thoughtNumber,
          totalThoughts: parsedDescription.totalThoughts,
          nextThoughtNeeded: parsedDescription.nextThoughtNeeded,
          isRevision: parsedDescription.isRevision,
          revisesThought: parsedDescription.revisesThought,
          branchFromThought: parsedDescription.branchFromThought,
          branchId: parsedDescription.branchId,
          needsMoreThoughts: parsedDescription.needsMoreThoughts,
          branches: parsedDescription.branches,
          thoughtHistoryLength: parsedDescription.thoughtHistoryLength,
        };
      }
    } catch {
      // Not JSON, ignore
    }
  }

  if (typeof resultDisplay === 'string') {
    if (resultDisplay.length > MAXIMUM_RESULT_DISPLAY_CHARACTERS) {
      // Truncate the result display to fit within the available width.
      resultDisplay =
        '...' + resultDisplay.slice(-MAXIMUM_RESULT_DISPLAY_CHARACTERS);
    }
  }
  return (
    <Box paddingX={1} paddingY={0} flexDirection="column">
      <Box minHeight={1}>
        <ToolStatusIndicator status={status} />
        <ToolInfo
          name={name}
          status={status}
          description={description}
          emphasis={emphasis}
        />
        {emphasis === 'high' && <TrailingIndicator />}
      </Box>
      {/* Show thinking display if available */}
      {thinkingDisplayData && (
        <Box paddingLeft={STATUS_INDICATOR_WIDTH} width="100%">
          <Box flexDirection="column">
            <Box flexDirection="row">
              <Text color={Colors.Gray}>└ </Text>
              <Box flexGrow={1}>
                <McpThinkingDisplayRenderer data={thinkingDisplayData} />
              </Box>
            </Box>
          </Box>
        </Box>
      )}
      {/* Show regular resultDisplay if no thinking display */}
      {!thinkingDisplayData && resultDisplay && (
        <Box paddingLeft={STATUS_INDICATOR_WIDTH} width="100%">
          <Box flexDirection="column">
            {typeof resultDisplay === 'string' && renderOutputAsMarkdown && (
              <Text wrap="wrap">
                <Text color={Colors.Gray}>└ </Text>
                {resultDisplay}
              </Text>
            )}
            {typeof resultDisplay === 'string' && !renderOutputAsMarkdown && (
              // 🔧 修复闪屏：只在执行中（Executing）时限制高度，避免撑破布局
              // 执行完成后显示完整内容，不再限制
              availableHeight !== undefined && status === ToolCallStatus.Executing ? (
                <MaxSizedBox maxWidth={childWidth} maxHeight={availableHeight} overflowDirection="top">
                  <Box>
                    <Text wrap="wrap">
                      <Text color={Colors.Gray}>└ </Text>
                      {resultDisplay}
                    </Text>
                  </Box>
                </MaxSizedBox>
              ) : (
                <Text wrap="wrap">
                  <Text color={Colors.Gray}>└ </Text>
                  {resultDisplay}
                </Text>
              )
            )}
            {typeof resultDisplay !== 'string' && (resultDisplay as any).type === 'todo_display' && (
              <Box flexDirection="row">
                <Text color={Colors.Gray}>└ </Text>
                <Box flexGrow={1}>
                  <TodoDisplayRenderer data={resultDisplay as any} />
                </Box>
              </Box>
            )}
            {typeof resultDisplay !== 'string' && (resultDisplay as any).type === 'subagent_display' && (
              <Box flexDirection="row">
                <Text color={Colors.Gray}>└ </Text>
                <Box flexGrow={1}>
                  <SubAgentDisplayRenderer data={resultDisplay as any} />
                </Box>
              </Box>
            )}
            {typeof resultDisplay !== 'string' && (resultDisplay as any).type === 'subagent_update' && (
              <Box flexDirection="row">
                <Text color={Colors.Gray}>└ </Text>
                <Box flexGrow={1}>
                  <SubAgentDisplayRenderer data={(resultDisplay as any).data} />
                </Box>
              </Box>
            )}
            {typeof resultDisplay !== 'string' && (resultDisplay as any).fileDiff && (
              <Box flexDirection="row">
                <Text color={Colors.Gray}>└ </Text>
                <Box flexGrow={1}>
                  {shouldSimplifyDiff ? (
                    renderSimplifiedDiffStats(
                      analyzeDiffStats((resultDisplay as any).fileDiff),
                      (resultDisplay as any).fileName || '未知文件'
                    )
                  ) : (
                    <DiffRenderer
                      diffContent={(resultDisplay as any).fileDiff}
                      filename={(resultDisplay as any).fileName}
                      availableTerminalHeight={availableHeight}
                      terminalWidth={childWidth - 2}
                    />
                  )}
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

type ToolStatusIndicatorProps = {
  status: ToolCallStatus;
};

const ToolStatusIndicator: React.FC<ToolStatusIndicatorProps> = ({
  status,
}) => (
  <Box minWidth={STATUS_INDICATOR_WIDTH}>
    {status === ToolCallStatus.Pending && (
      <Text color={Colors.AccentGreen}>o</Text>
    )}
    {status === ToolCallStatus.Executing && (
      <GeminiRespondingSpinner
        nonRespondingDisplay={'⊷'}
      />
    )}
    {status === ToolCallStatus.SubAgentRunning && (
      <Text color={Colors.AccentBlue}>🤖</Text>
    )}
    {status === ToolCallStatus.Success && (
      <Text color={Colors.AccentGreen}>●</Text>
    )}
    {status === ToolCallStatus.Confirming && (
      <Text color={Colors.AccentYellow}>?</Text>
    )}
    {status === ToolCallStatus.Canceled && (
      <Text color={Colors.AccentYellow} bold>
        -
      </Text>
    )}
    {status === ToolCallStatus.Error && (
      <Text color={Colors.AccentRed} bold>
        x
      </Text>
    )}
  </Box>
);

type ToolInfo = {
  name: string;
  description: string;
  status: ToolCallStatus;
  emphasis: TextEmphasis;
};
const ToolInfo: React.FC<ToolInfo> = ({
  name,
  description,
  status,
  emphasis,
}) => {
  // Special handling for Sequential thinking tool - show summary instead of full thought
  let displayDescription = description;
  const normalizedToolName = name?.toLowerCase().replace(/[_-]/g, '');
  if (normalizedToolName?.includes('sequentialthinking') && description?.includes('thought')) {
    try {
      const parsed = JSON.parse(description);
      if (parsed.thoughtNumber && parsed.totalThoughts) {
        // Show a summary like "Step 1/5" or "步骤 1/5"
        const stepText = isChineseLocale() ? '步骤' : 'Step';
        displayDescription = `${stepText} ${parsed.thoughtNumber}/${parsed.totalThoughts}`;
      }
    } catch {
      // If parsing fails, use original description
    }
  }

  const nameColor = React.useMemo<string>(() => {
    switch (emphasis) {
      case 'high':
        return Colors.Foreground;
      case 'medium':
        return Colors.Foreground;
      case 'low':
        return Colors.Gray;
      default: {
        const exhaustiveCheck: never = emphasis;
        return exhaustiveCheck;
      }
    }
  }, [emphasis]);
  if (normalizedToolName?.includes('sequentialthinking')) {
    console.log('🖼️ [ToolInfo] RENDERING with displayDescription:', displayDescription.substring(0, 100));
  }

  return (
    <Box>
      <Text
        wrap="truncate-end"
        strikethrough={status === ToolCallStatus.Canceled}
      >
        <Text color={nameColor} bold>
          {getLocalizedToolName(name)}
        </Text>{' '}
        <Text color={Colors.Gray}>{displayDescription}</Text>
      </Text>
    </Box>
  );
};

const TrailingIndicator: React.FC = () => (
  <Text color={Colors.Foreground} wrap="truncate">
    {' '}
    ←
  </Text>
);
