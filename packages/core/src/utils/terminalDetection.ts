/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 检测当前终端环境
 */

import { execSync } from 'child_process';

interface TerminalInfo {
  platform: string;
  shell?: string;
  terminal?: string;
  version?: string;
}

// 缓存检测结果，避免重复检测
let cachedTerminalInfo: TerminalInfo | null = null;

/**
 * 检测当前的终端和Shell环境
 * @returns TerminalInfo 包含平台、Shell、终端类型等信息
 */
export function detectTerminalEnvironment(): TerminalInfo {
  // 如果已经检测过，直接返回缓存结果
  if (cachedTerminalInfo) {
    return cachedTerminalInfo;
  }

  const platform = process.platform;
  const env = process.env;

  const result: TerminalInfo = {
    platform,
  };

  if (platform === 'win32') {
    // Windows 环境检测：仅使用快速的环境变量检测，跳过耗时的进程树扫描
    result.shell = detectWindowsShellFast(env);
    result.terminal = detectWindowsTerminal(env);

    // 🚀 启动异步增强检测，不阻塞当前调用
    setTimeout(() => {
      enhanceWindowsShellAsync(env).catch(() => {});
    }, 2000); // 延迟 2 秒，等界面完全稳定后再跑重型任务

  } else if (platform === 'darwin') {
    // macOS 环境检测
    result.shell = detectUnixShell(env);
    result.terminal = detectMacTerminal(env);
  } else {
    // Linux/Unix 环境检测
    result.shell = detectUnixShell(env);
    result.terminal = detectLinuxTerminal(env);
  }

  // 缓存初步结果
  cachedTerminalInfo = result;
  return result;
}

/**
 * Windows 下的快速 Shell 检测（仅环境变量）
 */
function detectWindowsShellFast(env: NodeJS.ProcessEnv): string {
  // 检查 Git Bash
  if (env.MSYSTEM || env.MINGW_PREFIX || env.MSYS2_PATH_TYPE) {
    return 'Git Bash (MSYS2)';
  }

  // 检查 WSL
  if (env.WSL_DISTRO_NAME || (env.WSLENV && env.WSL_INTEROP)) {
    return `WSL (${env.WSL_DISTRO_NAME || 'Unknown'})`;
  }

  // 检查 PowerShell 环境变量
  if (env.PSModulePath) {
    return env.PSEdition === 'Core' ? 'PowerShell Core' : 'Windows PowerShell';
  }

  return 'Command Prompt (CMD)';
}

/**
 * 异步增强 Windows Shell 检测（使用进程树扫描）
 */
async function enhanceWindowsShellAsync(env: NodeJS.ProcessEnv): Promise<void> {
  try {
    const shellFromTree = await findShellInProcessTreeAsync(process.pid);
    if (shellFromTree && cachedTerminalInfo) {
      cachedTerminalInfo.shell = shellFromTree;
    }
  } catch {
    // 增强失败不影响使用
  }
}

/**
 * 异步版本的进程树 Shell 查找
 */
