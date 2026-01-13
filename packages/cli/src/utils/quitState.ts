/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 🎯 macOS Ctrl+C OOM 修复：全局退出状态管理
 *
 * 在 /quit 命令执行时设置此标志位，信号处理器会检查它。
 * 当 isQuitting 为 true 时，快速按 Ctrl+C 会直接 process.exit()，
 * 避免多个 JS 信号处理器同时执行导致的内存积累。
 */

let isQuitting = false;

/**
 * 设置退出状态标志
 * 在 /quit 命令执行时调用
 */
export function setQuitting(quitting: boolean = true): void {
  isQuitting = quitting;
}

/**
 * 获取当前退出状态
 */
export function getIsQuitting(): boolean {
  return isQuitting;
}
