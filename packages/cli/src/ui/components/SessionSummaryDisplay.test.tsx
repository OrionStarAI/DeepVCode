/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { SessionSummaryDisplay } from './SessionSummaryDisplay.js';
import * as SessionContext from '../contexts/SessionContext.js';
import { SessionMetrics } from '../contexts/SessionContext.js';
import { getExpectedText, withMockedLocale } from '../utils/testI18n.js';

vi.mock('../contexts/SessionContext.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionContext>();
  return {
    ...actual,
    useSessionStats: vi.fn(),
  };
});

const useSessionStatsMock = vi.mocked(SessionContext.useSessionStats);

const renderWithMockedStats = (metrics: SessionMetrics) => {
  useSessionStatsMock.mockReturnValue({
    stats: {
      sessionStartTime: new Date(),
      metrics,
      lastPromptTokenCount: 0,
      promptCount: 5,
    },

    getPromptCount: () => 5,
    startNewPrompt: vi.fn(),
  });

  return render(<SessionSummaryDisplay duration="1h 23m 45s" />);
};

describe('<SessionSummaryDisplay />', () => {
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
