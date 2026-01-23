/**
 * DeepV Code Skills System - Script Executor
 *
 * Safely executes skill scripts and captures output
 * - Supports Python, Bash, Node.js scripts
 * - Timeout control
 * - Output capture (script code = 0 tokens, only output injected)
 * - Error handling
 * - Resource limits
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import {
  SkillScript,
  ScriptType,
  SkillError,
  SkillErrorCode,
} from './skill-types.js';

const execAsync = promisify(exec);

/**
 * Script execution options
 */
export interface ScriptExecutionOptions {
  /** Timeout in milliseconds (default: 30000 = 30s) */
  timeout?: number;
  /** Maximum output size in bytes (default: 1MB) */
  maxOutputSize?: number;
  /** Working directory for script execution */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Arguments to pass to the script */
  args?: string[];
}

/**
 * Script execution result
 */
export interface ScriptExecutionResult {
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Exit code */
  exitCode: number;
  /** Execution time in milliseconds */
  executionTime: number;
  /** Whether execution was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Default execution options
 */
const DEFAULT_OPTIONS: Required<ScriptExecutionOptions> = {
  timeout: 30000, // 30 seconds
  maxOutputSize: 1024 * 1024, // 1MB
  cwd: process.cwd(),
  env: {},
  args: [],
};

/**
 * ScriptExecutor - Skill 脚本执行器
 *
 * 职责:
 * 1. 安全执行 Python/Bash/Node.js 脚本
 * 2. 超时控制
 * 3. 捕获输出（仅输出进入 context，代码不进入）
 * 4. 错误处理和日志
 * 5. 资源限制
 */
export class ScriptExecutor {
  private readonly defaultOptions: ScriptExecutionOptions;

  constructor(options: Partial<ScriptExecutionOptions> = {}) {
    this.defaultOptions = { ...DEFAULT_OPTIONS, ...options };
  }

  // ============================================================================
  // 公共方法 - 执行脚本
  // ============================================================================

  /**
   * Execute a skill script
   */
  async executeScript(
    script: SkillScript,
    options: ScriptExecutionOptions = {},
  ): Promise<ScriptExecutionResult> {
    const opts = { ...this.defaultOptions, ...options };

    // Validate script exists
    if (!(await fs.pathExists(script.path))) {
      throw new SkillError(
        `Script not found: ${script.path}`,
        SkillErrorCode.FILE_NOT_FOUND,
        { path: script.path },
      );
    }

    // Execute based on script type
    switch (script.type) {
      case ScriptType.PYTHON:
        return this.executePythonScript(script, opts);

      case ScriptType.BASH:
        return this.executeBashScript(script, opts);

      case ScriptType.NODE:
        return this.executeNodeScript(script, opts);

      default:
        throw new SkillError(
          `Unsupported script type: ${script.type}`,
          SkillErrorCode.SCRIPT_EXECUTION_FAILED,
          { scriptType: script.type },
        );
    }
  }

