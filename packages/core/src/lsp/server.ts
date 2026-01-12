/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
import { LSPServer } from './types.js';
import { BinaryManager } from './binaryManager.js';

/**
 * 智能根目录探测：向上递归寻找特征文件
 */
export const NearestRoot = (includePatterns: string[], projectRoot: string) => {
  return async (file: string): Promise<string> => {
    // 🎯 Windows 兼容性：规范化路径并转为小写进行比较，防止驱动器盘符大小写不一致导致判断失败
    let current = path.normalize(path.dirname(path.resolve(file)));
    const stop = path.normalize(path.resolve(projectRoot));

    const isInside = (child: string, parent: string) => {
      const c = child.toLowerCase();
      const p = parent.toLowerCase();
      return c.startsWith(p) || c === p;
    };

    while (isInside(current, stop)) {
      for (const pattern of includePatterns) {
        if (fs.existsSync(path.join(current, pattern))) {
          return current;
        }
      }
      const parent = path.normalize(path.dirname(current));
      if (parent === current) break;
      current = parent;
    }
    return stop;
  };
};

/**
 * 语言服务配置定义
 */
export const TypeScriptLSP = (projectRoot: string): LSPServer.Info => ({
  id: 'typescript-language-server',
  displayName: 'TypeScript/JavaScript Language Server',
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  root: NearestRoot(['package.json', 'tsconfig.json', 'jsconfig.json'], projectRoot),
  async spawn(root: string) {
    const bin = await BinaryManager.ensureBinary('typescript-language-server',
      await BinaryManager.npmInstaller(['typescript-language-server', 'typescript'], 'typescript-language-server')
    );

    // 🎯 优化点：显式找到 tsserver.js 的路径，防止 server 启动后找不到 tsserver
    const tsServerPath = path.join(path.dirname(bin), '..', '..', 'typescript', 'lib', 'tsserver.js');
    const args = ['--stdio'];
    if (fs.existsSync(tsServerPath)) {
      args.push('--tsserver-path', tsServerPath);
    }

    return {
      process: spawn(bin, args, { cwd: root, shell: true })
    };
  }
});

export const Pyright = (projectRoot: string): LSPServer.Info => ({
  id: 'pyright',
  displayName: 'Python Language Server',
  extensions: ['.py'],
  root: NearestRoot(['pyproject.toml', 'setup.py', 'requirements.txt', '.git'], projectRoot),
  async spawn(root: string) {
    const bin = await BinaryManager.ensureBinary('pyright',
      await BinaryManager.npmInstaller(['pyright'], 'pyright-langserver')
    );
    return {
      process: spawn(bin, ['--stdio'], { cwd: root, shell: true })
    };
  }
});

export const RustAnalyzer = (projectRoot: string): LSPServer.Info => ({
  id: 'rust-analyzer',
  displayName: 'Rust Language Server',
  extensions: ['.rs'],
  root: NearestRoot(['Cargo.toml'], projectRoot),
  async spawn(root: string) {
    // 🎯 FIX: 正确处理 githubInstaller 的返回值
    // githubInstaller 返回 Promise<Function>，不能直接 await 嵌套
    const platform = process.platform;
    const arch = process.arch;
    console.log(`[LSP] Detecting platform for rust-analyzer: platform=${platform}, arch=${arch}`);

    const installer = await BinaryManager.githubInstaller('rust-lang', 'rust-analyzer', (platform, arch) => {
      // 🎯 对应 GitHub release 中实际的文件名
      // Windows: rust-analyzer-x86_64-pc-windows-msvc.zip (不是 .gz!)
      // macOS x64: rust-analyzer-x86_64-apple-darwin.gz
      // macOS ARM64: rust-analyzer-aarch64-apple-darwin.gz
      // Linux x64: rust-analyzer-x86_64-unknown-linux-gnu.gz
      // Linux ARM64: rust-analyzer-aarch64-unknown-linux-gnu.gz

      const nameMap: Record<string, string | RegExp> = {
        'win32-x64': /rust-analyzer.*x86_64.*windows.*\.zip/i,
        'win32-arm64': /rust-analyzer.*aarch64.*windows.*\.zip/i,
        'darwin-x64': /rust-analyzer.*x86_64.*apple-darwin.*\.gz/i,
        'darwin-arm64': /rust-analyzer.*aarch64.*apple-darwin.*\.gz/i,
        'linux-x64': /rust-analyzer.*x86_64.*linux.*\.gz/i,
        'linux-arm64': /rust-analyzer.*aarch64.*linux.*\.gz/i,
      };

      const key = `${platform}-${arch}`;
      const result = nameMap[key] || /rust-analyzer-.*/;
      console.log(`[LSP] Asset matcher for ${key}: ${result instanceof RegExp ? result.source : result}`);
      return result;
    });

    // 等 installer 函数完全准备好后，再调用 ensureBinary
    const bin = await BinaryManager.ensureBinary(
      'rust-analyzer',
      installer,
      { maxRetries: 1 }
    );

    console.log(`[LSP] RustAnalyzer binary path: ${bin}`);
    console.log(`[LSP] RustAnalyzer binary exists: ${fs.existsSync(bin)}`);
    if (fs.existsSync(bin)) {
      const stats = fs.statSync(bin);
      console.log(`[LSP] RustAnalyzer binary stats: size=${stats.size}, isFile=${stats.isFile()}, mode=${(stats.mode & parseInt('777', 8)).toString(8)}`);
    }
    console.log(`[LSP] RustAnalyzer spawning with cwd=${root}, args=[], shell=undefined`);
    const proc = spawn(bin, [], { cwd: root });
    console.log(`[LSP] RustAnalyzer spawn returned: pid=${proc.pid}`);

    proc.on('error', (err) => {
      console.error(`[LSP] RustAnalyzer process error:`, {
        code: (err as any).code,
        errno: (err as any).errno,
        syscall: (err as any).syscall,
        path: (err as any).path,
        message: err.message
      });
    });

    proc.on('exit', (code, signal) => {
      console.log(`[LSP] RustAnalyzer process exited: code=${code}, signal=${signal}`);
    });

    return {
      process: proc
    };
  }
});

