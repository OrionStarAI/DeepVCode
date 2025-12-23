/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Config } from '../config/config.js';
import { GeminiClient } from '../core/client.js';
import {
  GeminiEventType,
  ServerGeminiContentEvent,
  ServerGeminiStreamEvent,
  ServerGeminiToolCallRequestEvent,
} from '../core/turn.js';
import * as loggers from '../telemetry/loggers.js';
import { LoopType } from '../telemetry/types.js';
import { LoopDetectionService } from './loopDetectionService.js';

vi.mock('../telemetry/loggers.js', () => ({
  logLoopDetected: vi.fn(),
}));

const TOOL_CALL_LOOP_THRESHOLD = 10;
const CONTENT_LOOP_THRESHOLD = 20;
const CONTENT_CHUNK_SIZE = 500;

describe('LoopDetectionService', () => {
  let service: LoopDetectionService;
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      getTelemetryEnabled: () => true,
      getModel: () => 'gemini-2.0-flash', // Non-preview model for regular tests
    } as unknown as Config;
    service = new LoopDetectionService(mockConfig);
    vi.clearAllMocks();
  });

  const createToolCallRequestEvent = (
    name: string,
    args: Record<string, unknown>,
  ): ServerGeminiToolCallRequestEvent => ({
    type: GeminiEventType.ToolCallRequest,
    value: {
      name,
      args,
      callId: 'test-id',
      isClientInitiated: false,
      prompt_id: 'test-prompt-id',
    },
  });

  const createContentEvent = (content: string): ServerGeminiContentEvent => ({
    type: GeminiEventType.Content,
    value: content,
  });

  describe('Tool Call Loop Detection', () => {
    it(`should not detect a loop for fewer than TOOL_CALL_LOOP_THRESHOLD identical calls`, () => {
      const event = createToolCallRequestEvent('testTool', { param: 'value' });
      for (let i = 0; i < TOOL_CALL_LOOP_THRESHOLD - 1; i++) {
        expect(service.addAndCheck(event)).toBe(false);
      }
      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });

    it(`should detect a loop on the TOOL_CALL_LOOP_THRESHOLD-th identical call`, () => {
      const event = createToolCallRequestEvent('testTool', { param: 'value' });
      for (let i = 0; i < TOOL_CALL_LOOP_THRESHOLD - 1; i++) {
        service.addAndCheck(event);
      }
      expect(service.addAndCheck(event)).toBe(true);
      expect(loggers.logLoopDetected).toHaveBeenCalledTimes(1);
    });

    it('should detect a loop on subsequent identical calls', () => {
      const event = createToolCallRequestEvent('testTool', { param: 'value' });
      for (let i = 0; i < TOOL_CALL_LOOP_THRESHOLD; i++) {
        service.addAndCheck(event);
      }
      expect(service.addAndCheck(event)).toBe(true);
      expect(loggers.logLoopDetected).toHaveBeenCalledTimes(1);
    });

    it('should not detect a loop for different tool calls', () => {
      const event1 = createToolCallRequestEvent('testTool', {
        param: 'value1',
      });
      const event2 = createToolCallRequestEvent('testTool', {
        param: 'value2',
      });
      const event3 = createToolCallRequestEvent('anotherTool', {
        param: 'value1',
      });

      for (let i = 0; i < TOOL_CALL_LOOP_THRESHOLD - 2; i++) {
        expect(service.addAndCheck(event1)).toBe(false);
        expect(service.addAndCheck(event2)).toBe(false);
        expect(service.addAndCheck(event3)).toBe(false);
      }
    });

    it('should not reset tool call counter for other event types', () => {
      const toolCallEvent = createToolCallRequestEvent('testTool', {
        param: 'value',
      });
      const otherEvent = {
        type: 'thought',
      } as unknown as ServerGeminiStreamEvent;

      // Send events just below the threshold
      for (let i = 0; i < TOOL_CALL_LOOP_THRESHOLD - 1; i++) {
        expect(service.addAndCheck(toolCallEvent)).toBe(false);
      }

      // Send a different event type
      expect(service.addAndCheck(otherEvent)).toBe(false);

      // Send the tool call event again, which should now trigger the loop
      expect(service.addAndCheck(toolCallEvent)).toBe(true);
      expect(loggers.logLoopDetected).toHaveBeenCalledTimes(1);
    });
  });

  describe('Content Loop Detection', () => {
    const generateRandomString = (length: number) => {
      let result = '';
      const characters =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      const charactersLength = characters.length;
      for (let i = 0; i < length; i++) {
        result += characters.charAt(
          Math.floor(Math.random() * charactersLength),
        );
      }
      return result;
    };

    it('should not detect a loop for random content', () => {
      service.reset('');
      for (let i = 0; i < 1000; i++) {
        const content = generateRandomString(10);
        const isLoop = service.addAndCheck(createContentEvent(content));
        expect(isLoop).toBe(false);
      }
      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });

    it('should detect a loop when a chunk of content repeats consecutively', () => {
      service.reset('');
      const repeatedContent = 'a'.repeat(CONTENT_CHUNK_SIZE);

      let isLoop = false;
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD; i++) {
        for (const char of repeatedContent) {
          isLoop = service.addAndCheck(createContentEvent(char));
        }
      }
      expect(isLoop).toBe(true);
      expect(loggers.logLoopDetected).toHaveBeenCalledTimes(1);
    });

    it('should not detect a loop if repetitions are very far apart', () => {
      service.reset('');
      const repeatedContent = 'b'.repeat(CONTENT_CHUNK_SIZE);
      const fillerContent = generateRandomString(500);

      let isLoop = false;
      for (let i = 0; i < CONTENT_LOOP_THRESHOLD; i++) {
        for (const char of repeatedContent) {
          isLoop = service.addAndCheck(createContentEvent(char));
        }
        for (const char of fillerContent) {
          isLoop = service.addAndCheck(createContentEvent(char));
        }
      }
      expect(isLoop).toBe(false);
      expect(loggers.logLoopDetected).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty content', () => {
      const event = createContentEvent('');
      expect(service.addAndCheck(event)).toBe(false);
    });
  });

  describe('Reset Functionality', () => {
    it('tool call should reset content count', () => {
      const contentEvent = createContentEvent('Some content.');
      const toolEvent = createToolCallRequestEvent('testTool', {
        param: 'value',
      });
      for (let i = 0; i < 9; i++) {
        service.addAndCheck(contentEvent);
      }

      service.addAndCheck(toolEvent);

      // Should start fresh
      expect(service.addAndCheck(createContentEvent('Fresh content.'))).toBe(
        false,
      );
    });
  });

  describe('General Behavior', () => {
    it('should return false for unhandled event types', () => {
      const otherEvent = {
        type: 'unhandled_event',
      } as unknown as ServerGeminiStreamEvent;
      expect(service.addAndCheck(otherEvent)).toBe(false);
      expect(service.addAndCheck(otherEvent)).toBe(false);
    });
  });
});

