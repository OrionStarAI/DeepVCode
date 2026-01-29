/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * 错误日志条目
 */
export interface ErrorLogEntry {
  timestamp: Date;
  level: 'error' | 'warn';
  source: string;
  message: string;
  details?: string;
}

/**
 * 错误日志服务 - 收集、存储和显示错误日志
 */
export class ErrorLogsService {
  private errorLogs: ErrorLogEntry[] = [];
  private readonly maxLogs = 500;
  private readonly errorLogFilePath: string;
  private statusBarItem: vscode.StatusBarItem | undefined;
  private onErrorCountChanged: ((count: number) => void) | undefined;

  constructor(context: vscode.ExtensionContext) {
    // 设置错误日志文件路径
    const logDir = path.join(os.homedir(), '.vscode', 'extensions', 'deepv-logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    this.errorLogFilePath = path.join(logDir, 'deepv-errors.log');

    // 启动时清空旧的错误日志
    try {
      if (fs.existsSync(this.errorLogFilePath)) {
        fs.unlinkSync(this.errorLogFilePath);
      }
      this.writeToFile(`=== DeepV Error Log Started at ${new Date().toISOString()} ===\n\n`);
    } catch (error) {
      // 忽略文件删除错误
    }

    // 创建状态栏项
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      99
    );
    this.statusBarItem.command = 'deepv.viewErrorLogs';
    this.updateStatusBar();
    context.subscriptions.push(this.statusBarItem);
  }

  /**
   * 设置错误数量变化回调
   */
  setOnErrorCountChanged(callback: (count: number) => void) {
    this.onErrorCountChanged = callback;
  }

  /**
   * 记录错误
   */
  logError(source: string, message: string, details?: string) {
    this.addLog('error', source, message, details);
  }

  /**
   * 记录警告
   */
  logWarning(source: string, message: string, details?: string) {
    this.addLog('warn', source, message, details);
  }

  /**
   * 添加日志条目
   */
  private addLog(level: 'error' | 'warn', source: string, message: string, details?: string) {
    const entry: ErrorLogEntry = {
      timestamp: new Date(),
      level,
      source,
      message,
      details
    };

    this.errorLogs.push(entry);

    // 保持日志数量在限制内
    if (this.errorLogs.length > this.maxLogs) {
      this.errorLogs.shift();
    }

    // 写入文件
    this.writeLogEntry(entry);

    // 更新状态栏
    this.updateStatusBar();

    // 触发回调
    if (this.onErrorCountChanged) {
      this.onErrorCountChanged(this.getErrorCount());
    }
  }

  /**
   * 获取错误数量
   */
  getErrorCount(): number {
    return this.errorLogs.filter(log => log.level === 'error').length;
  }

  /**
   * 获取警告数量
   */
  getWarningCount(): number {
    return this.errorLogs.filter(log => log.level === 'warn').length;
  }

  /**
   * 获取所有日志
   */
  getLogs(): ErrorLogEntry[] {
    return [...this.errorLogs];
  }

  /**
   * 获取仅错误日志
   */
  getErrors(): ErrorLogEntry[] {
    return this.errorLogs.filter(log => log.level === 'error');
  }

  /**
   * 获取仅警告日志
   */
  getWarnings(): ErrorLogEntry[] {
    return this.errorLogs.filter(log => log.level === 'warn');
  }

  /**
   * 清空日志
   */
  clearLogs() {
    this.errorLogs = [];
    this.updateStatusBar();
    if (this.onErrorCountChanged) {
      this.onErrorCountChanged(0);
    }
  }

  /**
   * 更新状态栏显示
   */
  private updateStatusBar() {
    if (!this.statusBarItem) return;

    const errorCount = this.getErrorCount();
    const warnCount = this.getWarningCount();

    if (errorCount === 0 && warnCount === 0) {
      this.statusBarItem.hide();
      return;
    }

    const parts: string[] = [];
    if (errorCount > 0) {
      parts.push(`$(error) ${errorCount}`);
    }
    if (warnCount > 0) {
      parts.push(`$(warning) ${warnCount}`);
    }

    this.statusBarItem.text = `DeepV: ${parts.join(' ')}`;
    this.statusBarItem.tooltip = `DeepV Code: ${errorCount} 个错误, ${warnCount} 个警告\n点击查看详情`;
    this.statusBarItem.backgroundColor = errorCount > 0 
      ? new vscode.ThemeColor('statusBarItem.errorBackground')
      : new vscode.ThemeColor('statusBarItem.warningBackground');
    this.statusBarItem.show();
  }

  /**
   * 写入日志条目到文件
   */
  private writeLogEntry(entry: ErrorLogEntry) {
    const levelIcon = entry.level === 'error' ? '❌' : '⚠️';
    const timestamp = entry.timestamp.toISOString();
    let logLine = `[${timestamp}] ${levelIcon} [${entry.source}] ${entry.message}\n`;
    if (entry.details) {
      logLine += `  Details: ${entry.details}\n`;
    }
    this.writeToFile(logLine);
  }

