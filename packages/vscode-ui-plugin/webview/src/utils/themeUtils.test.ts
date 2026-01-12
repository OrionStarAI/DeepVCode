import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isLightTheme,
  getThemeType,
  getThemeColor,
  getThemeOpacity,
  applyThemeClass,
  watchThemeChange,
} from './themeUtils';

describe('themeUtils', () => {
  let originalGetComputedStyle: typeof window.getComputedStyle;

  // 辅助函数：Mock getComputedStyle 返回特定的背景色
  const mockEditorBackground = (color: string) => {
    window.getComputedStyle = vi.fn().mockReturnValue({
      getPropertyValue: (prop: string) => {
        if (prop === '--vscode-editor-background') {
          return color;
        }
        return '';
      },
    } as CSSStyleDeclaration);
  };

  beforeEach(() => {
    // 保存原始函数
    originalGetComputedStyle = window.getComputedStyle;

    // 清理 body 样式
    document.body.style.cssText = '';
    document.body.className = '';
  });

  afterEach(() => {
    // 恢复原始函数
    window.getComputedStyle = originalGetComputedStyle;
    vi.clearAllMocks();
  });

  describe('isLightTheme', () => {
    it('should return true for white background (#fff)', () => {
      mockEditorBackground('#ffffff');
      expect(isLightTheme()).toBe(true);
    });

    it('should return true for rgb white background', () => {
      mockEditorBackground('rgb(255, 255, 255)');
      expect(isLightTheme()).toBe(true);
    });

    it('should return true for light gray background (high brightness)', () => {
      mockEditorBackground('#e0e0e0'); // brightness > 128
      expect(isLightTheme()).toBe(true);
    });

    it('should return false for dark background (low brightness)', () => {
      mockEditorBackground('#1e1e1e'); // VS Code dark theme
      expect(isLightTheme()).toBe(false);
    });

    it('should return false for black background', () => {
      mockEditorBackground('#000000');
      expect(isLightTheme()).toBe(false);
    });

    it('should handle errors gracefully and return false', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Mock getComputedStyle to throw error
      window.getComputedStyle = (() => {
        throw new Error('Mock error');
      }) as any;

      expect(isLightTheme()).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('getThemeType', () => {
    it('should return "light" for light theme', () => {
      mockEditorBackground('#ffffff');
      expect(getThemeType()).toBe('light');
    });

    it('should return "dark" for dark theme', () => {
      mockEditorBackground('#1e1e1e');
      expect(getThemeType()).toBe('dark');
    });

    it('should return "dark" when isLightTheme returns false on error', () => {
      // Note: Since isLightTheme has its own try-catch that returns false on error,
      // getThemeType will return 'dark' even when there's an error
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      window.getComputedStyle = (() => {
        throw new Error('Mock error');
      }) as any;

      expect(getThemeType()).toBe('dark');
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('getThemeColor', () => {
    it('should return light color for light theme', () => {
      mockEditorBackground('#ffffff');
      const result = getThemeColor('#000000', '#ffffff');
      expect(result).toBe('#000000');
    });

    it('should return dark color for dark theme', () => {
      mockEditorBackground('#1e1e1e');
      const result = getThemeColor('#000000', '#ffffff');
      expect(result).toBe('#ffffff');
    });
  });

  describe('getThemeOpacity', () => {
    it('should return light opacity for light theme', () => {
      mockEditorBackground('#ffffff');
      const result = getThemeOpacity(0.8, 0.6);
      expect(result).toBe(0.8);
    });

    it('should return dark opacity for dark theme', () => {
      mockEditorBackground('#1e1e1e');
      const result = getThemeOpacity(0.8, 0.6);
      expect(result).toBe(0.6);
    });
  });

  describe('applyThemeClass', () => {
    it('should add theme-light class for light theme', () => {
      mockEditorBackground('#ffffff');
      const element = document.createElement('div');
      applyThemeClass(element);
      expect(element.classList.contains('theme-light')).toBe(true);
      expect(element.classList.contains('theme-dark')).toBe(false);
    });

    it('should add theme-dark class for dark theme', () => {
      mockEditorBackground('#1e1e1e');
      const element = document.createElement('div');
      applyThemeClass(element);
      expect(element.classList.contains('theme-dark')).toBe(true);
      expect(element.classList.contains('theme-light')).toBe(false);
    });

    it('should remove old theme class when switching themes', () => {
      const element = document.createElement('div');

      // First apply light theme
      mockEditorBackground('#ffffff');
      applyThemeClass(element);
      expect(element.classList.contains('theme-light')).toBe(true);

      // Then switch to dark theme
      mockEditorBackground('#1e1e1e');
      applyThemeClass(element);
      expect(element.classList.contains('theme-dark')).toBe(true);
      expect(element.classList.contains('theme-light')).toBe(false);
    });

    it('should add theme-dark class even on error', () => {
      // Note: When an error occurs, isLightTheme returns false, so theme becomes 'dark'
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      window.getComputedStyle = (() => {
        throw new Error('Mock error');
      }) as any;

      const element = document.createElement('div');
      applyThemeClass(element);

      expect(element.classList.contains('theme-light')).toBe(false);
      expect(element.classList.contains('theme-dark')).toBe(true);

      consoleWarnSpy.mockRestore();
    });
  });

  describe('watchThemeChange', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should detect theme change via periodic check', () => {
      // Start with light theme
      mockEditorBackground('#ffffff');
      const callback = vi.fn();
      const cleanup = watchThemeChange(callback);

      // Change to dark theme
      mockEditorBackground('#1e1e1e');

      // Advance timer to trigger periodic check
      vi.advanceTimersByTime(1000);

      expect(callback).toHaveBeenCalledWith('dark');

      cleanup();
    });

    it('should return cleanup function that stops watching', () => {
      mockEditorBackground('#ffffff');
      const callback = vi.fn();
      const cleanup = watchThemeChange(callback);

      cleanup();

      // Change theme after cleanup
      mockEditorBackground('#1e1e1e');
      vi.advanceTimersByTime(2000);

      // Callback should not be called after cleanup
      expect(callback).not.toHaveBeenCalled();
    });

    it('should not call callback if theme does not change', () => {
      mockEditorBackground('#ffffff');
      const callback = vi.fn();
      const cleanup = watchThemeChange(callback);

      // Keep the same theme
      mockEditorBackground('#ffffff');
      vi.advanceTimersByTime(2000);

      expect(callback).not.toHaveBeenCalled();

      cleanup();
    });

    it('should detect light to dark transition', () => {
      mockEditorBackground('#ffffff');
      const callback = vi.fn();
      const cleanup = watchThemeChange(callback);

      // Switch to dark
      mockEditorBackground('#000000');
      vi.advanceTimersByTime(1000);

      expect(callback).toHaveBeenCalledWith('dark');

      cleanup();
    });

    it('should detect dark to light transition', () => {
      mockEditorBackground('#000000');
      const callback = vi.fn();
      const cleanup = watchThemeChange(callback);

      // Switch to light
      mockEditorBackground('#ffffff');
      vi.advanceTimersByTime(1000);

      expect(callback).toHaveBeenCalledWith('light');

      cleanup();
    });
  });
});