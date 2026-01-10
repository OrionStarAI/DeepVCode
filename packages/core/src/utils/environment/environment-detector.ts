/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * 统一的环境检测模块
 *
 * 特性：
 * - 集中管理所有环境变量检测
 * - 提供清晰的检测优先级和可信度级别
 * - 返回详细的检测结果和方法
 * - 易于单元测试和调试
 */

import * as process from 'node:process';
import {
  EnvironmentType,
  VSCodeDetectionMethod,
  EnvironmentDetectionResult,
} from './environment-types.js';
import {
  ENVIRONMENT_VARIABLES,
  VSCODE_INDICATORS,
} from './environment-constants.js';

/**
 * 统一的 VSCode 环境检测
 *
 * 检测优先级（从高到低）：
 * 1. VSCODE_PLUGIN=1    (最可信，由 DeepV Code 插件主动设置)
 * 2. VSCODE_PID        (可信，由 VSCode 设置)
 * 3. TERM_PROGRAM=vscode (较低，可能有误报)
 *
 * @returns EnvironmentDetectionResult - 检测结果及使用的方法
 */
export function detectVSCodeEnvironment(): EnvironmentDetectionResult {
  const details: EnvironmentDetectionResult['details'] = {
    vscodePluginValue: process.env[ENVIRONMENT_VARIABLES.VSCODE_PLUGIN],
    vscodeProcessId: process.env[ENVIRONMENT_VARIABLES.VSCODE_PID],
    termProgram: process.env[ENVIRONMENT_VARIABLES.TERM_PROGRAM],
    appRoot: process.env[ENVIRONMENT_VARIABLES.VSCODE_APP_ROOT],
  };

  // 优先级1: 检查 VSCODE_PLUGIN=1（最可信）
  if (process.env[ENVIRONMENT_VARIABLES.VSCODE_PLUGIN] === VSCODE_INDICATORS.PLUGIN_ENABLED_VALUE) {
    return {
      type: EnvironmentType.VSCODE_PLUGIN,
      isVSCode: true,
      method: VSCodeDetectionMethod.PLUGIN_MARKER,
      details,
    };
  }

  // 优先级2: 检查 VSCODE_PID（可信）
  if (process.env[ENVIRONMENT_VARIABLES.VSCODE_PID] !== undefined) {
    return {
      type: EnvironmentType.VSCODE_PLUGIN,
      isVSCode: true,
      method: VSCodeDetectionMethod.VSCODE_PID,
      details,
    };
  }

  // 优先级3: 检查 TERM_PROGRAM=vscode（较低可信度，但在某些环境中有效）
  if (process.env[ENVIRONMENT_VARIABLES.TERM_PROGRAM] === VSCODE_INDICATORS.TERM_PROGRAM_VALUE) {
    return {
      type: EnvironmentType.VSCODE_PLUGIN,
      isVSCode: true,
      method: VSCodeDetectionMethod.TERM_PROGRAM,
      details,
    };
  }

  // 都不匹配：CLI 环境
  return {
    type: EnvironmentType.CLI,
    isVSCode: false,
    method: null,
    details,
  };
}

/**
 * 快速判断是否为 VSCode 环境
 * （简化版，直接返回布尔值）
 */
export function isVSCodeEnvironment(): boolean {
  return detectVSCodeEnvironment().isVSCode;
}

/**
 * 获取检测详情（用于日志和调试）
 */
export function getEnvironmentDetectionDetails(): EnvironmentDetectionResult {
  return detectVSCodeEnvironment();
}

/**
 * 获取可读的环境检测报告
 */
export function getEnvironmentDetectionReport(): string {
  const result = detectVSCodeEnvironment();

  let report = `Environment Detection Report:\n`;
  report += `  Environment Type: ${result.type}\n`;
  report += `  Is VSCode: ${result.isVSCode}\n`;

  if (result.method) {
    report += `  Detection Method: ${result.method}\n`;
  }

  report += `  Details:\n`;
  report += `    VSCODE_PLUGIN: ${result.details.vscodePluginValue ?? 'not set'}\n`;
  report += `    VSCODE_PID: ${result.details.vscodeProcessId ?? 'not set'}\n`;
  report += `    TERM_PROGRAM: ${result.details.termProgram ?? 'not set'}\n`;
  report += `    VSCODE_APP_ROOT: ${result.details.appRoot ?? 'not set'}\n`;

  return report;
}

/**
 * 用于测试的环境模拟器
 * @param overrides - 环境变量覆盖
 * @returns 检测结果
 */
export function detectVSCodeEnvironmentWithOverrides(
  overrides: Record<string, string | undefined>,
): EnvironmentDetectionResult {
  const savedEnv = { ...process.env };

  try {
    // 应用覆盖
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    return detectVSCodeEnvironment();
  } finally {
    // 恢复原始环境
    Object.assign(process.env, savedEnv);
  }
}
