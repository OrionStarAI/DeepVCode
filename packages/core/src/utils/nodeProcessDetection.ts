/**
 * 跨平台Node.js进程树检测
 * 使用可靠的npm包替代直接的系统命令调用
 */

interface NodeProcessInfo {
  pid: number;
  ppid: number;
  name: string;
  commandLine?: string;
}

// 手动类型定义
interface PidTreeProcess {
  pid: number;
  ppid: number;
}

type PidTree = (pid: number, options?: { advanced?: boolean; root?: boolean }) => Promise<number[] | PidTreeProcess[]>;

/**
 * 动态导入进程检测包，按需加载以避免启动时的性能损耗
 * 现在主要使用pidtree，pidusage作为可选增强
 */
async function importProcessDetectionPackages(): Promise<{ pidtree: PidTree } | null> {
  try {
    // 动态导入pidtree，这是我们的主要工具
    const pidtree = await import('pidtree').then(m => (m.default || m) as PidTree);

    return { pidtree };
  } catch (error) {
    // 如果包不可用，回退到系统命令
    console.info('[Process Detection] pidtree unavailable');
    return null;
  }
}

/**
 * 检测是否运行在VSCode插件环境中
 * 与ripgrepAdapter.ts中的检测逻辑保持一致
 */
function isVSCodePluginEnvironment(): boolean {
  return typeof process !== 'undefined' &&
         (process.env.VSCODE_PID !== undefined ||
          process.env.TERM_PROGRAM === 'vscode');
}

/**
 * 使用混合策略获取Node.js进程树：pidtree+pidusage+系统命令
 * 充分发挥各工具的优势，提供完整的进程信息
 * @param skipInVSCode 是否在VSCode环境中跳过进程检测（默认true）
 */
export async function getNodeProcessTreeAsync(skipInVSCode: boolean = true): Promise<NodeProcessInfo[]> {
  // 如果在VSCode插件环境中且设置了跳过，则直接返回当前进程信息
  if (skipInVSCode && isVSCodePluginEnvironment()) {
    console.info('[Process Detection] VSCode plugin environment detected, skipping process tree detection to avoid CLI self-termination risks');
    return [await getBasicCurrentProcessInfo()];
  }

  const nodeProcesses: NodeProcessInfo[] = [];

  try {
    const packages = await importProcessDetectionPackages();

    if (packages) {
      const { pidtree } = packages;

      // 🚀 策略1: pidtree获取进程树 + 系统命令获取进程名
      try {
        // 首先获取当前进程的子进程树（更精确，避免全系统扫描）
        const processTree = await pidtree(process.pid, { advanced: true, root: true }) as PidTreeProcess[];

        // 并行获取所有进程的详细信息
        const processInfoPromises = processTree.map(async (proc): Promise<NodeProcessInfo | null> => {
          try {
            const processDetails = await getProcessDetails(proc.pid);

            // 判断是否为Node.js进程
            if (isNodeJSProcessByDetails(processDetails)) {
              return {
                pid: proc.pid,
                ppid: proc.ppid,
                name: processDetails.name,
                commandLine: processDetails.commandLine || 'N/A' // 确保不为undefined
              };
            }
          } catch (error) {
            // 单个进程检测失败不影响其他进程
            console.warn(`[Process Detection] Failed to get details for PID ${proc.pid}:`, error);
          }
          return null;
        });

        const results = await Promise.all(processInfoPromises);
        const validProcesses = results.filter((proc): proc is NodeProcessInfo => proc !== null);
        nodeProcesses.push(...validProcesses);

        // 如果没有找到任何Node.js进程，至少添加当前进程
        if (nodeProcesses.length === 0) {
          nodeProcesses.push(await getBasicCurrentProcessInfo());
        }

      } catch (treeError) {
        console.warn('[Process Detection] pidtree failed, using system command fallback:', treeError);

        // 🚀 策略2: 直接使用系统命令查找Node.js进程
        const systemProcesses = await getNodeProcessesBySystemCommand();
        nodeProcesses.push(...systemProcesses);
      }

    } else {
      // 🚀 策略3: 包不可用时，纯系统命令方式
      console.warn('[Process Detection] npm packages unavailable, using system commands');
      const systemProcesses = await getNodeProcessesBySystemCommand();
      nodeProcesses.push(...systemProcesses);
    }

  } catch (error) {
    console.warn('[Node Process Detection] All advanced methods failed:', error);
    // 最后的回退：至少返回当前进程信息
    nodeProcesses.push(await getBasicCurrentProcessInfo());
  }

  // 去重（基于PID）
  const uniqueProcesses = nodeProcesses.filter((proc, index, arr) =>
    arr.findIndex(p => p.pid === proc.pid) === index
  );

  return uniqueProcesses;
}