async function findShellInProcessTreeAsync(
  currentPid: number,
  visited: Set<number> = new Set(),
  depth: number = 0,
  foundShells: Array<{shell: string, pid: number, depth: number}> = []
): Promise<string | null> {
  // 延迟导入以减小包体积影响
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  if (depth > 8 || visited.has(currentPid)) {
    if (foundShells.length > 0) {
      return foundShells.sort((a, b) => b.depth - a.depth)[0].shell;
    }
    return null;
  }

  visited.add(currentPid);

  try {
    // 使用异步 exec
    const wmicCommand = `wmic process where "ProcessId=${currentPid}" get ParentProcessId,Name /format:value`;
    const { stdout: result } = await execAsync(wmicCommand, {
      timeout: 2000,
    });

    const parentPidMatch = result.match(/ParentProcessId=(\d+)/);
    const processNameMatch = result.match(/Name=([^\r\n]+)/);

    if (!parentPidMatch || !processNameMatch) {
      return foundShells.length > 0 ? foundShells.sort((a, b) => b.depth - a.depth)[0].shell : null;
    }

    const parentPid = parseInt(parentPidMatch[1]);
    const processName = processNameMatch[1].toLowerCase().trim();

    let currentShell: string | null = null;
    if (processName.includes('powershell.exe')) currentShell = 'Windows PowerShell';
    else if (processName.includes('pwsh.exe')) currentShell = 'PowerShell Core';
    else if (processName.includes('cmd.exe')) currentShell = 'Command Prompt (CMD)';
    else if (processName.includes('bash.exe')) currentShell = 'Git Bash';

    if (currentShell) {
      foundShells.push({shell: currentShell, pid: currentPid, depth: depth});
    }

    if (parentPid > 0 && parentPid !== currentPid) {
      // 递归异步查找，但每一层都让出事件循环
      await new Promise(resolve => setImmediate(resolve));
      return findShellInProcessTreeAsync(parentPid, visited, depth + 1, foundShells);
    }

    return foundShells.length > 0 ? foundShells.sort((a, b) => b.depth - a.depth)[0].shell : null;
  } catch {
    return foundShells.length > 0 ? foundShells.sort((a, b) => b.depth - a.depth)[0].shell : null;
  }
}

/**
 * 递归查找进程树中的所有 Shell 进程 (保留同步版本以防万一，但不再被 detectTerminalEnvironment 调用)
 */
