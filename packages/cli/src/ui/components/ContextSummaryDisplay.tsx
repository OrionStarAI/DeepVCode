/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../colors.js';
import {
  type OpenFiles,
  type MCPServerConfig,
  getAllMCPServerStatuses,
  MCPServerStatus,
  getMCPDiscoveryState,
  MCPDiscoveryState,
} from 'deepv-code-core';
import { t } from '../utils/i18n.js';

// 强制恢复终端标题（MCP 启动时 npx 会覆盖标题）
function forceRestoreTerminalTitle() {
  const title = process.env.CLI_TITLE || '🚀 DeepV Code';
  process.stdout.write(`\x1b]2;${title}\x07`);
}

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

  // 追踪是否曾经处于连接状态，以及是否已恢复标题
  const wasConnectingRef = useRef(false);
  const titleRestoredRef = useRef(false);

  // 当 MCP 从连接中变为非连接中状态时，强制恢复终端标题
  useEffect(() => {
    if (configuredMcpServerCount === 0) {
      return; // 没有配置 MCP，无需处理
    }

    const isConnecting = discoveryState === MCPDiscoveryState.IN_PROGRESS || connectingMcpServerCount > 0;

    if (isConnecting) {
      wasConnectingRef.current = true;
    } else if (wasConnectingRef.current && !titleRestoredRef.current) {
      // 从连接中变为非连接中，恢复标题
      titleRestoredRef.current = true;
      forceRestoreTerminalTitle();
    }
  }, [configuredMcpServerCount, discoveryState, connectingMcpServerCount]);

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
    const fileLabel = count > 1 ? t('context.summary.recent.files') : t('context.summary.recent.file');
    return `${count} ${fileLabel} (${t('context.summary.recent.view')})`;
  })();

  const geminiMdText = (() => {
    if (geminiMdFileCount === 0) {
      return '';
    }
    const fileLabel = geminiMdFileCount > 1 ? t('context.summary.memory.files') : t('context.summary.memory.file');
    return `${geminiMdFileCount} ${fileLabel}`;
  })();

  const mcpText = (() => {
    if (configuredMcpServerCount === 0 && blockedMcpServerCount === 0) {
      return '';
    }

    const parts = [];
    if (configuredMcpServerCount > 0) {
      const serverLabel = configuredMcpServerCount > 1 ? t('context.summary.mcp.servers') : t('context.summary.mcp.server');
      // 显示连接状态
      if (discoveryState === MCPDiscoveryState.IN_PROGRESS || connectingMcpServerCount > 0) {
        // 正在连接中
        parts.push(
          `${connectedMcpServerCount}/${configuredMcpServerCount} ${serverLabel} (${t('context.summary.mcp.connecting')})`,
        );
      } else if (connectedMcpServerCount === configuredMcpServerCount) {
        // 全部连接成功
        parts.push(
          `${connectedMcpServerCount} ${serverLabel}`,
        );
      } else if (connectedMcpServerCount > 0) {
        // 部分连接成功
        parts.push(
          `${connectedMcpServerCount}/${configuredMcpServerCount} ${serverLabel}`,
        );
      } else {
        // 全部连接失败
        parts.push(
          `0/${configuredMcpServerCount} ${serverLabel} (${t('context.summary.mcp.failed')})`,
        );
      }
    }

    if (blockedMcpServerCount > 0) {
      let blockedText = `${blockedMcpServerCount} ${t('context.summary.mcp.blocked')}`;
      if (configuredMcpServerCount === 0) {
        const serverLabel = blockedMcpServerCount > 1 ? t('context.summary.mcp.servers') : t('context.summary.mcp.server');
        blockedText += ` ${serverLabel}`;
      }
      parts.push(blockedText);
    }
    return parts.join(', ');
  })();

  let summaryText = `${t('context.summary.using')}: `;
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
      summaryText += ` (${t('context.summary.mcp.toggle')})`;
    } else {
      summaryText += ` (${t('context.summary.mcp.view')})`;
    }
  }

  return (
    <Box marginLeft={2}>
      <Text color={Colors.Gray}>{summaryText}</Text>
    </Box>
  );
};
