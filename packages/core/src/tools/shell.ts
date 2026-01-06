/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { Config } from '../config/config.js';
import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolExecuteConfirmationDetails,
  ToolConfirmationOutcome,
  Icon,
} from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';
import stripAnsi from 'strip-ansi';
import {
  getCommandRoots,
  isCommandAllowed,
  stripShellWrapper,
} from '../utils/shell-utils.js';
import { execSync } from 'child_process';
import iconv from 'iconv-lite';
import { t } from '../utils/simpleI18n.js';

export interface ShellToolParams {
  command: string;
  description?: string;
  directory?: string;
}

import { spawn } from 'child_process';
import {
  BackgroundTaskManager,
  getBackgroundTaskManager,
} from '../services/backgroundTaskManager.js';
import { getBackgroundModeSignal } from '../services/backgroundModeSignal.js';
import { summarizeToolOutput } from '../utils/summarizer.js';

const OUTPUT_UPDATE_INTERVAL_MS = 1000;
const OUTPUT_UPDATE_INTERVAL_MS_VSCODE = 100;

// 缓存Windows系统编码信息，避免重复检测
let _windowsEncodingCache: {
  codePage?: string;
  oemCodePage?: string;
  isChineseSystem?: boolean;
  detectedAt?: number;
} = {};

const ENCODING_CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

/**
 * 检测Windows系统的编码信息
 * 使用最稳定的Windows API来获取系统代码页信息
 */
