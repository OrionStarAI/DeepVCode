/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import {
  HistoryItemWithoutId,
  IndividualToolCallDisplay,
  ToolCallStatus,
} from '../types.js';
import { useCallback } from 'react';
import {
  Config,
  GeminiClient,
  MESSAGE_ROLES,
} from 'deepv-code-core';
import { type PartListUnion } from '@google/genai';
import { formatMemoryUsage } from '../utils/formatters.js';
import { isBinary } from '../utils/textUtils.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import { SHELL_COMMAND_NAME } from '../constants.js';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import fs from 'fs';
import stripAnsi from 'strip-ansi';

// 🔧 提高节流间隔到2秒，减少高频输出（如ping）导致的UI重绘，缓解闪屏问题
const OUTPUT_UPDATE_INTERVAL_MS = 2000;
const MAX_OUTPUT_LENGTH = 10000;

/**
 * 清理Shell输出中的控制字符
 * 温和的控制字符过滤版本：
 * 1. 保持换行符处理
 * 2. 添加温和的控制字符过滤，只移除可能破坏界面显示的字符
 * 3. 处理异常超长单行输出，防止CLI渲染卡死
 * 4. 🔧 增强\r处理，修复闪屏问题
 */
function sanitizeShellOutput(text: string): string {
  if (!text) return text;

  // 1. 移除ANSI转义序列
  let cleaned = stripAnsi(text);

  // 2. 移除其他可能破坏界面的ESC序列
  cleaned = cleaned.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');  // CSI序列
  cleaned = cleaned.replace(/\x1b\([0-9;]*[a-zA-Z]/g, '');  // 其他ESC序列
  cleaned = cleaned.replace(/\x1b\][0-9;]*[a-zA-Z]/g, '');  // OSC序列

  // 3. 🔧 增强的\r处理 - 修复ping等命令导致的闪屏问题
  // 先处理\r\n组合（Windows标准换行）
  cleaned = cleaned.replace(/\r\n/g, '\n');
  // 处理连续的\r（如ping命令的覆盖式输出）
  cleaned = cleaned.replace(/\r+/g, '\n');
  // 移除行首的\r残留
  cleaned = cleaned.replace(/^\r/gm, '');

  // 4. 移除可能破坏界面的控制字符
  cleaned = cleaned.replace(/[\x00\x07\x08\x7F]/g, '');

  // 5. 清理多余的连续换行（但保留有意义的空行）
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // 6. 特殊处理：防止超长单行输出导致渲染卡死
  // 如果输出行数少于3行，但总字符数超过5000，则截断内容
  const lines = cleaned.split('\n');
  const MAX_CHARS_FOR_FEW_LINES = 5000;
  if (lines.length < 3 && cleaned.length > MAX_CHARS_FOR_FEW_LINES) {
    const truncated = cleaned.substring(0, MAX_CHARS_FOR_FEW_LINES);
    const omittedChars = cleaned.length - MAX_CHARS_FOR_FEW_LINES;
    return `${truncated}\n... (truncated ${omittedChars} characters to prevent rendering issues)`;
  }

  return cleaned;
}

/**
 * A structured result from a shell command execution.
 */
interface ShellExecutionResult {
  rawOutput: Buffer;
  output: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error: Error | null;
  aborted: boolean;
}

/**
 * Executes a shell command using `spawn`, capturing all output and lifecycle events.
 * This is the single, unified implementation for shell execution.
 *
 * @param commandToExecute The exact command string to run.
 * @param cwd The working directory to execute the command in.
 * @param abortSignal An AbortSignal to terminate the process.
 * @param onOutputChunk A callback for streaming real-time output.
 * @param onDebugMessage A callback for logging debug information.
 * @returns A promise that resolves with the complete execution result.
 */
