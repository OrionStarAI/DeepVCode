/**
 * Language Switcher Component
 */

import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { SupportedLocale } from '../i18n/types';

interface LanguageSwitcherProps {
  style?: React.CSSProperties;
  size?: 'small' | 'medium' | 'large';
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ 
  style = {},
  size = 'small'
}) => {
  const { locale, setLocale, getDisplayName, availableLocales } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const sizeConfig = {
    small: {
      fontSize: '11px',
      padding: '4px 8px',
      minWidth: '80px'
    },
    medium: {
      fontSize: '12px',
      padding: '6px 10px',
      minWidth: '100px'
    },
    large: {
      fontSize: '14px',
      padding: '8px 12px',
      minWidth: '120px'
    }
  };

  const currentConfig = sizeConfig[size];

  const handleLocaleChange = (newLocale: SupportedLocale) => {
    setLocale(newLocale);
    setIsOpen(false);
  };

  const currentLocaleConfig = availableLocales.find(l => l.code === locale);

  return (
    <div style={{
      position: 'relative',
      display: 'inline-block',
      ...style
    }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          ...currentConfig,
          backgroundColor: 'var(--vscode-button-background)',
          color: 'var(--vscode-button-foreground)',
          border: '1px solid var(--vscode-button-border)',
          borderRadius: '4px',
          cursor: 'pointer',
          fontFamily: 'var(--vscode-font-family)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '4px',
          transition: 'all 0.2s ease',
          outline: 'none',
        }}
        title="Switch Language"
        onMouseOver={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--vscode-button-hoverBackground)';
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--vscode-button-background)';
        }}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow = '0 0 0 1px var(--vscode-focusBorder)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <span>
          {currentLocaleConfig?.flag} {currentLocaleConfig?.name}
        </span>
        <span style={{ 
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
          fontSize: '10px'
        }}>
          ▼
        </span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setIsOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 999,
              backgroundColor: 'transparent'
            }}
          />
          
          {/* Dropdown */}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '2px',
              backgroundColor: 'var(--vscode-dropdown-background)',
              border: '1px solid var(--vscode-dropdown-border)',
              borderRadius: '4px',
              zIndex: 1000,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              overflow: 'hidden',
              animation: 'fadeIn 0.15s ease-out'
            }}
          >
            {availableLocales.map((localeOption) => (
              <button
                key={localeOption.code}
                onClick={() => handleLocaleChange(localeOption.code)}
                style={{
                  width: '100%',
                  padding: currentConfig.padding,
                  fontSize: currentConfig.fontSize,
                  backgroundColor: locale === localeOption.code ? 
                    'var(--vscode-list-activeSelectionBackground)' : 
                    'transparent',
                  color: locale === localeOption.code ?
                    'var(--vscode-list-activeSelectionForeground)' :
                    'var(--vscode-dropdown-foreground)',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--vscode-font-family)',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'background-color 0.1s ease',
                  outline: 'none'
                }}
                onMouseOver={(e) => {
                  if (locale !== localeOption.code) {
                    e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
                  }
                }}
                onMouseOut={(e) => {
                  if (locale !== localeOption.code) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span>{localeOption.flag}</span>
                <span>{localeOption.name}</span>
                {locale === localeOption.code && (
                  <span style={{ 
                    marginLeft: 'auto', 
                    fontSize: '10px',
                    opacity: 0.8
                  }}>
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-4px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>
    </div>
  );
};
