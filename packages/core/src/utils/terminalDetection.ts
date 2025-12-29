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
    // Windows 环境检测
    result.shell = detectWindowsShell(env);
    result.terminal = detectWindowsTerminal(env);
  } else if (platform === 'darwin') {
    // macOS 环境检测
    result.shell = detectUnixShell(env);
    result.terminal = detectMacTerminal(env);
  } else {
    // Linux/Unix 环境检测
    result.shell = detectUnixShell(env);
    result.terminal = detectLinuxTerminal(env);
  }

  // 缓存结果
  cachedTerminalInfo = result;
  return result;
}

/**
 * 递归查找进程树中的所有 Shell 进程，返回最顶层的那个
 * @param currentPid 当前进程 PID
 * @param visited 已访问的 PID 集合，防止循环
 * @param depth 递归深度，防止无限递归
 * @param foundShells 已找到的 shell 列表，按深度排序
 * @returns 找到的最顶层 Shell 类型，如果没找到返回 null
 */
function findShellInProcessTree(currentPid: number, visited: Set<number> = new Set(), depth: number = 0, foundShells: Array<{shell: string, pid: number, depth: number}> = []): string | null {
  // 防止无限递归和循环引用
  if (depth > 15 || visited.has(currentPid)) {
    // 如果已经找到shell，返回最顶层的（深度最大的）
    if (foundShells.length > 0) {
      const topShell = foundShells.sort((a, b) => b.depth - a.depth)[0];
      console.log(`[Shell Detection] Returning top-level shell: ${topShell.shell} (PID: ${topShell.pid}, Depth: ${topShell.depth})`);
      return topShell.shell;
    }
    return null;
  }

  visited.add(currentPid);

  try {
    console.log(`[Shell Detection] Checking process PID ${currentPid} (Depth: ${depth})`);

    // 查询当前进程的父进程 PID
    const wmicCommand = `wmic process where "ProcessId=${currentPid}" get ParentProcessId,Name /format:value`;
    const result = execSync(wmicCommand, {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const parentPidMatch = result.match(/ParentProcessId=(\d+)/);
    const processNameMatch = result.match(/Name=([^\r\n]+)/);

    if (!parentPidMatch || !parentPidMatch[1] || !processNameMatch || !processNameMatch[1]) {
      console.log(`[Shell Detection] PID ${currentPid}: Unable to get process info`);
      // Even if current process info fails, check if a shell has been found
      if (foundShells.length > 0) {
        const topShell = foundShells.sort((a, b) => b.depth - a.depth)[0];
        console.log(`[Shell Detection] Returning the highest-level shell found: ${topShell.shell} (PID: ${topShell.pid}, Depth: ${topShell.depth})`);
        return topShell.shell;
      }
      return null;
    }

    const parentPid = parseInt(parentPidMatch[1]);
    const processName = processNameMatch[1].toLowerCase().trim();

    console.log(`[Shell Detection] PID ${currentPid}: ${processName}, Parent PID: ${parentPid}`);

    // 检查当前进程是否是已知的 shell
    let currentShell: string | null = null;
    if (processName.includes('powershell.exe')) {
      currentShell = 'Windows PowerShell';
      console.log(`[Shell Detection] Found PowerShell: ${processName} (PID: ${currentPid}, Depth: ${depth})`);
    } else if (processName.includes('pwsh.exe')) {
      currentShell = 'PowerShell Core';
      console.log(`[Shell Detection] Found PowerShell Core: ${processName} (PID: ${currentPid}, Depth: ${depth})`);
    } else if (processName.includes('cmd.exe')) {
      currentShell = 'Command Prompt (CMD)';
      console.log(`[Shell Detection] Found Command Prompt: ${processName} (PID: ${currentPid}, Depth: ${depth})`);
    } else if (processName.includes('bash.exe')) {
      currentShell = 'Git Bash';
      console.log(`[Shell Detection] Found Git Bash: ${processName} (PID: ${currentPid}, Depth: ${depth})`);
    }

    // 如果找到了shell，添加到列表中
    if (currentShell) {
      foundShells.push({shell: currentShell, pid: currentPid, depth: depth});
      console.log(`[Shell Detection] Collected shell: ${currentShell}, continuing to look for higher-level shells`);
    }

    // 无论是否找到shell，都继续向上查找父进程
    if (parentPid > 0 && parentPid !== currentPid) {
      return findShellInProcessTree(parentPid, visited, depth + 1, foundShells);
    }

    // 已到达进程树顶部，返回最顶层的shell
    if (foundShells.length > 0) {
      const topShell = foundShells.sort((a, b) => b.depth - a.depth)[0];
      console.log(`[Shell Detection] Reached top of process tree, returning top-level shell: ${topShell.shell} (PID: ${topShell.pid}, Depth: ${topShell.depth})`);
      console.log(`[Shell Detection] All found shells:`, foundShells.map(s => `${s.shell}(Depth:${s.depth})`).join(', '));
      return topShell.shell;
    }

    console.log(`[Shell Detection] PID ${currentPid}: Reached top of process tree, no shell found`);
    return null;

  } catch (error) {
    console.log(`[Shell Detection] PID ${currentPid} query failed:`, error instanceof Error ? error.message : String(error));
    // Even if query fails, check if a shell has been found
    if (foundShells.length > 0) {
      const topShell = foundShells.sort((a, b) => b.depth - a.depth)[0];
      console.log(`[Shell Detection] Query failed but returning the highest-level shell found: ${topShell.shell} (PID: ${topShell.pid}, Depth: ${topShell.depth})`);
      return topShell.shell;
    }
    return null;
  }
}

/**
 * 检测 Windows 下的 Shell 类型
 * 使用执行 PowerShell 命令的方式来准确检测
 */
function detectWindowsShell(env: NodeJS.ProcessEnv): string {
  console.log('[Shell Detection] Starting Windows Shell type detection');

  // 首先检查特殊环境
  console.log('[Shell Detection] Checking for special environments...');

  // 检查 Git Bash
  const hasGitBash = env.MSYSTEM || env.MINGW_PREFIX || env.MSYS2_PATH_TYPE;
  console.log('[Shell Detection] Git Bash check:', hasGitBash ? 'Yes' : 'No');
  if (hasGitBash) {
    console.log('[Shell Detection] Detection result: Git Bash (MSYS2)');
    return 'Git Bash (MSYS2)';
  }

  // 检查 WSL（需要更精确的判断）
  const hasWSL = env.WSL_DISTRO_NAME || (env.WSLENV && env.WSL_INTEROP);
  console.log('[Shell Detection] WSL check:', hasWSL ? 'Yes' : 'No');
  console.log('[Shell Detection] - WSL_DISTRO_NAME:', env.WSL_DISTRO_NAME || 'Not present');
  console.log('[Shell Detection] - WSLENV:', env.WSLENV || 'Not present');
  console.log('[Shell Detection] - WSL_INTEROP:', env.WSL_INTEROP || 'Not present');
  if (hasWSL) {
    const result = `WSL (${env.WSL_DISTRO_NAME || 'Unknown Distribution'})`;
    console.log('[Shell Detection] Detection result:', result);
    return result;
  }

  // 检查 Cygwin
  const hasCygwin = !!env.CYGWIN;
  console.log('[Shell Detection] Cygwin check:', hasCygwin ? 'Yes' : 'No');
  if (hasCygwin) {
    console.log('[Shell Detection] Detection result: Cygwin');
    return 'Cygwin';
  }

  // 使用递归进程树信息检测当前 shell
  try {
    console.log('[Shell Detection] Starting recursive process tree check...');

    const shellFromProcessTree = findShellInProcessTree(process.pid);
    if (shellFromProcessTree) {
      console.log('[Shell Detection] Detection result:', shellFromProcessTree, '(from process tree)');
      return shellFromProcessTree;
    }

    console.log('[Shell Detection] No known shell found in process tree, using environment variable detection');
  } catch (error) {
    console.log('[Shell Detection] Process tree detection failed:', error instanceof Error ? error.message : String(error));
    console.log('[Shell Detection] Continuing to environment variable detection');
  }

  // 回退方案：使用环境变量检测
  console.log('[Shell Detection] Using fallback detection scheme...');
  const hasPSModulePath = !!env.PSModulePath;
  console.log('[Shell Detection] PSModulePath exists:', hasPSModulePath);
  console.log('[Shell Detection] PSEdition:', env.PSEdition || 'Not present');

  if (hasPSModulePath) {
    if (env.PSEdition === 'Core') {
      console.log('[Shell Detection] Fallback detection result: PowerShell Core');
      return 'PowerShell Core';
    }
    console.log('[Shell Detection] Fallback detection result: Windows PowerShell');
    return 'Windows PowerShell';
  }

  console.log('[Shell Detection] Final default result: Command Prompt (CMD)');
  return 'Command Prompt (CMD)';
}

/**
 * 检测 Windows 下的终端类型
 */
function detectWindowsTerminal(env: NodeJS.ProcessEnv): string {
  // Windows Terminal
  if (env.WT_SESSION || env.WT_PROFILE_ID) {
    return 'Windows Terminal';
  }

  // VS Code 集成终端
  if (env.VSCODE_PID || env.TERM_PROGRAM === 'vscode') {
    return 'VS Code Integrated Terminal';
  }

  // ConEmu
  if (env.ConEmuPID || env.ConEmuWorkDir) {
    return 'ConEmu';
  }

  // Cmder
  if (env.CMDER_ROOT) {
    return 'Cmder';
  }

  // Hyper Terminal
  if (env.HYPER) {
    return 'Hyper';
  }

  // JetBrains IDE 终端
  if (env.TERMINAL_EMULATOR?.includes('JetBrains')) {
    return 'JetBrains IDE Terminal';
  }

  // 默认
  return 'Windows Console Host';
}

/**
 * 检测 Unix/Linux 下的 Shell 类型
 */
function detectUnixShell(env: NodeJS.ProcessEnv): string {
  const shell = env.SHELL || '';

  if (shell.includes('bash')) {
    return 'Bash';
  } else if (shell.includes('zsh')) {
    return 'Zsh';
  } else if (shell.includes('fish')) {
    return 'Fish';
  } else if (shell.includes('tcsh')) {
    return 'Tcsh';
  } else if (shell.includes('csh')) {
    return 'Csh';
  } else if (shell.includes('sh')) {
    return 'Sh';
  }

  return shell || 'Unknown Shell';
}

/**
 * 检测 macOS 下的终端类型
 */
function detectMacTerminal(env: NodeJS.ProcessEnv): string {
  // iTerm2
  if (env.ITERM_SESSION_ID || env.TERM_PROGRAM === 'iTerm.app') {
    return 'iTerm2';
  }

  // Apple Terminal
  if (env.TERM_PROGRAM === 'Apple_Terminal') {
    return 'Apple Terminal';
  }

  // VS Code
  if (env.VSCODE_PID || env.TERM_PROGRAM === 'vscode') {
    return 'VS Code Integrated Terminal';
  }

  // Hyper
  if (env.HYPER) {
    return 'Hyper';
  }

  // Warp
  if (env.TERM_PROGRAM === 'WarpTerminal') {
    return 'Warp';
  }

  return env.TERM_PROGRAM || 'Unknown Terminal';
}

/**
 * 检测 Linux 下的终端类型
 */
function detectLinuxTerminal(env: NodeJS.ProcessEnv): string {
  // VS Code
  if (env.VSCODE_PID || env.TERM_PROGRAM === 'vscode') {
    return 'VS Code Integrated Terminal';
  }

  // GNOME Terminal
  if (env.GNOME_TERMINAL_SERVICE || env.VTE_VERSION) {
    return 'GNOME Terminal';
  }

  // Konsole
  if (env.KONSOLE_VERSION) {
    return 'Konsole';
  }

  // Terminator
  if (env.TERMINATOR_UUID) {
    return 'Terminator';
  }

  // Tilix
  if (env.TILIX_ID) {
    return 'Tilix';
  }

  // Kitty
  if (env.KITTY_WINDOW_ID) {
    return 'Kitty';
  }

  // Alacritty
  if (env.ALACRITTY_SOCKET) {
    return 'Alacritty';
  }

  return env.TERM || 'Unknown Terminal';
}

/**
 * 格式化终端信息为字符串
 */
export function formatTerminalInfo(info: TerminalInfo): string {
  const parts: string[] = [info.platform];

  if (info.terminal) {
    parts.push(`terminal: ${info.terminal}`);
  }

  if (info.shell) {
    parts.push(`shell: ${info.shell}`);
  }

  if (info.version) {
    parts.push(`version: ${info.version}`);
  }

  return parts.join(', ');
}