/**
 * 使用跨平台系统命令获取进程详细信息
 * Windows: tasklist, Linux/macOS: ps
 */
async function getProcessDetails(pid: number): Promise<{name: string, commandLine: string}> {
  try {
    if (process.platform === 'win32') {
      // Windows: 使用tasklist获取进程名和命令行
      const { execSync } = await import('child_process');
      const result = execSync(`tasklist /fi "PID eq ${pid}" /fo csv /v`, {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'pipe']
      }) as string;

      const lines = result.split('\n').filter(line => line.trim());
      if (lines.length >= 2) {
        // CSV格式：imageName,PID,sessionName,sessionNumber,memUsage,status,userName,cpuTime,windowTitle
        const dataLine = lines[1];
        const fields = dataLine.split('","').map(field => field.replace(/"/g, ''));

        return {
          name: fields[0] || 'unknown',
          commandLine: fields[8] || fields[0] || 'N/A' // windowTitle可能包含命令信息
        };
      }
    } else {
      // Linux/macOS: 使用ps获取进程名和命令行
      const { execSync } = await import('child_process');
      // 在macOS上使用command=而不是cmd=
      const psCommand = process.platform === 'darwin'
        ? `ps -p ${pid} -o comm=,command=`
        : `ps -p ${pid} -o comm=,cmd=`;
      const result = execSync(psCommand, {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'pipe']
      }) as string;

      const line = result.trim();
      if (line) {
        const parts = line.split(/\s+/);
        const name = parts[0] || 'unknown';
        const commandLine = line.substring(name.length).trim() || name;

        return { name, commandLine };
      }
    }
  } catch (error) {
    //console.warn(`[Process Details] Failed to get details for PID ${pid}:`, error);
  }

  // 回退信息
  return { name: 'unknown', commandLine: 'N/A' };
}

/**
 * 使用系统命令直接查找所有Node.js进程
 * 当npm包不可用时的完整回退方案
 */
async function getNodeProcessesBySystemCommand(): Promise<NodeProcessInfo[]> {
  const processes: NodeProcessInfo[] = [];

  try {
    const { execSync } = await import('child_process');

    if (process.platform === 'win32') {
      // Windows: 查找所有node.exe进程
      const result = execSync('tasklist /fi "imagename eq node.exe" /fo csv /v', {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      }) as string;

      const lines = result.split('\n').filter(line => line.trim() && !line.startsWith('"Image Name"'));

      for (const line of lines) {
        try {
          const fields = line.split('","').map(field => field.replace(/"/g, ''));
          const pid = parseInt(fields[1]);

          if (pid > 0) {
            // 获取父进程ID（需要额外查询）
            let ppid = 0;
            try {
              const ppidResult = execSync(`wmic process where "ProcessId=${pid}" get ParentProcessId /format:value`, {
                encoding: 'utf8',
                timeout: 2000,
                stdio: ['pipe', 'pipe', 'pipe']
              }) as string;
              const ppidMatch = ppidResult.match(/ParentProcessId=(\d+)/);
              ppid = ppidMatch ? parseInt(ppidMatch[1]) : 0;
            } catch {}

            processes.push({
              pid,
              ppid,
              name: fields[0] || 'node.exe',
              commandLine: fields[8] || fields[0] || 'N/A'
            });
          }
        } catch (parseError) {
          //console.warn('[System Command] Failed to parse line:', line, parseError);
        }
      }
    } else {
      // Linux/macOS: 查找所有node进程
      const result = execSync('ps -eo pid,ppid,comm,cmd | grep -i node | grep -v grep', {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      }) as string;

      const lines = result.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[0]);
          const ppid = parseInt(parts[1]);
          const name = parts[2] || 'node';
          const commandLine = parts.slice(3).join(' ') || name;

          if (pid > 0) {
            processes.push({
              pid,
              ppid,
              name,
              commandLine
            });
          }
        } catch (parseError) {
          //console.warn('[System Command] Failed to parse line:', line, parseError);
        }
      }
    }
  } catch (error) {
    //console.warn('[System Command] Process detection failed:', error);
    // 至少返回当前进程
    processes.push({
      pid: process.pid,
      ppid: process.ppid || 0,
      name: 'node',
      commandLine: process.argv.join(' ')
    });
  }

  return processes;
}

