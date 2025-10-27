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

  // 🔧 修复闪屏问题：Shell命令完全禁用边框
  // 原因：即使在执行完成后，长输出也会导致边框与终端滚动冲突，引发闪烁
  // 解决方案：Shell命令始终不显示边框，保持简洁且避免闪烁
  const shouldShowBorder = !isShellCommand;

  const borderColor =
    hasPending || isShellCommand ? Colors.AccentYellow : Colors.Gray;

  // 根据是否显示边框调整静态高度和内部宽度
  const staticHeight = shouldShowBorder ? (/* border */ 2 + /* marginBottom */ 1) : (/* marginBottom */ 1);
  // 🔧 精确的宽度计算：
  // - marginLeft=1 占用 1 列
  // - 有边框时：边框占用左右各 1 列，Box width 需要是 terminalWidth - marginLeft - 边框宽度
  // - 无边框时：Box width 需要是 terminalWidth - marginLeft
  const boxWidth = shouldShowBorder ? terminalWidth - 1 - 2 : terminalWidth - 1;
  const innerWidth = shouldShowBorder ? terminalWidth - 4 : terminalWidth - 2;

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

  // 🔧 优化：智能分配每个工具消息的高度
  const availableTerminalHeightPerToolMessage = availableTerminalHeight
    ? (() => {
        // 计算可分配的高度
        const allocatableHeight = availableTerminalHeight - staticHeight - countOneLineToolCalls;

        // 平均分配
        const averageHeight = Math.floor(allocatableHeight / Math.max(1, countToolCallsWithResults));

        // 🔧 关键优化：为 Shell 命令设置更合理的高度上限
        // - Shell 命令通常是单个工具调用，避免分配过多高度导致内容稀疏
        // - 限制最大高度为 20 行（对于大部分 shell 输出足够）
        const maxHeightForSingleTool = isShellCommand ? 20 : Math.floor(availableTerminalHeight * 0.8);

        // 返回最终高度：至少 1 行，最多 maxHeightForSingleTool
        return Math.max(Math.min(averageHeight, maxHeightForSingleTool), 1);
      })()
    : undefined;

  return (
    <Box
      flexDirection="column"
      borderStyle={shouldShowBorder ? "round" : undefined}
      /*
        🔧 修复闪屏问题：
        1. 执行中的shell命令禁用边框，避免滚动输出时与终端边界冲突
        2. 使用精确宽度计算，确保流式和非流式输出的对齐一致
        3. boxWidth = terminalWidth - marginLeft(1) - border(0或2)
      */
      width={boxWidth}
      marginLeft={1}
      borderDimColor={shouldShowBorder ? hasPending : undefined}
      borderColor={shouldShowBorder ? borderColor : undefined}
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
