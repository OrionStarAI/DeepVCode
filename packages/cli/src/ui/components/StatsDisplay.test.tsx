/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { StatsDisplay } from './StatsDisplay.js';
import * as SessionContext from '../contexts/SessionContext.js';
import { SessionMetrics } from '../contexts/SessionContext.js';
import { getExpectedText, withMockedLocale } from '../utils/testI18n.js';
import { WindowSizeLevel } from '../hooks/useSmallWindowOptimization.js';

// Mock the context to provide controlled data for testing
vi.mock('../contexts/SessionContext.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionContext>();
  return {
    ...actual,
    useSessionStats: vi.fn(),
  };
});

// Mock SubAgentStatsContainer to avoid internal crashes
vi.mock('./SubAgentStats.js', () => ({
  SubAgentStatsContainer: () => null,
}));

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
  // Ensure credits are present for all models to avoid reduce crashes in StatsDisplay
  const sanitizedModels = { ...metrics.models };
  for (const modelKey in sanitizedModels) {
    if (!sanitizedModels[modelKey].credits) {
      sanitizedModels[modelKey].credits = { total: 0 };
    }
    // Also ensure subAgents metrics are present for computeSubAgentStats
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

  // Use the actual compute function to generate valid computed stats
  const computedStats = SessionContext.computeSessionStats(stats as any);

  useSessionStatsMock.mockReturnValue({
    stats,
    computedStats,
    getPromptCount: () => 5,
    startNewPrompt: vi.fn(),
    resetStats: vi.fn(),
  });

  return render(<StatsDisplay duration="1s" />);
};