function executeShellCommand(
  commandToExecute: string,
  cwd: string,
  abortSignal: AbortSignal,
  onOutputChunk: (chunk: string) => void,
  onDebugMessage: (message: string) => void,
): Promise<ShellExecutionResult> {
  return new Promise((resolve) => {
    const isWindows = os.platform() === 'win32';
    const shell = isWindows ? 'cmd.exe' : 'bash';
    const shellArgs = isWindows
      ? ['/c', commandToExecute]
      : ['-c', commandToExecute];

    const child = spawn(shell, shellArgs, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: !isWindows, // Use process groups on non-Windows for robust killing
      env: {
        ...process.env,
        GEMINI_CLI: '1',
      },
      // On Windows, prevent automatic quote escaping to fix quote handling issues
      ...(isWindows && { windowsVerbatimArguments: true }),
    });

    let stdout = '';
    let stderr = '';
    const outputChunks: Buffer[] = [];
    let error: Error | null = null;
    let exited = false;

    let streamToUi = true;
    const MAX_SNIFF_SIZE = 4096;
    let sniffedBytes = 0;

    const handleOutput = (data: Buffer, stream: 'stdout' | 'stderr') => {
      outputChunks.push(data);

      if (streamToUi && sniffedBytes < MAX_SNIFF_SIZE) {
        // Use a limited-size buffer for the check to avoid performance issues.
        const sniffBuffer = Buffer.concat(outputChunks.slice(0, 20));
        sniffedBytes = sniffBuffer.length;

        if (isBinary(sniffBuffer)) {
          streamToUi = false;
          // Overwrite any garbled text that may have streamed with a clear message.
          onOutputChunk('[Binary output detected. Halting stream...]');
        }
      }

      // CLI层不再处理编码和清理，直接使用原始数据
      const rawChunk = data.toString('utf8');

      if (stream === 'stdout') {
        stdout += rawChunk;
      } else {
        stderr += rawChunk;
      }

      if (!exited && streamToUi) {
        // 直接发送原始数据，让core层处理
        onOutputChunk(rawChunk);
      } else if (!exited && !streamToUi) {
        // Send progress updates for the binary stream
        const totalBytes = outputChunks.reduce(
          (sum, chunk) => sum + chunk.length,
          0,
        );
        onOutputChunk(
          `[Receiving binary output... ${formatMemoryUsage(totalBytes)} received]`,
        );
      }
    };

    child.stdout.on('data', (data) => handleOutput(data, 'stdout'));
    child.stderr.on('data', (data) => handleOutput(data, 'stderr'));
    child.on('error', (err) => {
      error = err;
    });

    const abortHandler = async () => {
      if (child.pid && !exited) {
        onDebugMessage(`Aborting shell command (PID: ${child.pid})`);
        if (isWindows) {
          spawn('taskkill', ['/pid', child.pid.toString(), '/f', '/t']);
        } else {
          try {
            // Kill the entire process group (negative PID).
            // SIGTERM first, then SIGKILL if it doesn't die.
            process.kill(-child.pid, 'SIGTERM');
            await new Promise((res) => setTimeout(res, 200));
            if (!exited) {
              process.kill(-child.pid, 'SIGKILL');
            }
          } catch (_e) {
            // Fall back to killing just the main process if group kill fails.
            if (!exited) child.kill('SIGKILL');
          }
        }
      }
    };

    abortSignal.addEventListener('abort', abortHandler, { once: true });

    child.on('exit', (code, signal) => {
      exited = true;
      abortSignal.removeEventListener('abort', abortHandler);

      const finalBuffer = Buffer.concat(outputChunks);

      resolve({
        rawOutput: finalBuffer,
        output: stdout + (stderr ? `\n${stderr}` : ''),
        exitCode: code,
        signal,
        error,
        aborted: abortSignal.aborted,
      });
    });
  });
}

function addShellCommandToGeminiHistory(
  geminiClient: GeminiClient,
  rawQuery: string,
  resultText: string,
) {
  const modelContent =
    resultText.length > MAX_OUTPUT_LENGTH
      ? resultText.substring(0, MAX_OUTPUT_LENGTH) + '\n... (truncated)'
      : resultText;

  geminiClient.addHistory({
    role: MESSAGE_ROLES.USER,
    parts: [
      {
        text: `I ran the following shell command:
\`\`\`sh
${rawQuery}
\`\`\`

This produced the following result:
\`\`\`
${modelContent}
\`\`\``,
      },
    ],
  });
}

/**
 * Hook to process shell commands.
 * Orchestrates command execution and updates history and agent context.
 */

