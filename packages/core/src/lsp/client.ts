/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { pathToFileURL } from 'node:url';
import * as path from 'node:path';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node.js';
import { LSPClient, LSPServer } from './types.js';

export async function createLSPClient(input: {
  serverID: string;
  server: { process: any };
  root: string;
}): Promise<LSPClient.Info> {
  // 1. 建立基于 Stdio 的连接
  const connection = createMessageConnection(
    new StreamMessageReader(input.server.process.stdout),
    new StreamMessageWriter(input.server.process.stdin)
  );

  // 2. 监听错误和关闭
  connection.onError((e: [Error, any, number | undefined]) => {
    console.error(`[LSP][${input.serverID}] Connection error:`, e[0]);
  });

  connection.onClose(() => {
    console.log(`[LSP][${input.serverID}] Connection closed`);
  });

  // 3. 启动监听
  connection.listen();

  // 4. 发送初始化请求 (Capabilities 交涉)
  const initializeParams = {
    processId: process.pid,
    rootUri: pathToFileURL(input.root).href,
    capabilities: {
      textDocument: {
        synchronization: {
          dynamicRegistration: true,
          willSave: false,
          willSaveWaitUntil: false,
          didSave: true,
        },
        hover: { contentFormat: ['markdown', 'plaintext'] },
        definition: { dynamicRegistration: true },
        references: { dynamicRegistration: true },
        documentSymbol: { dynamicRegistration: true },
        diagnostic: { dynamicRegistration: true },
      },
      workspace: {
        workspaceFolders: true,
        configuration: true,
      }
    },
    workspaceFolders: [
      {
        uri: pathToFileURL(input.root).href,
        name: path.basename(input.root),
      }
    ]
  };

  const result = await connection.sendRequest('initialize', initializeParams) as any;
  await connection.sendNotification('initialized', {});

  return {
    serverID: input.serverID,
    root: input.root,
    connection,
    capabilities: result.capabilities,
  };
}


export async function stopLSPClient(client: LSPClient.Info) {
  try {
    await client.connection.sendRequest('shutdown');
    await client.connection.sendNotification('exit');
    client.connection.dispose();
  } catch (e) {
    console.error(`[LSP][${client.serverID}] Shutdown error:`, e);
  }
}
