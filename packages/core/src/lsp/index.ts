/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { LSPClient, LSPServer } from './types.js';
import { createLSPClient, stopLSPClient } from './client.js';
import { DefaultServers } from './server.js';

export class LSPManager {
  private clients: Map<string, LSPClient.Info> = new Map(); // key: serverID + root
  private servers: LSPServer.Info[];
  private projectRoot: string;
  private openedFiles: Set<string> = new Set();

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.servers = DefaultServers(projectRoot);
  }

  /**
   * 获取或创建一个匹配文件的 LSP Client
   */
  async getClientsForFile(file: string): Promise<LSPClient.Info[]> {
    const ext = path.extname(file).toLowerCase();
    const matchingServers = this.servers.filter(s => s.extensions.includes(ext));

    const results: LSPClient.Info[] = [];
    for (const serverInfo of matchingServers) {
      const root = await serverInfo.root(file);
      const key = `${serverInfo.id}:${root}`;

      if (this.clients.has(key)) {
        results.push(this.clients.get(key)!);
      } else {
        try {
          console.log(`[LSP] Starting ${serverInfo.id} for root ${root}`);
          const { process } = await serverInfo.spawn(root);
          const client = await createLSPClient({
            serverID: serverInfo.id,
            server: { process },
            root,
          });
          this.clients.set(key, client);
          results.push(client);
        } catch (e) {
          console.error(`[LSP] Failed to start ${serverInfo.id}:`, e);
        }
      }
    }
    return results;
  }

  /**
   * 确保文档在服务端已打开并同步
   */
  async syncDocument(client: LSPClient.Info, file: string) {
    const uri = pathToFileURL(file).href;
    const key = `${client.serverID}:${uri}`;

    if (!this.openedFiles.has(key)) {
      const content = fs.readFileSync(file, 'utf8');
      await client.connection.sendNotification('textDocument/didOpen', {
        textDocument: {
          uri,
          languageId: this.getLanguageId(file),
          version: 1,
          text: content,
        }
      });
      this.openedFiles.add(key);
    } else {
      // 简单起见，每次调用时同步最新内容（增量更新实现较复杂，先用全量 didChange 或假设已同步）
      // 在生产级实现中，应监听文件修改事件
      const content = fs.readFileSync(file, 'utf8');
      await client.connection.sendNotification('textDocument/didChange', {
        textDocument: { uri, version: Date.now() },
        contentChanges: [{ text: content }]
      });
    }
  }

  private getLanguageId(file: string): string {
    const ext = path.extname(file).toLowerCase();
    switch (ext) {
      case '.ts': case '.tsx': return 'typescript';
      case '.js': case '.jsx': return 'javascript';
      case '.go': return 'go';
      case '.py': return 'python';
      case '.rs': return 'rust';
      default: return 'plaintext';
    }
  }

  async shutdown() {
    for (const client of this.clients.values()) {
      await stopLSPClient(client);
    }
    this.clients.clear();
    this.openedFiles.clear();
  }

  /**
   * 执行 LSP 请求的通用包装
   */
  async run<T>(file: string, task: (client: LSPClient.Info) => Promise<T>): Promise<T[]> {
    const clients = await this.getClientsForFile(file);
    const results = await Promise.all(
      clients.map(async (client) => {
        await this.syncDocument(client, file);
        try {
          return await task(client);
        } catch (err) {
          console.error(`[LSP][${client.serverID}] Request failed:`, err);
          return null;
        }
      })
    );

    const finalResults: T[] = [];
    for (const r of results) {
      if (r !== null) {
        finalResults.push(r as T);
      }
    }
    return finalResults;
  }

  // 具体的 LSP 功能 API

  async getHover(file: string, line: number, character: number) {
    return this.run(file, (client) =>
      client.connection.sendRequest('textDocument/hover', {
        textDocument: { uri: pathToFileURL(file).href },
        position: { line, character }
      })
    );
  }

  async getDefinition(file: string, line: number, character: number) {
    return this.run(file, (client) =>
      client.connection.sendRequest('textDocument/definition', {
        textDocument: { uri: pathToFileURL(file).href },
        position: { line, character }
      })
    );
  }

  async getDiagnostics(file: string) {
    // 诊断通常由服务端主动推送，这里演示如何手动触发（如果支持）或获取缓存
    // 实际实现应监听 'textDocument/publishDiagnostics'
    return [];
  }
}