/**
 * 基于进程详细信息判断是否为Node.js进程
 */
function isNodeJSProcessByDetails(details: {name: string, commandLine: string}): boolean {
  const { name, commandLine } = details;

  // 检查进程名
  if (name.toLowerCase().includes('node')) {
    return true;
  }

  // 检查命令行
  if (commandLine.toLowerCase().includes('node') ||
      commandLine.includes(process.execPath) ||
      commandLine.includes('node.exe')) {
    return true;
  }

  return false;
}

// 这些函数已被新的实现替代，保留用于向后兼容

/**
 * @deprecated 使用 isNodeJSProcessByDetails 替代
 */
async function isNodeJSProcess(pid: number): Promise<boolean> {
  try {
    if (pid === process.pid) {
      return true;
    }

    const details = await getProcessDetails(pid);
    return isNodeJSProcessByDetails(details);
  } catch {
    return false;
  }
}

/**
 * @deprecated 使用 getProcessDetails 替代
 */
async function getProcessCommandLine(pid: number): Promise<string | undefined> {
  try {
    if (pid === process.pid) {
      return process.argv.join(' ');
    }

    const details = await getProcessDetails(pid);
    return details.commandLine;
  } catch {
    return undefined;
  }
}

/**
 * 获取当前进程的基础信息作为回退选项
 */
async function getBasicCurrentProcessInfo(): Promise<NodeProcessInfo> {
  return {
    pid: process.pid,
    ppid: process.ppid || 0,
    name: 'node',
    commandLine: process.argv.join(' ')
  };
}

/**
 * 同步版本的getNodeProcessTree，用于向后兼容
 * 注意：这个版本不能使用高级检测功能，建议迁移到异步版本
 * @param skipInVSCode 是否在VSCode环境中跳过进程检测（默认true）
 */
export function getNodeProcessTree(skipInVSCode: boolean = true): NodeProcessInfo[] {
  // 如果在VSCode插件环境中且设置了跳过，则直接返回当前进程信息
  if (skipInVSCode && isVSCodePluginEnvironment()) {
    console.info('[Process Detection] VSCode plugin environment detected, skipping process tree detection to avoid CLI self-termination risks');
    return [{
      pid: process.pid,
      ppid: process.ppid || 0,
      name: 'node',
      commandLine: process.argv.join(' ')
    }];
  }

  // 为了向后兼容，我们提供一个同步的基础实现
  console.warn('[Process Detection] Using synchronous fallback - consider migrating to getNodeProcessTreeAsync() for better detection');

  return [{
    pid: process.pid,
    ppid: process.ppid || 0,
    name: 'node',
    commandLine: process.argv.join(' ')
  }];
}

/**
 * 格式化Node.js进程信息为字符串（异步版本）
 */
