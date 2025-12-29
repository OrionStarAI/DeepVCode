/**
 * 终端输出服务
 *
 * 通过剪贴板获取终端输出内容
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export class TerminalOutputService {
  private static instance: TerminalOutputService;
  private logger: Logger;

  private constructor(logger: Logger) {
    this.logger = logger;
    this.logger.info('🖥️ TerminalOutputService initialized');
  }

  static getInstance(logger: Logger): TerminalOutputService {
    if (!TerminalOutputService.instance) {
      TerminalOutputService.instance = new TerminalOutputService(logger);
    }
    return TerminalOutputService.instance;
  }

  /**
   * 获取指定终端的输出内容
   *
   * 通过选择终端内容并复制到剪贴板的方式获取
   *
   * @param terminalId 终端索引
   * @param maxLines 最大行数
   * @returns 终端信息
   */
  async getTerminalOutputAsync(terminalId: number, maxLines: number = 200): Promise<{ name: string; output: string } | null> {
    const terminals = vscode.window.terminals;

    if (terminalId < 0 || terminalId >= terminals.length) {
      return null;
    }

    const terminal = terminals[terminalId];
    const terminalName = terminal.name || `Terminal ${terminalId + 1}`;

    try {
      // 保存当前剪贴板内容
      const originalClipboard = await vscode.env.clipboard.readText();

      // 显示终端（不获取焦点）
      terminal.show(false);

      // 等待终端激活（延长等待以适应较慢的机器）
      await this.delay(300);

      // 选择终端所有内容
      await vscode.commands.executeCommand('workbench.action.terminal.selectAll');
      await this.delay(200);

      // 复制选中内容
      await vscode.commands.executeCommand('workbench.action.terminal.copySelection');
      await this.delay(200);

      // 从剪贴板读取内容
      const terminalContent = await vscode.env.clipboard.readText();

      // 清除选择
      await vscode.commands.executeCommand('workbench.action.terminal.clearSelection');

      // 恢复原来的剪贴板内容
      if (originalClipboard) {
        await vscode.env.clipboard.writeText(originalClipboard);
      }

      if (terminalContent && terminalContent.trim().length > 0) {
        // 限制到最后 maxLines 行
        const lines = terminalContent.split('\n');
        const lastLines = lines.slice(-maxLines);
        const output = lastLines.join('\n');

        this.logger.info(`✅ Got ${lastLines.length} lines from terminal ${terminalName} via clipboard`);
        return {
          name: terminalName,
          output
        };
      } else {
        this.logger.warn(`Terminal ${terminalName} appears to be empty`);
        return {
          name: terminalName,
          output: `[终端 ${terminalName} 为空或无法读取内容]`
        };
      }
    } catch (error) {
      this.logger.error('Failed to get terminal output via clipboard', error instanceof Error ? error : undefined);
      return {
        name: terminalName,
        output: `[无法获取终端输出: ${error instanceof Error ? error.message : String(error)}]`
      };
    }
  }

  /**
   * 同步版本（使用默认提示）
   */
  getTerminalOutput(terminalId: number, maxLines: number = 200): { name: string; output: string } | null {
    const terminals = vscode.window.terminals;

    if (terminalId < 0 || terminalId >= terminals.length) {
      return null;
    }

    const terminal = terminals[terminalId];
    const terminalName = terminal.name || `Terminal ${terminalId + 1}`;

    // 触发异步获取，但先返回一个占位符
    // 实际的获取会通过异步方法完成
    return {
      name: terminalName,
      output: '[正在获取终端输出...]'
    };
  }

  /**
   * 获取所有终端的信息
   */
  getAllTerminalsInfo(): Array<{ id: number; name: string }> {
    const terminals = vscode.window.terminals;
    return terminals.map((terminal, index) => ({
      id: index,
      name: terminal.name || `Terminal ${index + 1}`
    }));
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  dispose() {
    this.logger.info('🖥️ TerminalOutputService disposed');
  }
}
