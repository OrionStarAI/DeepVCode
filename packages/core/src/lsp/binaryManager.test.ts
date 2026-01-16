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
import { EventEmitter } from 'node:events';
import JSZip from 'jszip';
import { BinaryManager } from './binaryManager.js';
import { spawn } from 'node:child_process';

// Mock undici request for GitHub API
vi.mock('undici', () => ({
  request: vi.fn(),
}));

// Mock child_process spawn for curl
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

import { request } from 'undici';
const requestMock = request as unknown as ReturnType<typeof vi.fn>;
const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>;

describe('BinaryManager.githubInstaller (zip extraction)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'deepv-lsp-bin-'));
    requestMock.mockReset();
    spawnMock.mockReset();
  });

  afterEach(async () => {
    if (fs.existsSync(tempDir)) {
      await fsp.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should extract an executable from a .zip asset when basename matches repo name (Windows rust-analyzer)', async () => {
    // Create a fake rust-analyzer zip containing rust-analyzer.exe
    const zip = new JSZip();
    const binName = process.platform === 'win32' ? 'rust-analyzer.exe' : 'rust-analyzer';
    zip.file(binName, Buffer.from('fake-binary', 'utf8'));
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    requestMock
      // releases/latest
      .mockResolvedValueOnce({
        body: {
          json: async () => ({
            assets: [
              {
                name: 'rust-analyzer-x86_64-pc-windows-msvc.zip',
                browser_download_url: 'https://example.com/ra.zip',
                size: zipBuffer.length,
              },
            ],
          }),
        },
      });

    // Mock curl execution
    spawnMock.mockImplementation((command, args) => {
      // Create a mock ChildProcess
      const cp = new EventEmitter() as any;
      cp.stdout = new EventEmitter();
      cp.stderr = new EventEmitter();

      // Simulate download by writing the file
      // args: ['-L', '--fail', '-o', tempDownloadPath, url]
      const outputPath = args[args.indexOf('-o') + 1];
      fs.writeFileSync(outputPath, zipBuffer);

      // Finish successfully next tick
      setTimeout(() => {
        cp.emit('close', 0);
      }, 10);

      return cp;
    });

    const installer = await BinaryManager.githubInstaller(
      'rust-lang',
      'rust-analyzer',
      () => 'rust-analyzer-x86_64-pc-windows-msvc.zip',
    );

    const binPath = await installer(tempDir);
    expect(path.basename(binPath).toLowerCase()).toBe(binName.toLowerCase());
    expect(fs.existsSync(binPath)).toBe(true);
    expect(fs.readFileSync(binPath, 'utf8')).toBe('fake-binary');
  });

  it('should extract an executable from a nested path inside zip (clangd-like)', async () => {
    const zip = new JSZip();
    const binName = process.platform === 'win32' ? 'clangd.exe' : 'clangd';
    zip.file(`clangd_99.0.0/bin/${binName}`, Buffer.from('clangd-bin', 'utf8'));
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    requestMock
      .mockResolvedValueOnce({
        body: {
          json: async () => ({
            assets: [
              {
                name: 'clangd-windows-99.0.0.zip',
                browser_download_url: 'https://example.com/clangd.zip',
                size: zipBuffer.length,
              },
            ],
          }),
        },
      });

    // Mock curl execution
    spawnMock.mockImplementation((command, args) => {
      const cp = new EventEmitter() as any;
      cp.stdout = new EventEmitter();
      cp.stderr = new EventEmitter();

      const outputPath = args[args.indexOf('-o') + 1];
      fs.writeFileSync(outputPath, zipBuffer);

      setTimeout(() => {
        cp.emit('close', 0);
      }, 10);

      return cp;
    });

    const installer = await BinaryManager.githubInstaller(
      'clangd',
      'clangd',
      () => 'clangd-windows-99.0.0.zip',
    );

    const binPath = await installer(tempDir);
    expect(path.basename(binPath).toLowerCase()).toBe(binName.toLowerCase());
    expect(fs.existsSync(binPath)).toBe(true);
    expect(fs.readFileSync(binPath, 'utf8')).toBe('clangd-bin');
  });
});
