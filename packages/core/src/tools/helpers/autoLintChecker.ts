/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { Config } from '../../config/config.js';
import { ReadLintsTool, LintDiagnostic } from '../read-lints.js';
import { logger } from '../../utils/enhancedLogger.js';

/**
 * 检查文件是否为代码文件（需要lint检查）
 */
export function isCodeFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const codeExtensions = [
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.vue', '.svelte', '.py', '.java', '.cs', '.cpp', '.c',
    '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.scala',
    '.css', '.scss', '.sass', '.less', '.json', '.yaml', '.yml'
  ];
  return codeExtensions.includes(ext);
}

/**
 * 格式化lint结果为易读的字符串
 */
export function formatLintResults(diagnostics: LintDiagnostic[], filePath: string): string {
  if (diagnostics.length === 0) {
    return `✅ **Lint Check**: No errors found in ${path.basename(filePath)}`;
  }

  const errors = diagnostics.filter(d => d.severity === 'error');
  const warnings = diagnostics.filter(d => d.severity === 'warning');
  const others = diagnostics.filter(d => d.severity !== 'error' && d.severity !== 'warning');

  let result = `🔍 **Lint Check Results** for ${path.basename(filePath)}:\n`;

  if (errors.length > 0) {
    result += `❌ **${errors.length} Error${errors.length > 1 ? 's' : ''}**:\n`;
    errors.slice(0, 3).forEach(error => {
      result += `  - Line ${error.line}:${error.column}: ${error.message} [${error.source}]\n`;
    });
    if (errors.length > 3) {
      result += `  - ... and ${errors.length - 3} more errors\n`;
    }
  }

  if (warnings.length > 0) {
    result += `⚠️ **${warnings.length} Warning${warnings.length > 1 ? 's' : ''}**:\n`;
    warnings.slice(0, 2).forEach(warning => {
      result += `  - Line ${warning.line}:${warning.column}: ${warning.message} [${warning.source}]\n`;
    });
    if (warnings.length > 2) {
      result += `  - ... and ${warnings.length - 2} more warnings\n`;
    }
  }

  if (others.length > 0) {
    result += `💡 **${others.length} Other issue${others.length > 1 ? 's' : ''}** (info/hints)\n`;
  }

  return result.trim();
}

/**
 * 格式化简洁的lint状态（用于UI显示）
 */
export function formatLintStatus(diagnostics: LintDiagnostic[]): string {
  if (diagnostics.length === 0) {
    return "✅ No lint errors";
  }

  const errors = diagnostics.filter(d => d.severity === 'error').length;
  const warnings = diagnostics.filter(d => d.severity === 'warning').length;

  if (errors > 0) {
    return `❌ ${errors} error${errors > 1 ? 's' : ''}${warnings > 0 ? `, ${warnings} warning${warnings > 1 ? 's' : ''}` : ''}`;
  }

  if (warnings > 0) {
    return `⚠️ ${warnings} warning${warnings > 1 ? 's' : ''}`;
  }

  return "💡 Minor issues found";
}

/**
 * 自动执行lint检查（仅在VS Code环境且为代码文件时）
 */
export async function performAutoLintCheck(
  filePath: string,
  config: Config
): Promise<{ shouldAppend: boolean; lintMessage: string; lintStatus: string; diagnostics: LintDiagnostic[] }> {
  // 检查是否在VS Code环境
  const isVSCodeEnvironment = config.getVsCodePluginMode();

  // 检查是否为代码文件
  const isCode = isCodeFile(filePath);

  logger.info(`[AutoLintChecker] Checking file: ${filePath}, isVSCode: ${isVSCodeEnvironment}, isCode: ${isCode}`);

  if (!isVSCodeEnvironment || !isCode) {
    logger.info(`[AutoLintChecker] Skipping lint check - not VSCode environment or not code file`);
    return {
      shouldAppend: false,
      lintMessage: '',
      lintStatus: '',
      diagnostics: []
    };
  }

  try {
    // 获取ReadLintsTool的回调
    const lintCallback = ReadLintsTool.getCallback();

    logger.info(`[AutoLintChecker] ReadLintsTool callback availability: ${!!lintCallback}`);

    if (!lintCallback) {
      logger.warn('[AutoLintChecker] ReadLintsTool callback not available, skipping auto lint check');
      return {
        shouldAppend: false,
        lintMessage: '',
        lintStatus: '',
        diagnostics: []
      };
    }

    // 只检查当前修改的文件
    const diagnostics = await lintCallback([filePath]);

    // 过滤出当前文件的诊断信息
    const fileDiagnostics = diagnostics.filter(d => d.file === filePath);

    logger.info(`[AutoLintChecker] Found ${fileDiagnostics.length} lint issues for file: ${filePath}`);

    const lintMessage = formatLintResults(fileDiagnostics, filePath);
    const lintStatus = formatLintStatus(fileDiagnostics);

    return {
      shouldAppend: true,
      lintMessage,
      lintStatus,
      diagnostics: fileDiagnostics
    };

  } catch (error) {
    logger.error('[AutoLintChecker] Error during auto lint check:', error);
    return {
      shouldAppend: false,
      lintMessage: '',
      lintStatus: '',
      diagnostics: []
    };
  }
}