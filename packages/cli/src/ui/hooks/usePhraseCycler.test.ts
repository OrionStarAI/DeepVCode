/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  usePhraseCycler,
  WITTY_LOADING_PHRASES_EN,
  KNOWLEDGE_TIPS_EN,
  PHRASE_CHANGE_INTERVAL_MS,
} from './usePhraseCycler.js';

const ALL_PHRASES = [...WITTY_LOADING_PHRASES_EN, ...KNOWLEDGE_TIPS_EN];

describe('usePhraseCycler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with the first witty phrase when not active and not waiting', () => {
    const { result } = renderHook(() => usePhraseCycler(false, false));
    expect(result.current).toBe(WITTY_LOADING_PHRASES_EN[0]);
  });

  it('should show "Waiting for user confirmation..." when isWaiting is true', () => {
    const { result, rerender } = renderHook(
      ({ isActive, isWaiting }) => usePhraseCycler(isActive, isWaiting),
      { initialProps: { isActive: true, isWaiting: false } },
    );
    rerender({ isActive: true, isWaiting: true });
    expect(result.current).toBe('Waiting for user confirmation...');
  });

  it('should not cycle phrases if isActive is false and not waiting', () => {
    const { result } = renderHook(() => usePhraseCycler(false, false));
    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS * 2);
    });
    expect(result.current).toBe(WITTY_LOADING_PHRASES_EN[0]);
  });

  it('should cycle through witty phrases when isActive is true and not waiting', () => {
    const { result } = renderHook(() => usePhraseCycler(true, false));
    // Initial phrase should be one of the witty phrases
    expect(ALL_PHRASES).toContain(result.current);
    const _initialPhrase = result.current;

    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS);
    });
    // Phrase should change and be one of the witty phrases
    expect(ALL_PHRASES).toContain(result.current);

    const _secondPhrase = result.current;
    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS);
    });
    expect(ALL_PHRASES).toContain(result.current);
  });

  it('should reset to a witty phrase when isActive becomes true after being false (and not waiting)', () => {
    // Ensure there are at least two phrases for this test to be meaningful.
    if (ALL_PHRASES.length < 2) {
      return;
    }

    // Mock Math.random to make the test deterministic.
    let callCount = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      // 80% chance for loading phrase (forcing branch)
      // and then picking the first phrase
      return 0.9;
    });

    const { result, rerender } = renderHook(
      ({ isActive, isWaiting }) => usePhraseCycler(isActive, isWaiting),
      { initialProps: { isActive: false, isWaiting: false } },
    );

    // Activate
    rerender({ isActive: true, isWaiting: false });
    const firstActivePhrase = result.current;
    expect(ALL_PHRASES).toContain(firstActivePhrase);
    // With our mock (0.9), it should be one of the loading phrases.
    // randomIndex = floor(0.9 * loadingPhrases.length)
    const expectedInitialIndex = Math.floor(0.9 * WITTY_LOADING_PHRASES_EN.length);
    expect(firstActivePhrase).toBe(WITTY_LOADING_PHRASES_EN[expectedInitialIndex]);

    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS);
    });

    // Phrase should stay the same because random mock is static
    expect(result.current).toBe(firstActivePhrase);

    // Set to inactive - should reset to the default initial phrase
    rerender({ isActive: false, isWaiting: false });
    expect(result.current).toBe(WITTY_LOADING_PHRASES_EN[0]);
  });

  it('should clear phrase interval on unmount when active', () => {
    const { unmount } = renderHook(() => usePhraseCycler(true, false));
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledOnce();
  });

  it('should reset to a witty phrase when transitioning from waiting to active', () => {
    const { result, rerender } = renderHook(
      ({ isActive, isWaiting }) => usePhraseCycler(isActive, isWaiting),
      { initialProps: { isActive: true, isWaiting: false } },
    );

    const _initialPhrase = result.current;
    expect(ALL_PHRASES).toContain(_initialPhrase);

    // Cycle to a different phrase (potentially)
    act(() => {
      vi.advanceTimersByTime(PHRASE_CHANGE_INTERVAL_MS);
    });
    expect(ALL_PHRASES).toContain(result.current);

    // Go to waiting state
    rerender({ isActive: false, isWaiting: true });
    expect(result.current).toBe('Waiting for user confirmation...');

    // Go back to active cycling - should pick a random witty phrase
    rerender({ isActive: true, isWaiting: false });
    expect(ALL_PHRASES).toContain(result.current);
  });
});
