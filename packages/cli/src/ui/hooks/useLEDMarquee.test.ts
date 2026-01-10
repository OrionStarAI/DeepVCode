/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useLEDMarquee } from './useLEDMarquee.js';

// Mock小窗口优化hooks
vi.mock('./useSmallWindowOptimization.js', () => ({
  useSmallWindowOptimization: () => ({
    sizeLevel: 'normal',
    isSmallWindow: false
  }),
  shouldSkipAnimation: () => false,
  getOptimalRefreshInterval: (sizeLevel: string) => sizeLevel === 'normal' ? 500 : 1000
}));

describe('useLEDMarquee', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return unhighlighted characters when not active', () => {
    const { result } = renderHook(() =>
      useLEDMarquee('Hello', {
        isActive: false
      })
    );

    const { highlightedChars, isAnimating } = result.current;
    
    expect(isAnimating).toBe(false);
    expect(highlightedChars).toHaveLength(5);
    expect(highlightedChars.every(char => !char.isHighlighted)).toBe(true);
    expect(highlightedChars.map(char => char.char).join('')).toBe('Hello');
  });

  it('should highlight characters at current position when active', () => {
    const { result } = renderHook(() =>
      useLEDMarquee('Hello', {
        isActive: true,
        interval: 100,
        highlightLength: 2 // 固定长度测试
      })
    );

    const { highlightedChars, isAnimating } = result.current;
    
    expect(isAnimating).toBe(true);
    expect(highlightedChars).toHaveLength(5);
    
    // 初始位置：前2个字符应该被高亮
    expect(highlightedChars[0].isHighlighted).toBe(true);
    expect(highlightedChars[1].isHighlighted).toBe(true);
    expect(highlightedChars[2].isHighlighted).toBe(false);
  });

  it('should advance highlight position over time', () => {
    const { result } = renderHook(() =>
      useLEDMarquee('Hello', {
        isActive: true,
        interval: 120, // 更新为新的流畅频率
        highlightLength: 2,
        stepSize: 1
      })
    );

    // 初始状态：位置0-1高亮
    expect(result.current.highlightedChars[0].isHighlighted).toBe(true);
    expect(result.current.highlightedChars[1].isHighlighted).toBe(true);
    expect(result.current.highlightedChars[2].isHighlighted).toBe(false);

    // 前进一步：位置1-2高亮
    act(() => {
      vi.advanceTimersByTime(120);
    });

    expect(result.current.highlightedChars[0].isHighlighted).toBe(false);
    expect(result.current.highlightedChars[1].isHighlighted).toBe(true);
    expect(result.current.highlightedChars[2].isHighlighted).toBe(true);
  });

  it('should reset to beginning after reaching end with seamless loop', () => {
    const { result } = renderHook(() =>
      useLEDMarquee('Hi', {
        isActive: true,
        interval: 120,
        highlightLength: 2,
        stepSize: 1
      })
    );

    // 让动画运行足够长时间以完成一个周期
    // 由于收尾衔接优化，现在只需要文本长度的步数：2步后重置
    act(() => {
      vi.advanceTimersByTime(240); // 2步 * 120ms
    });

    // 应该重新开始：位置0-1高亮
    expect(result.current.highlightedChars[0].isHighlighted).toBe(true);
    expect(result.current.highlightedChars[1].isHighlighted).toBe(true);
  });

  it('should handle empty text gracefully', () => {
    const { result } = renderHook(() =>
      useLEDMarquee('', {
        isActive: true
      })
    );

    const { highlightedChars, isAnimating } = result.current;
    
    expect(highlightedChars).toHaveLength(0);
    expect(isAnimating).toBe(false);
  });

  it('should stop animation when becoming inactive', () => {
    const { result, rerender } = renderHook(
      ({ isActive }) => useLEDMarquee('Hello', { isActive }),
      { initialProps: { isActive: true } }
    );

    expect(result.current.isAnimating).toBe(true);

    // 停用动画
    rerender({ isActive: false });

    expect(result.current.isAnimating).toBe(false);
    expect(result.current.highlightedChars.every(char => !char.isHighlighted)).toBe(true);
  });

  it('should calculate dynamic highlight length based on text length and ratio', () => {
    // 测试短文本
    const { result: shortResult } = renderHook(() =>
      useLEDMarquee('Hi', {
        isActive: true,
        highlightRatio: 0.5 // 50%
      })
    );

    // 文本长度2，50% = 1，但最小值是2，所以应该是2
    const shortHighlighted = shortResult.current.highlightedChars.filter(char => char.isHighlighted);
    expect(shortHighlighted.length).toBe(2);

    // 测试长文本
    const longText = 'This is a much longer text for testing dynamic highlight length calculation';
    const { result: longResult } = renderHook(() =>
      useLEDMarquee(longText, {
        isActive: true,
        highlightRatio: 0.3 // 30%
      })
    );

    // 文本长度约74，30% ≈ 22
    const longHighlighted = longResult.current.highlightedChars.filter(char => char.isHighlighted);
    const expectedLength = Math.round(longText.length * 0.3);
    expect(longHighlighted.length).toBe(expectedLength);
  });

  it('should prefer explicit highlightLength over dynamic calculation', () => {
    const { result } = renderHook(() =>
      useLEDMarquee('Hello World', {
        isActive: true,
        highlightLength: 5, // 显式指定
        highlightRatio: 0.3 // 应该被忽略
      })
    );

    // 应该使用显式指定的5，而不是动态计算的 11 * 0.3 ≈ 3
    const highlighted = result.current.highlightedChars.filter(char => char.isHighlighted);
    expect(highlighted.length).toBe(5);
  });
});