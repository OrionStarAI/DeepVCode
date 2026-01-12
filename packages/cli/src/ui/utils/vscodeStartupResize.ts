/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * VSCode终端启动时的resize优化模块
 * 
 * 针对VSCode内置终端启动后坐标系统校准问题的解决方案
 * 通过模拟resize事件来触发终端重新校准，解决光标位置偏移等问题
 */

/**
 * 检测是否在VSCode环境中运行
 */
function isVSCodeEnvironment(): boolean {
  return !!(
    process.env.VSCODE_PID || 
    process.env.TERM_PROGRAM === 'vscode'
  );
}

/**
 * 检测是否在IDE环境中运行（包括VSCode和其他IDE）
 */
function isIDEEnvironment(): boolean {
  return !!(
    process.env.TERM_PROGRAM || 
    process.env.VSCODE_PID || 
    process.env.TERMINAL_EMULATOR
  );
}

/**
 * 启动时触发简单的resize模拟
 * 
 * 这个函数通过以下步骤解决VSCode终端的坐标校准问题：
 * 1. 临时修改终端列数（减少1列）
 * 2. 触发resize事件
 * 3. 100ms后恢复原始列数
 * 4. 再次触发resize事件
 * 
 * 这个过程会强制终端重新计算坐标系统，解决光标位置不准确的问题
 */
function triggerStartupResize(): void {
  if (!process.stdout.isTTY) return;
  
  const originalColumns = process.stdout.columns || 80;
  const originalRows = process.stdout.rows || 24;
  
  // 简单的resize模拟：暂时调整为略小的尺寸再恢复
  setTimeout(() => {
    // 修改为略小的尺寸
    Object.defineProperty(process.stdout, 'columns', {
      value: originalColumns - 1,
      writable: true,
      configurable: true
    });
    
    // 触发resize事件
    process.stdout.emit('resize');
    
    // 100ms后恢复原始尺寸
    setTimeout(() => {
      Object.defineProperty(process.stdout, 'columns', {
        value: originalColumns,
        writable: true,
        configurable: true
      });
      
      // 再次触发resize事件
      process.stdout.emit('resize');
    }, 100);
  }, 300);
}

/**
 * 在VSCode或其他IDE环境中执行启动时的resize校准
 * 
 * 这是对外暴露的主要函数，会自动检测环境并决定是否执行resize校准
 * 
 * @param options - 可选配置
 * @param options.force - 强制执行resize，即使不在IDE环境中
 * @param options.delay - 自定义延迟时间（毫秒），默认300ms
 */
export function performStartupResize(options: {
  force?: boolean;
  delay?: number;
} = {}): void {
  const { force = false, delay = 300 } = options;
  
  // 检查是否应该执行resize
  if (!force && !isIDEEnvironment()) {
    return;
  }
  
  if (!process.stdout.isTTY) return;
  
  const originalColumns = process.stdout.columns || 80;
  const originalRows = process.stdout.rows || 24;
  
  // 使用自定义延迟
  setTimeout(() => {
    // 修改为略小的尺寸
    Object.defineProperty(process.stdout, 'columns', {
      value: originalColumns - 1,
      writable: true,
      configurable: true
    });
    
    // 触发resize事件
    process.stdout.emit('resize');
    
    // 100ms后恢复原始尺寸
    setTimeout(() => {
      Object.defineProperty(process.stdout, 'columns', {
        value: originalColumns,
        writable: true,
        configurable: true
      });
      
      // 再次触发resize事件
      process.stdout.emit('resize');
    }, 100);
  }, delay);
}

/**
 * 检查当前环境是否需要启动resize校准
 */
export function shouldPerformStartupResize(): boolean {
  return isIDEEnvironment() && process.stdout.isTTY;
}

/**
 * 获取当前环境信息（用于调试）
 */
export function getEnvironmentInfo(): {
  isVSCode: boolean;
  isIDE: boolean;
  isTTY: boolean;
  columns: number;
  rows: number;
  termProgram: string | undefined;
  vscodePid: string | undefined;
} {
  return {
    isVSCode: isVSCodeEnvironment(),
    isIDE: isIDEEnvironment(),
    isTTY: process.stdout.isTTY,
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
    termProgram: process.env.TERM_PROGRAM,
    vscodePid: process.env.VSCODE_PID,
  };
}