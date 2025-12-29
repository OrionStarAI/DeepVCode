/**
 * i18n Main Module
 */

import { Translations, SupportedLocale, LocaleConfig } from './types';
import { zhCN } from './locales/zh-CN';
import { enUS } from './locales/en-US';

// Available translations
const translations: Record<SupportedLocale, Translations> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

// Locale configurations
export const localeConfigs: LocaleConfig[] = [
  { code: 'zh-CN', name: '简体中文', flag: '🇨🇳' },
  { code: 'en-US', name: 'English', flag: '🇺🇸' },
];

// Default locale
export const DEFAULT_LOCALE: SupportedLocale = 'zh-CN';

/**
 * Get VS Code locale or system locale
 */
export const getSystemLocale = (): SupportedLocale => {
  try {
    // Try to get VS Code language setting
    if (typeof window !== 'undefined' && window.navigator) {
      const language = window.navigator.language;
      
      // Map common locale formats to supported locales
      const localeMap: Record<string, SupportedLocale> = {
        'zh': 'zh-CN',
        'zh-CN': 'zh-CN',
        'zh-Hans': 'zh-CN',
        'zh-Hans-CN': 'zh-CN',
        'zh-TW': 'zh-CN',
        'zh-HK': 'zh-CN',
        'en': 'en-US',
        'en-US': 'en-US',
        'en-GB': 'en-US',
        'en-CA': 'en-US',
        'en-AU': 'en-US',
      };

      const mappedLocale = localeMap[language] || localeMap[language.split('-')[0]];
      if (mappedLocale) {
        return mappedLocale;
      }
    }
  } catch (error) {
    console.warn('Failed to detect system locale:', error);
  }

  return DEFAULT_LOCALE;
};

/**
 * Get translation by key path
 * @param locale Current locale
 * @param keyPath Dot-separated key path (e.g., 'welcome.title')
 * @param fallback Fallback text if key not found
 */
export const getTranslation = (
  locale: SupportedLocale,
  keyPath: string,
  fallback?: string
): string => {
  const translation = translations[locale] || translations[DEFAULT_LOCALE];
  
  try {
    const keys = keyPath.split('.');
    let current: any = translation;
    
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        // Key not found, return fallback or key path
        return fallback || keyPath;
      }
    }
    
    return typeof current === 'string' ? current : fallback || keyPath;
  } catch (error) {
    console.warn(`Translation error for key "${keyPath}":`, error);
    return fallback || keyPath;
  }
};

/**
 * Format translation with placeholders
 * @param text Translation text
 * @param params Parameters to replace placeholders
 */
export const formatTranslation = (text: string, params: Record<string, string | number>): string => {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return params[key]?.toString() || match;
  });
};

/**
 * Get locale display name
 */
export const getLocaleDisplayName = (locale: SupportedLocale): string => {
  const config = localeConfigs.find(c => c.code === locale);
  return config ? `${config.flag} ${config.name}` : locale;
};

/**
 * Check if locale is RTL (Right-to-Left)
 */
export const isRTL = (locale: SupportedLocale): boolean => {
  const config = localeConfigs.find(c => c.code === locale);
  return config?.rtl || false;
};

export { translations };
export type { Translations, SupportedLocale, LocaleConfig };
