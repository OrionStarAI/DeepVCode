/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Config } from './config.js';

describe('Flash Model Fallback Configuration', () => {
  let config: Config;

  beforeEach(() => {
    config = new Config({
      sessionId: 'test-session',
      targetDir: '/test',
      debugMode: false,
      cwd: '/test',
      model: 'auto',
    });

    // Initialize contentGeneratorConfig for testing
    (
      config as unknown as { contentGeneratorConfig: unknown }
    ).contentGeneratorConfig = {
      model: 'auto',
      authType: 'oauth-personal',
    };
  });

  describe('setModel', () => {
    it('should update the model and mark as switched during session', () => {
      expect(config.getModel()).toBe('auto');
      expect(config.isModelSwitchedDuringSession()).toBe(false);

      config.setModel('gemini-flash-test');

      expect(config.getModel()).toBe('gemini-flash-test');
      expect(config.isModelSwitchedDuringSession()).toBe(true);
    });

    it('should handle multiple model switches during session', () => {
      config.setModel('gemini-flash-test');
      expect(config.isModelSwitchedDuringSession()).toBe(true);

      config.setModel('test-model-pro');
      expect(config.getModel()).toBe('test-model-pro');
      expect(config.isModelSwitchedDuringSession()).toBe(true);
    });

    it('should only mark as switched if contentGeneratorConfig exists', () => {
      // Create config without initializing contentGeneratorConfig
      const newConfig = new Config({
        sessionId: 'test-session-2',
        targetDir: '/test',
        debugMode: false,
        cwd: '/test',
      });

      // Should not mark as switched when contentGeneratorConfig is undefined
      newConfig.setModel('gemini-flash-test');
      expect(newConfig.isModelSwitchedDuringSession()).toBe(false);
    });
  });

  describe('getModel', () => {
    it('should return the set model', () => {
      config.setModel('gemini-flash-test');
      expect(config.getModel()).toBe('gemini-flash-test');
    });

    it('should fall back to auto if no model is set', () => {
      const newConfig = new Config({
        sessionId: 'test-session-2',
        targetDir: '/test',
        debugMode: false,
        cwd: '/test',
      });

      expect(newConfig.getModel()).toBe('auto');
    });
  });

  describe('isModelSwitchedDuringSession', () => {
    it('should start as false for new session', () => {
      expect(config.isModelSwitchedDuringSession()).toBe(false);
    });

    it('should remain false if no model switch occurs', () => {
      expect(config.isModelSwitchedDuringSession()).toBe(false);
    });

    it('should persist switched state throughout session', () => {
      config.setModel('gemini-flash-test');
      expect(config.isModelSwitchedDuringSession()).toBe(true);

      config.getModel();
      expect(config.isModelSwitchedDuringSession()).toBe(true);
    });
  });

  describe('resetModelToDefault', () => {
    it('should clear session switch flag but keep the current model (current behavior)', () => {
      config.setModel('gemini-flash-test');
      expect(config.getModel()).toBe('gemini-flash-test');
      expect(config.isModelSwitchedDuringSession()).toBe(true);

      // Reset
      config.resetModelToDefault();

      // Flag is cleared but model remains (based on current implementation)
      expect(config.getModel()).toBe('gemini-flash-test');
      expect(config.isModelSwitchedDuringSession()).toBe(false);
    });
  });
});