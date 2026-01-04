/**
 * @license
 * Copyright 2025 Google LLC
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
    const bin = await BinaryManager.ensureBinary('rust-analyzer',
      await BinaryManager.githubInstaller('rust-lang', 'rust-analyzer', (platform, arch) => {
        const p = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'apple-darwin' : 'unknown-linux-gnu';
        const a = arch === 'x64' ? 'x86_64' : 'aarch64';
        // e.g. rust-analyzer-x86_64-pc-windows-msvc.zip or similar
        // actually they are just binaries: rust-analyzer-x86_64-pc-windows-msvc.gz
        const nameMap: Record<string, string> = {
          'win32-x64': 'rust-analyzer-x86_64-pc-windows-msvc.gz',
          'darwin-x64': 'rust-analyzer-x86_64-apple-darwin.gz',
          'darwin-arm64': 'rust-analyzer-aarch64-apple-darwin.gz',
          'linux-x64': 'rust-analyzer-x86_64-unknown-linux-gnu.gz',
          'linux-arm64': 'rust-analyzer-aarch64-unknown-linux-gnu.gz',
        };
        return nameMap[`${platform}-${arch}`] || /rust-analyzer-.*gz/;
      })
    );

    // 注意：如果是 .gz 还需要解压，BinaryManager 里的 githubInstaller 还没做解压
    // 简化起见，这里假设下载后就能用，实际需要根据后缀处理
    return {
      process: spawn(bin, [], { cwd: root })
    };
  }
});

export const Gopls = (projectRoot: string): LSPServer.Info => ({
  id: 'gopls',
  displayName: 'Go Language Server',
  extensions: ['.go'],
  root: NearestRoot(['go.mod', 'go.sum'], projectRoot),
  async spawn(root: string) {
    const bin = await BinaryManager.ensureBinary('gopls',
      await BinaryManager.githubInstaller('golang', 'tools', (platform, arch) => {
        // gopls binaries are a bit different, often distributed via 'go install'
        // but for小白 users, we can try to find them or use a precompiled source
        // simplified here to use githubInstaller if available
        return /gopls-.*\.gz/;
      })
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
    const bin = await BinaryManager.ensureBinary('clangd',
      await BinaryManager.githubInstaller('clangd', 'clangd', (platform, arch) => {
        // clangd release names: clangd-windows-18.1.3.zip, clangd-linux-18.1.3.zip, etc.
        const p = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'mac' : 'linux';
        return new RegExp(`clangd-${p}-.*\\.zip`);
      })
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
    // 这里其实一个包里有多个 server，我们简单起见先启动 HTML 的，
    // 实际实现中可能需要根据后缀动态选择启动哪一个子命令
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

