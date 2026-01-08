/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getShortVersion,
  getShortModelName,
  getContextDisplay,
  getFooterDisplayConfig,
} from './footerUtils.js';

describe('footerUtils', () => {
  let originalNodeVersion: string;

  beforeEach(() => {
    originalNodeVersion = process.versions.node;
    // Mock Node version for consistent tests
    Object.defineProperty(process.versions, 'node', {
      value: '22.19.0',
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process.versions, 'node', {
      value: originalNodeVersion,
      writable: true,
      configurable: true,
    });
  });

  describe('getShortVersion', () => {
    it('should return version with Node version when includeNodeVersion is true', () => {
      expect(getShortVersion('1.0.161', true)).toBe('v1.0.161(22.19.0)');
    });

    it('should return version without Node version when includeNodeVersion is false', () => {
      expect(getShortVersion('1.0.161', false)).toBe('v1.0.161');
    });

    it('should default to not including Node version', () => {
      expect(getShortVersion('1.0.161')).toBe('v1.0.161');
    });
  });

  describe('getShortModelName', () => {
    it('should return full name when simplified is false', () => {
      expect(getShortModelName('Claude-3.5-Sonnet', false)).toBe('Claude-3.5-Sonnet');
      expect(getShortModelName('Gemini-2.0-Flash', false)).toBe('Gemini-2.0-Flash');
    });

    it('should simplify Claude model names', () => {
      expect(getShortModelName('Claude-3.5-Sonnet', true)).toBe('Sonnet');
      expect(getShortModelName('Claude-Opus', true)).toBe('Opus');
      expect(getShortModelName('Claude-Haiku', true)).toBe('Haiku');
    });

    it('should simplify Gemini model names', () => {
      expect(getShortModelName('Gemini-2.0-Flash', true)).toBe('Flash');
      expect(getShortModelName('Gemini-Pro', true)).toBe('Pro');
      expect(getShortModelName('Gemini-Ultra', true)).toBe('Ultra');
    });

    it('should simplify GPT model names', () => {
      expect(getShortModelName('GPT-4', true)).toBe('4');
      expect(getShortModelName('GPT-3.5-Turbo', true)).toBe('3.5-Turbo');
    });

    it('should simplify OpenAI model names', () => {
      expect(getShortModelName('OpenAI-GPT4', true)).toBe('GPT4');
    });

    it('should return original name if no pattern matches', () => {
      expect(getShortModelName('UnknownModel', true)).toBe('UnknownModel');
      expect(getShortModelName('CustomAI-Model', true)).toBe('CustomAI-Model');
    });

    it('should handle case-insensitive matching', () => {
      expect(getShortModelName('claude-3.5-sonnet', true)).toBe('sonnet');
      expect(getShortModelName('GEMINI-Pro', true)).toBe('Pro');
    });
  });

  describe('getContextDisplay', () => {
    it('should return full text when simplified is false', () => {
      expect(getContextDisplay(92, false)).toBe('(92% context left)');
      expect(getContextDisplay(50, false)).toBe('(50% context left)');
    });

    it('should return percentage only when simplified is true', () => {
      expect(getContextDisplay(92, true)).toBe('92%');
      expect(getContextDisplay(50, true)).toBe('50%');
    });

    it('should handle edge cases', () => {
      expect(getContextDisplay(0, false)).toBe('(0% context left)');
      expect(getContextDisplay(100, false)).toBe(''); // 100% 时隐藏
      expect(getContextDisplay(0, true)).toBe('0%');
      expect(getContextDisplay(100, true)).toBe(''); // 100% 时隐藏
    });

    it('should hide context display when at 100%', () => {
      expect(getContextDisplay(100, false)).toBe('');
      expect(getContextDisplay('100', false)).toBe('');
      expect(getContextDisplay(100, true)).toBe('');
      expect(getContextDisplay('100', true)).toBe('');
    });
  });

  describe('getFooterDisplayConfig', () => {
    it('should return full config for width >= 80', () => {
      const config80 = getFooterDisplayConfig(80);
      expect(config80.showNodeVersion).toBe(true);
      expect(config80.simplifyContext).toBe(false);
      expect(config80.simplifyModel).toBe(false);
      expect(config80.level).toBe('full');

      const config120 = getFooterDisplayConfig(120);
      expect(config120.showNodeVersion).toBe(true);
      expect(config120.simplifyContext).toBe(false);
      expect(config120.simplifyModel).toBe(false);
      expect(config120.level).toBe('full');
    });

    it('should return compact config for width 60-79', () => {
      const config60 = getFooterDisplayConfig(60);
      expect(config60.showNodeVersion).toBe(false);
      expect(config60.simplifyContext).toBe(true);
      expect(config60.simplifyModel).toBe(true);
      expect(config60.level).toBe('compact');

      const config79 = getFooterDisplayConfig(79);
      expect(config79.showNodeVersion).toBe(false);
      expect(config79.simplifyContext).toBe(true);
      expect(config79.simplifyModel).toBe(true);
      expect(config79.level).toBe('compact');
    });

    it('should return compact config for width < 60', () => {
      const config50 = getFooterDisplayConfig(50);
      expect(config50.showNodeVersion).toBe(false);
      expect(config50.simplifyContext).toBe(true);
      expect(config50.simplifyModel).toBe(true);
      expect(config50.level).toBe('compact');
    });

    it('should handle boundary conditions correctly', () => {
      const config79 = getFooterDisplayConfig(79);
      expect(config79.level).toBe('compact');

      const config80 = getFooterDisplayConfig(80);
      expect(config80.level).toBe('full');
    });
  });

  describe('Integration: Display transformations', () => {
    it('should show full display for 80+ columns', () => {
      const config = getFooterDisplayConfig(100);
      const version = getShortVersion('1.0.161', config.showNodeVersion);
      const context = getContextDisplay(92, config.simplifyContext);
      const model = getShortModelName('Claude-3.5-Sonnet', config.simplifyModel);

      expect(version).toBe('v1.0.161(22.19.0)');
      expect(context).toBe('(92% context left)');
      expect(model).toBe('Claude-3.5-Sonnet');
    });

    it('should show compact display for 60-79 columns', () => {
      const config = getFooterDisplayConfig(70);
      const version = getShortVersion('1.0.161', config.showNodeVersion);
      const context = getContextDisplay(92, config.simplifyContext);
      const model = getShortModelName('Claude-3.5-Sonnet', config.simplifyModel);

      expect(version).toBe('v1.0.161');
      expect(context).toBe('92%');
      expect(model).toBe('Sonnet');
    });

    it('should show compact display for narrow terminals', () => {
      const config = getFooterDisplayConfig(50);
      const version = getShortVersion('1.0.161', config.showNodeVersion);
      const context = getContextDisplay(92, config.simplifyContext);
      const model = getShortModelName('Gemini-2.0-Flash', config.simplifyModel);

      expect(version).toBe('v1.0.161');
      expect(context).toBe('92%');
      expect(model).toBe('Flash');
    });
  });
});
