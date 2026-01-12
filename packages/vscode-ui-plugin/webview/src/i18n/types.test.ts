import type { LocaleConfig, SupportedLocale } from './types';

describe('i18n types', () => {
  it('accepts supported locales and configs', () => {
    const locale: SupportedLocale = 'en-US';
    const config: LocaleConfig = { code: locale, name: 'English', flag: 'US' };

    expect(config.code).toBe('en-US');
  });
});
