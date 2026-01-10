/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
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

  // 🎯 注册服务端请求处理器
  // 处理 workspace/configuration 请求，返回空配置
  connection.onRequest('workspace/configuration', (params: any) => {
    return (params.items || []).map(() => ({}));
  });

  // 处理 client/registerCapability 请求，简单返回成功
  connection.onRequest('client/registerCapability', () => {
    return {};
  });

  // 处理 workspace/workspaceFolders 请求
  connection.onRequest('workspace/workspaceFolders', () => {
    return [
      {
        uri: normalizeUri(pathToFileURL(input.root).href),
        name: path.basename(input.root),
      }
    ];
  });

  // 3. 启动监听
  connection.listen();

  // 🎯 Windows 兼容性：确保驱动器盘符为小写 (file:///D:/ -> file:///d:/)
  // 这对于 tsserver 正确识别项目至关重要
  const normalizeUri = (uri: string) => uri.replace(/^file:\/\/\/([A-Z]):\//, (match, drive) => `file:///${drive.toLowerCase()}:/`);
  const rootUri = normalizeUri(pathToFileURL(input.root).href);

  // 4. 发送初始化请求 (Capabilities 交涉)
  const initializeParams = {
    processId: process.pid,
    rootUri: rootUri,
    capabilities: {
      textDocument: {
        synchronization: {
          dynamicRegistration: true,
          willSave: false,
          willSaveWaitUntil: false,
          didSave: true,
          // 🎯 明确声明支持全量同步
          didChange: 1, // 1 = Full
        },
        hover: { contentFormat: ['markdown', 'plaintext'] },
        definition: { dynamicRegistration: true, linkSupport: true },
        references: { dynamicRegistration: true },
        documentSymbol: {
          dynamicRegistration: true,
          hierarchicalDocumentSymbolSupport: true,
          symbolKind: {
            valueSet: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]
          }
        },
        implementation: { dynamicRegistration: true, linkSupport: true },
        typeDefinition: { dynamicRegistration: true, linkSupport: true },
        diagnostic: { dynamicRegistration: true },
      },
      workspace: {
        workspaceFolders: true,
        configuration: true,
        symbol: {
          dynamicRegistration: true,
          symbolKind: {
            valueSet: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]
          }
        }
      }
    },
    workspaceFolders: [
      {
        uri: rootUri,
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
