/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { translations, tp } from './i18n.js';

/**
 * Test helper to get the expected translation text for both locales
 * This is useful for tests that need to verify i18n functionality
 */
export function getExpectedText(key: keyof typeof translations.en): {
  en: string;
  zh: string;
} {
  const enTranslation = translations.en[key];
  const zhTranslation = translations.zh[key];
  
  // 对于包含参数的翻译，使用默认的esc键进行测试
  const hasParams = typeof enTranslation === 'string' && enTranslation.includes('{');
  
  return {
    en: hasParams ? tp(key, { cancelKey: 'esc' }) : enTranslation,
    zh: hasParams ? withMockedLocale('zh', () => tp(key, { cancelKey: 'esc' })) : zhTranslation,
  };
}

/**
 * Mock function to force locale for testing
 * @param locale The locale to mock ('en' or 'zh')
 * @param callback Function to execute with the mocked locale
 */
export function withMockedLocale<T>(
  locale: 'en' | 'zh',
  callback: () => T
): T {
  // Save original environment
  const originalEnv = { ...process.env };
  
  try {
    // Set environment variables to force locale
    if (locale === 'zh') {
      process.env.LANG = 'zh_CN.UTF-8';
      process.env.LC_ALL = 'zh_CN.UTF-8';
    } else {
      process.env.LANG = 'en_US.UTF-8';
      process.env.LC_ALL = 'en_US.UTF-8';
    }
    
    return callback();
  } finally {
    // Restore original environment
    process.env = originalEnv;
  }
}