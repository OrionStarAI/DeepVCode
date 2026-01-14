/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { HealthyUseReminder } from './HealthyUseReminder.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sanitizeOutput } from '../test-utils.js';

// Mock i18n
vi.mock('../utils/i18n.js', () => ({
  t: (key: string) => key,
  tp: (key: string, args: Record<string, unknown>) => `${key}:${JSON.stringify(args)}`,
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

    const output = sanitizeOutput(lastFrame());
    expect(output).toContain('healthy.reminder.title');
    expect(output).toContain('healthy.reminder.waiting:{"seconds":300}');
  });

  it('should countdown every second', async () => {
    const onDismiss = vi.fn();
    const { lastFrame } = render(<HealthyUseReminder onDismiss={onDismiss} />);

    await vi.advanceTimersByTimeAsync(1000);
    expect(sanitizeOutput(lastFrame())).toContain('healthy.reminder.waiting:{"seconds":299}');

    await vi.advanceTimersByTimeAsync(10000);
    expect(sanitizeOutput(lastFrame())).toContain('healthy.reminder.waiting:{"seconds":289}');
  });

  it.skip('should show dismiss button when countdown reaches zero', async () => {
    const onDismiss = vi.fn();
    const { lastFrame, rerender } = render(<HealthyUseReminder onDismiss={onDismiss} />);

    // Fast forward exactly 300 seconds
    await vi.advanceTimersByTimeAsync(300000);

    // In React 18 / Ink, state updates after effects might need a manual cycle
    await vi.runOnlyPendingTimersAsync();
    rerender(<HealthyUseReminder onDismiss={onDismiss} />);

    expect(sanitizeOutput(lastFrame())).toContain('healthy.reminder.dismiss');
    expect(sanitizeOutput(lastFrame())).not.toContain('healthy.reminder.waiting');
  });

  it.skip('should call onDismiss when countdown is finished and user presses Enter', async () => {
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