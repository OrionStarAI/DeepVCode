/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { truncateText, getDefaultMaxRows } from './textTruncator.js';

describe('textTruncator', () => {
  describe('truncateText', () => {
    it('should not truncate short text', () => {
      const text = 'Short text\nSecond line';
      const result = truncateText(text, {
        maxRows: 10,
        terminalWidth: 80,
      });

      expect(result.isTruncated).toBe(false);
      expect(result.displayText).toBe(text);
      expect(result.fullText).toBe(text);
      expect(result.omittedLines).toBeUndefined();
    });

    it('should truncate long text with head and tail', () => {
      const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
      const text = lines.join('\n');

      const result = truncateText(text, {
        maxRows: 5,
        terminalWidth: 80,
      });

      expect(result.isTruncated).toBe(true);
      expect(result.fullText).toBe(text);
      expect(result.omittedLines).toBeGreaterThan(0);

      // 应该包含省略提示
      expect(result.displayText).toContain('已省略显示');
      expect(result.displayText).toContain('行');

      // 应该包含头部和尾部
      expect(result.displayText).toContain('Line 1');
      expect(result.displayText).toContain('Line 20');
    });

    it('should preserve full text for copying', () => {
      const text = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}`).join('\n');

      const result = truncateText(text, {
        maxRows: 10,
        terminalWidth: 80,
      });

      expect(result.fullText).toBe(text);
      expect(result.fullText.split('\n')).toHaveLength(50);
    });

    it('should handle custom headRatio', () => {
      const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
      const text = lines.join('\n');

      const result = truncateText(text, {
        maxRows: 10,
        terminalWidth: 80,
        headRatio: 0.7, // 头部占 70%
      });

      expect(result.isTruncated).toBe(true);

      const displayLines = result.displayText.split('\n');
      // maxRows=10, headRatio=0.7 => headRows=6, tailRows=3, omitted=1
      // 总共应该是 10 行（包括省略提示）
      expect(displayLines.length).toBe(10);
    });

    it('should handle empty text', () => {
      const result = truncateText('', {
        maxRows: 10,
        terminalWidth: 80,
      });

      expect(result.isTruncated).toBe(false);
      expect(result.displayText).toBe('');
      expect(result.fullText).toBe('');
    });

    it('should handle single line text', () => {
      const text = 'Single line';
      const result = truncateText(text, {
        maxRows: 10,
        terminalWidth: 80,
      });

      expect(result.isTruncated).toBe(false);
      expect(result.displayText).toBe(text);
    });

    it('should handle text exactly at maxRows', () => {
      const lines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`);
      const text = lines.join('\n');

      const result = truncateText(text, {
        maxRows: 10,
        terminalWidth: 80,
      });

      expect(result.isTruncated).toBe(false);
      expect(result.displayText).toBe(text);
    });
  });

  describe('getDefaultMaxRows', () => {
    it('should return stricter limit for sent scenario', () => {
      const viewportRows = 30;
      const sentLimit = getDefaultMaxRows('sent', viewportRows);
      const refinedLimit = getDefaultMaxRows('refined', viewportRows);

      expect(sentLimit).toBeLessThanOrEqual(refinedLimit);
      expect(sentLimit).toBe(8); // min(8, 30-1)
    });

    it('should cap refined limit at viewport - 1', () => {
      const viewportRows = 10;
      const limit = getDefaultMaxRows('refined', viewportRows);

      expect(limit).toBe(9); // min(10-1, 16)
    });

    it('should cap refined limit at 16', () => {
      const viewportRows = 50;
      const limit = getDefaultMaxRows('refined', viewportRows);

      expect(limit).toBe(16); // min(50-1, 16)
    });

    it('should handle small viewport for sent', () => {
      const viewportRows = 5;
      const limit = getDefaultMaxRows('sent', viewportRows);

      expect(limit).toBe(4); // min(8, 5-1)
    });
  });
});