export const useShellCommandProcessor = (
  addItemToHistory: UseHistoryManagerReturn['addItem'],
  setPendingHistoryItem: React.Dispatch<
    React.SetStateAction<HistoryItemWithoutId | null>
  >,
  onExec: (command: Promise<void>) => void,
  onDebugMessage: (message: string) => void,
  config: Config,
  geminiClient: GeminiClient,
) => {
  const handleShellCommand = useCallback(
    (rawQuery: PartListUnion, abortSignal: AbortSignal): boolean => {
      if (typeof rawQuery !== 'string' || rawQuery.trim() === '') {
        return false;
      }

      const userMessageTimestamp = Date.now();
      const callId = `shell-${userMessageTimestamp}`;
      addItemToHistory(
        { type: 'user_shell', text: rawQuery },
        userMessageTimestamp,
      );

      const isWindows = os.platform() === 'win32';
      const targetDir = config.getTargetDir();
      let commandToExecute = rawQuery;
      let pwdFilePath: string | undefined;

      // On non-windows, wrap the command to capture the final working directory.
      if (!isWindows) {
        let command = rawQuery.trim();
        const pwdFileName = `shell_pwd_${crypto.randomBytes(6).toString('hex')}.tmp`;
        pwdFilePath = path.join(os.tmpdir(), pwdFileName);
        // Ensure command ends with a separator before adding our own.
        if (!command.endsWith(';') && !command.endsWith('&')) {
          command += ';';
        }
        commandToExecute = `{ ${command} }; __code=$?; pwd > "${pwdFilePath}"; exit $__code`;
      }

      const execPromise = new Promise<void>((resolve) => {
        let lastUpdateTime = 0;

        const initialToolDisplay: IndividualToolCallDisplay = {
          callId,
          name: SHELL_COMMAND_NAME,
          toolId: 'run_shell_command',
          description: rawQuery,
          status: ToolCallStatus.Executing,
          resultDisplay: '',
          confirmationDetails: undefined,
          renderOutputAsMarkdown: false, // 使用纯文本渲染，确保宽度限制生效
        };

        setPendingHistoryItem({
          type: 'tool_group',
          tools: [initialToolDisplay],
        });

        onDebugMessage(`Executing in ${targetDir}: ${commandToExecute}`);
        executeShellCommand(
          commandToExecute,
          targetDir,
          abortSignal,
          (streamedOutput) => {
            // Throttle pending UI updates to avoid excessive re-renders.
            if (Date.now() - lastUpdateTime > OUTPUT_UPDATE_INTERVAL_MS) {
              setPendingHistoryItem({
                type: 'tool_group',
                tools: [
                  { ...initialToolDisplay, resultDisplay: streamedOutput },
                ],
              });
              lastUpdateTime = Date.now();
            }
          },
          onDebugMessage,
        )
          .then((result) => {
            setPendingHistoryItem(null);

            let mainContent: string;

            if (isBinary(result.rawOutput)) {
              mainContent =
                '[Command produced binary output, which is not shown.]';
            } else {
              // 清理Shell输出中的控制字符，防止撑破界面
              const cleanedOutput = sanitizeShellOutput(result.output);
              mainContent = cleanedOutput.trim() || '(Command produced no output)';
            }

            let finalOutput = mainContent;
            let finalStatus = ToolCallStatus.Success;

            if (result.error) {
              finalStatus = ToolCallStatus.Error;
              finalOutput = `${result.error.message}\n${finalOutput}`;
            } else if (result.aborted) {
              finalStatus = ToolCallStatus.Canceled;
              finalOutput = `Command was cancelled.\n${finalOutput}`;
            } else if (result.signal) {
              finalStatus = ToolCallStatus.Error;
              finalOutput = `Command terminated by signal: ${result.signal}.\n${finalOutput}`;
            } else if (result.exitCode !== 0) {
              finalStatus = ToolCallStatus.Error;
              finalOutput = `Command exited with code ${result.exitCode}.\n${finalOutput}`;
            }

            if (pwdFilePath && fs.existsSync(pwdFilePath)) {
              const finalPwd = fs.readFileSync(pwdFilePath, 'utf8').trim();
              if (finalPwd && finalPwd !== targetDir) {
                const warning = `WARNING: shell mode is stateless; the directory change to '${finalPwd}' will not persist.`;
                finalOutput = `${warning}\n\n${finalOutput}`;
              }
            }

            const finalToolDisplay: IndividualToolCallDisplay = {
              ...initialToolDisplay,
              status: finalStatus,
              resultDisplay: finalOutput,
            };

            // Add the complete, contextual result to the local UI history.
            addItemToHistory(
              {
                type: 'tool_group',
                tools: [finalToolDisplay],
              } as HistoryItemWithoutId,
              userMessageTimestamp,
            );

            // Add the same complete, contextual result to the LLM's history.
            addShellCommandToGeminiHistory(geminiClient, rawQuery, finalOutput);
          })
          .catch((err) => {
            setPendingHistoryItem(null);
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            addItemToHistory(
              {
                type: 'error',
                text: `An unexpected error occurred: ${errorMessage}`,
              },
              userMessageTimestamp,
            );
          })
          .finally(() => {
            if (pwdFilePath && fs.existsSync(pwdFilePath)) {
              fs.unlinkSync(pwdFilePath);
            }
            resolve();
          });
      });

      onExec(execPromise);
      return true; // Command was initiated
    },
    [
      config,
      onDebugMessage,
      addItemToHistory,
      setPendingHistoryItem,
      onExec,
      geminiClient,
    ],
  );

  return { handleShellCommand };
};
