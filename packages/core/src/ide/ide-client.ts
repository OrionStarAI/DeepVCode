/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ideContext, OpenFilesNotificationSchema } from '../ide/ideContext.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) => {
    // 只在开发模式或明确启用调试时才输出
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG || process.env.DEEPV_CODE_DEBUG) {
      console.debug('[DEBUG] [IdeClient]', ...args);
    }
  },
};

export type IDEConnectionState = {
  status: IDEConnectionStatus;
  details?: string;
};

export enum IDEConnectionStatus {
  Connected = 'connected',
  Disconnected = 'disconnected',
  Connecting = 'connecting',
}

/**
 * Manages the connection to and interaction with the IDE server.
 */
export class IdeClient {
  client: Client | undefined = undefined;
  connectionStatus: IDEConnectionStatus = IDEConnectionStatus.Disconnected;

  constructor() {
    this.connectToMcpServer().catch((err) => {
      // 静默处理连接失败，避免抛出异常
      // 常见情况：IDE插件未安装或已卸载
      this.connectionStatus = IDEConnectionStatus.Disconnected;
    });
  }
  getConnectionStatus(): {
    status: IDEConnectionStatus;
    details?: string;
  } {
    let details: string | undefined;
    if (this.connectionStatus === IDEConnectionStatus.Disconnected) {
      if (!process.env['DEEPV_CODE_IDE_SERVER_PORT']) {
        details = 'DEEPV_CODE_IDE_SERVER_PORT environment variable is not set.';
      }
    }
    return {
      status: this.connectionStatus,
      details,
    };
  }

  async connectToMcpServer(): Promise<void> {
    this.connectionStatus = IDEConnectionStatus.Connecting;
    const idePort = process.env['DEEPV_CODE_IDE_SERVER_PORT'];
    if (!idePort) {
      // IDE服务器端口未设置，静默失败
      this.connectionStatus = IDEConnectionStatus.Disconnected;
      return;
    }

    try {
      this.client = new Client({
        name: 'streamable-http-client',
        // TODO(#3487): use the CLI version here.
        version: '1.0.0',
      });
      const transport = new StreamableHTTPClientTransport(
        new URL(`http://localhost:${idePort}/mcp`),
      );
      
      // 先尝试连接，只有成功后才设置处理器
      await this.client.connect(transport);
      
      // 连接成功后设置通知处理器
      this.client.setNotificationHandler(
        OpenFilesNotificationSchema,
        (notification) => {
          ideContext.setOpenFilesContext(notification.params);
        },
      );
      
      this.client.onerror = (error) => {
        // 静默处理运行时错误
        this.connectionStatus = IDEConnectionStatus.Disconnected;
        ideContext.clearOpenFilesContext();
      };
      
      this.client.onclose = () => {
        // 静默处理连接关闭
        this.connectionStatus = IDEConnectionStatus.Disconnected;
        ideContext.clearOpenFilesContext();
      };

      // 只有成功连接并设置所有处理器后才标记为已连接
      this.connectionStatus = IDEConnectionStatus.Connected;
    } catch (error) {
      // 静默处理所有连接错误（包括 ECONNREFUSED, fetch failed 等）
      this.connectionStatus = IDEConnectionStatus.Disconnected;
      
      // 只在调试模式下记录详细错误信息
      if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
        logger.debug('Failed to connect to IDE MCP server:', error);
      }
    }
  }
}
