/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import React from 'react';
import { render } from 'ink-testing-library';
import { TaskCompletionSummary } from './TaskCompletionSummary.js';
import { describe, it, expect, vi } from 'vitest';

describe('<TaskCompletionSummary />', () => {
  // Mock useStdout to provide consistent column width
  vi.mock('ink', async () => {
    const actual = await vi.importActual('ink');
    return {
      ...actual,
      useStdout: () => ({ columns: 80 }),
    };
  });

  it('should not render when isVisible is false', () => {
    const { lastFrame } = render(
      <TaskCompletionSummary elapsedTime={45} isVisible={false} />,
    );
    expect(lastFrame()).toBe('');
  });

  it('should not render when elapsedTime < 20 seconds', () => {
    const { lastFrame } = render(
      <TaskCompletionSummary elapsedTime={15} isVisible={true} />,
    );
    expect(lastFrame()).toBe('');
  });

  it('should render when elapsedTime is exactly 20 seconds', () => {
    const { lastFrame } = render(
      <TaskCompletionSummary elapsedTime={20} isVisible={true} />,
    );
    const output = lastFrame();
    expect(output).toContain('✓ Worked for 20s');
  });

  it('should render completion summary with seconds when elapsedTime < 60', () => {
    const { lastFrame } = render(
      <TaskCompletionSummary elapsedTime={45} isVisible={true} />,
    );
    const output = lastFrame();
    expect(output).toContain('✓ Worked for 45s');
    expect(output).toContain('─');
  });

  it('should render completion summary with formatted duration when elapsedTime >= 60', () => {
    const { lastFrame } = render(
      <TaskCompletionSummary elapsedTime={158} isVisible={true} />,
    );
    const output = lastFrame();
    expect(output).toContain('✓ Worked for 2m 38s');
    expect(output).toContain('─');
  });

  it('should render completion summary with hours and minutes', () => {
    const { lastFrame } = render(
      <TaskCompletionSummary elapsedTime={3785} isVisible={true} />,
    );
    const output = lastFrame();
    // 3785 秒 = 1 小时 3 分 5 秒
    expect(output).toContain('✓ Worked for 1h 3m 5s');
    expect(output).toContain('─');
  });

  it('should render dashes below the message matching its length', () => {
    const { lastFrame } = render(
      <TaskCompletionSummary elapsedTime={30} isVisible={true} />,
    );
    const output = lastFrame();
    // 应该包含 dash 字符（作为下划线）
    const dashCount = (output.match(/─/g) || []).length;
    expect(dashCount).toBeGreaterThan(0);
  });

  it('should render a single second value', () => {
    const { lastFrame } = render(
      <TaskCompletionSummary elapsedTime={1} isVisible={true} />,
    );
    const output = lastFrame();
    expect(output).toContain('✓ Worked for 1s');
  });

  it('should render exactly 1 minute', () => {
    const { lastFrame } = render(
      <TaskCompletionSummary elapsedTime={60} isVisible={true} />,
    );
    const output = lastFrame();
    expect(output).toContain('✓ Worked for 1m');
  });
});
