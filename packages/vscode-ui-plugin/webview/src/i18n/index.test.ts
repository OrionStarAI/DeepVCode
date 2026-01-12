import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_LOCALE,
  formatTranslation,
  getLocaleDisplayName,
  getSystemLocale,
  getTranslation,
  isRTL,
  localeConfigs,
  translations,
} from './index';

describe('i18n index', () => {
  describe('DEFAULT_LOCALE', () => {
    it('should be zh-CN', () => {
      expect(DEFAULT_LOCALE).toBe('zh-CN');
    });
  });

  describe('localeConfigs', () => {
    it('should contain zh-CN and en-US', () => {
      expect(localeConfigs).toHaveLength(2);
      expect(localeConfigs.some(c => c.code === 'zh-CN')).toBe(true);
      expect(localeConfigs.some(c => c.code === 'en-US')).toBe(true);
    });

    it('should have valid config structure', () => {
      localeConfigs.forEach(config => {
        expect(config).toHaveProperty('code');
        expect(config).toHaveProperty('name');
        expect(config).toHaveProperty('flag');
      });
    });

    it('should have Chinese config', () => {
      const zhConfig = localeConfigs.find(c => c.code === 'zh-CN');
      expect(zhConfig).toBeDefined();
      expect(zhConfig?.name).toBe('简体中文');
      expect(zhConfig?.flag).toBe('🇨🇳');
    });

    it('should have English config', () => {
      const enConfig = localeConfigs.find(c => c.code === 'en-US');
      expect(enConfig).toBeDefined();
      expect(enConfig?.name).toBe('English');
      expect(enConfig?.flag).toBe('🇺🇸');
    });
  });

  describe('translations', () => {
    it('should have zh-CN translations', () => {
      expect(translations['zh-CN']).toBeDefined();
      expect(typeof translations['zh-CN']).toBe('object');
    });

    it('should have en-US translations', () => {
      expect(translations['en-US']).toBeDefined();
      expect(typeof translations['en-US']).toBe('object');
    });
  });

  describe('formatTranslation', () => {
    it('should replace single placeholder', () => {
      expect(formatTranslation('Hello {{name}}', { name: 'Ada' })).toBe('Hello Ada');
    });

    it('should replace multiple placeholders', () => {
      const result = formatTranslation('{{greeting}} {{name}}!', {
        greeting: 'Hello',
        name: 'World'
      });
      expect(result).toBe('Hello World!');
    });

    it('should handle numeric values', () => {
      expect(formatTranslation('Count: {{count}}', { count: 42 })).toBe('Count: 42');
    });

    it('should keep unmatched placeholders', () => {
      expect(formatTranslation('Hello {{name}}', {})).toBe('Hello {{name}}');
    });

    it('should handle text without placeholders', () => {
      expect(formatTranslation('Hello World', {})).toBe('Hello World');
    });

    it('should handle empty string', () => {
      expect(formatTranslation('', {})).toBe('');
    });

    it('should handle multiple instances of same placeholder', () => {
      expect(formatTranslation('{{x}} + {{x}} = {{y}}', { x: 1, y: 2 })).toBe('1 + 1 = 2');
    });
  });

  describe('getTranslation', () => {
    it('should return translation for valid key', () => {
      // Assuming 'welcome.title' exists in translations
      const result = getTranslation('zh-CN', 'welcome.title');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return fallback for missing key', () => {
      expect(getTranslation('en-US', 'missing.key', 'fallback')).toBe('fallback');
    });

    it('should return key path if no fallback provided', () => {
      expect(getTranslation('en-US', 'totally.missing.key')).toBe('totally.missing.key');
    });

    it('should fallback to DEFAULT_LOCALE if locale not found', () => {
      const result = getTranslation('fr-FR' as any, 'welcome.title');
      expect(typeof result).toBe('string');
    });

    it('should handle nested keys', () => {
      const result = getTranslation('zh-CN', 'welcome.title');
      expect(typeof result).toBe('string');
    });

    it('should return fallback for partial key path', () => {
      const result = getTranslation('zh-CN', 'welcome', 'fallback');
      // 'welcome' is an object, not a string
      expect(result).toBe('fallback');
    });

    it('should handle empty key path', () => {
      const result = getTranslation('zh-CN', '', 'fallback');
      expect(result).toBe('fallback');
    });
  });

  describe('getSystemLocale', () => {
    let originalNavigator: any;

    beforeEach(() => {
      originalNavigator = window.navigator;
    });

    afterEach(() => {
      Object.defineProperty(window, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    });

    it('should map zh-CN correctly', () => {
      Object.defineProperty(window.navigator, 'language', {
        value: 'zh-CN',
        configurable: true,
      });
      expect(getSystemLocale()).toBe('zh-CN');
    });

    it('should map en-US correctly', () => {
      Object.defineProperty(window.navigator, 'language', {
        value: 'en-US',
        configurable: true,
      });
      expect(getSystemLocale()).toBe('en-US');
    });

    it('should map en-GB to en-US', () => {
      Object.defineProperty(window.navigator, 'language', {
        value: 'en-GB',
        configurable: true,
      });
      expect(getSystemLocale()).toBe('en-US');
    });

    it('should map zh to zh-CN', () => {
      Object.defineProperty(window.navigator, 'language', {
        value: 'zh',
        configurable: true,
      });
      expect(getSystemLocale()).toBe('zh-CN');
    });

    it('should map en to en-US', () => {
      Object.defineProperty(window.navigator, 'language', {
        value: 'en',
        configurable: true,
      });
      expect(getSystemLocale()).toBe('en-US');
    });

    it('should map zh-TW to zh-CN', () => {
      Object.defineProperty(window.navigator, 'language', {
        value: 'zh-TW',
        configurable: true,
      });
      expect(getSystemLocale()).toBe('zh-CN');
    });

    it('should return default locale for unsupported language', () => {
      Object.defineProperty(window.navigator, 'language', {
        value: 'fr-FR',
        configurable: true,
      });
      expect(getSystemLocale()).toBe(DEFAULT_LOCALE);
    });

    it('should return default locale if navigator is unavailable', () => {
      Object.defineProperty(window, 'navigator', {
        value: undefined,
        configurable: true,
      });
      expect(getSystemLocale()).toBe(DEFAULT_LOCALE);
    });
  });

  describe('getLocaleDisplayName', () => {
    it('should return display name with flag for zh-CN', () => {
      const displayName = getLocaleDisplayName('zh-CN');
      expect(displayName).toContain('简体中文');
      expect(displayName).toContain('🇨🇳');
    });

    it('should return display name with flag for en-US', () => {
      const displayName = getLocaleDisplayName('en-US');
      expect(displayName).toContain('English');
      expect(displayName).toContain('🇺🇸');
    });

    it('should return locale code for unknown locale', () => {
      expect(getLocaleDisplayName('fr-FR' as any)).toBe('fr-FR');
    });
  });

  describe('isRTL', () => {
    it('should return false for zh-CN', () => {
      expect(isRTL('zh-CN')).toBe(false);
    });

    it('should return false for en-US', () => {
      expect(isRTL('en-US')).toBe(false);
    });

    it('should return false for unknown locale', () => {
      expect(isRTL('ar-SA' as any)).toBe(false);
    });
  });
});
