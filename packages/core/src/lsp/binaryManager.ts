/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { request } from 'undici';

export class BinaryManager {
  private static readonly LSP_DIR = path.join(os.homedir(), '.deepv', 'lsp');

  /**
   * 确保二进制文件可用，如果不存在则调用 installer 下载
   */
  static async ensureBinary(
    id: string,
    installer: (destDir: string) => Promise<string>
  ): Promise<string> {
    const destDir = path.join(this.LSP_DIR, id);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    return await installer(destDir);
  }

  /**
   * NPM 安装器：用于安装基于 Node 的 LSP (typescript, pyright)
   */
  static async npmInstaller(packages: string[], binName: string): Promise<(destDir: string) => Promise<string>> {
    return async (destDir: string) => {
      const binPath = path.join(destDir, 'node_modules', '.bin', binName + (process.platform === 'win32' ? '.cmd' : ''));

      if (fs.existsSync(binPath)) {
        return binPath;
      }

      console.log(`[LSP] Installing ${packages.join(', ')} via npm...`);

      // 创建一个简单的 package.json 确保 npm install 在此目录下工作
      if (!fs.existsSync(path.join(destDir, 'package.json'))) {
        fs.writeFileSync(path.join(destDir, 'package.json'), JSON.stringify({
          name: `deepv-lsp-${binName}`,
          version: '1.0.0',
          private: true
        }));
      }

      await new Promise<void>((resolve, reject) => {
        const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        const child = spawn(npm, ['install', ...packages, '--no-save'], {
          cwd: destDir,
          shell: true,
          stdio: 'inherit'
        });
        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`npm install failed with code ${code}`));
        });
      });

      return binPath;
    };
  }

  /**
   * GitHub 安装器：直接下载预编译二进制 (rust-analyzer)
   */
  static async githubInstaller(owner: string, repo: string, assetNameMapper: (platform: string, arch: string) => string | RegExp): Promise<(destDir: string) => Promise<string>> {
    return async (destDir: string) => {
      const platform = process.platform;
      const arch = process.arch;
      const expectedName = assetNameMapper(platform, arch);
      const binName = repo + (platform === 'win32' ? '.exe' : '');
      const binPath = path.join(destDir, binName);

      if (fs.existsSync(binPath)) {
        return binPath;
      }

      console.log(`[LSP] Downloading ${repo} from GitHub ${owner}/${repo}...`);

      const apiUri = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
      const res = await request(apiUri, {
        headers: { 'User-Agent': 'DeepV-Code-Agent' }
      });
      const release = (await res.body.json()) as any;

      const asset = release.assets.find((a: any) => {
        if (typeof expectedName === 'string') return a.name === expectedName;
        return expectedName.test(a.name);
      });

      if (!asset) {
        throw new Error(`Could not find a suitable binary for ${platform}-${arch} in ${owner}/${repo} releases.`);
      }

      console.log(`[LSP] Downloading ${asset.browser_download_url}...`);
      const downloadRes = await request(asset.browser_download_url);

      const tempDownloadPath = path.join(destDir, asset.name);
      const fileStream = fs.createWriteStream(tempDownloadPath);
      const readable = downloadRes.body as any;
      for await (const chunk of readable) {
        fileStream.write(chunk);
      }
      fileStream.end();

      // 处理压缩文件
      if (asset.name.endsWith('.gz')) {
        console.log(`[LSP] Decompressing ${asset.name}...`);
        const compressedData = fs.readFileSync(tempDownloadPath);
        const decompressedData = zlib.gunzipSync(compressedData);
        fs.writeFileSync(binPath, decompressedData);
        fs.unlinkSync(tempDownloadPath);
      } else if (asset.name.endsWith('.zip')) {
        // TODO: 使用 adm-zip 或其他方式解压 zip
        console.warn(`[LSP] .zip extraction not fully implemented, manually check ${tempDownloadPath}`);
        fs.renameSync(tempDownloadPath, binPath);
      } else {
        fs.renameSync(tempDownloadPath, binPath);
      }

      if (platform !== 'win32') {
        fs.chmodSync(binPath, 0o755);
      }

      return binPath;
    };
  }
}