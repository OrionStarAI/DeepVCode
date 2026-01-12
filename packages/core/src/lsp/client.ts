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
  // 🎯 Windows 兼容性：确保驱动器盘符为小写 (file:///D:/ -> file:///d:/)
  // 注意：部分 LSP（如 Pyright）会在 initialize 过程中立刻发起 workspace/workspaceFolders 请求。
  // 若 normalizeUri 尚未初始化，会触发 TDZ ReferenceError，导致 initialize Promise 永远不 resolve（表现为“卡住”）。
  const normalizeUri = (uri: string) =>
    uri.replace(/^file:\/\/\/([A-Z]):\//, (match, drive) =>
      `file:///${drive.toLowerCase()}:/`,
    );
  const rootUri = normalizeUri(pathToFileURL(input.root).href);

  // 1. 建立基于 Stdio 的连接
  const connection = createMessageConnection(
    new StreamMessageReader(input.server.process.stdout),
    new StreamMessageWriter(input.server.process.stdin),
  );

  // 2. 监听错误和关闭
  connection.onError((e: [Error, any, number | undefined]) => {
    console.error(`[LSP][${input.serverID}] Connection error:`, e[0]);
  });

  connection.onClose(() => {
    console.log(`[LSP][${input.serverID}] Connection closed`);
  });

  // 🎯 注册服务端请求处理器
  // 注意：一些 LSP（尤其是 Pyright）会在初始化或处理首个请求时向 client 发起额外 request。
  // 如果 client 不响应，这些 server 可能会阻塞后续响应，表现为“卡住”。

  // 打印 server stderr（协议数据通常在 stdout；日志通常在 stderr）
  // 仅在开启 DEEPV_LSP_DEBUG 时输出，避免默认刷屏。
  const debug =
    process.env.DEEPV_LSP_DEBUG === '1' ||
    process.env.DEEPV_LSP_DEBUG === 'true';
  if (debug && input.server.process?.stderr) {
    input.server.process.stderr.on('data', (buf: Buffer) => {
      const msg = buf.toString('utf8').trimEnd();
      if (msg) {
        console.log(`[LSP][${input.serverID}][stderr] ${msg}`);
      }
    });
  }

  // 处理 workspace/configuration 请求，返回空配置
  connection.onRequest('workspace/configuration', (params: any) => {
    return (params.items || []).map(() => ({}));
  });

  // 处理 client/registerCapability 请求，简单返回成功
  connection.onRequest('client/registerCapability', () => {
    return {};
  });

  // 处理 client/unregisterCapability 请求
  connection.onRequest('client/unregisterCapability', () => {
    return {};
  });

  // 处理 window/workDoneProgress/create 请求（常见于 Pyright / Rust Analyzer 等）
  connection.onRequest('window/workDoneProgress/create', () => {
    return null;
  });

  // 一些 server 会主动请求 refresh（客户端无需处理具体逻辑，返回成功即可）
  connection.onRequest('workspace/semanticTokens/refresh', () => {
    return null;
  });
  connection.onRequest('workspace/inlayHint/refresh', () => {
    return null;
  });
  connection.onRequest('workspace/codeLens/refresh', () => {
    return null;
  });
  connection.onRequest('workspace/diagnostic/refresh', () => {
    return null;
  });

  // 处理 window/showMessageRequest（避免 server 等待用户交互而阻塞）
  connection.onRequest('window/showMessageRequest', (params: any) => {
    const actions = params?.actions;
    if (Array.isArray(actions) && actions.length > 0) {
      return actions[0];
    }
    return null;
  });

  // 处理 workspace/applyEdit（部分 server 会尝试修复/整理 import 等）
  connection.onRequest('workspace/applyEdit', () => {
    return { applied: true };
  });

  // 处理 workspace/workspaceFolders 请求
  connection.onRequest('workspace/workspaceFolders', () => {
    return [
      {
        uri: rootUri,
        name: path.basename(input.root),
      },
    ];
  });

  // 3. 启动监听
  connection.listen();

  // 4. 发送初始化请求 (Capabilities 交涉)
  const initializeParams = {
    processId: process.pid,
    rootUri: rootUri,
    capabilities: {
      window: {
        workDoneProgress: true,
      },
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
            valueSet: [
              1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
              19, 20, 21, 22, 23, 24, 25, 26,
            ],
          },
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
            valueSet: [
              1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
              18, 19, 20, 21, 22, 23, 24, 25, 26,
            ],
          },
        },
      },
    },
    workspaceFolders: [
      {
        uri: rootUri,
        name: path.basename(input.root),
      },
    ],
  };

  const result = (await connection.sendRequest(
    'initialize',
    initializeParams,
  )) as any;
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
