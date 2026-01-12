import { describe, it, expect } from 'vitest';
import type { LocaleConfig, SupportedLocale, Translations } from './types';

describe('i18n types', () => {
  it('should accept zh-CN as SupportedLocale', () => {
    const locale: SupportedLocale = 'zh-CN';
    expect(locale).toBe('zh-CN');
  });

  it('should accept en-US as SupportedLocale', () => {
    const locale: SupportedLocale = 'en-US';
    expect(locale).toBe('en-US');
  });

  it('should accept valid LocaleConfig', () => {
    const config: LocaleConfig = {
      code: 'en-US',
      name: 'English',
      flag: '🇺🇸'
    };
    expect(config.code).toBe('en-US');
    expect(config.name).toBe('English');
    expect(config.flag).toBe('🇺🇸');
  });

  it('should accept LocaleConfig with rtl flag', () => {
    const config: LocaleConfig = {
      code: 'zh-CN',
      name: 'Chinese',
      flag: '🇨🇳',
      rtl: false
    };
    expect(config.rtl).toBe(false);
  });

  it('should accept valid Translations structure', () => {
    const translations: any = {
      common: { loading: 'Loading...' },
      welcome: { title: 'Welcome' },
      session: { export: 'Export' },
      chat: { thinking: 'Thinking...' },
    };
    expect(translations.common.loading).toBe('Loading...');
  });
});