export const Gopls = (projectRoot: string): LSPServer.Info => ({
  id: 'gopls',
  displayName: 'Go Language Server',
  extensions: ['.go'],
  root: NearestRoot(['go.mod', 'go.sum'], projectRoot),
  async spawn(root: string) {
    // Prefer user-provided path, then PATH, finally install via Go toolchain.
    // Note: golang/tools GitHub releases often ship no prebuilt assets.
    const envPath = process.env.DEEPV_GOPLS_PATH;
    if (envPath && fs.existsSync(envPath)) {
      return { process: spawn(envPath, [], { cwd: root }) };
    }

    const onPath = BinaryManager.findOnPath('gopls');
    if (onPath) {
      return { process: spawn(onPath, [], { cwd: root }) };
    }

    const bin = await BinaryManager.ensureBinary(
      'gopls',
      await BinaryManager.goInstaller('golang.org/x/tools/gopls', 'gopls'),
      { maxRetries: 1 },
    );

    return {
      process: spawn(bin, [], { cwd: root })
    };
  }
});

export const Clangd = (projectRoot: string): LSPServer.Info => ({
  id: 'clangd',
  displayName: 'C/C++ Language Server',
  extensions: ['.c', '.cpp', '.h', '.hpp', '.cc'],
  root: NearestRoot(['compile_commands.json', 'CMakeLists.txt', '.git'], projectRoot),
  async spawn(root: string) {
    const installer = await BinaryManager.githubInstaller('clangd', 'clangd', (platform, arch) => {
      const p = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'mac' : 'linux';
      return new RegExp(`clangd-${p}-.*\\.zip`);
    });
    const bin = await BinaryManager.ensureBinary(
      'clangd',
      installer,
      { maxRetries: 1 }
    );
    return {
      process: spawn(bin, [], { cwd: root })
    };
  }
});

export const WebLSP = (projectRoot: string): LSPServer.Info => ({
  id: 'vscode-langservers-extracted',
  displayName: 'HTML/CSS/JSON/ESLint Language Server',
  extensions: ['.html', '.css', '.json', '.jsonc'],
  root: async () => projectRoot,
  async spawn(root: string) {
    const bin = await BinaryManager.ensureBinary('vscode-langservers-extracted',
      await BinaryManager.npmInstaller(['vscode-langservers-extracted'], 'vscode-html-language-server')
    );
    return {
      process: spawn(bin, ['--stdio'], { cwd: root, shell: true })
    };
  }
});

export const SqlLSP = (projectRoot: string): LSPServer.Info => ({
  id: 'sql-language-server',
  displayName: 'SQL Language Server',
  extensions: ['.sql'],
  root: async () => projectRoot,
  async spawn(root: string) {
    const bin = await BinaryManager.ensureBinary('sql-language-server',
      await BinaryManager.npmInstaller(['sql-language-server'], 'sql-language-server')
    );
    return {
      process: spawn(bin, ['up', '--method', 'stdio'], { cwd: root, shell: true })
    };
  }
});

export const DockerLSP = (projectRoot: string): LSPServer.Info => ({
  id: 'dockerfile-language-server-nodejs',
  displayName: 'Dockerfile Language Server',
  extensions: ['Dockerfile', '.dockerfile'],
  root: async () => projectRoot,
  async spawn(root: string) {
    const bin = await BinaryManager.ensureBinary('dockerfile-language-server-nodejs',
      await BinaryManager.npmInstaller(['dockerfile-language-server-nodejs'], 'docker-langserver')
    );
    return {
      process: spawn(bin, ['--stdio'], { cwd: root, shell: true })
    };
  }
});

export const YamlLSP = (projectRoot: string): LSPServer.Info => ({
  id: 'yaml-language-server',
  displayName: 'YAML Language Server',
  extensions: ['.yaml', '.yml'],
  root: async () => projectRoot,
  async spawn(root: string) {
    const bin = await BinaryManager.ensureBinary('yaml-language-server',
      await BinaryManager.npmInstaller(['yaml-language-server'], 'yaml-language-server')
    );
    return {
      process: spawn(bin, ['--stdio'], { cwd: root, shell: true })
    };
  }
});

export const DefaultServers = (projectRoot: string): LSPServer.Info[] => [
  TypeScriptLSP(projectRoot),
  Pyright(projectRoot),
  RustAnalyzer(projectRoot),
  Gopls(projectRoot),
  Clangd(projectRoot),
  WebLSP(projectRoot),
  SqlLSP(projectRoot),
  DockerLSP(projectRoot),
  YamlLSP(projectRoot),
];