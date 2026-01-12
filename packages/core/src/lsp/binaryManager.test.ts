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
import { Readable } from 'node:stream';
import JSZip from 'jszip';
import { BinaryManager } from './binaryManager.js';

vi.mock('undici', () => ({
  request: vi.fn(),
}));

import { request } from 'undici';
const requestMock = request as unknown as ReturnType<typeof vi.fn>;

describe('BinaryManager.githubInstaller (zip extraction)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'deepv-lsp-bin-'));
    requestMock.mockReset();
  });

  afterEach(async () => {
    if (fs.existsSync(tempDir)) {
      await fsp.rm(tempDir, { recursive: true, force: true });
    }
  });

  it.skip('should extract an executable from a .zip asset when basename matches repo name (Windows rust-analyzer)', async () => {
    // Create a fake rust-analyzer zip containing rust-analyzer.exe
    const zip = new JSZip();
    zip.file('rust-analyzer.exe', Buffer.from('fake-binary', 'utf8'));
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
              },
            ],
          }),
        },
      })
      // download asset
      .mockResolvedValueOnce({
        body: Readable.from([zipBuffer]),
      });

    const installer = await BinaryManager.githubInstaller(
      'rust-lang',
      'rust-analyzer',
      () => 'rust-analyzer-x86_64-pc-windows-msvc.zip',
    );

    const binPath = await installer(tempDir);
    expect(path.basename(binPath).toLowerCase()).toBe(
      process.platform === 'win32' ? 'rust-analyzer.exe' : 'rust-analyzer',
    );
    expect(fs.existsSync(binPath)).toBe(true);
    expect(fs.readFileSync(binPath, 'utf8')).toBe('fake-binary');
  });

  it.skip('should extract an executable from a nested path inside zip (clangd-like)', async () => {
    const zip = new JSZip();
    zip.file('clangd_99.0.0/bin/clangd.exe', Buffer.from('clangd-bin', 'utf8'));
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    requestMock
      .mockResolvedValueOnce({
        body: {
          json: async () => ({
            assets: [
              {
                name: 'clangd-windows-99.0.0.zip',
                browser_download_url: 'https://example.com/clangd.zip',
              },
            ],
          }),
        },
      })
      .mockResolvedValueOnce({
        body: Readable.from([zipBuffer]),
      });

    const installer = await BinaryManager.githubInstaller(
      'clangd',
      'clangd',
      () => 'clangd-windows-99.0.0.zip',
    );

    const binPath = await installer(tempDir);
    expect(path.basename(binPath).toLowerCase()).toBe(
      process.platform === 'win32' ? 'clangd.exe' : 'clangd',
    );
    expect(fs.existsSync(binPath)).toBe(true);
    expect(fs.readFileSync(binPath, 'utf8')).toBe('clangd-bin');
  });
});
