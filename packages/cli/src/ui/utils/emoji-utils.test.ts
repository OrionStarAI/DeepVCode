/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { describe, it, expect } from 'vitest';
import {
  isEmoji,
  isCommonSymbol,
  analyzeTextForHighlight,
  calculateHighlightableLength
} from './emoji-utils.js';

describe('emoji-utils', () => {
  describe('isEmoji', () => {
    it('should detect common emojis', () => {
      expect(isEmoji('😀')).toBe(true);
      expect(isEmoji('🚀')).toBe(true);
      expect(isEmoji('💡')).toBe(true);
      expect(isEmoji('⭐')).toBe(true);
      expect(isEmoji('⏳')).toBe(true);
    });

    it('should not detect regular characters as emojis', () => {
      expect(isEmoji('a')).toBe(false);
      expect(isEmoji('A')).toBe(false);
      expect(isEmoji('1')).toBe(false);
      expect(isEmoji(' ')).toBe(false);
      expect(isEmoji('中')).toBe(false);
    });

    it('should detect multi-byte characters as emojis', () => {
      expect(isEmoji('👨‍💻')).toBe(true); // composite emoji
    });
  });

  describe('isCommonSymbol', () => {
    it('should detect common symbols', () => {
      expect(isCommonSymbol('💡')).toBe(true);
      expect(isCommonSymbol('🚀')).toBe(true);
      expect(isCommonSymbol('⚡')).toBe(true);
      expect(isCommonSymbol('🔥')).toBe(true);
    });

    it('should not detect regular characters as common symbols', () => {
      expect(isCommonSymbol('a')).toBe(false);
      expect(isCommonSymbol('😀')).toBe(false); // emoji but not in common symbols list
    });
  });

  describe('analyzeTextForHighlight', () => {
    it('should correctly analyze text with emojis', () => {
      const result = analyzeTextForHighlight('💡 Hello World');

      expect(result).toHaveLength(13);
      expect(result[0]).toEqual({
        char: '💡',
        index: 0,
        isEmoji: true,
        shouldHighlight: false
      });
      expect(result[1]).toEqual({
        char: ' ',
        index: 1,
        isEmoji: false,
        shouldHighlight: true
      });
      expect(result[2]).toEqual({
        char: 'H',
        index: 2,
        isEmoji: false,
        shouldHighlight: true
      });
    });

    it('should analyze pure text without emojis', () => {
      const result = analyzeTextForHighlight('Hello World');

      expect(result).toHaveLength(11);
      expect(result.every(item => item.shouldHighlight)).toBe(true);
      expect(result.every(item => !item.isEmoji)).toBe(true);
    });

    it('should analyze text with only emojis', () => {
      const result = analyzeTextForHighlight('💡🚀⭐');

      expect(result).toHaveLength(3);
      expect(result.every(item => !item.shouldHighlight)).toBe(true);
      expect(result.every(item => item.isEmoji)).toBe(true);
    });
  });

  describe('calculateHighlightableLength', () => {
    it('should calculate correct highlightable length for text with emojis', () => {
      expect(calculateHighlightableLength('💡 Hello World')).toBe(12); // 13 - 1 emoji
      expect(calculateHighlightableLength('🚀 Processing...')).toBe(14); // 15 - 1 emoji
      expect(calculateHighlightableLength('Hello World')).toBe(11); // no emojis
      expect(calculateHighlightableLength('💡🚀⭐')).toBe(0); // only emojis
    });

    it('should handle mixed emoji and text', () => {
      const text = '💡 Use dvcode -c 🚀';
      const result = calculateHighlightableLength(text);
      // 让我们验证实际长度：总长度减去emoji数量
      const codePointLength = Array.from(text).length; // 应该是17
      const emojiCount = 2; // 💡 和 🚀
      expect(result).toBe(codePointLength - emojiCount); // 17 - 2 = 15
    });

    it('should handle Chinese text with emojis', () => {
      expect(calculateHighlightableLength('💡 使用dvcode命令')).toBe(11); // 12 - 1 emoji
    });
  });
});