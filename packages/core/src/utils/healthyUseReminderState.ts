/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { getProjectTempDir } from './paths.js';

const REMINDER_STATE_FILE = 'healthy-use-reminder.json';

interface ReminderState {
  lastReminderShownAt: number; // 最后一次显示提醒的时间戳
}

/**
 * 健康使用提醒状态管理工具类
 *
 * 存储在项目临时目录下，支持多实例共享状态
 * 文件路径：~/.deepv/tmp/<project-hash>/healthy-use-reminder.json
 */
export class HealthyUseReminderState {
  private projectRoot: string;
  private stateFilePath: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    const tempDir = getProjectTempDir(projectRoot);
    this.stateFilePath = path.join(tempDir, REMINDER_STATE_FILE);
  }

  /**
   * 检查是否应该显示提醒
   *
   * 逻辑：
   * 1. 如果当前不在防沉迷时段（22:00-6:00），清理状态并返回 false
   * 2. 如果在防沉迷时段内，检查距离上次提醒是否已超过 45 分钟
   *
   * @returns 是否应该显示提醒
   */
  shouldShowReminder(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const isRestrictedTime = hour >= 22 || hour < 6;

    // 不在防沉迷时段，清理状态
    if (!isRestrictedTime) {
      this.clearState();
      return false;
    }

    // 在防沉迷时段，检查是否需要提醒
    const state = this.loadState();
    if (!state || state.lastReminderShownAt === 0) {
      return true; // 首次提醒
    }

    const fortyFiveMinutesInMs = 45 * 60 * 1000;
    const timeSinceLastReminder = Date.now() - state.lastReminderShownAt;

    return timeSinceLastReminder >= fortyFiveMinutesInMs;
  }

  /**
   * 记录已显示提醒
   *
   * 注意：这是记录"显示提醒"的时间，而不是"稍后提醒"的时间
   * 用户点击"稍后提醒"只是关闭弹窗，不重置这个时间戳
   */
  markReminderShown(): void {
    this.saveState({
      lastReminderShownAt: Date.now(),
    });
  }

  /**
   * 清理状态文件
   *
   * 在退出防沉迷时段时调用，确保下次进入时重新开始计时
   */
  clearState(): void {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        fs.unlinkSync(this.stateFilePath);
      }
    } catch (error) {
      // 静默失败，不影响主流程
      if (process.env.DEBUG) {
        console.error('[HealthyUseReminderState] Failed to clear state:', error);
      }
    }
  }

  /**
   * 加载状态
   */
  private loadState(): ReminderState | null {
    try {
      if (!fs.existsSync(this.stateFilePath)) {
        return null;
      }

      const content = fs.readFileSync(this.stateFilePath, 'utf-8');
      return JSON.parse(content) as ReminderState;
    } catch (error) {
      // 文件损坏或格式错误，返回 null
      if (process.env.DEBUG) {
        console.error('[HealthyUseReminderState] Failed to load state:', error);
      }
      return null;
    }
  }

  /**
   * 保存状态
   */
  private saveState(state: ReminderState): void {
    try {
      const tempDir = path.dirname(this.stateFilePath);

      // 确保目录存在
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (error) {
      // 静默失败，不影响主流程
      if (process.env.DEBUG) {
        console.error('[HealthyUseReminderState] Failed to save state:', error);
      }
    }
  }
}
