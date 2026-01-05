/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 跨平台Node.js进程树检测
 * 使用可靠的npm包替代直接的系统命令调用
 */

import { isVSCodeEnvironment, getEnvironmentDetectionDetails } from './environment/index.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

// 缓存已导入的包，避免重复导入开销
let cachedPackages: { pidtree: PidTree } | null | undefined = undefined;

/**
 * 动态导入进程检测包，按需加载以避免启动时的性能损耗
 * 现在主要使用pidtree，pidusage作为可选增强
 */
async function importProcessDetectionPackages(): Promise<{ pidtree: PidTree } | null> {
  if (cachedPackages !== undefined) {
    return cachedPackages;
  }

  try {
    // 动态导入pidtree，这是我们的主要工具
    const pidtree = await import('pidtree').then(m => (m.default || m) as PidTree);

    cachedPackages = { pidtree };
    return cachedPackages;
  } catch (error) {
    // 如果包不可用，回退到系统命令
    console.info('[Process Detection] pidtree unavailable');
    cachedPackages = null;
    return null;
  }
}

/**
 * 使用混合策略获取Node.js进程树：pidtree+pidusage+系统命令
 * 充分发挥各工具的优势，提供完整的进程信息
 * @param skipInVSCode 是否在VSCode环境中跳过进程检测（默认true）
 */
