/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { escapePath, unescapePath } from './paths.js';

describe('escapePath', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    // Restore original platform
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
      configurable: true,
    });
  });

  describe('on Windows (win32)', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });
    });

    it('should NOT escape spaces in file paths on Windows', () => {
      expect(escapePath('文件名 有空格.docx')).toBe('文件名 有空格.docx');
      expect(escapePath('file with spaces.txt')).toBe('file with spaces.txt');
      expect(escapePath('My Documents\\file.txt')).toBe('My Documents\\file.txt');
    });

    it('should return paths unchanged on Windows', () => {
      expect(escapePath('normal-file.txt')).toBe('normal-file.txt');
      expect(escapePath('文件名.docx')).toBe('文件名.docx');
    });

    it('should handle paths with multiple spaces on Windows', () => {
      expect(escapePath('文件名   有空格.docx')).toBe('文件名   有空格.docx');
    });
  });

  describe('on Unix-like systems (darwin, linux)', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true,
      });
    });

    it('should escape spaces in file paths on Unix-like systems', () => {
      expect(escapePath('file with spaces.txt')).toBe('file\\ with\\ spaces.txt');
      expect(escapePath('文件名 有空格.docx')).toBe('文件名\\ 有空格.docx');
    });

    it('should not double-escape already escaped spaces', () => {
      expect(escapePath('file\\ with\\ spaces.txt')).toBe('file\\ with\\ spaces.txt');
    });

    it('should handle paths with multiple consecutive spaces', () => {
      expect(escapePath('file   name.txt')).toBe('file\\ \\ \\ name.txt');
    });

    it('should not escape paths without spaces', () => {
      expect(escapePath('normal-file.txt')).toBe('normal-file.txt');
    });
  });
});

describe('unescapePath', () => {
  it('should unescape backslash-escaped spaces', () => {
    expect(unescapePath('file\\ with\\ spaces.txt')).toBe('file with spaces.txt');
    expect(unescapePath('文件名\\ 有空格.docx')).toBe('文件名 有空格.docx');
  });

  it('should handle multiple consecutive escaped spaces', () => {
    expect(unescapePath('文件名\\ \\ \\ 有空格.docx')).toBe('文件名   有空格.docx');
  });

  it('should not modify paths without escaped spaces', () => {
    expect(unescapePath('normal-file.txt')).toBe('normal-file.txt');
    expect(unescapePath('file with spaces.txt')).toBe('file with spaces.txt');
  });

  it('should preserve backslashes that are not escaping spaces', () => {
    expect(unescapePath('path\\to\\file.txt')).toBe('path\\to\\file.txt');
  });

  it('should work with @ symbol prefix', () => {
    expect(unescapePath('@file\\ name.txt')).toBe('@file name.txt');
    expect(unescapePath('@文件名\\ 有空格.docx')).toBe('@文件名 有空格.docx');
  });
});

describe('escapePath and unescapePath integration', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
      configurable: true,
    });
  });

  describe('on Windows', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });
    });

    it('should maintain path integrity through escape/unescape cycle', () => {
      const originalPath = '文件名   有空格.docx';
      const escaped = escapePath(originalPath);
      const unescaped = unescapePath(escaped);

      expect(escaped).toBe(originalPath); // No escaping on Windows
      expect(unescaped).toBe(originalPath); // Should remain unchanged
    });

    it('should handle @ command workflow correctly', () => {
      const userInput = '@文件名 有空格.docx';
      const pathPart = userInput.substring(1);
      const escaped = escapePath(pathPart);
      const finalPath = unescapePath('@' + escaped).substring(1);

      expect(finalPath).toBe(pathPart); // Path should be preserved
    });
  });

  describe('on Unix-like systems', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true,
      });
    });

    it('should maintain path integrity through escape/unescape cycle', () => {
      const originalPath = 'file with spaces.txt';
      const escaped = escapePath(originalPath);
      const unescaped = unescapePath(escaped);

      expect(escaped).toBe('file\\ with\\ spaces.txt');
      expect(unescaped).toBe(originalPath); // Should restore to original
    });
  });
});
