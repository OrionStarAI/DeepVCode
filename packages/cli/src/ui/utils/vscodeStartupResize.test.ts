/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { performStartupResize, shouldPerformStartupResize, getEnvironmentInfo } from './vscodeStartupResize.js';

describe('vscodeStartupResize', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.useFakeTimers();
    // Reset environment
    originalEnv = { ...process.env };

    // Mock process.stdout properties
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(process.stdout, 'columns', {
      value: 120,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(process.stdout, 'rows', {
      value: 30,
      writable: true,
      configurable: true,
    });

    // Mock emit method
    process.stdout.emit = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('getEnvironmentInfo', () => {
    it('should detect VSCode environment correctly', () => {
      process.env.VSCODE_PID = '12345';
      process.env.TERM_PROGRAM = 'vscode';

      const info = getEnvironmentInfo();

      expect(info.isVSCode).toBe(true);
      expect(info.isIDE).toBe(true);
      expect(info.isTTY).toBe(true);
      expect(info.columns).toBe(120);
      expect(info.rows).toBe(30);
      expect(info.termProgram).toBe('vscode');
      expect(info.vscodePid).toBe('12345');
    });

    it('should detect non-VSCode IDE environment', () => {
      process.env.TERM_PROGRAM = 'jetbrains';
      delete process.env.VSCODE_PID;

      const info = getEnvironmentInfo();

      expect(info.isVSCode).toBe(false);
      expect(info.isIDE).toBe(true);
    });

    it('should detect regular terminal environment', () => {
      delete process.env.VSCODE_PID;
      delete process.env.TERM_PROGRAM;
      delete process.env.TERMINAL_EMULATOR;

      const info = getEnvironmentInfo();

      expect(info.isVSCode).toBe(false);
      expect(info.isIDE).toBe(false);
    });
  });

  describe('shouldPerformStartupResize', () => {
    it('should return true for VSCode with TTY', () => {
      process.env.VSCODE_PID = '12345';

      expect(shouldPerformStartupResize()).toBe(true);
    });

    it('should return false for non-TTY environment', () => {
      process.env.VSCODE_PID = '12345';
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      });

      expect(shouldPerformStartupResize()).toBe(false);
    });

    it('should return false for regular terminal', () => {
      delete process.env.VSCODE_PID;
      delete process.env.TERM_PROGRAM;

      expect(shouldPerformStartupResize()).toBe(false);
    });
  });

  describe('performStartupResize', () => {
    it('should perform resize in VSCode environment', () => {
      process.env.VSCODE_PID = '12345';

      // Use a shorter delay for testing
      performStartupResize({ delay: 10 });

      // Advance past initial delay
      vi.advanceTimersByTime(10);
      expect(process.stdout.emit).toHaveBeenCalledWith('resize');

      // Advance past second delay (100ms)
      vi.advanceTimersByTime(100);
      expect(process.stdout.emit).toHaveBeenCalledTimes(2);
    });

    it('should not perform resize in regular terminal', () => {
      delete process.env.VSCODE_PID;
      delete process.env.TERM_PROGRAM;

      performStartupResize();

      vi.runAllTimers();
      expect(process.stdout.emit).not.toHaveBeenCalled();
    });

    it('should perform resize when forced', () => {
      delete process.env.VSCODE_PID;
      delete process.env.TERM_PROGRAM;

      performStartupResize({ force: true, delay: 10 });

      // Advance past initial delay
      vi.advanceTimersByTime(10);
      expect(process.stdout.emit).toHaveBeenCalledWith('resize');

      // Advance past second delay (100ms)
      vi.advanceTimersByTime(100);
      expect(process.stdout.emit).toHaveBeenCalledTimes(2);
    });

    it('should not perform resize when stdout is not TTY', () => {
      process.env.VSCODE_PID = '12345';
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      });

      performStartupResize();

      expect(process.stdout.emit).not.toHaveBeenCalled();
    });
  });
});