/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * 环境检测相关的类型定义
 */

export enum EnvironmentType {
  VSCODE_PLUGIN = 'vscode-plugin',  // VSCode 插件环境
  CLI = 'cli',                      // 命令行环境
  IDE = 'ide',                      // IDE 环境
}

export enum VSCodeDetectionMethod {
  PLUGIN_MARKER = 'VSCODE_PLUGIN=1',         // 最可信：插件标记
  VSCODE_PID = 'VSCODE_PID',                 // 次可信：VSCode PID
  TERM_PROGRAM = 'TERM_PROGRAM=vscode',     // 不可信：终端程序（可能是其他编辑器）
}

export interface EnvironmentDetectionResult {
  type: EnvironmentType;
  isVSCode: boolean;
  method: VSCodeDetectionMethod | null;
  details: {
    vscodePluginValue?: string;
    vscodeProcessId?: string;
    termProgram?: string;
    appRoot?: string;
  };
}

export interface ProcessDetectionConfig {
  skipInVSCode?: boolean;          // 在 VSCode 环境中是否跳过进程检测
  enableDetailedLogging?: boolean;  // 是否启用详细日志
  timeoutMs?: number;               // 进程检测超时（毫秒）
}
