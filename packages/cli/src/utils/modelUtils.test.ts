/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { formatProviderName, formatCustomModelDisplayName } from './modelUtils.js';
import type { CustomModelConfig } from 'deepv-code-core';

describe('modelUtils', () => {
  describe('formatProviderName', () => {
    it('should format "openai" as "OpenAI"', () => {
      expect(formatProviderName('openai')).toBe('OpenAI');
    });

    it('should format "anthropic" as "Anthropic"', () => {
      expect(formatProviderName('anthropic')).toBe('Anthropic');
    });

    it('should capitalize first letter for unknown providers', () => {
      expect(formatProviderName('azure')).toBe('Azure');
      expect(formatProviderName('custom')).toBe('Custom');
    });

    it('should handle empty string', () => {
      expect(formatProviderName('')).toBe('');
    });
  });

  describe('formatCustomModelDisplayName', () => {
    it('should format OpenAI custom model display name', () => {
      const model: CustomModelConfig = {
        displayName: 'GPT-4o',
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        modelId: 'gpt-4o',
      };
      expect(formatCustomModelDisplayName(model)).toBe('[OpenAI] GPT-4o');
    });

    it('should format Anthropic custom model display name', () => {
      const model: CustomModelConfig = {
        displayName: 'Claude Opus',
        provider: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'test-key',
        modelId: 'claude-opus',
      };
      expect(formatCustomModelDisplayName(model)).toBe('[Anthropic] Claude Opus');
    });
  });
});
