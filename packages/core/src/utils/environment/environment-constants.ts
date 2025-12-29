/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 环境相关的环境变量常量定义
 */

export const ENVIRONMENT_VARIABLES = {
  // VSCode 相关环境变量
  VSCODE_PID: 'VSCODE_PID',           // VSCode 进程 ID（由 VSCode 设置）
  VSCODE_PLUGIN: 'VSCODE_PLUGIN',     // DeepV Code 插件标记（由插件设置为 '1'）
  VSCODE_APP_ROOT: 'VSCODE_APP_ROOT', // VSCode 应用根路径（由 VSCode 设置）
  TERM_PROGRAM: 'TERM_PROGRAM',       // 终端程序（macOS Terminal 设置为 'Apple_Terminal'）

  // 其他环境相关
  WSL_DISTRO_NAME: 'WSL_DISTRO_NAME', // WSL 发行版名称
  WSL_INTEROP: 'WSL_INTEROP',         // WSL 互操作标记
} as const;

export const VSCODE_INDICATORS = {
  TERM_PROGRAM_VALUE: 'vscode',  // 终端程序值
  PLUGIN_ENABLED_VALUE: '1',      // 插件启用值
} as const;
