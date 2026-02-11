/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { Suggestion } from '../components/SuggestionsDisplay.js';
import path from 'node:path';
import { homedir } from 'node:os';

const execAsync = promisify(exec);

function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "'\\''");
}

function expandHomeDir(inputPath: string): string {
  if (inputPath === '~') {
    return homedir();
  }
  if (inputPath.startsWith('~/')) {
    return path.join(homedir(), inputPath.slice(2));
  }
  return inputPath;
}

/**
 * 检查是否支持 shell 补全（仅 macOS 和 Linux）
 */
export function isShellCompletionSupported(): boolean {
  return process.platform === 'darwin' || process.platform === 'linux';
}

/**
 * 获取命令补全建议
 */
async function getCommandCompletions(prefix: string): Promise<Suggestion[]> {
  if (!prefix.trim()) return [];

  try {
    const escapedPrefix = escapeSingleQuotes(prefix);
    const { stdout } = await execAsync(
      `bash -lc "compgen -c -- '${escapedPrefix}'" 2>/dev/null`,
      { timeout: 2000 },
    );

    return stdout
      .split('\n')
      .filter((cmd) => cmd.trim())
      .slice(0, 30) // 限制数量
      .map((cmd) => ({
        label: cmd,
        value: cmd,
      }));
  } catch {
    return [];
  }
}

/**
 * 获取文件/目录补全建议
 */
async function getFileCompletions(
  prefix: string,
  cwd: string,
): Promise<Suggestion[]> {
  try {
    // 解析路径：分离目录部分和文件名前缀部分
    const lastSlashIndex = prefix.lastIndexOf('/');
    let searchDir = cwd;
    let filePrefix = prefix;
    let pathPrefix = '';

    if (lastSlashIndex !== -1) {
      const dirPart = prefix.substring(0, lastSlashIndex);
      filePrefix = prefix.substring(lastSlashIndex + 1);
      pathPrefix = dirPart + '/';

      if (prefix.startsWith('/')) {
        // 绝对路径：/user/xxx -> searchDir = "/user"
        searchDir = dirPart;
      } else if (prefix.startsWith('~/')) {
        // 家目录路径：~/Documents/xxx -> searchDir = "<home>/Documents"
        searchDir = expandHomeDir(dirPart);
      } else {
        // 相对路径：src/xxx -> searchDir = "cwd/src"
        searchDir = `${cwd}/${dirPart}`;
      }
    } else {
      // 没有路径分隔符的情况
      if (prefix.startsWith('~')) {
        // 只有 ~ 开头但没有斜杠，例如 "~doc"，在家目录下搜索
        searchDir = expandHomeDir('~');
        filePrefix = prefix.slice(1);
        pathPrefix = '~';
      }
      // 其他情况保持默认（在当前目录搜索）
    }

    const escapedFilePrefix = escapeSingleQuotes(filePrefix);
    const resolvedSearchDir = expandHomeDir(searchDir);
    const escapedSearchDir = escapeSingleQuotes(resolvedSearchDir);

    // 构建 bash 命令，避免未转义路径与非交互执行
    const bashCommand = `bash -lc "cd -- '${escapedSearchDir}' && compgen -f -- '${escapedFilePrefix}' | head -30 | xargs -r -I {} ls -dF {} 2>/dev/null" 2>/dev/null`;

    // 在正确的目录中搜索匹配的文件
    const { stdout } = await execAsync(bashCommand, { timeout: 2000 });

    if (!stdout.trim()) {
      return [];
    }

    const suggestions: Suggestion[] = [];
    const paths = stdout.split('\n').filter((path) => path.trim());

    paths.forEach((path) => {
      const hasSpaces = path.includes(' ');

      if (path.endsWith('/')) {
        // 目录：重新构建完整路径并保持斜杠
        const dirName = path.slice(0, -1); // 移除末尾斜杠
        const fullPath = pathPrefix + dirName + '/';
        suggestions.push({
          label: fullPath,
          value: hasSpaces ? `"${fullPath}"` : fullPath,
        });
      } else {
        // 文件：移除ls -F的类型标记并重新构建完整路径
        const fileName = path.replace(/[*@|=>]$/, '');
        const fullPath = pathPrefix + fileName;
        suggestions.push({
          label: fullPath,
          value: hasSpaces ? `"${fullPath}"` : fullPath,
        });
      }
    });

    // 目录优先排序，然后按字母排序
    return suggestions.sort((a, b) => {
      const aIsDir = a.label.endsWith('/');
      const bIsDir = b.label.endsWith('/');

      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return a.label.localeCompare(b.label);
    });
  } catch {
    return [];
  }
}

/**
 * 获取 shell 模式的补全建议
 */
export async function getShellCompletions(
  input: string,
  cwd: string,
): Promise<Suggestion[]> {
  if (!isShellCompletionSupported() || !input.trim()) {
    return [];
  }

  const trimmed = input.trim();
  const parts = trimmed.split(/\s+/);
  const currentPart = parts[parts.length - 1] || '';

  if (parts.length === 1) {
    // 第一个词：补全命令
    return await getCommandCompletions(currentPart);
  } else {
    // 后续词：补全文件
    return await getFileCompletions(currentPart, cwd);
  }
}
