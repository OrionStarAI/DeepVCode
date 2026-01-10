/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionSummaryDisplay } from './SessionSummaryDisplay.js';
import * as SessionContext from '../contexts/SessionContext.js';
import { SessionMetrics } from '../contexts/SessionContext.js';
import { getExpectedText, withMockedLocale } from '../utils/testI18n.js';
import { WindowSizeLevel } from '../hooks/useSmallWindowOptimization.js';
import { _clearLocaleCache } from '../utils/i18n.js';

const clearCache = _clearLocaleCache;

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
}));

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

const useSessionStatsMock = vi.mocked(SessionContext.useSessionStats);

const renderWithMockedStats = (metrics: SessionMetrics) => {
  // Ensure credits and subAgents are present for all models to avoid reduce crashes in StatsDisplay
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
    stats,
    computedStats: SessionContext.computeSessionStats(stats as any),
    getPromptCount: () => 5,
    startNewPrompt: vi.fn(),
    resetStats: vi.fn(),
  });

  return render(<SessionSummaryDisplay duration="1h 23m 45s" />);
};

describe('<SessionSummaryDisplay />', () => {
  beforeEach(() => {
    _clearLocaleCache();
  });

  afterEach(() => {
    _clearLocaleCache();
  });

  it('renders the summary display with English title', () => {
    const metrics: SessionMetrics = {
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 10, totalErrors: 1, totalLatencyMs: 50234 },
          tokens: {
            prompt: 1000,
            candidates: 2000,
            total: 3500,
            cached: 500,
            thoughts: 300,
            tool: 200,
          },
        },
      },
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
    };

    const expectedText = getExpectedText('agent.powering.down');

    const result = withMockedLocale('en', () => {
      const { lastFrame } = renderWithMockedStats(metrics);
      return lastFrame();
    });

    expect(result).toContain(expectedText.en);
    expect(result).toMatchSnapshot();
  });

  it('renders the summary display with Chinese title in Chinese locale', () => {
    const metrics: SessionMetrics = {
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 10, totalErrors: 1, totalLatencyMs: 50234 },
          tokens: {
            prompt: 1000,
            candidates: 2000,
            total: 3500,
            cached: 500,
            thoughts: 300,
            tool: 200,
          },
        },
      },
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
    };

    const expectedText = getExpectedText('agent.powering.down');

    const result = withMockedLocale('zh', () => {
      const { lastFrame } = renderWithMockedStats(metrics);
      return lastFrame();
    });

    expect(result).toContain(expectedText.zh);
  });
});
