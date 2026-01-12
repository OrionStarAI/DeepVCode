/**
 * @license
 * Copyright 2026 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<any>('node:child_process');
  return {
    ...actual,
    spawn: vi.fn(),
    spawnSync: vi.fn(),
  };
});

import { spawn, spawnSync } from 'node:child_process';
import { BinaryManager } from './binaryManager.js';

const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>;
const spawnSyncMock = spawnSync as unknown as ReturnType<typeof vi.fn>;

describe('BinaryManager.goInstaller', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'deepv-lsp-go-'));
    spawnMock.mockReset();
    spawnSyncMock.mockReset();
  });

  afterEach(async () => {
    if (fs.existsSync(tempDir)) {
      await fsp.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should throw if go is not on PATH', async () => {
    spawnSyncMock.mockReturnValue({ stdout: '' });

    const installer = await BinaryManager.goInstaller('golang.org/x/tools/gopls', 'gopls');
    await expect(installer(tempDir)).rejects.toThrow(/Go toolchain not found in PATH/);
  });

  it.skip('should run go install with GOBIN=destDir and return the expected bin path when file exists', async () => {
    const goExe = process.platform === 'win32' ? 'C:\\Go\\bin\\go.exe' : '/usr/local/go/bin/go';
    spawnSyncMock.mockReturnValue({ stdout: `${goExe}\n` });

    // Simulate go install creating the binary in GOBIN.
    spawnMock.mockImplementation((_cmd: string, _args: string[], opts: any) => {
      expect(opts?.env?.GOBIN).toBe(tempDir);
      // We must not use shell mode here (go.exe path contains spaces on Windows).
      expect(opts?.shell).toBe(false);

      const binPath = path.join(tempDir, 'gopls' + (process.platform === 'win32' ? '.exe' : ''));
      fs.writeFileSync(binPath, 'fake', 'utf8');

      const handlers: Record<string, Function> = {};
      const stdout = { on: vi.fn() };
      const stderr = { on: vi.fn() };

      return {
        stdout,
        stderr,
        on: (evt: string, cb: Function) => {
          handlers[evt] = cb;
          if (evt === 'close') {
            // close after next tick
            setImmediate(() => cb(0));
          }
          return this;
        },
      } as any;
    });

    const installer = await BinaryManager.goInstaller('golang.org/x/tools/gopls', 'gopls');
    const bin = await installer(tempDir);

    expect(path.basename(bin).toLowerCase()).toBe(
      process.platform === 'win32' ? 'gopls.exe' : 'gopls',
    );
    expect(fs.existsSync(bin)).toBe(true);
  });
});
