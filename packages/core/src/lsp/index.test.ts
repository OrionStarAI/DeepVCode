/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node.js';
import { LSPManager } from './index.js';

function createDuplexTransport() {
  const clientToServer = new PassThrough();
  const serverToClient = new PassThrough();

  const fakeProcess = {
    stdin: clientToServer,
    stdout: serverToClient,
    stderr: new PassThrough(),
  };

  const serverConnection = createMessageConnection(
    new StreamMessageReader(clientToServer),
    new StreamMessageWriter(serverToClient),
  );

  return { fakeProcess, serverConnection };
}

describe('LSPManager robustness', () => {
  let tempRootDir: string;
  let pyFile: string;

  beforeEach(async () => {
    tempRootDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'deepv-lsp-'));
    pyFile = path.join(tempRootDir, 'a.py');
    await fsp.writeFile(pyFile, 'x = 1\n', 'utf8');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (fs.existsSync(tempRootDir)) {
      await fsp.rm(tempRootDir, { recursive: true, force: true });
    }
  });

  it('should not hang forever if a server never responds to a request (timeout)', async () => {
    vi.stubEnv('DEEPV_LSP_REQUEST_TIMEOUT_MS', '50');

    const manager = new LSPManager(tempRootDir);

    const { fakeProcess, serverConnection } = createDuplexTransport();

    // Override servers with a fake .py server.
    (manager as any).servers = [
      {
        id: 'pyright',
        displayName: 'Fake Pyright',
        extensions: ['.py'],
        root: async () => tempRootDir,
        spawn: async () => ({ process: fakeProcess as any }),
      },
    ];

    serverConnection.onRequest('initialize', async () => {
      return { capabilities: {} };
    });

    // Never resolve hover -> simulate server stuck.
    serverConnection.onRequest('textDocument/hover', async () => {
      return await new Promise(() => {
        // intentionally never resolves
      });
    });

    serverConnection.listen();

    const t0 = Date.now();
    const result = await manager.getHover(pyFile, 0, 0);
    const elapsed = Date.now() - t0;

    // The manager should return quickly with no results.
    expect(elapsed).toBeLessThan(1500);
    expect(result).toEqual([]);

    await manager.shutdown();
    serverConnection.dispose();
  });
});