describe('LoopDetectionService LLM Checks', () => {
  let service: LoopDetectionService;
  let mockConfig: Config;
  let mockGeminiClient: GeminiClient;
  let abortController: AbortController;

  beforeEach(() => {
    mockGeminiClient = {
      getHistory: vi.fn().mockReturnValue([]),
      generateJson: vi.fn(),
    } as unknown as GeminiClient;

    mockConfig = {
      getGeminiClient: () => mockGeminiClient,
      getDebugMode: () => false,
      getTelemetryEnabled: () => true,
    } as unknown as Config;

    service = new LoopDetectionService(mockConfig);
    abortController = new AbortController();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const advanceTurns = async (count: number) => {
    for (let i = 0; i < count; i++) {
      await service.turnStarted(abortController.signal);
    }
  };

});

describe('LoopDetectionService - Preview Model Strict Checking', () => {
  let service: LoopDetectionService;
  let mockConfig: Config;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createToolCallRequestEvent = (
    name: string,
    args: Record<string, unknown>,
  ): ServerGeminiToolCallRequestEvent => ({
    type: GeminiEventType.ToolCallRequest,
    value: {
      name,
      args,
      callId: 'test-id',
      isClientInitiated: false,
      prompt_id: 'test-prompt-id',
    },
  });

  it('should apply strict tool-name checking for preview models', () => {
    // Setup mock config that returns a preview model
    mockConfig = {
      getTelemetryEnabled: () => true,
      getModel: () => 'gemini-3-pro-preview',
    } as unknown as Config;
    service = new LoopDetectionService(mockConfig);
    service.reset('test-prompt');

    // Call read_file with different args 12 times
    const events = [];
    for (let i = 0; i < 12; i++) {
      events.push(createToolCallRequestEvent('read_file', { file_path: `/path/file${i}.txt` }));
    }

    // First 11 calls should not trigger
    for (let i = 0; i < 11; i++) {
      expect(service.addAndCheck(events[i])).toBe(false);
    }
    expect(loggers.logLoopDetected).not.toHaveBeenCalled();

    // 12th call to read_file should trigger
    expect(service.addAndCheck(events[11])).toBe(true);
    expect(loggers.logLoopDetected).toHaveBeenCalledTimes(1);
  });

  it('should use threshold of 12 for non-intensive tools in preview models', () => {
    mockConfig = {
      getTelemetryEnabled: () => true,
      getModel: () => 'gemini-3-pro-preview',
    } as unknown as Config;
    service = new LoopDetectionService(mockConfig);
    service.reset('test-prompt');

    // Call shell with different args 12 times
    const events = [];
    for (let i = 0; i < 12; i++) {
      events.push(createToolCallRequestEvent('shell', { command: `ls /dir${i}` }));
    }

    // First 11 calls should not trigger
    for (let i = 0; i < 11; i++) {
      expect(service.addAndCheck(events[i])).toBe(false);
    }
    expect(loggers.logLoopDetected).not.toHaveBeenCalled();

    // 12th call should trigger
    expect(service.addAndCheck(events[11])).toBe(true);
    expect(loggers.logLoopDetected).toHaveBeenCalledTimes(1);
  });

  it('should not apply preview strict checking for non-preview models', () => {
    mockConfig = {
      getTelemetryEnabled: () => true,
      getModel: () => 'gemini-2.0-flash', // Not a preview model
    } as unknown as Config;
    service = new LoopDetectionService(mockConfig);
    service.reset('test-prompt');

    // Call read_file 10 times with different args
    for (let i = 0; i < 10; i++) {
      const event = createToolCallRequestEvent('read_file', {
        file_path: `/path/file${i}.txt`
      });
      // Should not trigger because args are different (exact match required for non-preview)
      expect(service.addAndCheck(event)).toBe(false);
    }
    expect(loggers.logLoopDetected).not.toHaveBeenCalled();
  });

  it('should detect glob tool calls exceeding threshold in preview models', () => {
    mockConfig = {
      getTelemetryEnabled: () => true,
      getModel: () => 'gemini-3-pro-preview',
    } as unknown as Config;
    service = new LoopDetectionService(mockConfig);
    service.reset('test-prompt');

    // threshold = 12
    const events = [];
    for (let i = 0; i < 12; i++) {
      events.push(createToolCallRequestEvent('glob', { pattern: `**/*.${i}` }));
    }

    // First 11 should pass
    for (let i = 0; i < 11; i++) {
      expect(service.addAndCheck(events[i])).toBe(false);
    }

    // 12th call should trigger
    expect(service.addAndCheck(events[11])).toBe(true);
    expect(loggers.logLoopDetected).toHaveBeenCalledTimes(1);
  });

  it('should detect search_file_content exceeding threshold in preview models', () => {
    mockConfig = {
      getTelemetryEnabled: () => true,
      getModel: () => 'gemini-3-pro-preview',
    } as unknown as Config;
    service = new LoopDetectionService(mockConfig);
    service.reset('test-prompt');

    // threshold = 12
    const events = [];
    for (let i = 0; i < 12; i++) {
      events.push(createToolCallRequestEvent('search_file_content', { pattern: `pattern${i}` }));
    }

    // First 11 should pass
    for (let i = 0; i < 11; i++) {
      expect(service.addAndCheck(events[i])).toBe(false);
    }

    // 12th call should trigger
    expect(service.addAndCheck(events[11])).toBe(true);
    expect(loggers.logLoopDetected).toHaveBeenCalledTimes(1);
  });
});