function findShellInProcessTree(currentPid: number, visited: Set<number> = new Set(), depth: number = 0, foundShells: Array<{shell: string, pid: number, depth: number}> = []): string | null {
  if (depth > 8 || visited.has(currentPid)) {
    if (foundShells.length > 0) {
      const topShell = foundShells.sort((a, b) => b.depth - a.depth)[0];
      return topShell.shell;
    }
    return null;
  }

  visited.add(currentPid);

  try {
    const wmicCommand = `wmic process where "ProcessId=${currentPid}" get ParentProcessId,Name /format:value`;
    const result = execSync(wmicCommand, {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const parentPidMatch = result.match(/ParentProcessId=(\d+)/);
    const processNameMatch = result.match(/Name=([^\r\n]+)/);

    if (!parentPidMatch || !parentPidMatch[1] || !processNameMatch || !processNameMatch[1]) {
      if (foundShells.length > 0) {
        const topShell = foundShells.sort((a, b) => b.depth - a.depth)[0];
        return topShell.shell;
      }
      return null;
    }

    const parentPid = parseInt(parentPidMatch[1]);
    const processName = processNameMatch[1].toLowerCase().trim();

    let currentShell: string | null = null;
    if (processName.includes('powershell.exe')) currentShell = 'Windows PowerShell';
    else if (processName.includes('pwsh.exe')) currentShell = 'PowerShell Core';
    else if (processName.includes('cmd.exe')) currentShell = 'Command Prompt (CMD)';
    else if (processName.includes('bash.exe')) currentShell = 'Git Bash';

    if (currentShell) {
      foundShells.push({shell: currentShell, pid: currentPid, depth: depth});
    }

    if (parentPid > 0 && parentPid !== currentPid) {
      return findShellInProcessTree(parentPid, visited, depth + 1, foundShells);
    }

    if (foundShells.length > 0) {
      const topShell = foundShells.sort((a, b) => b.depth - a.depth)[0];
      return topShell.shell;
    }
    return null;
  } catch (error) {
    if (foundShells.length > 0) {
      const topShell = foundShells.sort((a, b) => b.depth - a.depth)[0];
      return topShell.shell;
    }
    return null;
  }
}

/**
 * 检测 Windows 下的 Shell 类型 (已弃用，改用 detectWindowsShellFast + enhanceWindowsShellAsync)
 */
function detectWindowsShell(env: NodeJS.ProcessEnv): string {
  const hasGitBash = env.MSYSTEM || env.MINGW_PREFIX || env.MSYS2_PATH_TYPE;
  if (hasGitBash) return 'Git Bash (MSYS2)';

  const hasWSL = env.WSL_DISTRO_NAME || (env.WSLENV && env.WSL_INTEROP);
  if (hasWSL) return `WSL (${env.WSL_DISTRO_NAME || 'Unknown Distribution'})`;

  const hasCygwin = !!env.CYGWIN;
  if (hasCygwin) return 'Cygwin';

  try {
    const shellFromProcessTree = findShellInProcessTree(process.pid);
    if (shellFromProcessTree) return shellFromProcessTree;
  } catch (error) {}

  if (env.PSModulePath) {
    if (env.PSEdition === 'Core') return 'PowerShell Core';
    return 'Windows PowerShell';
  }

  return 'Command Prompt (CMD)';
}

/**
 * 检测 Windows 下的终端类型
 */
function detectWindowsTerminal(env: NodeJS.ProcessEnv): string {
  if (env.WT_SESSION || env.WT_PROFILE_ID) return 'Windows Terminal';
  if (env.VSCODE_PID || env.TERM_PROGRAM === 'vscode') return 'VS Code Integrated Terminal';
  if (env.ConEmuPID || env.ConEmuWorkDir) return 'ConEmu';
  if (env.CMDER_ROOT) return 'Cmder';
  if (env.HYPER) return 'Hyper';
  if (env.TERMINAL_EMULATOR?.includes('JetBrains')) return 'JetBrains IDE Terminal';
  return 'Windows Console Host';
}

/**
 * 检测 Unix/Linux 下的 Shell 类型
 */
function detectUnixShell(env: NodeJS.ProcessEnv): string {
  const shell = env.SHELL || '';
  if (shell.includes('bash')) return 'Bash';
  if (shell.includes('zsh')) return 'Zsh';
  if (shell.includes('fish')) return 'Fish';
  if (shell.includes('tcsh')) return 'Tcsh';
  if (shell.includes('csh')) return 'Csh';
  if (shell.includes('sh')) return 'Sh';
  return shell || 'Unknown Shell';
}

/**
 * 检测 macOS 下的终端类型
 */
function detectMacTerminal(env: NodeJS.ProcessEnv): string {
  if (env.ITERM_SESSION_ID || env.TERM_PROGRAM === 'iTerm.app') return 'iTerm2';
  if (env.TERM_PROGRAM === 'Apple_Terminal') return 'Apple Terminal';
  if (env.VSCODE_PID || env.TERM_PROGRAM === 'vscode') return 'VS Code Integrated Terminal';
  if (env.HYPER) return 'Hyper';
  if (env.TERM_PROGRAM === 'WarpTerminal') return 'Warp';
  return env.TERM_PROGRAM || 'Unknown Terminal';
}

/**
 * 检测 Linux 下的终端类型
 */
function detectLinuxTerminal(env: NodeJS.ProcessEnv): string {
  if (env.VSCODE_PID || env.TERM_PROGRAM === 'vscode') return 'VS Code Integrated Terminal';
  if (env.GNOME_TERMINAL_SERVICE || env.VTE_VERSION) return 'GNOME Terminal';
  if (env.KONSOLE_VERSION) return 'Konsole';
  if (env.TERMINATOR_UUID) return 'Terminator';
  if (env.TILIX_ID) return 'Tilix';
  if (env.KITTY_WINDOW_ID) return 'Kitty';
  if (env.ALACRITTY_SOCKET) return 'Alacritty';
  return env.TERM || 'Unknown Terminal';
}

/**
 * 格式化终端信息为字符串
 */
export function formatTerminalInfo(info: TerminalInfo): string {
  const parts: string[] = [info.platform];
  if (info.terminal) parts.push(`terminal: ${info.terminal}`);
  if (info.shell) parts.push(`shell: ${info.shell}`);
  if (info.version) parts.push(`version: ${info.version}`);
  return parts.join(', ');
}
