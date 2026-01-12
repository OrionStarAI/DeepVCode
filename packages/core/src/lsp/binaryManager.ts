/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { request } from 'undici';
import JSZip from 'jszip';

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

      let asset = release.assets.find((a: any) => {
        if (typeof expectedName === 'string') return a.name === expectedName;
        return expectedName.test(a.name);
      });

      // Fallback: If exact match not found, try platform-arch patterns for common naming schemes
      if (!asset) {
        const platformArch = `${platform}-${arch}`;

        // Build flexible patterns for different repos and platforms
        const fallbackPatterns: RegExp[] = [];

        if (repo === 'rust-analyzer') {
          if (platformArch === 'win32-x64') {
            fallbackPatterns.push(
              /rust-analyzer.*x86_64.*windows.*\.zip/i,
              /rust-analyzer.*x64.*windows.*\.zip/i,
              /rust-analyzer.*msvc.*\.zip/i
            );
          } else if (platformArch === 'win32-arm64') {
            fallbackPatterns.push(/rust-analyzer.*aarch64.*windows.*\.zip/i);
          } else if (platformArch === 'darwin-x64') {
            fallbackPatterns.push(
              /rust-analyzer.*x86_64.*apple-darwin.*\.gz/i,
              /rust-analyzer.*x86_64.*macos.*\.gz/i
            );
          } else if (platformArch === 'darwin-arm64') {
            fallbackPatterns.push(
              /rust-analyzer.*aarch64.*apple-darwin.*\.gz/i,
              /rust-analyzer.*aarch64.*macos.*\.gz/i
            );
          } else if (platformArch === 'linux-x64') {
            fallbackPatterns.push(
              /rust-analyzer.*x86_64.*linux.*\.gz/i,
              /rust-analyzer.*x86_64.*gnu.*\.gz/i
            );
          } else if (platformArch === 'linux-arm64') {
            fallbackPatterns.push(
              /rust-analyzer.*aarch64.*linux.*\.gz/i,
              /rust-analyzer.*aarch64.*gnu.*\.gz/i
            );
          }
        }

        // Try fallback patterns
        if (fallbackPatterns.length > 0) {
          asset = release.assets.find((a: any) =>
            fallbackPatterns.some(p => p.test(a.name))
          );
        }
      }

      if (!asset) {
        // Log available assets for debugging
        const availableAssets = release.assets.map((a: any) => a.name).join(', ');
        throw new Error(`Could not find a suitable binary for ${platform}-${arch} in ${owner}/${repo} releases. Available: ${availableAssets}`);
      }

      console.log(`[LSP] Downloading ${asset.browser_download_url}...`);

      const tempDownloadPath = path.join(destDir, asset.name);

      // 使用 curl 异步下载，非阻塞
      await new Promise<void>((resolve, reject) => {
        const curlBin = process.platform === 'win32' ? 'curl.exe' : 'curl';
        const curlProcess = spawn(curlBin, [
          '-L',                      // follow redirects
          '--fail',                  // fail on HTTP errors
          '--silent',                // no progress meter
          '--show-error',            // show errors
          '-o', tempDownloadPath,    // output file
          asset.browser_download_url
        ]);

        let stderrOutput = '';
        curlProcess.stderr.on('data', (data) => {
          stderrOutput += data.toString();
        });

        curlProcess.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            if (fs.existsSync(tempDownloadPath)) {
              fs.unlinkSync(tempDownloadPath);
            }
            reject(new Error(`[LSP] curl failed with code ${code}: ${stderrOutput}`));
          }
        });

        curlProcess.on('error', (err) => {
          if (fs.existsSync(tempDownloadPath)) {
            fs.unlinkSync(tempDownloadPath);
          }
          reject(new Error(
            `[LSP] Failed to spawn curl: ${err.message}. ` +
            `curl may not be installed or available in PATH. ` +
            `Please install curl and add it to your system PATH.`
          ));
        });
      });

      // 验证文件是否成功下载
      if (!fs.existsSync(tempDownloadPath)) {
        throw new Error(
          `[LSP] Downloaded file not found at ${tempDownloadPath}. curl may have failed silently.`
        );
      }

      const actualSize = fs.statSync(tempDownloadPath).size;
      if (actualSize === 0) {
        fs.unlinkSync(tempDownloadPath);
        throw new Error(
          `[LSP] Downloaded file is empty (0 bytes) for ${asset.name}. ` +
          `The download URL may be invalid or temporarily unavailable. Please retry.`
        );
      }

      console.log(`[LSP] Downloaded ${actualSize} bytes`);

      // 处理压缩文件
      if (asset.name.endsWith('.gz')) {
        console.log(`[LSP] Decompressing ${asset.name}...`);
        const compressedData = fs.readFileSync(tempDownloadPath);
        try {
          const decompressedData = zlib.gunzipSync(compressedData);
          if (decompressedData.length === 0) {
            throw new Error('Decompressed data is empty');
          }
          fs.writeFileSync(binPath, decompressedData);
        } catch (gzError) {
          fs.unlinkSync(tempDownloadPath);
          const errorMsg = gzError instanceof Error ? gzError.message : String(gzError);
          throw new Error(
            `[LSP] Failed to decompress ${asset.name}: ${errorMsg}. ` +
            `The file may be corrupted. Please retry.`
          );
        }
        fs.unlinkSync(tempDownloadPath);
      } else if (asset.name.endsWith('.zip')) {
        console.log(`[LSP] Extracting ${asset.name}...`);
        const zipBuffer = fs.readFileSync(tempDownloadPath);

        // 验证ZIP文件结构完整性
        if (zipBuffer.length < 4) {
          fs.unlinkSync(tempDownloadPath);
          throw new Error(
            `[LSP] ZIP file is too small (${zipBuffer.length} bytes) for ${asset.name}. ` +
            `The download is corrupted. Please retry or check your network connection.`
          );
        }

        // 检查ZIP本地文件头签名 (PK\x03\x04)
        if (zipBuffer[0] !== 0x50 || zipBuffer[1] !== 0x4b || zipBuffer[2] !== 0x03 || zipBuffer[3] !== 0x04) {
          fs.unlinkSync(tempDownloadPath);
          throw new Error(
            `[LSP] ZIP file header is corrupted for ${asset.name}. ` +
            `The download may have been interrupted. Please retry.`
          );
        }

        let zip: JSZip;
        try {
          zip = await JSZip.loadAsync(zipBuffer);
        } catch (zipError) {
          fs.unlinkSync(tempDownloadPath);
          const errorMsg = zipError instanceof Error ? zipError.message : String(zipError);
          throw new Error(
            `[LSP] Failed to parse ZIP file ${asset.name}: ${errorMsg}. ` +
            `The file may be corrupted. Please retry the download.`
          );
        }

        // Heuristic: find an entry whose basename matches the expected binary name.
        // Works for rust-analyzer (rust-analyzer.exe) and clangd (clangd.exe inside bin/).
        const expectedBase = binName.toLowerCase();
        const matchingFiles = Object.values(zip.files)
          .filter((f) => !f.dir)
          .filter((f) => {
            const base = path.posix.basename(f.name).toLowerCase();
            return base === expectedBase;
          })
          // Prefer shorter paths (closer to root).
          .sort((a, b) => a.name.length - b.name.length);

        const target = matchingFiles[0];
        if (!target) {
          throw new Error(
            `Zip archive did not contain expected executable "${binName}" for ${owner}/${repo}.`,
          );
        }

        const data = await target.async('nodebuffer');
        fs.writeFileSync(binPath, data);
        fs.unlinkSync(tempDownloadPath);
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