  /**
   * 写入文件
   */
  private writeToFile(content: string) {
    try {
      fs.appendFileSync(this.errorLogFilePath, content, 'utf8');
    } catch (error) {
      // 忽略文件写入错误
    }
  }

  /**
   * 获取错误日志文件路径
   */
  getErrorLogFilePath(): string {
    return this.errorLogFilePath;
  }

  /**
   * 在 WebView 面板中显示错误日志
   */
  async showErrorLogsPanel() {
    const errors = this.getErrors();
    const warnings = this.getWarnings();

    if (errors.length === 0 && warnings.length === 0) {
      vscode.window.showInformationMessage('🎉 暂无错误或警告日志');
      return;
    }

    // 使用 QuickPick 显示筛选选项
    const filterOptions = [
      { label: '$(list-flat) 全部显示', description: `${errors.length + warnings.length} 条`, value: 'all' },
      { label: '$(error) 仅错误', description: `${errors.length} 条`, value: 'errors' },
      { label: '$(warning) 仅警告', description: `${warnings.length} 条`, value: 'warnings' },
      { label: '$(trash) 清空日志', description: '', value: 'clear' },
      { label: '$(file) 打开日志文件', description: '', value: 'open_file' }
    ];

    const selected = await vscode.window.showQuickPick(filterOptions, {
      placeHolder: '选择查看方式',
      title: 'DeepV Code 错误日志'
    });

    if (!selected) return;

    switch (selected.value) {
      case 'all':
        await this.showLogsInDocument([...errors, ...warnings]);
        break;
      case 'errors':
        await this.showLogsInDocument(errors);
        break;
      case 'warnings':
        await this.showLogsInDocument(warnings);
        break;
      case 'clear':
        this.clearLogs();
        vscode.window.showInformationMessage('✅ 日志已清空');
        break;
      case 'open_file':
        const logUri = vscode.Uri.file(this.errorLogFilePath);
        await vscode.window.showTextDocument(logUri);
        break;
    }
  }

  /**
   * 在新文档中显示日志
   */
  private async showLogsInDocument(logs: ErrorLogEntry[]) {
    if (logs.length === 0) {
      vscode.window.showInformationMessage('暂无日志');
      return;
    }

    // 按时间倒序排列
    const sortedLogs = [...logs].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // 生成 Markdown 内容
    const content = this.generateMarkdownContent(sortedLogs);

    // 创建虚拟文档
    const doc = await vscode.workspace.openTextDocument({
      language: 'markdown',
      content
    });

    await vscode.window.showTextDocument(doc, { preview: true });
  }

  /**
   * 生成 Markdown 格式内容
   */
  private generateMarkdownContent(logs: ErrorLogEntry[]): string {
    const errorCount = logs.filter(l => l.level === 'error').length;
    const warnCount = logs.filter(l => l.level === 'warn').length;

    let content = `# DeepV Code 错误日志\n\n`;
    content += `> 生成时间: ${new Date().toLocaleString()}\n\n`;
    content += `| 统计 | 数量 |\n|------|------|\n`;
    content += `| ❌ 错误 | ${errorCount} |\n`;
    content += `| ⚠️ 警告 | ${warnCount} |\n\n`;
    content += `---\n\n`;

    for (const log of logs) {
      const icon = log.level === 'error' ? '❌' : '⚠️';
      const time = log.timestamp.toLocaleString();
      content += `### ${icon} ${log.message}\n\n`;
      content += `- **时间**: ${time}\n`;
      content += `- **来源**: \`${log.source}\`\n`;
      if (log.details) {
        content += `- **详情**:\n\`\`\`\n${log.details}\n\`\`\`\n`;
      }
      content += `\n---\n\n`;
    }

    return content;
  }

  /**
   * 释放资源
   */
  dispose() {
    if (this.statusBarItem) {
      this.statusBarItem.dispose();
    }
    this.writeToFile(`\n=== DeepV Error Log Ended at ${new Date().toISOString()} ===\n`);
  }
}

// 单例实例
let errorLogsServiceInstance: ErrorLogsService | undefined;

/**
 * 获取 ErrorLogsService 实例
 */
export function getErrorLogsService(context?: vscode.ExtensionContext): ErrorLogsService | undefined {
  if (!errorLogsServiceInstance && context) {
    errorLogsServiceInstance = new ErrorLogsService(context);
  }
  return errorLogsServiceInstance;
}

/**
 * 销毁 ErrorLogsService 实例
 */
export function disposeErrorLogsService() {
  if (errorLogsServiceInstance) {
    errorLogsServiceInstance.dispose();
    errorLogsServiceInstance = undefined;
  }
}
