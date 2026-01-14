/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { HistoryItemDisplay } from './HistoryItemDisplay.js';
import { HistoryItem, MessageType } from '../types.js';
import { SessionStatsProvider } from '../contexts/SessionContext.js';
import { getExpectedText, withMockedLocale } from '../utils/testI18n.js';
import { WindowSizeLevel } from '../hooks/useSmallWindowOptimization.js';
import { sanitizeOutput } from '../test-utils.js';

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

// Mock child components
vi.mock('./messages/ToolGroupMessage.js', () => ({
  ToolGroupMessage: () => <div />,
}));

describe('<HistoryItemDisplay />', () => {
  const baseItem = {
    id: 1,
    timestamp: 12345,
    isPending: false,
    terminalWidth: 80,
  };

  it('renders UserMessage for "user" type', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: MessageType.USER,
      text: 'Hello',
    };
    const { lastFrame } = render(
      <HistoryItemDisplay {...baseItem} item={item} />,
    );
    expect(sanitizeOutput(lastFrame())).toContain('Hello');
  });

  it('renders StatsDisplay for "stats" type', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: MessageType.STATS,
      duration: '1s',
    };
    const { lastFrame } = render(
      <SessionStatsProvider>
        <HistoryItemDisplay {...baseItem} item={item} />
      </SessionStatsProvider>,
    );
    expect(sanitizeOutput(lastFrame())).toContain('Stats');
  });

  it('renders AboutBox for "about" type', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: MessageType.ABOUT,
      cliVersion: '1.0.0',
      osVersion: 'test-os',
      sandboxEnv: 'test-env',
      modelVersion: 'test-model',
      selectedAuthType: 'test-auth',
      gcpProject: 'test-project',
    };
    const { lastFrame } = render(
      <HistoryItemDisplay {...baseItem} item={item} />,
    );
    // Test should check for any reasonable variation of the about title
    // since it now uses i18n and may render in different languages
    const frame = sanitizeOutput(lastFrame());
    const aboutText = getExpectedText('about.title');
    const isEnglish = frame.includes(aboutText.en);
    const isChinese = frame.includes(aboutText.zh);
    expect(isEnglish || isChinese).toBe(true);
  });

  it('renders ModelStatsDisplay for "model_stats" type', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: 'model_stats',
    };
    const { lastFrame } = render(
      <SessionStatsProvider>
        <HistoryItemDisplay {...baseItem} item={item} />
      </SessionStatsProvider>,
    );
    expect(sanitizeOutput(lastFrame())).toContain(
      'No API calls have been made in this session yet.',
    );
  });

  it('renders ToolStatsDisplay for "tool_stats" type', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: 'tool_stats',
    };
    const { lastFrame } = render(
      <SessionStatsProvider>
        <HistoryItemDisplay {...baseItem} item={item} />
      </SessionStatsProvider>,
    );
    expect(sanitizeOutput(lastFrame())).toContain(
      'No tool calls have been made in this session yet.',
    );
  });

  it('renders SessionSummaryDisplay for "quit" type', () => {
    const item: HistoryItem = {
      ...baseItem,
      type: 'quit',
      duration: '1s',
    };

    const expectedText = getExpectedText('agent.powering.down');

    const result = withMockedLocale('en', () => {
      const { lastFrame } = render(
        <SessionStatsProvider>
          <HistoryItemDisplay {...baseItem} item={item} />
        </SessionStatsProvider>,
      );
      return sanitizeOutput(lastFrame());
    });

    expect(result).toContain(expectedText.en);
  });
});
