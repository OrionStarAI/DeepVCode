/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { HealthyUseReminder } from './HealthyUseReminder';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock i18n
vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    tp: (key: string, args: any) => `${key}:${JSON.stringify(args)}`,
  }),
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
    render(<HealthyUseReminder onDismiss={onDismiss} />);

    expect(screen.getByText(/healthy.reminderTitle/i)).toBeDefined();
    expect(screen.getByText(/60/i)).toBeDefined();
  });

  it('should countdown every second', () => {
    const onDismiss = vi.fn();
    render(<HealthyUseReminder onDismiss={onDismiss} />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText(/59/i)).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.getByText(/49/i)).toBeDefined();
  });

  it('should show dismiss button as enabled when countdown reaches zero', () => {
    const onDismiss = vi.fn();
    render(<HealthyUseReminder onDismiss={onDismiss} />);

    act(() => {
      vi.advanceTimersByTime(60000);
    });

    const button = screen.getByRole('button');
    expect(button.hasAttribute('disabled')).toBe(false);
  });

  it('should call onDismiss when countdown is finished and user clicks dismiss button', () => {
    const onDismiss = vi.fn();
    render(<HealthyUseReminder onDismiss={onDismiss} />);

    act(() => {
      vi.advanceTimersByTime(60000);
    });

    const dismissButton = screen.getByRole('button');
    act(() => {
      dismissButton.click();
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});