describe('<StatsDisplay />', () => {
  it('renders only the Performance section in its zero state', () => {
    const zeroMetrics: SessionMetrics = {
      models: {},
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
    };

    const { lastFrame } = renderWithMockedStats(zeroMetrics);
    const output = lastFrame();

    expect(output).toContain('Performance');
    expect(output).not.toContain('Interaction Summary');
    expect(output).not.toContain('Efficiency & Optimizations');
    expect(output).not.toContain('Model'); // The table header
    expect(output).toMatchSnapshot();
  });

  it('renders a table with two models correctly', () => {
    const metrics: SessionMetrics = {
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 3, totalErrors: 0, totalLatencyMs: 15000 },
          tokens: {
            prompt: 1000,
            candidates: 2000,
            total: 43234,
            cached: 500,
            thoughts: 100,
            tool: 50,
          },
          credits: { total: 0.1 },
        },
        'gemini-2.5-flash': {
          api: { totalRequests: 5, totalErrors: 1, totalLatencyMs: 4500 },
          tokens: {
            prompt: 25000,
            candidates: 15000,
            total: 150000000,
            cached: 10000,
            thoughts: 2000,
            tool: 1000,
          },
          credits: { total: 0.01 },
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

    const { lastFrame } = renderWithMockedStats(metrics);
    const output = lastFrame();

    expect(output).toContain('gemini-2.5-pro');
    expect(output).toContain('gemini-2.5-flash');
    expect(output).toContain('1,000');
    expect(output).toContain('25,000');
    expect(output).toMatchSnapshot();
  });

  it('renders all sections when all data is present', () => {
    const metrics: SessionMetrics = {
      models: {
        'gemini-2.5-pro': {
          api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
          tokens: {
            prompt: 100,
            candidates: 100,
            total: 250,
            cached: 50,
            thoughts: 0,
            tool: 0,
          },
          credits: { total: 0.05 },
        },
      },
      tools: {
        totalCalls: 2,
        totalSuccess: 1,
        totalFail: 1,
        totalDurationMs: 123,
        totalDecisions: { accept: 1, reject: 0, modify: 0 },
        byName: {
          'test-tool': {
            count: 2,
            success: 1,
            fail: 1,
            durationMs: 123,
            decisions: { accept: 1, reject: 0, modify: 0 },
          },
        },
      },
    };

    const { lastFrame } = renderWithMockedStats(metrics);
    const output = lastFrame();

    expect(output).toContain('Performance');
    expect(output).toContain('Interaction Summary');
    expect(output).toContain('User Agreement');
    expect(output).toContain('gemini-2.5-pro');
    expect(output).toMatchSnapshot();
  });

  describe('Conditional Rendering Tests', () => {
    it('hides User Agreement when no decisions are made', () => {
      const metrics: SessionMetrics = {
        models: {},
        tools: {
          totalCalls: 2,
          totalSuccess: 1,
          totalFail: 1,
          totalDurationMs: 123,
          totalDecisions: { accept: 0, reject: 0, modify: 0 }, // No decisions
          byName: {
            'test-tool': {
              count: 2,
              success: 1,
              fail: 1,
              durationMs: 123,
              decisions: { accept: 0, reject: 0, modify: 0 },
            },
          },
        },
      };

      const { lastFrame } = renderWithMockedStats(metrics);
      const output = lastFrame();

      expect(output).toContain('Interaction Summary');
      expect(output).toContain('Success Rate');
      expect(output).not.toContain('User Agreement');
      expect(output).toMatchSnapshot();
    });

    it('hides Efficiency section when cache is not used', () => {
      const metrics: SessionMetrics = {
        models: {
          'gemini-2.5-pro': {
            api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
            tokens: {
              prompt: 100,
              candidates: 100,
              total: 200,
              cached: 0,
              thoughts: 0,
              tool: 0,
            },
            credits: { total: 0.02 },
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

      const { lastFrame } = renderWithMockedStats(metrics);
      const output = lastFrame();

      expect(output).not.toContain('Efficiency & Optimizations');
      expect(output).toMatchSnapshot();
    });
  });

  describe('Conditional Color Tests', () => {
    it('renders success rate in green for high values', () => {
      const metrics: SessionMetrics = {
        models: {},
        tools: {
          totalCalls: 10,
          totalSuccess: 10,
          totalFail: 0,
          totalDurationMs: 0,
          totalDecisions: { accept: 0, reject: 0, modify: 0 },
          byName: {},
        },
      };
      const { lastFrame } = renderWithMockedStats(metrics);
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders success rate in yellow for medium values', () => {
      const metrics: SessionMetrics = {
        models: {},
        tools: {
          totalCalls: 10,
          totalSuccess: 9,
          totalFail: 1,
          totalDurationMs: 0,
          totalDecisions: { accept: 0, reject: 0, modify: 0 },
          byName: {},
        },
      };
      const { lastFrame } = renderWithMockedStats(metrics);
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders success rate in red for low values', () => {
      const metrics: SessionMetrics = {
        models: {},
        tools: {
          totalCalls: 10,
          totalSuccess: 5,
          totalFail: 5,
          totalDurationMs: 0,
          totalDecisions: { accept: 0, reject: 0, modify: 0 },
          byName: {},
        },
      };
      const { lastFrame } = renderWithMockedStats(metrics);
      expect(lastFrame()).toMatchSnapshot();
    });
  });

  describe('Title Rendering', () => {
    const zeroMetrics: SessionMetrics = {
      models: {},
      tools: {
        totalCalls: 0,
        totalSuccess: 0,
        totalFail: 0,
        totalDurationMs: 0,
        totalDecisions: { accept: 0, reject: 0, modify: 0 },
        byName: {},
      },
    };

    it('renders the default title when no title prop is provided', () => {
      const expectedText = getExpectedText('stats.session.stats');

      const result = withMockedLocale('en', () => {
        const { lastFrame } = renderWithMockedStats(zeroMetrics);
        return lastFrame();
      });

      expect(result).toContain(expectedText.en);
      expect(result).not.toContain('Agent powering down');
      expect(result).toMatchSnapshot();
    });

    it('renders the custom title when a title prop is provided', () => {
      const expectedText = getExpectedText('agent.powering.down');

      const result = withMockedLocale('en', () => {
        useSessionStatsMock.mockReturnValue({
          stats: {
            sessionStartTime: new Date(),
            metrics: zeroMetrics,
            lastPromptTokenCount: 0,
            promptCount: 5,
          },

          getPromptCount: () => 5,
          startNewPrompt: vi.fn(),
        });

        const { lastFrame } = render(
          <StatsDisplay duration="1s" title={expectedText.en} />,
        );
        return lastFrame();
      });

      expect(result).toContain(expectedText.en);
      expect(result).not.toContain(getExpectedText('stats.session.stats').en);
      expect(result).toMatchSnapshot();
    });
  });
});