function detectWindowsEncoding(): { codePage: string; oemCodePage: string; isChineseSystem: boolean } {
  const now = Date.now();

  // 检查缓存是否有效
  if (_windowsEncodingCache.detectedAt &&
      (now - _windowsEncodingCache.detectedAt) < ENCODING_CACHE_TTL &&
      _windowsEncodingCache.codePage &&
      _windowsEncodingCache.oemCodePage) {
    return {
      codePage: _windowsEncodingCache.codePage,
      oemCodePage: _windowsEncodingCache.oemCodePage,
      isChineseSystem: _windowsEncodingCache.isChineseSystem || false
    };
  }

  let codePage = 'cp1252'; // 默认西欧编码
  let oemCodePage = 'cp437'; // 默认OEM编码
  let isChineseSystem = false;

  try {
    // 方法1: 使用chcp命令获取当前代码页（最可靠）
    const chcpResult = execSync('chcp', {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).toString().trim();

    // 解析chcp输出，例如: "Active code page: 936"
    const chcpMatch = chcpResult.match(/(\d+)/);
    if (chcpMatch) {
      const pageNumber = chcpMatch[1];
      oemCodePage = `cp${pageNumber}`;

      // 检测是否是中文系统
      if (pageNumber === '936' || pageNumber === '950') {
        isChineseSystem = true;
        codePage = pageNumber === '936' ? 'gbk' : 'big5';
      }
    }
  } catch (error) {
    // chcp失败，尝试其他方法
  }

  try {
    // 方法2: 使用PowerShell获取系统区域设置（备用方法）
    const psScript = 'Get-WinSystemLocale | Select-Object -ExpandProperty Name';
    const localeResult = execSync(`powershell -Command "${psScript}"`, {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).toString().trim();

    if (localeResult.toLowerCase().includes('zh-cn')) {
      isChineseSystem = true;
      codePage = 'gbk';
      oemCodePage = 'cp936';
    } else if (localeResult.toLowerCase().includes('zh-tw') || localeResult.toLowerCase().includes('zh-hk')) {
      isChineseSystem = true;
      codePage = 'big5';
      oemCodePage = 'cp950';
    }
  } catch (error) {
    // PowerShell也失败，使用默认值
  }

  // 缓存结果
  _windowsEncodingCache = {
    codePage,
    oemCodePage,
    isChineseSystem,
    detectedAt: now
  };

  return { codePage, oemCodePage, isChineseSystem };
}

// Core层不再处理命令类型判断，采用统一的UTF-8处理

/**
 * 判断是否是Windows外部exe命令
 * 这些命令通常使用系统默认编码而不是UTF-8
 */
function isWindowsExternalCommand(command: string): boolean {
  if (os.platform() !== 'win32') {
    return false;
  }

  // 提取命令的第一个词（命令名）
  const commandName = command.trim().split(/\s+/)[0].toLowerCase();

  // Windows系统命令列表（这些通常使用系统编码）
  const windowsSystemCommands = new Set([
    'ping', 'ipconfig', 'netstat', 'tasklist', 'dir', 'type', 'find', 'findstr',
    'systeminfo', 'wmic', 'sc', 'net', 'route', 'arp', 'nslookup', 'tracert',
    'chkdsk', 'sfc', 'dism', 'reg', 'attrib', 'xcopy', 'robocopy', 'cipher',
    'diskpart', 'format', 'fsutil', 'icacls', 'takeown', 'whoami', 'gpresult'
  ]);

  // 检查是否是Windows系统命令
  if (windowsSystemCommands.has(commandName)) {
    return true;
  }

  // 检查是否是.exe文件（但不在PATH中的Node.js等程序）
  if (commandName.endsWith('.exe')) {
    // 排除常见的开发工具（这些通常输出UTF-8）
    const utf8Programs = new Set([
      'node.exe', 'npm.exe', 'yarn.exe', 'git.exe', 'code.exe', 'python.exe',
      'java.exe', 'javac.exe', 'mvn.exe', 'gradle.exe', 'docker.exe'
    ]);

    return !utf8Programs.has(commandName);
  }

  return false;
}

/**
 * 智能解码Windows外部命令的输出
 * 根据系统编码自动选择正确的解码方式
 */
function decodeWindowsCommandOutput(buffer: Buffer, command: string): string {
  // 非Windows系统或非外部命令，使用默认UTF-8解码
  if (!isWindowsExternalCommand(command)) {
    return buffer.toString('utf8');
  }

  try {
    // 获取Windows系统编码信息
    const { oemCodePage, isChineseSystem } = detectWindowsEncoding();

    // 首先检测是否是有效的UTF-8
    if (isValidUtf8(buffer)) {
      return buffer.toString('utf8');
    }

    // 如果不是有效UTF-8，尝试使用系统编码解码
    let decoded: string;

    if (isChineseSystem) {
      // 中文系统，尝试GBK/GB2312解码
      try {
        // 使用iconv-lite进行GBK到UTF-8的转换
        if (oemCodePage === 'cp936') {
          decoded = iconv.decode(buffer, 'gbk');
        } else if (oemCodePage === 'cp950') {
          decoded = iconv.decode(buffer, 'big5');
        } else {
          // 默认尝试GBK
          decoded = iconv.decode(buffer, 'gbk');
        }

        // 验证解码结果是否合理
        if (decoded && decoded.length > 0 && !decoded.includes('\uFFFD')) {
          return decoded;
        }
      } catch (error) {
        // GBK解码失败，继续尝试其他方法
      }
    }

    // 尝试使用检测到的OEM代码页
    try {
      const encoding = oemCodePage.replace('cp', 'cp');
      if (iconv.encodingExists(encoding)) {
        decoded = iconv.decode(buffer, encoding);
        if (decoded && decoded.length > 0 && !decoded.includes('\uFFFD')) {
          return decoded;
        }
      }
    } catch (error) {
      // OEM代码页解码失败
    }

    // 最后尝试常见的Windows编码
    const fallbackEncodings = ['cp1252', 'latin1'];
    for (const encoding of fallbackEncodings) {
      try {
        decoded = iconv.decode(buffer, encoding);
        if (decoded && decoded.length > 0) {
          return decoded;
        }
      } catch (error) {
        continue;
      }
    }

    // 所有解码方法都失败，回退到UTF-8
    return buffer.toString('utf8');
  } catch (error) {
    // 解码失败，回退到UTF-8
    return buffer.toString('utf8');
  }
}

/**
 * 检测Buffer是否是有效的UTF-8编码
 */
function isValidUtf8(buffer: Buffer): boolean {
  try {
    const str = buffer.toString('utf8');
    return Buffer.from(str, 'utf8').equals(buffer);
  } catch {
    return false;
  }
}

/**
 * 温和的控制字符过滤版本
 * 1. 保持换行符处理（已验证有效）
 * 2. 添加温和的控制字符过滤，只移除可能破坏界面显示的字符
 */
function sanitizeShellOutput(text: string): string {
  if (!text) return text;

  // 1. 移除ANSI转义序列
  let cleaned = stripAnsi(text);

  // 2. 移除其他可能破坏界面的ESC序列
  cleaned = cleaned.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');  // CSI序列
  cleaned = cleaned.replace(/\x1b\([0-9;]*[a-zA-Z]/g, '');  // 其他ESC序列
  cleaned = cleaned.replace(/\x1b\][0-9;]*[a-zA-Z]/g, '');  // OSC序列

  // 3. 核心修复：将\r转换为\n（已验证有效）
  // 先处理\r\n组合（Windows标准换行）
  cleaned = cleaned.replace(/\r\n/g, '\n');
  // 然后将单独的\r转换为\n
  cleaned = cleaned.replace(/\r/g, '\n');

  // 🔧 减少过滤范围，避免影响实时输出的流式数据
  cleaned = cleaned.replace(/[\x00\x07\x08\x7F]/g, '');

  // 5. 清理多余的连续换行（但保留有意义的空行）
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  return cleaned;
}



const DEFAULT_SHELL_TIMEOUT_MS = 120000; // 120 seconds default timeout

export class ShellTool extends BaseTool<ShellToolParams, ToolResult> {
  static Name: string = 'run_shell_command';
  private allowlist: Set<string> = new Set();

  constructor(private readonly config: Config) {
    super(
      ShellTool.Name,
      'Shell',
      `This tool executes a given shell command as \`bash -c <command>\`. Command can start background processes using \`&\`. Command is executed as a subprocess that leads its own process group. Command process group can be terminated as \`kill -- -PGID\` or signaled as \`kill -s SIGNAL -- -PGID\`.

      The following information is returned:

      Command: Executed command.
      Directory: Directory (relative to project root) where command was executed, or \`(root)\`.
      Stdout: Output on stdout stream. Can be \`(empty)\` or partial on error and for any unwaited background processes.
      Stderr: Output on stderr stream. Can be \`(empty)\` or partial on error and for any unwaited background processes.
      Error: Error or \`(none)\` if no error was reported for the subprocess.
      Exit Code: Exit code or \`(none)\` if terminated by signal.
      Signal: Signal number or \`(none)\` if no signal was received.
      Background PIDs: List of background processes started or \`(none)\`.
      Process Group PGID: Process group started or \`(none)\``,
      Icon.Terminal,
      {
        type: Type.OBJECT,
        properties: {
          command: {
            type: Type.STRING,
            description: 'Exact bash command to execute as `bash -c <command>`',
          },
          description: {
            type: Type.STRING,
            description:
              'Brief description of the command for the user. Be specific and concise. Ideally a single sentence. Can be up to 3 sentences for clarity. No line breaks.',
          },
          directory: {
            type: Type.STRING,
            description:
              '(OPTIONAL) Directory to run the command in, if not the project root directory. Must be relative to the project root directory and must already exist.',
          },
        },
        required: ['command'],
      },
      false, // output is not markdown
      true, // output can be updated
    );
  }

  getDescription(params: ShellToolParams): string {
    let description = `${params.command}`;
    // append optional [in directory]
    // note description is needed even if validation fails due to absolute path
    if (params.directory) {
      description += ` [in ${params.directory}]`;
    }
    // append optional (description), replacing any line breaks with spaces
    if (params.description) {
      description += ` (${params.description.replace(/\n/g, ' ')})`;
    }
    return description;
  }

  validateToolParams(params: ShellToolParams): string | null {
    const commandCheck = isCommandAllowed(params.command, this.config);
    if (!commandCheck.allowed) {
      if (!commandCheck.reason) {
        console.error(
          'Unexpected: isCommandAllowed returned false without a reason',
        );
        return `Command is not allowed: ${params.command}`;
      }
      return commandCheck.reason;
    }
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }
    if (!params.command.trim()) {
      return 'Command cannot be empty.';
    }
    if (getCommandRoots(params.command).length === 0) {
      return 'Could not identify command root to obtain permission from user.';
    }
    if (params.directory) {
      if (path.isAbsolute(params.directory)) {
        return 'Directory cannot be absolute. Must be relative to the project root directory.';
      }
      const directory = path.resolve(
        this.config.getTargetDir(),
        params.directory,
      );
      if (!fs.existsSync(directory)) {
        return 'Directory must exist.';
      }
    }
    return null;
  }

  async shouldConfirmExecute(
    params: ShellToolParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.validateToolParams(params)) {
      return false; // skip confirmation, execute call will fail immediately
    }

    const command = stripShellWrapper(params.command);
    const rootCommands = [...new Set(getCommandRoots(command))];
    const commandsToConfirm = rootCommands.filter(
      (command) => !this.allowlist.has(command),
    );

    if (commandsToConfirm.length === 0) {
      return false; // already approved and whitelisted
    }

    const confirmationDetails: ToolExecuteConfirmationDetails = {
      type: 'exec',
      title: 'Confirm Shell Command',
      command: params.command,
      rootCommand: commandsToConfirm.join(', '),
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          commandsToConfirm.forEach((command) => this.allowlist.add(command));
        }
      },
    };
    return confirmationDetails;
  }

  async execute(
    params: ShellToolParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const strippedCommand = stripShellWrapper(params.command);
    const validationError = this.validateToolParams({
      ...params,
      command: strippedCommand,
    });
    if (validationError) {
      return {
        llmContent: validationError,
        returnDisplay: validationError,
      };
    }

    if (signal.aborted) {
      return {
        llmContent: 'Command was cancelled by user before it could start.',
        returnDisplay: 'Command cancelled by user.',
      };
    }

    const isWindows = os.platform() === 'win32';
    const tempFileName = `shell_pgrep_${crypto
      .randomBytes(6)
      .toString('hex')}.tmp`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);

    // pgrep is not available on Windows, so we can't get background PIDs
    const commandToExecute = isWindows
      ? strippedCommand
      : (() => {
          // wrap command to append subprocess pids (via pgrep) to temporary file
          let command = strippedCommand.trim();
          if (!command.endsWith('&')) command += ';';
          return `{ ${command} }; __code=$?; pgrep -g 0 >${tempFilePath} 2>&1; exit $__code;`;
        })();

    // spawn command in specified directory (or project root if not specified)
    const shell = isWindows
      ? spawn('cmd.exe', ['/c', commandToExecute], {
          stdio: ['ignore', 'pipe', 'pipe'],
          // detached: true, // ensure subprocess starts its own process group (esp. in Linux)
          cwd: path.resolve(this.config.getTargetDir(), params.directory || ''),
          env: {
            ...process.env,
            GEMINI_CLI: '1',
          },
          // On Windows, use shell: true to properly handle quotes
          shell: false, // We're already using cmd.exe explicitly
          windowsVerbatimArguments: true, // Prevent automatic quote escaping
        })
      : spawn('bash', ['-c', commandToExecute], {
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: true, // ensure subprocess starts its own process group (esp. in Linux)
          cwd: path.resolve(this.config.getTargetDir(), params.directory || ''),
          env: {
            ...process.env,
            GEMINI_CLI: '1',
          },
        });

    let exited = false;
    let timedOut = false;
    let stdout = '';
    let output = '';
    let lastUpdateTime = Date.now();

    // 最大显示行数
    const MAX_DISPLAY_LINES = 15;

    // Create internal abort controller for timeout
    const internalAbortController = new AbortController();

    // Create a manual combined abort signal for better compatibility
    let isAborted = false;
    const abortedSignal = {
      get aborted() { return isAborted || signal.aborted || internalAbortController.signal.aborted; },
      addEventListener: (type: string, listener: EventListener) => {
        if (type === 'abort') {
          signal.addEventListener('abort', listener);
          internalAbortController.signal.addEventListener('abort', listener);
        }
      },
      removeEventListener: (type: string, listener: EventListener) => {
        if (type === 'abort') {
          signal.removeEventListener('abort', listener);
          internalAbortController.signal.removeEventListener('abort', listener);
        }
      }
    };

    const appendOutput = (str: string) => {
      // 累积完整输出（已经过 sanitizeShellOutput 清理）
      output += str;

      const interval = process.env.VSCODE_PLUGIN === '1' ? OUTPUT_UPDATE_INTERVAL_MS_VSCODE : OUTPUT_UPDATE_INTERVAL_MS;
      if (
        updateOutput &&
        Date.now() - lastUpdateTime > interval
      ) {
        // 直接从已清理的 output 中计算行数和截断
        const lines = output.split('\n');
        const totalLines = lines.length;

        // 只显示最新的 MAX_DISPLAY_LINES 行
        let displayText: string;
        if (totalLines > MAX_DISPLAY_LINES) {
          const linesToShow = lines.slice(-MAX_DISPLAY_LINES);
          displayText = t('shell.output.truncated', {
            maxLines: MAX_DISPLAY_LINES.toString(),
            totalLines: (totalLines - 1).toString()
          }) + '\n' + linesToShow.join('\n');
        } else {
          displayText = output;
        }

        updateOutput(displayText);
        lastUpdateTime = Date.now();
      }
    };

    shell.stdout.on('data', (data: Buffer) => {
      // continue to consume post-exit for background processes
      // removing listeners can overflow OS buffer and block subprocesses
      // destroying (e.g. shell.stdout.destroy()) can terminate subprocesses via SIGPIPE
      if (!exited) {
        // 使用智能编码解码，特别处理Windows外部命令
        const decodedStr = decodeWindowsCommandOutput(data, strippedCommand);
        const str = sanitizeShellOutput(decodedStr);
        stdout += str;
        appendOutput(str);
      }
    });

    let stderr = '';
    shell.stderr.on('data', (data: Buffer) => {
      if (!exited) {
        // 使用智能编码解码，特别处理Windows外部命令
        const decodedStr = decodeWindowsCommandOutput(data, strippedCommand);
        const str = sanitizeShellOutput(decodedStr);
        stderr += str;
        appendOutput(str);
      }
    });

    let error: Error | null = null;
    shell.on('error', (err: Error) => {
      error = err;
      // remove wrapper from user's command in error message
      error.message = error.message.replace(commandToExecute, params.command);
    });

    let code: number | null = null;
    let processSignal: NodeJS.Signals | null = null;
    const exitHandler = (
      _code: number | null,
      _signal: NodeJS.Signals | null,
    ) => {
      exited = true;
      code = _code;
      processSignal = _signal;
    };
    shell.on('exit', exitHandler);

    const abortHandler = async () => {
      if (shell.pid && !exited) {
        if (os.platform() === 'win32') {
          // For Windows, use taskkill to kill the process tree
          spawn('taskkill', ['/pid', shell.pid.toString(), '/f', '/t']);
        } else {
          try {
            // attempt to SIGTERM process group (negative PID)
            // fall back to SIGKILL (to group) after 200ms
            process.kill(-shell.pid, 'SIGTERM');
            await new Promise((resolve) => setTimeout(resolve, 200));
            if (shell.pid && !exited) {
              process.kill(-shell.pid, 'SIGKILL');
            }
          } catch (_e) {
            // if group kill fails, fall back to killing just the main process
            try {
              if (shell.pid) {
                shell.kill('SIGKILL');
              }
            } catch (_e) {
              console.error(`failed to kill shell process ${shell.pid}: ${_e}`);
            }
          }
        }
      }
    };
    abortedSignal.addEventListener('abort', abortHandler);

    // Set up timeout mechanism
    const timeoutId = setTimeout(() => {
      if (!exited) {
        timedOut = true;
        console.warn(`Shell command timed out after ${DEFAULT_SHELL_TIMEOUT_MS}ms: ${params.command}`);
        internalAbortController.abort();
      }
    }, DEFAULT_SHELL_TIMEOUT_MS);

    // 🔥 Set up background mode detection (Ctrl+B)
    const backgroundSignal = getBackgroundModeSignal();
    let backgroundModeTriggered = false;
    let backgroundTaskId: string | undefined;

    // wait for the shell to exit OR background mode to be triggered
    try {
      await new Promise<void>((resolve) => {
        // Normal exit handler
        shell.on('exit', () => {
          if (!backgroundModeTriggered) {
            resolve();
          }
        });

        // Background mode handler - check periodically
        const checkInterval = setInterval(() => {
          if (backgroundSignal.isBackgroundModeRequested() && !exited) {
            console.log('[ShellTool] 🔥 Background mode detected! Moving to background...');
            backgroundModeTriggered = true;
            clearInterval(checkInterval);

            // Create a background task to track this process
            const taskManager = getBackgroundTaskManager();
            const task = taskManager.createTask(params.command, params.directory);
            backgroundTaskId = task.id;

            if (shell.pid) {
              taskManager.setTaskPid(task.id, shell.pid);
            }

            // Forward existing output to task manager
            taskManager.appendOutput(task.id, stdout);
            if (stderr) {
              taskManager.appendStderr(task.id, stderr);
            }

            // Set up listeners for future output (these add to existing listeners, not replace)
            const originalStdoutHandler = (data: Buffer) => {
              const str = sanitizeShellOutput(decodeWindowsCommandOutput(data, strippedCommand));
              taskManager.appendOutput(task.id, str);
            };
            const originalStderrHandler = (data: Buffer) => {
              const str = sanitizeShellOutput(decodeWindowsCommandOutput(data, strippedCommand));
              taskManager.appendStderr(task.id, str);
            };
            shell.stdout.on('data', originalStdoutHandler);
            shell.stderr.on('data', originalStderrHandler);

            // Set up exit handler for background task
            shell.on('exit', (exitCode: number | null, sig: NodeJS.Signals | null) => {
              console.log('[ShellTool] Background task completed:', task.id, 'exit code:', exitCode);
              taskManager.completeTask(task.id, {
                exitCode: exitCode ?? undefined,
                signal: sig ?? undefined
              });
            });

            // Clear the signal
            backgroundSignal.clearBackgroundMode();

            // Resolve immediately to return control to user
            resolve();
          }
        }, 100);

        // Clean up interval when process exits normally
        shell.on('exit', () => clearInterval(checkInterval));
      });
    } finally {
      clearTimeout(timeoutId);
      abortedSignal.removeEventListener('abort', abortHandler);
    }

    // If background mode was triggered, return early with a special message
    if (backgroundModeTriggered) {
      return {
        llmContent: `Command "${params.command}" has been moved to the background (Task ID: ${backgroundTaskId}). The user can continue working while it runs. The task will complete in the background and results can be checked later. DO NOT report this as completed - it is still running.`,
        returnDisplay: `Running in background...`,
        isBackgroundTask: true,
        backgroundTaskId,
      };
    }

    // parse pids (pgrep output) from temporary file and remove it
    const backgroundPIDs: number[] = [];
    if (os.platform() !== 'win32') {
      if (fs.existsSync(tempFilePath)) {
        const pgrepLines = fs
          .readFileSync(tempFilePath, 'utf8')
          .split('\n')
          .filter(Boolean);
        for (const line of pgrepLines) {
          if (!/^\d+$/.test(line)) {
            console.error(`pgrep: ${line}`);
          }
          const pid = Number(line);
          // exclude the shell subprocess pid
          if (pid !== shell.pid) {
            backgroundPIDs.push(pid);
          }
        }
        fs.unlinkSync(tempFilePath);
              } else {
          if (!abortedSignal.aborted) {
            console.error('missing pgrep output');
          }
        }
    }

    let llmContent = '';
    if (abortedSignal.aborted) {
      if (timedOut) {
        llmContent = `Command timed out after ${DEFAULT_SHELL_TIMEOUT_MS / 1000} seconds and was automatically terminated.`;
        if (output.trim()) {
          llmContent += ` Below is the output (on stdout and stderr) before timeout:\n${output}`;
        } else {
          llmContent += ' There was no output before timeout.';
        }
      } else {
        llmContent = 'Command was cancelled by user before it could complete.';
        if (output.trim()) {
          llmContent += ` Below is the output (on stdout and stderr) before it was cancelled:\n${output}`;
        } else {
          llmContent += ' There was no output before it was cancelled.';
        }
      }
    } else {
      llmContent = [
        `Command: ${params.command}`,
        `Directory: ${params.directory || '(root)'}`,
        `Stdout: ${stdout || '(empty)'}`,
        `Stderr: ${stderr || '(empty)'}`,
        `Error: ${error ?? '(none)'}`,
        `Exit Code: ${code ?? '(none)'}`,
        `Signal: ${processSignal ?? '(none)'}`,
        `Background PIDs: ${backgroundPIDs.length ? backgroundPIDs.join(', ') : '(none)'}`,
        `Process Group PGID: ${shell.pid ?? '(none)'}`,
      ].join('\n');
    }

    let returnDisplayMessage = '';
    if (this.config.getDebugMode()) {
      returnDisplayMessage = llmContent;
    } else {
      if (output.trim()) {
        // 对于最终显示，也只显示最新的 MAX_DISPLAY_LINES 行
        // 直接从已清理的 output 中计算
        const lines = output.split('\n');
        const totalLines = lines.length;

        if (totalLines > MAX_DISPLAY_LINES) {
          const linesToShow = lines.slice(-MAX_DISPLAY_LINES);
          returnDisplayMessage = t('shell.output.truncated', {
            maxLines: MAX_DISPLAY_LINES.toString(),
            totalLines: (totalLines - 1).toString()
          }) + '\n' + linesToShow.join('\n');
        } else {
          returnDisplayMessage = output;
        }
      } else {
        // Output is empty, let's provide a reason if the command failed or was cancelled
        if (abortedSignal.aborted) {
          if (timedOut) {
            returnDisplayMessage = `Command timed out after ${DEFAULT_SHELL_TIMEOUT_MS / 1000} seconds.`;
          } else {
            returnDisplayMessage = 'Command cancelled by user.';
          }
        } else if (processSignal) {
          returnDisplayMessage = `Command terminated by signal: ${processSignal}`;
        } else if (error) {
          // If error is not null, it's an Error object (or other truthy value)
          returnDisplayMessage = `Command failed: ${getErrorMessage(error)}`;
        } else if (code !== null && code !== 0) {
          returnDisplayMessage = `Command exited with code: ${code}`;
        }
        // If output is empty and command succeeded (code 0, no error/signal/abort),
        // returnDisplayMessage will remain empty, which is fine.
      }
    }

    const summarizeConfig = this.config.getSummarizeToolOutputConfig();
    if (summarizeConfig && summarizeConfig[this.name]) {
      const summary = await summarizeToolOutput(
        llmContent,
        this.config.getGeminiClient(),
        signal,
        summarizeConfig[this.name].tokenBudget,
      );
      return {
        llmContent: summary,
        returnDisplay: returnDisplayMessage,
      };
    }

    // If no summarize config but output is too long, use truncation method
    const MAX_OUTPUT_LENGTH = 32*1024; // Maximum output length threshold
    let finalLlmContent = llmContent;

    if (llmContent.length > MAX_OUTPUT_LENGTH) {
      const halfLength = Math.floor(MAX_OUTPUT_LENGTH / 2);
      const headPart = llmContent.substring(0, halfLength);
      const tailPart = llmContent.substring(llmContent.length - halfLength);
      const omittedLength = llmContent.length - MAX_OUTPUT_LENGTH;

      finalLlmContent = [
        headPart,
        '',
        `[NOTICE: Output truncated due to length (${llmContent.length} chars total).`,
        `Omitted ${omittedLength} chars from middle.`,
        `Showing first ${halfLength} chars above and last ${halfLength} chars below.]`,
        '',
        tailPart
      ].join('\n');
    }

    return {
      llmContent: finalLlmContent,
      returnDisplay: returnDisplayMessage,
    };
  }

  /**
   * 在后台执行 shell 命令，立即返回任务ID
   * 用于支持 Ctrl+B 快捷键让用户取消等待
   */
  executeBackground(
    params: ShellToolParams,
    signal: AbortSignal,
  ): ToolResult {
    const strippedCommand = stripShellWrapper(params.command);
    const validationError = this.validateToolParams({
      ...params,
      command: strippedCommand,
    });
    if (validationError) {
      return {
        llmContent: validationError,
        returnDisplay: validationError,
      };
    }

    if (signal.aborted) {
      return {
        llmContent: 'Command was cancelled by user before it could start.',
        returnDisplay: 'Command cancelled by user.',
      };
    }

    const taskManager = getBackgroundTaskManager();
    const task = taskManager.createTask(strippedCommand, params.directory);

    const isWindows = os.platform() === 'win32';
    const tempFileName = `shell_pgrep_${crypto
      .randomBytes(6)
      .toString('hex')}.tmp`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);

    const commandToExecute = isWindows
      ? strippedCommand
      : (() => {
          let command = strippedCommand.trim();
          if (!command.endsWith('&')) command += ';';
          return `{ ${command} }; __code=$?; pgrep -g 0 >${tempFilePath} 2>&1; exit $__code;`;
        })();

    const shell = isWindows
      ? spawn('cmd.exe', ['/c', commandToExecute], {
          stdio: ['ignore', 'pipe', 'pipe'],
          cwd: path.resolve(this.config.getTargetDir(), params.directory || ''),
          env: {
            ...process.env,
            GEMINI_CLI: '1',
          },
          shell: false,
          windowsVerbatimArguments: true,
          detached: true, // 后台任务需要 detached
        })
      : spawn('bash', ['-c', commandToExecute], {
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: true,
          cwd: path.resolve(this.config.getTargetDir(), params.directory || ''),
          env: {
            ...process.env,
            GEMINI_CLI: '1',
          },
        });

    if (shell.pid) {
      taskManager.setTaskPid(task.id, shell.pid);
    }

    let code: number | null = null;
    let processSignal: NodeJS.Signals | null = null;

    shell.stdout.on('data', (data: Buffer) => {
      const decodedStr = decodeWindowsCommandOutput(data, strippedCommand);
      const str = sanitizeShellOutput(decodedStr);
      taskManager.appendOutput(task.id, str);
    });

    shell.stderr.on('data', (data: Buffer) => {
      const decodedStr = decodeWindowsCommandOutput(data, strippedCommand);
      const str = sanitizeShellOutput(decodedStr);
      taskManager.appendStderr(task.id, str);
    });

    shell.on('error', (err: Error) => {
      taskManager.failTask(task.id, err.message);
    });

    shell.on('exit', (exitCode: number | null, signal: NodeJS.Signals | null) => {
      code = exitCode;
      processSignal = signal;
      taskManager.completeTask(task.id, {
        exitCode: exitCode ?? undefined,
        signal: signal ?? undefined,
      });

      // 清理临时文件
      if (fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch (e) {
          // ignore
        }
      }
    });

    // 返回任务ID给 AI 和用户
    const taskDescription = `${strippedCommand}${params.directory ? ` [in ${params.directory}]` : ''}`;
    return {
      llmContent: `Background task started (Task ID: ${task.id}). Command: ${taskDescription}`,
      returnDisplay: `Running in background (Task ID: ${task.id})`,
      backgroundTaskId: task.id, // 新增字段，用于 CLI 层感知
    };
  }
}
