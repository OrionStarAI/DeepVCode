/**
 * Translation Hook
 */

import React, { useState, useCallback, useEffect, useContext, createContext, ReactNode } from 'react';
import { 
  SupportedLocale, 
  getSystemLocale, 
  getTranslation, 
  formatTranslation, 
  getLocaleDisplayName,
  DEFAULT_LOCALE,
  localeConfigs
} from '../i18n';

interface I18nContextType {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: string, params?: Record<string, string | number>, fallback?: string) => string;
  getDisplayName: (locale: SupportedLocale) => string;
  availableLocales: typeof localeConfigs;
}

const I18nContext = createContext<I18nContextType | null>(null);

interface I18nProviderProps {
  children: ReactNode;
  initialLocale?: SupportedLocale;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({ 
  children, 
  initialLocale 
}) => {
  const [locale, setLocaleState] = useState<SupportedLocale>(
    initialLocale || getSystemLocale()
  );

  // Translation function
  const t = useCallback(
    (key: string, params?: Record<string, string | number>, fallback?: string) => {
      const translation = getTranslation(locale, key, fallback);
      return params ? formatTranslation(translation, params) : translation;
    },
    [locale]
  );

  // Set locale with persistence
  const setLocale = useCallback((newLocale: SupportedLocale) => {
    setLocaleState(newLocale);
    
    // Try to persist locale preference in VS Code state
    try {
      if (window.vscode) {
        const currentState = window.vscode.getState() || {};
        window.vscode.setState({
          ...currentState,
          locale: newLocale
        });
      }
    } catch (error) {
      console.warn('Failed to persist locale preference:', error);
    }
  }, []);

  // Get display name for locale
  const getDisplayName = useCallback((locale: SupportedLocale) => {
    return getLocaleDisplayName(locale);
  }, []);

  // Load persisted locale on mount
  useEffect(() => {
    try {
      if (window.vscode) {
        const persistedState = window.vscode.getState();
        if (persistedState?.locale && 
            typeof persistedState.locale === 'string' &&
            localeConfigs.some(config => config.code === persistedState.locale)) {
          setLocaleState(persistedState.locale as SupportedLocale);
        }
      }
    } catch (error) {
      console.warn('Failed to load persisted locale:', error);
    }
  }, []);

  const value: I18nContextType = {
    locale,
    setLocale,
    t,
    getDisplayName,
    availableLocales: localeConfigs,
  };

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
};

/**
 * Translation hook
 */
export const useTranslation = () => {
  const context = useContext(I18nContext);
  
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  
  return context;
};

/**
 * Simple translation hook without context (for components that can't use context)
 */
export const useSimpleTranslation = (locale?: SupportedLocale) => {
  const currentLocale = locale || getSystemLocale();
  
  const t = useCallback(
    (key: string, params?: Record<string, string | number>, fallback?: string) => {
      const translation = getTranslation(currentLocale, key, fallback);
      return params ? formatTranslation(translation, params) : translation;
    },
    [currentLocale]
  );

  return { t, locale: currentLocale };
};
