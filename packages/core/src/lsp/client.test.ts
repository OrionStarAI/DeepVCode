/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import * as path from 'node:path';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node.js';
import { createLSPClient, stopLSPClient } from './client.js';

type FakeProcess = {
  stdin: PassThrough;
  stdout: PassThrough;
};

function createDuplexTransport(): {
  fakeProcess: FakeProcess;
  serverReader: PassThrough;
  serverWriter: PassThrough;
} {
  // client writes -> server reads
  const clientToServer = new PassThrough();
  // server writes -> client reads
  const serverToClient = new PassThrough();

  return {
    fakeProcess: {
      stdin: clientToServer,
      stdout: serverToClient,
    },
    serverReader: clientToServer,
    serverWriter: serverToClient,
  };
}

async function runHandshakeScenario(input: {
  serverID: string;
  root: string;
  scenario: (serverConnection: any) => Promise<void>;
}) {
  const { fakeProcess, serverReader, serverWriter } = createDuplexTransport();

  const serverConnection = createMessageConnection(
    new StreamMessageReader(serverReader),
    new StreamMessageWriter(serverWriter),
  );

  serverConnection.onRequest('initialize', async () => {
    // Simulate servers like Pyright that request workspaceFolders/configuration during initialize.
    await input.scenario(serverConnection);
    return { capabilities: {} };
  });

  // Basic request handlers a server would implement.
  serverConnection.onRequest('textDocument/hover', async () => {
    return { contents: 'ok' };
  });

  serverConnection.listen();

  const client = await createLSPClient({
    serverID: input.serverID,
    server: { process: fakeProcess as any },
    root: input.root,
  });

  await stopLSPClient(client);
  serverConnection.dispose();
}

describe('LSP createLSPClient handshake robustness', () => {
  it.each([
    ['pyright'],
    ['typescript-language-server'],
    ['rust-analyzer'],
    ['gopls'],
    ['clangd'],
    ['yaml-language-server'],
  ])(
    'should not hang when server requests workspace/workspaceFolders during initialize (%s)',
    async (serverID) => {
      const root = path.resolve(process.cwd());

      await runHandshakeScenario({
        serverID,
        root,
        scenario: async (serverConnection) => {
          const folders = await serverConnection.sendRequest(
            'workspace/workspaceFolders',
            null,
          );

          expect(Array.isArray(folders)).toBe(true);
          expect(folders[0]).toHaveProperty('uri');
          expect(folders[0]).toHaveProperty('name');
        },
      });
    },
    15_000,
  );

  it(
    'should respond to workspace/configuration requests during initialize',
    async () => {
      const root = path.resolve(process.cwd());

      await runHandshakeScenario({
        serverID: 'pyright',
        root,
        scenario: async (serverConnection) => {
          const cfg = await serverConnection.sendRequest(
            'workspace/configuration',
            { items: [{ section: 'python' }] },
          );
          expect(cfg).toEqual([{}]);
        },
      });
    },
    15_000,
  );

  it.each([
    ['pyright'],
    ['typescript-language-server'],
    ['rust-analyzer'],
    ['gopls'],
    ['clangd'],
    ['yaml-language-server'],
  ])(
    'should respond to window/workDoneProgress/create during initialize (%s)',
    async (serverID) => {
      const root = path.resolve(process.cwd());

      await runHandshakeScenario({
        serverID,
        root,
        scenario: async (serverConnection) => {
          const res = await serverConnection.sendRequest(
            'window/workDoneProgress/create',
            { token: 'progress-token' },
          );
          expect(res).toBeNull();
        },
      });
    },
    15_000,
  );

  it(
    'should not deadlock when server requests window/workDoneProgress/create while handling hover (Pyright-like)',
    async () => {
      const { fakeProcess, serverReader, serverWriter } = createDuplexTransport();

      const serverConnection = createMessageConnection(
        new StreamMessageReader(serverReader),
        new StreamMessageWriter(serverWriter),
      );

      serverConnection.onRequest('initialize', async () => {
        return { capabilities: {} };
      });

      serverConnection.onRequest('textDocument/hover', async () => {
        // Server asks client to create progress and waits for response.
        await serverConnection.sendRequest('window/workDoneProgress/create', {
          token: 'hover-progress',
        });
        return { contents: 'hover-ok' };
      });

      serverConnection.listen();

      const root = path.resolve(process.cwd());
      const client = await createLSPClient({
        serverID: 'pyright',
        server: { process: fakeProcess as any },
        root,
      });

      const result = await client.connection.sendRequest('textDocument/hover', {
        textDocument: { uri: 'file:///c:/dummy.py' },
        position: { line: 0, character: 0 },
      });
      expect(result).toEqual({ contents: 'hover-ok' });

      await stopLSPClient(client);
      serverConnection.dispose();
    },
    15_000,
  );
});