  /**
   * Execute multiple scripts in sequence
   */
  async executeScripts(
    scripts: SkillScript[],
    options: ScriptExecutionOptions = {},
  ): Promise<ScriptExecutionResult[]> {
    const results: ScriptExecutionResult[] = [];

    for (const script of scripts) {
      try {
        const result = await this.executeScript(script, options);
        results.push(result);
      } catch (error) {
        results.push({
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1,
          executionTime: 0,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Format script output for context injection
   *
   * This formats the output in a way that's clear for the AI,
   * without including the script code (saving tokens)
   */
  formatOutputForContext(
    script: SkillScript,
    result: ScriptExecutionResult,
  ): string {
    const lines: string[] = [
      `Script: ${script.name}`,
      `Type: ${script.type}`,
      '',
    ];

    if (result.success) {
      lines.push('Output:');
      lines.push('```');
      lines.push(result.stdout.trim());
      lines.push('```');
    } else {
      lines.push('⚠️  Script execution failed:');
      lines.push('```');
      lines.push(result.stderr || result.error || 'Unknown error');
      lines.push('```');
    }

    lines.push('');
    lines.push(`Execution time: ${result.executionTime}ms`);

    return lines.join('\n');
  }

  // ============================================================================
  // 私有方法 - 特定类型脚本执行
  // ============================================================================

  /**
   * Execute Python script
   */
  private async executePythonScript(
    script: SkillScript,
    options: ScriptExecutionOptions,
  ): Promise<ScriptExecutionResult> {
    const command = this.buildPythonCommand(script, options);
    return this.executeCommand(command, options);
  }

  /**
   * Execute Bash script
   */
  private async executeBashScript(
    script: SkillScript,
    options: ScriptExecutionOptions,
  ): Promise<ScriptExecutionResult> {
    const command = this.buildBashCommand(script, options);
    return this.executeCommand(command, options);
  }

  /**
   * Execute Node.js script
   */
  private async executeNodeScript(
    script: SkillScript,
    options: ScriptExecutionOptions,
  ): Promise<ScriptExecutionResult> {
    const command = this.buildNodeCommand(script, options);
    return this.executeCommand(command, options);
  }

  // ============================================================================
  // 私有方法 - 命令构建
  // ============================================================================

  /**
   * Build Python command
   */
  private buildPythonCommand(
    script: SkillScript,
    options: ScriptExecutionOptions,
  ): string {
    const args = options.args?.join(' ') || '';
    return `python3 "${script.path}" ${args}`.trim();
  }

  /**
   * Build Bash command
   */
  private buildBashCommand(
    script: SkillScript,
    options: ScriptExecutionOptions,
  ): string {
    const args = options.args?.join(' ') || '';
    return `bash "${script.path}" ${args}`.trim();
  }

  /**
   * Build Node.js command
   */
  private buildNodeCommand(
    script: SkillScript,
    options: ScriptExecutionOptions,
  ): string {
    const args = options.args?.join(' ') || '';
    return `node "${script.path}" ${args}`.trim();
  }

  // ============================================================================
  // 私有方法 - 命令执行
  // ============================================================================

  /**
   * Execute command with timeout and error handling
   */
  private async executeCommand(
    command: string,
    options: ScriptExecutionOptions,
  ): Promise<ScriptExecutionResult> {
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: options.cwd,
        timeout: options.timeout,
        maxBuffer: options.maxOutputSize,
        env: { ...process.env, ...options.env },
      });

      const executionTime = Date.now() - startTime;

      return {
        stdout,
        stderr,
        exitCode: 0,
        executionTime,
        success: true,
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      // Check if timeout
      if (error.killed || error.signal === 'SIGTERM') {
        throw new SkillError(
          `Script execution timeout (${options.timeout}ms)`,
          SkillErrorCode.SCRIPT_TIMEOUT,
          { command, timeout: options.timeout },
        );
      }

      // Check if output too large
      if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
        throw new SkillError(
          `Script output exceeds maximum size (${options.maxOutputSize} bytes)`,
          SkillErrorCode.SCRIPT_EXECUTION_FAILED,
          { command, maxOutputSize: options.maxOutputSize },
        );
      }

      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
        exitCode: error.code || 1,
        executionTime,
        success: false,
        error: error.message,
      };
    }
  }

  // ============================================================================
  // 工具方法
  // ============================================================================

  /**
   * Check if a command is available
   */
  async checkCommandAvailable(command: string): Promise<boolean> {
    try {
      await execAsync(`which ${command}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get available script executors
   */
  async getAvailableExecutors(): Promise<{
    python: boolean;
    bash: boolean;
    node: boolean;
  }> {
    const [python, bash, node] = await Promise.all([
      this.checkCommandAvailable('python3'),
      this.checkCommandAvailable('bash'),
      this.checkCommandAvailable('node'),
    ]);

    return { python, bash, node };
  }

  /**
   * Validate script before execution
   */
  async validateScript(script: SkillScript): Promise<{
    valid: boolean;
    error?: string;
  }> {
    // Check if file exists
    if (!(await fs.pathExists(script.path))) {
      return {
        valid: false,
        error: `Script file not found: ${script.path}`,
      };
    }

    // Check if file is readable
    try {
      await fs.access(script.path, fs.constants.R_OK);
    } catch {
      return {
        valid: false,
        error: `Script file not readable: ${script.path}`,
      };
    }

    // Check if executor is available
    const executors = await this.getAvailableExecutors();

    switch (script.type) {
      case ScriptType.PYTHON:
        if (!executors.python) {
          return {
            valid: false,
            error: 'Python3 not found. Install Python to run Python scripts.',
          };
        }
        break;

      case ScriptType.BASH:
        if (!executors.bash) {
          return {
            valid: false,
            error: 'Bash not found. Install Bash to run shell scripts.',
          };
        }
        break;

      case ScriptType.NODE:
        if (!executors.node) {
          return {
            valid: false,
            error: 'Node.js not found. Install Node.js to run JavaScript scripts.',
          };
        }
        break;

      default:
        return {
          valid: false,
          error: `Unsupported script type: ${script.type}`,
        };
    }

    return { valid: true };
  }
}

/**
 * 单例实例
 */
export const scriptExecutor = new ScriptExecutor();
