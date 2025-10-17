/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { Box } from 'ink';
import { IndividualToolCallDisplay, ToolCallStatus } from '../../types.js';
import { ToolMessage } from './ToolMessage.js';
import { ToolConfirmationMessage } from './ToolConfirmationMessage.js';
import { Colors } from '../../colors.js';
import { Config } from 'deepv-code-core';
import { SHELL_COMMAND_NAME } from '../../constants.js';

interface ToolGroupMessageProps {
  groupId: number;
  toolCalls: IndividualToolCallDisplay[];
  availableTerminalHeight?: number;
  terminalWidth: number;
  config?: Config;
  isFocused?: boolean;
}

// Main component renders the border and maps the tools using ToolMessage
export const ToolGroupMessage: React.FC<ToolGroupMessageProps> = ({
  toolCalls,
  availableTerminalHeight,
  terminalWidth,
  config,
  isFocused = true,
}) => {
  const hasPending = !toolCalls.every(
    (t) => t.status === ToolCallStatus.Success,
  );
  const isShellCommand = toolCalls.some((t) => t.name === SHELL_COMMAND_NAME);
  const borderColor =
    hasPending || isShellCommand ? Colors.AccentYellow : Colors.Gray;

  const staticHeight = /* border */ 2 + /* marginBottom */ 1;
  // This is a bit of a magic number, but it accounts for the border and
  // marginLeft.
  const innerWidth = terminalWidth - 4;

  // 🎯 递归查找需要确认的工具（包括嵌套的subToolCalls）
  const findConfirmingTool = (tools: typeof toolCalls): typeof toolCalls[0] | undefined => {
    for (const tool of tools) {
      if (tool.status === ToolCallStatus.Confirming) {
        return tool;
      }
      // 递归查找子工具调用
      if (tool.subToolCalls && tool.subToolCalls.length > 0) {
        const foundInSub = findConfirmingTool(tool.subToolCalls);
        if (foundInSub) return foundInSub;
      }
    }
    return undefined;
  };

  const toolAwaitingApproval = useMemo(
    () => findConfirmingTool(toolCalls),
    [toolCalls],
  );

  let countToolCallsWithResults = 0;
  for (const tool of toolCalls) {
    if (tool.resultDisplay !== undefined && tool.resultDisplay !== '') {
      countToolCallsWithResults++;
    }
  }
  const countOneLineToolCalls = toolCalls.length - countToolCallsWithResults;
  const availableTerminalHeightPerToolMessage = availableTerminalHeight
    ? Math.max(
        Math.floor(
          (availableTerminalHeight - staticHeight - countOneLineToolCalls) /
            Math.max(1, countToolCallsWithResults),
        ),
        1,
      )
    : undefined;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      /*
        🔧 修复：使用精确宽度计算而不是百分比，确保流式和非流式输出的边框对齐一致
        原先的width="100%"在流式输出时可能导致宽度计算不一致，改为使用明确的像素宽度
      */
      width={terminalWidth - 2} // 精确宽度：总宽度减去marginLeft(1)和右边距(1)
      marginLeft={1}
      borderDimColor={hasPending}
      borderColor={borderColor}
    >
      {toolCalls.map((tool, index) => {
        const isCurrentToolAwaitingApproval = toolAwaitingApproval?.callId === tool.callId;
        return (
          <Box key={tool.callId} flexDirection="column" minHeight={1} marginTop={index > 0 ? 1 : 0}>
            <Box flexDirection="row" alignItems="center">
              <ToolMessage
                callId={tool.callId}
                name={tool.name}
                description={tool.description}
                resultDisplay={tool.resultDisplay}
                status={tool.status}
                confirmationDetails={tool.confirmationDetails}
                availableTerminalHeight={availableTerminalHeightPerToolMessage}
                terminalWidth={innerWidth}
                emphasis={
                  isCurrentToolAwaitingApproval
                    ? 'high'
                    : toolAwaitingApproval
                      ? 'low'
                      : 'medium'
                }
                renderOutputAsMarkdown={tool.renderOutputAsMarkdown}
                forceMarkdown={tool.forceMarkdown}
              />
            </Box>
          </Box>
        );
      })}

      {/* 🎯 全局确认框 - 显示在底部，处理任意层级的确认 */}
      {toolAwaitingApproval && toolAwaitingApproval.confirmationDetails && (
        <Box marginTop={1}>
          <ToolConfirmationMessage
            confirmationDetails={toolAwaitingApproval.confirmationDetails}
            config={config}
            isFocused={isFocused}
            availableTerminalHeight={availableTerminalHeightPerToolMessage}
            terminalWidth={innerWidth}
            showTitle={
              // 🎯 判断是否为子Agent工具：检查是否在某个工具的subToolCalls中
              toolCalls.some(tool =>
                tool.subToolCalls?.some(subTool =>
                  subTool.callId === toolAwaitingApproval.callId
                )
              )
            }
          />
        </Box>
      )}
    </Box>
  );
};