export async function formatNodeProcessInfo(processes: NodeProcessInfo[]): Promise<string> {
  if (processes.length === 0) {
    return 'No Node.js processes detected in the current process tree.';
  }

  const processLines = processes.map(proc => {
    const cmdPreview = proc.commandLine ?
      (proc.commandLine.length > 80 ?
        proc.commandLine.substring(0, 80) + '...' :
        proc.commandLine) :
      'N/A';
    return `  - PID: ${proc.pid}, PPID: ${proc.ppid}, Name: ${proc.name}, Command: ${cmdPreview}`;
  }).join('\n');

  // 获取当前进程的完整祖先链
  const ancestors = await getCurrentProcessAncestors();
  const ancestorPids = ancestors.length > 1 ? ancestors.slice(1) : []; // 排除当前进程自身

  let result = `Current Node.js process tree (DO NOT kill these PIDs as they are part of this CLI):\n${processLines}`;

  // 如果有祖先进程，也要告知不能杀掉
  if (ancestorPids.length > 0) {
    const ancestorInfo = ancestorPids.map(pid => `  - PID: ${pid} (Process ancestor in current CLI chain)`).join('\n');
    result += `\n\nCurrent process ancestor chain (DO NOT kill these PIDs as they are part of this CLI):\n${ancestorInfo}`;
  }

  return result;
}

/**
 * 同步版本的formatNodeProcessInfo，用于向后兼容
 * 功能受限，建议使用异步版本
 */
export function formatNodeProcessInfoSync(processes: NodeProcessInfo[]): string {
  if (processes.length === 0) {
    return 'No Node.js processes detected in the current process tree.';
  }

  const processLines = processes.map(proc => {
    const cmdPreview = proc.commandLine ?
      (proc.commandLine.length > 80 ?
        proc.commandLine.substring(0, 80) + '...' :
        proc.commandLine) :
      'N/A';
    return `  - PID: ${proc.pid}, PPID: ${proc.ppid}, Name: ${proc.name}, Command: ${cmdPreview}`;
  }).join('\n');

  // 基础版本：只获取已知的父进程信息
  const ancestorPids = process.ppid ? [process.ppid] : [];

  let result = `Current Node.js process tree (DO NOT kill these PIDs as they are part of this CLI):\n${processLines}`;

  if (ancestorPids.length > 0) {
    const ancestorInfo = ancestorPids.map(pid => `  - PID: ${pid} (Process ancestor in current CLI chain)`).join('\n');
    result += `\n\nCurrent process ancestor chain (DO NOT kill these PIDs as they are part of this CLI):\n${ancestorInfo}`;
  }

  return result;
}

/**
 * 获取当前进程的完整祖先链
 * 使用新的跨平台方法，优雅回退
 */
export async function getCurrentProcessAncestors(): Promise<number[]> {
  const ancestors: number[] = [];

  try {
    const packages = await importProcessDetectionPackages();

    if (packages) {
      const { pidtree } = packages;

      // 使用pidtree获取当前进程的树结构
      try {
        const processTree = await pidtree(process.pid, { advanced: true, root: true }) as PidTreeProcess[];

        // 构建从当前进程到根的路径
        let currentPid = process.pid;
        const processMap = new Map<number, number>(); // pid -> ppid

        for (const proc of processTree) {
          processMap.set(proc.pid, proc.ppid);
        }

        // 向上追溯父进程链
        for (let i = 0; i < 15 && currentPid > 0; i++) {
          ancestors.push(currentPid);
          const parentPid = processMap.get(currentPid);

          if (!parentPid || parentPid === currentPid || parentPid === 1) {
            break;
          }

          currentPid = parentPid;
        }

      } catch (pidtreeError) {
        console.warn('[Process Ancestors] pidtree failed, using basic fallback:', pidtreeError);
        // 只返回当前进程和已知的父进程
        ancestors.push(process.pid);
        if (process.ppid && process.ppid > 0) {
          ancestors.push(process.ppid);
        }
      }
    } else {
      // 基础回退：只使用Node.js内置信息
      ancestors.push(process.pid);
      if (process.ppid && process.ppid > 0) {
        ancestors.push(process.ppid);
      }
    }
  } catch (error) {
    console.warn('[Process Ancestors] All methods failed:', error);
    // 最基础的回退
    ancestors.push(process.pid);
  }

  return ancestors;
}