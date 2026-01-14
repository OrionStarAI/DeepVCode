/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { ToolStatsDisplay } from './ToolStatsDisplay.js';
import * as SessionContext from '../contexts/SessionContext.js';
import { SessionMetrics } from '../contexts/SessionContext.js';
import { WindowSizeLevel } from '../hooks/useSmallWindowOptimization.js';
import { sanitizeOutput } from '../test-utils.js';

// Mock the context to provide controlled data for testing
vi.mock('../contexts/SessionContext.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionContext>();
  const mockStats = {
    sessionStartTime: new Date(),
    metrics: {
      models: {},
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
    },
    lastPromptTokenCount: 0,
    promptCount: 0,
    subAgentStats: {
      totalApiCalls: 0,
      totalErrors: 0,
      totalLatencyMs: 0,
      totalTokens: 0,
      promptTokens: 0,
      candidatesTokens: 0,
      cachedTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      thoughtsTokens: 0,
      toolTokens: 0,
    },
  };
  return {
    ...actual,
    useSessionStats: vi.fn(() => ({
      stats: mockStats,
      computedStats: actual.computeSessionStats(mockStats),
      startNewPrompt: vi.fn(),
      getPromptCount: vi.fn(() => 0),
      resetStats: vi.fn(),
    })),
  };
});

// Mock small window optimization to return normal size by default
vi.mock('../hooks/useSmallWindowOptimization.js', () => ({
  useSmallWindowOptimization: vi.fn(() => ({
    sizeLevel: WindowSizeLevel.NORMAL,
    disableAnimations: false,
    reducedRefreshRate: false,
    hideDecorations: false,
    simplifiedDisplay: false,
    refreshDebounceMs: 300,
  })),
  WindowSizeLevel: {
    NORMAL: 'normal',
    SMALL: 'small',
    TINY: 'tiny',
  },
  shouldSkipAnimation: vi.fn(() => false),
  getOptimalRefreshInterval: vi.fn(() => 1000),
}));

const useSessionStatsMock = vi.mocked(SessionContext.useSessionStats);

const renderWithMockedStats = (metrics: SessionMetrics) => {
  // Ensure credits and subAgents are present for all models to avoid reduce crashes
  const sanitizedModels = { ...metrics.models };
  for (const modelKey in sanitizedModels) {
    if (!sanitizedModels[modelKey].credits) {
      sanitizedModels[modelKey].credits = { total: 0 };
    }
    if (!sanitizedModels[modelKey].subAgents) {
      sanitizedModels[modelKey].subAgents = {
        api: { totalRequests: 0, totalErrors: 0, totalLatencyMs: 0 },
        tokens: { total: 0, prompt: 0, candidates: 0, cached: 0, thoughts: 0, tool: 0 },
      };
    }
  }
  const sanitizedMetrics = { ...metrics, models: sanitizedModels };

  const subAgentStats = {
    totalApiCalls: 0,
    totalErrors: 0,
    totalLatencyMs: 0,
    totalTokens: 0,
    promptTokens: 0,
    candidatesTokens: 0,
    cachedTokens: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    thoughtsTokens: 0,
    toolTokens: 0,
  };

  const stats = {
    sessionStartTime: new Date(),
    metrics: sanitizedMetrics,
    lastPromptTokenCount: 0,
    promptCount: 5,
    subAgentStats,
  };

  useSessionStatsMock.mockReturnValue({
    stats: stats as unknown as SessionContext.SessionStats,
    computedStats: SessionContext.computeSessionStats(stats as unknown as SessionContext.SessionStats),
    getPromptCount: () => 5,
    startNewPrompt: vi.fn(),
    resetStats: vi.fn(),
  });

  return render(<ToolStatsDisplay />);
};

describe('<ToolStatsDisplay />', () => {
  it('should render "no tool calls" message when there are no active tools', () => {
    const { lastFrame } = renderWithMockedStats({
      models: {},
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
    });

    expect(sanitizeOutput(lastFrame())).toContain(
      'No tool calls have been made in this session yet.',
    );
    expect(sanitizeOutput(lastFrame())).toMatchSnapshot();
  });

  it('should display stats for a single tool correctly', () => {
    const { lastFrame } = renderWithMockedStats({
      models: {},
      tools: {
        totalCalls: 1,
        totalSuccess: 1,
        totalFail: 0,
        totalDurationMs: 100,
        totalDecisions: { accept: 1, reject: 0, modify: 0 },
        byName: {
          'test-tool': {
            count: 1,
            success: 1,
            fail: 0,
            durationMs: 100,
            responseLength: 1234,
            decisions: { accept: 1, reject: 0, modify: 0 },
          },
        },
      },
    });

    const output = sanitizeOutput(lastFrame());
    expect(output).toContain('test-tool');
    expect(output).toMatchSnapshot();
  });

  it('should display stats for multiple tools correctly', () => {
    const { lastFrame } = renderWithMockedStats({
      models: {},
      tools: {
        totalCalls: 3,
        totalSuccess: 2,
        totalFail: 1,
        totalDurationMs: 300,
        totalDecisions: { accept: 1, reject: 1, modify: 1 },
        byName: {
          'tool-a': {
            count: 2,
            success: 1,
            fail: 1,
            durationMs: 200,
            responseLength: 2500,
            decisions: { accept: 1, reject: 1, modify: 0 },
          },
          'tool-b': {
            count: 1,
            success: 1,
            fail: 0,
            durationMs: 100,
            responseLength: 800,
            decisions: { accept: 0, reject: 0, modify: 1 },
          },
        },
      },
    });

    const output = sanitizeOutput(lastFrame());
    expect(output).toContain('tool-a');
    expect(output).toContain('tool-b');
    expect(output).toMatchSnapshot();
  });

  it('should handle large values without wrapping or overlapping', () => {
    const { lastFrame } = renderWithMockedStats({
      models: {},
      tools: {
        totalCalls: 999999999,
        totalSuccess: 888888888,
        totalFail: 111111111,
        totalDurationMs: 987654321,
        totalDecisions: {
          accept: 123456789,
          reject: 98765432,
          modify: 12345,
        },
        byName: {
          'long-named-tool-for-testing-wrapping-and-such': {
            count: 999999999,
            success: 888888888,
            fail: 111111111,
            durationMs: 987654321,
            responseLength: 5000000,
            decisions: {
              accept: 123456789,
              reject: 98765432,
              modify: 12345,
            },
          },
        },
      },
    });

    expect(sanitizeOutput(lastFrame())).toMatchSnapshot();
  });

  it('should handle zero decisions gracefully', () => {
    const { lastFrame } = renderWithMockedStats({
      models: {},
      tools: {
        totalCalls: 1,
        totalSuccess: 1,
        totalFail: 0,
        totalDurationMs: 100,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {
          'test-tool': {
            count: 1,
            success: 1,
            fail: 0,
            durationMs: 100,
            responseLength: 500,
            decisions: { accept: 0, reject: 0, modify: 0 },
          },
        },
      },
    });

    const output = sanitizeOutput(lastFrame());
    expect(output).toContain('User Decision Summary');
    expect(output).toContain('Total Reviewed Suggestions:');
    expect(output).toContain('0');
    expect(output).toContain('Overall Acceptance Rate:');
    expect(output).toContain('--');
    expect(output).toMatchSnapshot();
  });
});
