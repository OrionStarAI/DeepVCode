/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { HealthyUseReminder } from './HealthyUseReminder.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock i18n
vi.mock('../utils/i18n.js', () => ({
  t: (key: string) => key,
  tp: (key: string, args: any) => `${key}:${JSON.stringify(args)}`,
}));

describe('HealthyUseReminder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render the reminder with initial countdown', () => {
    const onDismiss = vi.fn();
    const { lastFrame } = render(<HealthyUseReminder onDismiss={onDismiss} />);

    expect(lastFrame()).toContain('healthy.reminder.title');
    expect(lastFrame()).toContain('healthy.reminder.waiting:{"seconds":300}');
  });

  it('should countdown every second', async () => {
    const onDismiss = vi.fn();
    const { lastFrame } = render(<HealthyUseReminder onDismiss={onDismiss} />);

    await vi.advanceTimersByTimeAsync(1000);
    expect(lastFrame()).toContain('healthy.reminder.waiting:{"seconds":299}');

    await vi.advanceTimersByTimeAsync(10000);
    expect(lastFrame()).toContain('healthy.reminder.waiting:{"seconds":289}');
  });

  it('should show dismiss button when countdown reaches zero', async () => {
    const onDismiss = vi.fn();
    const { lastFrame, rerender } = render(<HealthyUseReminder onDismiss={onDismiss} />);

    // Fast forward exactly 300 seconds
    await vi.advanceTimersByTimeAsync(300000);

    // In React 18 / Ink, state updates after effects might need a manual cycle
    await vi.runOnlyPendingTimersAsync();
    rerender(<HealthyUseReminder onDismiss={onDismiss} />);

    expect(lastFrame()).toContain('healthy.reminder.dismiss');
    expect(lastFrame()).not.toContain('healthy.reminder.waiting');
  });

  it('should call onDismiss when countdown is finished and user presses Enter', async () => {
    const onDismiss = vi.fn();
    const { stdin, rerender } = render(<HealthyUseReminder onDismiss={onDismiss} />);

    await vi.advanceTimersByTimeAsync(300000);
    await vi.runOnlyPendingTimersAsync();
    rerender(<HealthyUseReminder onDismiss={onDismiss} />);

    // Simulate Enter key
    stdin.write('\r');

    // Let the useInput event be processed
    await vi.runOnlyPendingTimersAsync();

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('should NOT call onDismiss if user presses Enter before countdown is finished', async () => {
    const onDismiss = vi.fn();
    const { stdin } = render(<HealthyUseReminder onDismiss={onDismiss} />);

    await vi.advanceTimersByTimeAsync(150000);
    await vi.runOnlyPendingTimersAsync();

    // Simulate Enter key
    stdin.write('\r');
    await vi.runOnlyPendingTimersAsync();

    expect(onDismiss).not.toHaveBeenCalled();
  });
});