export async function getNodeProcessTreeAsync(skipInVSCode: boolean = true): Promise<NodeProcessInfo[]> {
  // 如果在VSCode插件环境中且设置了跳过，则直接返回当前进程信息
  if (skipInVSCode && isVSCodeEnvironment()) {
    const details = getEnvironmentDetectionDetails();
    console.info(
      `[Process Detection] VSCode environment detected (${details.method}), ` +
      'skipping process tree detection to avoid CLI self-termination risks'
    );
    return [await getBasicCurrentProcessInfo()];
  }

  // 🚀 Windows 专属优化路径：直接使用批量获取
  if (process.platform === 'win32') {
    try {
      const cache = await getWindowsProcessInfoMap();
      const nodeProcesses: NodeProcessInfo[] = [];

      // 找出当前进程的所有后代
      const descendants = new Set<number>();
      descendants.add(process.pid);

      // 简单的一遍扫描来寻找后代（适用于层级不深的情况）
      // 为保证准确性，我们循环几次以处理多层嵌套
      for (let i = 0; i < 5; i++) {
        let added = false;
        for (const [pid, info] of cache.entries()) {
          if (!descendants.has(pid) && descendants.has(info.ppid)) {
            descendants.add(pid);
            added = true;
          }
        }
        if (!added) break;
      }

      for (const pid of descendants) {
        const info = cache.get(pid);
        if (info && isNodeJSProcessByDetails(info)) {
          nodeProcesses.push({
            pid,
            ppid: info.ppid,
            name: info.name,
            commandLine: info.commandLine
          });
        }
      }

      if (nodeProcesses.length > 0) return nodeProcesses;
    } catch (error) {
      console.warn('[Process Detection] Windows optimized path failed, falling back:', error);
    }
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
        const details = getEnvironmentDetectionDetails();
        console.warn(
          `[Process Detection] Strategy 1 (pidtree) failed. ` +
          `Environment: ${details.type}. ` +
          `Fallback to Strategy 2 (system commands). ` +
          `Error: ${treeError instanceof Error ? treeError.message : 'Unknown error'}`
        );

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

// Windows 进程信息缓存，用于批量获取以提升性能
let windowsProcessInfoCache: Map<number, {name: string, ppid: number, commandLine: string}> | null = null;
let lastCacheUpdate = 0;
let pendingCachePromise: Promise<Map<number, {name: string, ppid: number, commandLine: string}>> | null = null;

/**
 * 批量获取 Windows 进程信息
 * 使用 wmic 一次性获取所有必要字段，避免多次调用 execSync
 */
async function getWindowsProcessInfoMap(): Promise<Map<number, {name: string, ppid: number, commandLine: string}>> {
  const now = Date.now();
  // 缓存 5 秒有效
  if (windowsProcessInfoCache && (now - lastCacheUpdate < 5000)) {
    return windowsProcessInfoCache;
  }

  // 如果已经在获取中，返回同一个 Promise，避免并发启动多个 wmic
  if (pendingCachePromise) {
    return pendingCachePromise;
  }

  pendingCachePromise = (async () => {
    // 🚀 启动优化：稍微延迟执行，避免抢占启动资源
    await new Promise(resolve => setTimeout(resolve, 300));

    const map = new Map<number, {name: string, ppid: number, commandLine: string}>();
    try {
      // wmic process get 字段顺序通常为字母序: CommandLine, Name, ParentProcessId, ProcessId
      // 使用 CSV 格式获取，第一列通常是 Node (计算机名)
      const { stdout: result } = await execAsync('wmic process get processid,parentprocessid,name,commandline /format:csv', {
        timeout: 4500,
      });

      // 🚀 性能优化：让出事件循环，避免大文本解析阻塞
      await new Promise(resolve => setImmediate(resolve));

      // 清理可能存在的 BOM 或特殊字符
      const cleanResult = result.replace(/^\uFEFF/, '').replace(/\r/g, '');
      const lines = cleanResult.split('\n');
      let header: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // 如果行数太多，每 100 行让出一次事件循环
        if (i > 0 && i % 100 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }

        const fields = line.split(',');
        // wmic CSV 第一行是表头，或者包含关键字段名
        if (header.length === 0 && (line.toLowerCase().includes('processid') || line.toLowerCase().includes('node'))) {
          header = fields.map(f => f.trim().toLowerCase());
          continue;
        }

        if (header.length === 0) continue;

        const row: any = {};
        header.forEach((name, idx) => {
          if (fields[idx] !== undefined) {
            row[name] = fields[idx].trim();
          }
        });

        const pid = parseInt(row.processid);
        const ppid = parseInt(row.parentprocessid);
        if (!isNaN(pid)) {
          map.set(pid, {
            name: row.name || 'unknown',
            ppid: isNaN(ppid) ? 0 : ppid,
            commandLine: row.commandline || row.name || 'N/A'
          });
        }
      }
      windowsProcessInfoCache = map;
      lastCacheUpdate = Date.now();
    } catch (error) {
      // 如果 wmic 失败，回退到 tasklist (注意 tasklist 没 ppid)
      try {
        const { stdout: result } = await execAsync('tasklist /v /fo csv', {
          timeout: 5000,
        });

        const lines = result.split('\n');
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const fields = line.split('","').map(f => f.replace(/"/g, ''));
          if (fields.length >= 2) {
            const pid = parseInt(fields[1]);
            if (!isNaN(pid)) {
              map.set(pid, {
                name: fields[0] || 'unknown',
                ppid: 0,
                commandLine: fields[8] || fields[0] || 'N/A'
              });
            }
          }
        }
        windowsProcessInfoCache = map;
        lastCacheUpdate = Date.now();
      } catch (fallbackError) {
        // 保持 map 为空，后续逻辑会处理
      }
    } finally {
      pendingCachePromise = null;
    }
    return map;
  })();

  return pendingCachePromise;
}

/**
 * 使用跨平台系统命令获取进程详细信息
 * Windows: tasklist/wmic, Linux/macOS: ps
 */
async function getProcessDetails(pid: number): Promise<{name: string, commandLine: string}> {
  try {
    if (process.platform === 'win32') {
      const cache = await getWindowsProcessInfoMap();
      const info = cache.get(pid);
      if (info) {
        return { name: info.name, commandLine: info.commandLine };
      }

      // 如果缓存中没有，可能是刚启动的进程，单独查询一次
      const { stdout: result } = await execAsync(`tasklist /fi "PID eq ${pid}" /fo csv /v`, {
        timeout: 3000,
      });

      const lines = result.split('\n').filter(line => line.trim());
      if (lines.length >= 2) {
        const dataLine = lines[1];
        const fields = dataLine.split('","').map(field => field.replace(/"/g, ''));
        return {
          name: fields[0] || 'unknown',
          commandLine: fields[8] || fields[0] || 'N/A'
        };
      }
    } else {
      // Linux/macOS: 使用ps获取进程名和命令行
      // 在macOS上使用command=而不是cmd=
      const psCommand = process.platform === 'darwin'
        ? `ps -p ${pid} -o comm=,command=`
        : `ps -p ${pid} -o comm=,cmd=`;
      const { stdout: result } = await execAsync(psCommand, {
        timeout: 3000,
      });

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
    if (process.platform === 'win32') {
      // Windows: 查找所有node.exe进程
      const cache = await getWindowsProcessInfoMap();

      for (const [pid, info] of cache.entries()) {
        if (isNodeJSProcessByDetails(info)) {
          processes.push({
            pid,
            ppid: info.ppid,
            name: info.name,
            commandLine: info.commandLine
          });
        }
      }

      // 如果没有任何结果，至少返回当前进程
      if (processes.length === 0) {
        processes.push({
          pid: process.pid,
          ppid: process.ppid || 0,
          name: 'node.exe',
          commandLine: process.argv.join(' ')
        });
      }
    } else {
      // Linux/macOS: 查找所有node进程
      const { stdout: result } = await execAsync('ps -eo pid,ppid,comm,cmd | grep -i node | grep -v grep', {
        timeout: 5000,
      });

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
  if (skipInVSCode && isVSCodeEnvironment()) {
    const details = getEnvironmentDetectionDetails();
    console.info(
      `[Process Detection] VSCode environment detected (${details.method}), ` +
      'skipping process tree detection to avoid CLI self-termination risks'
    );
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
  const ancestors: number[] = [process.pid];

  try {
    // Windows 优化：直接使用缓存的进程图
    if (process.platform === 'win32') {
      const cache = await getWindowsProcessInfoMap();
      let currentPid = process.pid;
      for (let i = 0; i < 15; i++) {
        const info = cache.get(currentPid);
        if (!info || !info.ppid || info.ppid <= 0 || info.ppid === currentPid || info.ppid === 1) {
          // 尝试获取 immediate ppid 作为最后手段
          if (i === 0 && process.ppid && process.ppid > 0) {
            ancestors.push(process.ppid);
          }
          break;
        }
        if (!ancestors.includes(info.ppid)) {
          ancestors.push(info.ppid);
          currentPid = info.ppid;
        } else {
          break; // 防止死循环
        }
      }
      return ancestors;
    }

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
          const parentPid = processMap.get(currentPid);

          if (!parentPid || parentPid === currentPid || parentPid === 1) {
            // 如果 pidtree 没找着，尝试用系统 ppid
            if (i === 0 && process.ppid && process.ppid > 0) {
              ancestors.push(process.ppid);
            }
            break;
          }

          if (!ancestors.includes(parentPid)) {
            ancestors.push(parentPid);
            currentPid = parentPid;
          } else {
            break;
          }
        }

      } catch (pidtreeError) {
        //console.warn('[Process Ancestors] pidtree failed, using basic fallback:', pidtreeError);
        if (process.ppid && process.ppid > 0) {
          ancestors.push(process.ppid);
        }
      }
    } else {
      // 基础回退：只使用Node.js内置信息
      if (process.ppid && process.ppid > 0) {
        ancestors.push(process.ppid);
      }
    }
  } catch (error) {
    //console.warn('[Process Ancestors] All methods failed:', error);
    if (ancestors.length === 1 && process.ppid && process.ppid > 0) {
      ancestors.push(process.ppid);
    }
  }

  return ancestors;
}