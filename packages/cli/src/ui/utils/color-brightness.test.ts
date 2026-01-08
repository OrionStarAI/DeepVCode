/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { adjustBrightness, createLEDColorPair } from './color-brightness.js';

describe('color-brightness utils', () => {
  describe('adjustBrightness', () => {
    it('should adjust hex color brightness', () => {
      const color = '#FF8C00'; // 橙色
      const dimmed = adjustBrightness(color, 0.4);
      
      // 应该返回一个更暗的橙色hex值
      expect(dimmed).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(dimmed).not.toBe(color);
      
      // 验证亮度确实降低了
      const originalR = parseInt(color.substring(1, 3), 16);
      const dimmedR = parseInt(dimmed.substring(1, 3), 16);
      expect(dimmedR).toBeLessThan(originalR);
    });

    it('should handle 3-digit hex colors', () => {
      const color = '#F80'; // 3位橙色
      const dimmed = adjustBrightness(color, 0.5);
      
      expect(dimmed).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(dimmed).not.toBe(color);
    });

    it('should handle factor of 1 (no change)', () => {
      const color = '#FF8C00';
      const result = adjustBrightness(color, 1.0);
      
      expect(result.toLowerCase()).toBe(color.toLowerCase());
    });

    it('should handle factor of 0 (black)', () => {
      const color = '#FF8C00';
      const result = adjustBrightness(color, 0);
      
      expect(result).toBe('#000000');
    });

    it('should handle CSS color names', () => {
      const result = adjustBrightness('blue', 0.4);
      
      // 应该返回一个暗蓝色或原色
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should clamp factor to valid range', () => {
      const color = '#FF8C00';
      
      // 超出范围的因子应该被限制
      const tooHigh = adjustBrightness(color, 2.0);
      const tooLow = adjustBrightness(color, -0.5);
      
      expect(tooHigh.toLowerCase()).toBe(color.toLowerCase()); // factor 2.0 -> 1.0
      expect(tooLow).toBe('#000000'); // factor -0.5 -> 0.0
    });
  });

  describe('createLEDColorPair', () => {
    it('should create dim and bright color pair for hex color', () => {
      const originalColor = '#FF8C00';
      const colorPair = createLEDColorPair(originalColor);
      
      expect(colorPair).toHaveProperty('dim');
      expect(colorPair).toHaveProperty('bright');
      expect(colorPair.bright).toBe(originalColor);
      expect(colorPair.dim).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(colorPair.dim).not.toBe(originalColor);
    });

    it('should create color pair for CSS color name', () => {
      const originalColor = 'blue';
      const colorPair = createLEDColorPair(originalColor);
      
      expect(colorPair).toHaveProperty('dim');
      expect(colorPair).toHaveProperty('bright');
      expect(colorPair.bright).toBe(originalColor);
      expect(typeof colorPair.dim).toBe('string');
    });

    it('should make dim color darker than bright', () => {
      const originalColor = '#FF8C00';
      const colorPair = createLEDColorPair(originalColor);
      
      // 验证dim颜色比bright颜色暗
      const brightR = parseInt(originalColor.substring(1, 3), 16);
      const dimR = parseInt(colorPair.dim.substring(1, 3), 16);
      
      expect(dimR).toBeLessThan(brightR);
    });
  });
});