/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { HealthyUseReminderState } from './healthyUseReminderState.js';
import { getProjectTempDir } from './paths.js';

describe('HealthyUseReminderState', () => {
  let testProjectRoot: string;
  let testTempDir: string;
  let reminderState: HealthyUseReminderState;

  beforeEach(() => {
    // 创建临时测试目录
    testProjectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'healthy-use-test-'));
    reminderState = new HealthyUseReminderState(testProjectRoot);

    // 获取状态文件实际存储路径（通过 getProjectTempDir 计算）
    testTempDir = getProjectTempDir(testProjectRoot);
  });

  afterEach(() => {
    // 清理测试目录
    reminderState.clearState();
    if (fs.existsSync(testProjectRoot)) {
      fs.rmSync(testProjectRoot, { recursive: true, force: true });
    }
    if (fs.existsSync(testTempDir)) {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('shouldShowReminder', () => {
    it('should return false outside restricted time (6:00-22:00)', () => {
      // Mock 当前时间为上午 10:00（非防沉迷时段）
      const mockDate = new Date('2025-01-15T10:00:00');
      vi.setSystemTime(mockDate);

      const result = reminderState.shouldShowReminder();

      expect(result).toBe(false);
      vi.useRealTimers();
    });

    it('should return true at first time in restricted time (22:00-6:00)', () => {
      // Mock 当前时间为晚上 23:00（防沉迷时段）
      const mockDate = new Date('2025-01-15T23:00:00');
      vi.setSystemTime(mockDate);

      const result = reminderState.shouldShowReminder();

      expect(result).toBe(true);
      vi.useRealTimers();
    });

    it('should return false if less than 45 minutes since last reminder', () => {
      // Mock 当前时间为晚上 23:00
      const mockDate = new Date('2025-01-15T23:00:00');
      vi.setSystemTime(mockDate);

      // 标记已显示提醒
      reminderState.markReminderShown();

      // 30 分钟后检查
      vi.setSystemTime(new Date('2025-01-15T23:30:00'));
      const result = reminderState.shouldShowReminder();

      expect(result).toBe(false);
      vi.useRealTimers();
    });

    it('should return true if more than 45 minutes since last reminder', () => {
      // Mock 当前时间为晚上 23:00
      const mockDate = new Date('2025-01-15T23:00:00');
      vi.setSystemTime(mockDate);

      // 标记已显示提醒
      reminderState.markReminderShown();

      // 50 分钟后检查
      vi.setSystemTime(new Date('2025-01-15T23:50:00'));
      const result = reminderState.shouldShowReminder();

      expect(result).toBe(true);
      vi.useRealTimers();
    });

    it('should clear state when exiting restricted time', () => {
      // Mock 当前时间为晚上 23:00（防沉迷时段）
      vi.setSystemTime(new Date('2025-01-15T23:00:00'));
      reminderState.markReminderShown();

      // 验证状态文件已创建
      const stateFilePath = path.join(testTempDir, 'healthy-use-reminder.json');
      expect(fs.existsSync(stateFilePath)).toBe(true);

      // 切换到上午 8:00（非防沉迷时段）
      vi.setSystemTime(new Date('2025-01-16T08:00:00'));
      reminderState.shouldShowReminder();

      // 验证状态文件已删除
      expect(fs.existsSync(stateFilePath)).toBe(false);
      vi.useRealTimers();
    });
  });

  describe('markReminderShown', () => {
    it('should create state file with current timestamp', () => {
      const mockDate = new Date('2025-01-15T23:00:00');
      vi.setSystemTime(mockDate);

      reminderState.markReminderShown();

      const stateFilePath = path.join(testTempDir, 'healthy-use-reminder.json');
      expect(fs.existsSync(stateFilePath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
      expect(content.lastReminderShownAt).toBe(mockDate.getTime());
      vi.useRealTimers();
    });

    it('should create directory if not exists', () => {
      // 确保目录不存在
      if (fs.existsSync(testTempDir)) {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      }

      reminderState.markReminderShown();

      expect(fs.existsSync(testTempDir)).toBe(true);
    });
  });

  describe('clearState', () => {
    it('should remove state file if exists', () => {
      reminderState.markReminderShown();

      const stateFilePath = path.join(testTempDir, 'healthy-use-reminder.json');
      expect(fs.existsSync(stateFilePath)).toBe(true);

      reminderState.clearState();

      expect(fs.existsSync(stateFilePath)).toBe(false);
    });

    it('should not throw error if state file does not exist', () => {
      expect(() => reminderState.clearState()).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle corrupted state file gracefully', () => {
      const stateFilePath = path.join(testTempDir, 'healthy-use-reminder.json');

      // 创建目录
      fs.mkdirSync(testTempDir, { recursive: true });

      // 写入损坏的 JSON
      fs.writeFileSync(stateFilePath, '{ invalid json }', 'utf-8');

      // Mock 防沉迷时段
      vi.setSystemTime(new Date('2025-01-15T23:00:00'));

      // 应该返回 true（视为首次提醒）
      const result = reminderState.shouldShowReminder();
      expect(result).toBe(true);
      vi.useRealTimers();
    });

    it('should work across midnight (22:00 -> 1:00)', () => {
      // 晚上 23:00 显示提醒
      vi.setSystemTime(new Date('2025-01-15T23:00:00'));
      reminderState.markReminderShown();

      // 凌晨 1:00 检查（仍在防沉迷时段）
      vi.setSystemTime(new Date('2025-01-16T01:00:00'));
      const result = reminderState.shouldShowReminder();

      expect(result).toBe(true); // 已经过了 2 小时
      vi.useRealTimers();
    });
  });
});
