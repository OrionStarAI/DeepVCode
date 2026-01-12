/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
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
  private fileVersions: Map<string, number> = new Map();
  private fileContents: Map<string, string> = new Map();
  private freshClients: Set<string> = new Set(); // 🎯 追踪刚启动的客户端

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
          this.freshClients.add(client.serverID); // 🎯 标记为新客户端
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
    const uri = this.getUri(file);
    const key = `${client.serverID}:${uri}`;
    const content = fs.readFileSync(file, 'utf8');

    if (!this.openedFiles.has(key)) {
      this.fileVersions.set(key, 1);
      this.fileContents.set(key, content);
      await client.connection.sendNotification('textDocument/didOpen', {
        textDocument: {
          uri,
          languageId: this.getLanguageId(file),
          version: 1,
          text: content,
        }
      });
      this.openedFiles.add(key);
      // 🎯 给服务器一点时间解析新打开的文件
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      const oldContent = this.fileContents.get(key);
      if (oldContent === content) {
        return; // 内容未变，无需同步
      }

      const version = (this.fileVersions.get(key) || 1) + 1;
      this.fileVersions.set(key, version);
      this.fileContents.set(key, content);

      await client.connection.sendNotification('textDocument/didChange', {
        textDocument: { uri, version },
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

  /**
   * 🎯 Windows 兼容性：获取规范化的 URI
   */
  private getUri(file: string): string {
    const uri = pathToFileURL(path.resolve(file)).href;
    return uri.replace(/^file:\/\/\/([A-Z]):\//, (match, drive) => `file:///${drive.toLowerCase()}:/`);
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
  async run<T>(
    file: string,
    task: (client: LSPClient.Info) => Promise<T>,
    options?: { timeoutMs?: number; operationName?: string },
  ): Promise<T[]> {
    const debug =
      process.env.DEEPV_LSP_DEBUG === '1' ||
      process.env.DEEPV_LSP_DEBUG === 'true';
    const timeoutMsFromEnv = Number(process.env.DEEPV_LSP_REQUEST_TIMEOUT_MS);
    const timeoutMs =
      options?.timeoutMs ??
      (Number.isFinite(timeoutMsFromEnv) && timeoutMsFromEnv > 0
        ? timeoutMsFromEnv
        : 15_000);
    const operationName = options?.operationName ?? 'request';

    // 🎯 统一路径格式，防止 Windows 大小写问题
    const normalizedFile = path.normalize(file);
    const clients = await this.getClientsForFile(normalizedFile);
    const results = await Promise.all(
      clients.map(async (client) => {
        await this.syncDocument(client, normalizedFile);

        // 🎯 核心策略：给新 Server 基础暖机时间，确保首个请求的成功率
        if (this.freshClients.has(client.serverID)) {
          console.log(`[LSP][${client.serverID}] First request on fresh server, warming up for 3s...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          this.freshClients.delete(client.serverID); // 暖机完成
        }

        try {
          const result = await Promise.race([
            task(client),
            new Promise<never>((_, reject) => {
              const t = setTimeout(() => {
                clearTimeout(t);
                reject(
                  new Error(
                    `[LSP][${client.serverID}] ${operationName} timed out after ${timeoutMs}ms`,
                  ),
                );
              }, timeoutMs);
            }),
          ]);
          return result;
        } catch (err) {
          // 超时/异常都不应该阻塞整个 tool 调用。
          // 对于超时场景，记录必要日志并跳过该 client。
          if (debug) {
            console.error(`[LSP][${client.serverID}] Request failed:`, err);
          } else {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes('timed out after')) {
              console.warn(message);
            } else {
              console.error(`[LSP][${client.serverID}] Request failed:`, message);
            }
          }
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
    return this.run(
      file,
      (client) =>
        client.connection.sendRequest('textDocument/hover', {
          textDocument: { uri: this.getUri(file) },
          position: { line, character },
        }),
      { operationName: 'textDocument/hover' },
    );
  }

  async getDefinition(file: string, line: number, character: number) {
    return this.run(
      file,
      (client) =>
        client.connection.sendRequest('textDocument/definition', {
          textDocument: { uri: this.getUri(file) },
          position: { line, character },
        }),
      { operationName: 'textDocument/definition' },
    );
  }

  async getReferences(file: string, line: number, character: number) {
    return this.run(file, async (client) => {
      const params = {
        textDocument: { uri: this.getUri(file) },
        position: { line, character },
        context: { includeDeclaration: true }
      };
      let result = await client.connection.sendRequest('textDocument/references', params);

      // 🎯 重试逻辑：如果是空结果，可能是索引尚未完成
      if (!result || result.length === 0) {
        console.log(`[LSP][${client.serverID}] No references found, retrying in 3s...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        result = await client.connection.sendRequest('textDocument/references', params);
      }
      return result;
    }, { operationName: 'textDocument/references' });
  }

  async getImplementation(file: string, line: number, character: number) {
    return this.run(file, async (client) => {
      const params = {
        textDocument: { uri: this.getUri(file) },
        position: { line, character }
      };
      let result = await client.connection.sendRequest('textDocument/implementation', params);

      // 🎯 重试逻辑：如果是空结果，可能是索引尚未完成
      if (!result || result.length === 0) {
        console.log(`[LSP][${client.serverID}] No implementation found, retrying in 3s...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        result = await client.connection.sendRequest('textDocument/implementation', params);
      }
      return result;
    }, { operationName: 'textDocument/implementation' });
  }

  async getDocumentSymbols(file: string) {
    return this.run(
      file,
      (client) =>
        client.connection.sendRequest('textDocument/documentSymbol', {
          textDocument: { uri: this.getUri(file) },
        }),
      { operationName: 'textDocument/documentSymbol' },
    );
  }

  async getWorkspaceSymbols(query: string) {
    // Workspace symbols are tricky because we don't have a specific file to determine the client
    // We'll run it on all active clients or pick the first one that supports it

    // 🎯 泛化探测逻辑：支持多种主流语言服务器的自动激活
    if (this.clients.size === 0) {
      console.log('[LSP] No active clients for workspace symbols, probing project...');
      const files = fs.readdirSync(this.projectRoot, { recursive: true }) as string[];

      // 按优先级和常见程度探测
      const probeMap = [
        { ext: '.ts', id: 'typescript-language-server' },
        { ext: '.py', id: 'pyright' },
        { ext: '.go', id: 'gopls' },
        { ext: '.rs', id: 'rust-analyzer' },
        { ext: '.js', id: 'typescript-language-server' }
      ];

      for (const probe of probeMap) {
        const foundFile = files.find(f => f.endsWith(probe.ext) && !f.includes('node_modules') && !f.includes('dist'));
        if (foundFile) {
          console.log(`[LSP] Detected ${probe.ext} project, activating ${probe.id}...`);
          const fullPath = path.join(this.projectRoot, foundFile);
          const clients = await this.getClientsForFile(fullPath);
          for (const client of clients) {
            await this.syncDocument(client, fullPath);
          }
          console.log(`[LSP] Waiting 5s for ${probe.id} indexing...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          break; // 激活一个主语言即可
        }
      }
    }

    const results = [];
    console.log(`[LSP] Searching workspace symbols for "${query}" across ${this.clients.size} clients...`);

    for (const client of this.clients.values()) {
      try {
        // 🎯 泛化重试逻辑：所有具备索引性质的服务器在冷启动时都可能返回空
        let symbols = await client.connection.sendRequest('workspace/symbol', { query });
        if (!symbols || symbols.length === 0) {
          console.log(`[LSP][${client.serverID}] No symbols yet, retrying in 3s...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          symbols = await client.connection.sendRequest('workspace/symbol', { query });
        }

        console.log(`[LSP][${client.serverID}] Found ${symbols?.length || 0} symbols`);
        if (symbols) results.push(symbols);
      } catch (err) {
        console.error(`[LSP][${client.serverID}] Workspace symbols failed:`, err);
      }
    }
    return results;
  }

  async getDiagnostics(file: string) {
    // 诊断通常由服务端主动推送，这里演示如何手动触发（如果支持）或获取缓存
    // 实际实现应监听 'textDocument/publishDiagnostics'
    return [];
  }
}
