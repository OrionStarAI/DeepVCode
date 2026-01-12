import {
  DEFAULT_LOCALE,
  formatTranslation,
  getLocaleDisplayName,
  getSystemLocale,
  getTranslation,
  isRTL,
} from './index';

describe('i18n index', () => {
  it('formats translations and falls back', () => {
    expect(formatTranslation('Hello {{name}}', { name: 'Ada' })).toBe('Hello Ada');
    expect(getTranslation('en-US', 'missing.key', 'fallback')).toBe('fallback');
  });

  it('returns a mapped system locale', () => {
    Object.defineProperty(window.navigator, 'language', {
      value: 'en-GB',
      configurable: true,
    });

    expect(getSystemLocale()).toBe('en-US');
    expect(DEFAULT_LOCALE).toBe('zh-CN');
  });

  it('exposes locale display names and RTL flag', () => {
    expect(getLocaleDisplayName('en-US')).toContain('English');
    expect(isRTL('en-US')).toBe(false);
  });
});
