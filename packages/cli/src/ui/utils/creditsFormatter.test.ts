/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { formatCreditsNumber, formatCreditsWithColor } from './creditsFormatter.js';

describe('creditsFormatter', () => {
  describe('formatCreditsNumber', () => {
    it('should handle invalid values gracefully', () => {
      expect(formatCreditsNumber(NaN)).toBe('0');
      expect(formatCreditsNumber(Infinity)).toBe('0');
      expect(formatCreditsNumber(-100)).toBe('0');
    });

    it('should format large numbers with M suffix and 2 decimal places', () => {
      expect(formatCreditsNumber(1500000)).toBe('1.50M');
      expect(formatCreditsNumber(1000000)).toBe('1.00M');
      expect(formatCreditsNumber(2400000)).toBe('2.40M');
      expect(formatCreditsNumber(5000000)).toBe('5.00M');
      expect(formatCreditsNumber(1234567)).toBe('1.23M');
    });

    it('should format thousands with k suffix and 2 decimal places', () => {
      expect(formatCreditsNumber(1500)).toBe('1.50k');
      expect(formatCreditsNumber(1000)).toBe('1.00k');
      expect(formatCreditsNumber(2400)).toBe('2.40k');
      expect(formatCreditsNumber(5000)).toBe('5.00k');
      expect(formatCreditsNumber(1234)).toBe('1.23k');
    });

    it('should return plain integers for values under 1000', () => {
      expect(formatCreditsNumber(0)).toBe('0');
      expect(formatCreditsNumber(100)).toBe('100');
      expect(formatCreditsNumber(500)).toBe('500');
      expect(formatCreditsNumber(999)).toBe('999');
      expect(formatCreditsNumber(999.99)).toBe('999');
    });

    it('should keep 2 decimal places for M and k units', () => {
      expect(formatCreditsNumber(1050000)).toBe('1.05M');
      expect(formatCreditsNumber(1010000)).toBe('1.01M');
      expect(formatCreditsNumber(1050)).toBe('1.05k');
      expect(formatCreditsNumber(1010)).toBe('1.01k');
    });
  });

  describe('formatCreditsWithColor', () => {
    it('should include credits icon and labels', () => {
      const result = formatCreditsWithColor(10000, 2000, 20);
      expect(result).toContain('💳');
      // Labels will be internationalized, so just check the structure
      expect(result).toContain(':');  // Should have colon-separated labels
    });

    it('should format numbers using k/M suffixes', () => {
      const result = formatCreditsWithColor(10000, 5000, 50);
      expect(result).toContain('10.00k');  // Plan
      expect(result).toContain('5.00k');   // Used
      // Available = 10000 - 5000 = 5000
    });

    it('should include usage percentage', () => {
      const result = formatCreditsWithColor(10000, 2000, 20);
      expect(result).toContain('(20.0%)');
    });

    it('should calculate and display available credits', () => {
      const result = formatCreditsWithColor(10000, 3000, 30);
      // Available = 10000 - 3000 = 7000 = 7.00k
      expect(result).toContain('7.00k');
      // Usage percentage should appear after used credits
      expect(result).toContain('(30.0%)');
    });

    it('should include ANSI color codes', () => {
      const result = formatCreditsWithColor(10000, 2000, 20);
      expect(result).toContain('\x1b[');  // ANSI escape code
      expect(result).toContain('\x1b[0m'); // RESET code
    });

    it('should use appropriate colors based on usage percentage', () => {
      const lowUsage = formatCreditsWithColor(10000, 2000, 20);
      const highUsage = formatCreditsWithColor(10000, 9600, 96);

      // Both should have colors but we can't easily test the specific color codes
      // Just verify they contain ANSI codes
      expect(lowUsage).not.toBeNull();
      expect(lowUsage).toContain('\x1b[');
      expect(highUsage).not.toBeNull();
      expect(highUsage).toContain('\x1b[');
    });

    it('should return null for invalid data', () => {
      // NaN values
      expect(formatCreditsWithColor(NaN, 1000, 50)).toBeNull();
      expect(formatCreditsWithColor(10000, NaN, 50)).toBeNull();
      expect(formatCreditsWithColor(10000, 1000, NaN)).toBeNull();

      // Out of range
      expect(formatCreditsWithColor(-1000, 100, 10)).toBeNull();
      expect(formatCreditsWithColor(10000, -100, 10)).toBeNull();
      expect(formatCreditsWithColor(10000, 100, -10)).toBeNull();
      expect(formatCreditsWithColor(10000, 100, 101)).toBeNull();

      // Infinity
      expect(formatCreditsWithColor(Infinity, 1000, 50)).toBeNull();
      expect(formatCreditsWithColor(10000, Infinity, 50)).toBeNull();
    });
  });
});
