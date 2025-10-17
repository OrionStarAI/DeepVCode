/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import { Colors } from '../colors.js';
import {
  type OpenFiles,
  type MCPServerConfig,
  getAllMCPServerStatuses,
  MCPServerStatus,
  getMCPDiscoveryState,
  MCPDiscoveryState,
} from 'deepv-code-core';

interface ContextSummaryDisplayProps {
  geminiMdFileCount: number;
  contextFileNames: string[];
  mcpServers?: Record<string, MCPServerConfig>;
  blockedMcpServers?: Array<{ name: string; extensionName: string }>;
  showToolDescriptions?: boolean;
  openFiles?: OpenFiles;
}

export const ContextSummaryDisplay: React.FC<ContextSummaryDisplayProps> = ({
  geminiMdFileCount,
  contextFileNames,
  mcpServers,
  blockedMcpServers,
  showToolDescriptions,
  openFiles,
}) => {
  // 获取实际连接状态
  const allStatuses = getAllMCPServerStatuses();
  const discoveryState = getMCPDiscoveryState();

  // 计算已配置的服务器数量
  const configuredMcpServerCount = Object.keys(mcpServers || {}).length;

  // 计算实际连接成功的服务器数量
  const connectedMcpServerCount = Array.from(allStatuses.entries()).filter(
    ([serverName, status]) =>
      status === MCPServerStatus.CONNECTED &&
      (mcpServers && serverName in mcpServers)
  ).length;

  // 计算正在连接的服务器数量
  const connectingMcpServerCount = Array.from(allStatuses.entries()).filter(
    ([serverName, status]) =>
      status === MCPServerStatus.CONNECTING &&
      (mcpServers && serverName in mcpServers)
  ).length;

  const blockedMcpServerCount = blockedMcpServers?.length || 0;

  if (
    geminiMdFileCount === 0 &&
    configuredMcpServerCount === 0 &&
    blockedMcpServerCount === 0 &&
    (openFiles?.recentOpenFiles?.length ?? 0) === 0
  ) {
    return <Text> </Text>; // Render an empty space to reserve height
  }

  const recentFilesText = (() => {
    const count = openFiles?.recentOpenFiles?.length ?? 0;
    if (count === 0) {
      return '';
    }
    return `${count} recent file${count > 1 ? 's' : ''} (ctrl+e to view)`;
  })();

  const geminiMdText = (() => {
    if (geminiMdFileCount === 0) {
      return '';
    }
    const allNamesTheSame = new Set(contextFileNames).size < 2;
    const name = allNamesTheSame ? contextFileNames[0] : 'context';
    return `${geminiMdFileCount} ${name} file${
      geminiMdFileCount > 1 ? 's' : ''
    }`;
  })();

  const mcpText = (() => {
    if (configuredMcpServerCount === 0 && blockedMcpServerCount === 0) {
      return '';
    }

    const parts = [];
    if (configuredMcpServerCount > 0) {
      // 显示连接状态
      if (discoveryState === MCPDiscoveryState.IN_PROGRESS || connectingMcpServerCount > 0) {
        // 正在连接中
        parts.push(
          `${connectedMcpServerCount}/${configuredMcpServerCount} MCP server${configuredMcpServerCount > 1 ? 's' : ''} (connecting...)`,
        );
      } else if (connectedMcpServerCount === configuredMcpServerCount) {
        // 全部连接成功
        parts.push(
          `${connectedMcpServerCount} MCP server${connectedMcpServerCount > 1 ? 's' : ''}`,
        );
      } else if (connectedMcpServerCount > 0) {
        // 部分连接成功
        parts.push(
          `${connectedMcpServerCount}/${configuredMcpServerCount} MCP server${configuredMcpServerCount > 1 ? 's' : ''}`,
        );
      } else {
        // 全部连接失败
        parts.push(
          `0/${configuredMcpServerCount} MCP server${configuredMcpServerCount > 1 ? 's' : ''} (failed)`,
        );
      }
    }

    if (blockedMcpServerCount > 0) {
      let blockedText = `${blockedMcpServerCount} Blocked`;
      if (configuredMcpServerCount === 0) {
        blockedText += ` MCP server${blockedMcpServerCount > 1 ? 's' : ''}`;
      }
      parts.push(blockedText);
    }
    return parts.join(', ');
  })();

  let summaryText = 'Using: ';
  const summaryParts = [];
  if (recentFilesText) {
    summaryParts.push(recentFilesText);
  }
  if (geminiMdText) {
    summaryParts.push(geminiMdText);
  }
  if (mcpText) {
    summaryParts.push(mcpText);
  }
  summaryText += summaryParts.join(' | ');

  // Add ctrl+t hint when MCP servers are available
  if (mcpServers && Object.keys(mcpServers).length > 0) {
    if (showToolDescriptions) {
      summaryText += ' (ctrl+t to toggle)';
    } else {
      summaryText += ' (ctrl+t to view)';
    }
  }

  return <Text color={Colors.Gray}>{summaryText}</Text>;
};
