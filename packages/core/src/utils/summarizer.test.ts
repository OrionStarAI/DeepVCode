/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { GeminiClient } from '../core/client.js';
import { Config } from '../config/config.js';
import {
  summarizeToolOutput,
  llmSummarizer,
  defaultSummarizer,
} from './summarizer.js';
import { ToolResult } from '../tools/tools.js';
import { SceneType } from '../core/sceneManager.js';

// Mock GeminiClient and Config constructor
vi.mock('../core/client.js');
vi.mock('../config/config.js');

describe('summarizers', () => {
  let mockGeminiClient: GeminiClient;
  let MockConfig: Mock;
  let mockTemporaryChat: any;
  const abortSignal = new AbortController().signal;

  beforeEach(() => {
    MockConfig = vi.mocked(Config);
    const mockConfigInstance = new MockConfig(
      'test-api-key',
      'gemini-pro',
      false,
      '.',
      false,
      undefined,
      false,
      undefined,
      undefined,
      undefined,
    );

    mockTemporaryChat = {
      sendMessage: vi.fn()
    };

    mockGeminiClient = new GeminiClient(mockConfigInstance);
    (mockGeminiClient.createTemporaryChat as Mock) = vi.fn().mockResolvedValue(mockTemporaryChat);

    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    (console.error as Mock).mockRestore();
    (console.log as Mock).mockRestore();
    (console.warn as Mock).mockRestore();
  });

  describe('summarizeToolOutput', () => {
    it('should return original text if it is shorter than maxLength', async () => {
      const shortText = 'This is a short text.';
      const result = await summarizeToolOutput(
        shortText,
        mockGeminiClient,
        abortSignal,
        2000,
      );
      expect(result).toBe(shortText);
      expect(mockGeminiClient.createTemporaryChat).not.toHaveBeenCalled();
    });

    it('should return original text if it is empty', async () => {
      const emptyText = '';
      const result = await summarizeToolOutput(
        emptyText,
        mockGeminiClient,
        abortSignal,
        2000,
      );
      expect(result).toBe(emptyText);
      expect(mockGeminiClient.createTemporaryChat).not.toHaveBeenCalled();
    });

    it('should call createTemporaryChat if text is longer than maxLength', async () => {
      const longText = 'This is a very long text.'.repeat(200);
      const summary = 'This is a summary.';
      mockTemporaryChat.sendMessage.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: summary }] } }],
      });

      const result = await summarizeToolOutput(
        longText,
        mockGeminiClient,
        abortSignal,
        2000,
      );

      expect(mockGeminiClient.createTemporaryChat).toHaveBeenCalledTimes(1);
      expect(mockGeminiClient.createTemporaryChat).toHaveBeenCalledWith(
        SceneType.CONTENT_SUMMARY,
        expect.any(String),
        { type: 'sub', agentId: 'Summarizer' }
      );
      expect(mockTemporaryChat.sendMessage).toHaveBeenCalledTimes(1);
      expect(result).toBe(summary);
    });

    it('should return original text if summarization throws an error', async () => {
      const longText = 'This is a very long text.'.repeat(200);
      const error = new Error('API Error');
      mockTemporaryChat.sendMessage.mockRejectedValue(error);

      const result = await summarizeToolOutput(
        longText,
        mockGeminiClient,
        abortSignal,
        2000,
      );

      expect(mockGeminiClient.createTemporaryChat).toHaveBeenCalledTimes(1);
      expect(mockTemporaryChat.sendMessage).toHaveBeenCalledTimes(1);
      expect(result).toBe(longText);
      expect(console.error).toHaveBeenCalledWith(
        '[Summarizer] Summarization failed:',
        error,
      );
    });

    it('should construct the correct prompt for summarization', async () => {
      const longText = 'This is a very long text.'.repeat(200);
      const summary = 'This is a summary.';
      mockTemporaryChat.sendMessage.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: summary }] } }],
      });

      await summarizeToolOutput(longText, mockGeminiClient, abortSignal, 1000);

      const expectedPrompt = `Summarize the following tool output to be a maximum of 1000 tokens. The summary should be concise and capture the main points of the tool output.

The summarization should be done based on the content that is provided. Here are the basic rules to follow:
1. If the text is a directory listing or any output that is structural, use the history of the conversation to understand the context. Using this context try to understand what information we need from the tool output and return that as a response.
2. If the text is text content and there is nothing structural that we need, summarize the text.
3. If the text is the output of a shell command, use the history of the conversation to understand the context. Using this context try to understand what information we need from the tool output and return a summarization along with the stack trace of any error within the <error></error> tags. The stack trace should be complete and not truncated. If there are warnings, you should include them in the summary within <warning></warning> tags.


Text to summarize:
"${longText}"

Return the summary string which should first contain an overall summarization of text followed by the full stack trace of errors and warnings in the tool output.
`;
      const calledWith = mockTemporaryChat.sendMessage.mock.calls[0];
      expect(calledWith[0].message).toBe(expectedPrompt);
    });
  });

  describe('llmSummarizer', () => {
    it('should summarize tool output using summarizeToolOutput', async () => {
      const toolResult: ToolResult = {
        llmContent: 'This is a very long text.'.repeat(200),
        returnDisplay: '',
      };
      const summary = 'This is a summary.';
      mockTemporaryChat.sendMessage.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: summary }] } }],
      });

      const result = await llmSummarizer(
        toolResult,
        mockGeminiClient,
        abortSignal,
      );

      expect(mockGeminiClient.createTemporaryChat).toHaveBeenCalledTimes(1);
      expect(mockTemporaryChat.sendMessage).toHaveBeenCalledTimes(1);
      expect(result).toBe(summary);
    });

    it('should handle different llmContent types', async () => {
      const longText = 'This is a very long text.'.repeat(200);
      const toolResult: ToolResult = {
        llmContent: [{ text: longText }],
        returnDisplay: '',
      };
      const summary = 'This is a summary.';
      mockTemporaryChat.sendMessage.mockResolvedValue({
        candidates: [{ content: { parts: [{ text: summary }] } }],
      });

      const result = await llmSummarizer(
        toolResult,
        mockGeminiClient,
        abortSignal,
      );

      expect(mockGeminiClient.createTemporaryChat).toHaveBeenCalledTimes(1);
      expect(mockTemporaryChat.sendMessage).toHaveBeenCalledTimes(1);
      const calledWith = mockTemporaryChat.sendMessage.mock.calls[0];
      expect(calledWith[0].message).toContain(`"${longText}"`);
      expect(result).toBe(summary);
    });
  });

  describe('defaultSummarizer', () => {
    it('should stringify the llmContent', async () => {
      const toolResult: ToolResult = {
        llmContent: { text: 'some data' },
        returnDisplay: '',
      };

      const result = await defaultSummarizer(
        toolResult,
        mockGeminiClient,
        abortSignal,
      );

      expect(result).toBe(JSON.stringify({ text: 'some data' }));
      expect(mockGeminiClient.createTemporaryChat).not.toHaveBeenCalled();
    });
  });
});