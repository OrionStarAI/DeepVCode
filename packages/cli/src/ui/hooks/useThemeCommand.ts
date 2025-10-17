/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import { themeManager } from '../themes/theme-manager.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js'; // Import LoadedSettings, AppSettings, MergedSetting
import { type HistoryItem, MessageType } from '../types.js';
import { t } from '../utils/i18n.js';
import process from 'node:process';

interface UseThemeCommandReturn {
  isThemeDialogOpen: boolean;
  openThemeDialog: () => void;
  handleThemeSelect: (
    themeName: string | undefined,
    scope: SettingScope,
  ) => void; // Added scope
  handleThemeHighlight: (themeName: string | undefined) => void;
}

export const useThemeCommand = (
  loadedSettings: LoadedSettings,
  setThemeError: (error: string | null) => void,
  addItem: (item: Omit<HistoryItem, 'id'>, timestamp: number) => void,
): UseThemeCommandReturn => {
  const [isThemeDialogOpen, setIsThemeDialogOpen] = useState(false);

  // Check for theme configuration on startup
  useEffect(() => {
    const effectiveTheme = loadedSettings.merged.theme;

    console.log('🎨 [ThemeCommand] useEffect triggered, effectiveTheme:', effectiveTheme);

    // 如果没有配置主题，自动打开主题选择对话框
    if (!effectiveTheme) {
      console.log('🎨 [ThemeCommand] No theme configured, opening theme dialog');

      // 检查是否设置了 NO_COLOR 环境变量
      if (process.env.NO_COLOR) {
        console.log('🎨 [ThemeCommand] NO_COLOR set, showing info message');
        addItem(
          {
            type: MessageType.INFO,
            text: t('theme.first.start.no.color'),
          },
          Date.now(),
        );
        return;
      }

      console.log('🎨 [ThemeCommand] Setting isThemeDialogOpen to true');
      setIsThemeDialogOpen(true);
      setThemeError(null); // 清除任何之前的错误
      addItem(
        {
          type: MessageType.INFO,
          text: t('theme.first.start.select.style'),
        },
        Date.now(),
      );
      return;
    }

    // 如果配置了主题但主题不存在，也打开对话框
    if (!themeManager.findThemeByName(effectiveTheme)) {
      console.log('🎨 [ThemeCommand] Theme not found:', effectiveTheme);
      setIsThemeDialogOpen(true);
      setThemeError(`主题 "${effectiveTheme}" 未找到，请重新选择。`);
    } else {
      console.log('🎨 [ThemeCommand] Theme is valid:', effectiveTheme);
      setThemeError(null);
    }
  }, [loadedSettings.merged.theme, setThemeError, addItem]);

  const openThemeDialog = useCallback(() => {
    if (process.env.NO_COLOR) {
      addItem(
        {
          type: MessageType.INFO,
          text: 'Theme configuration unavailable due to NO_COLOR env variable.',
        },
        Date.now(),
      );
      return;
    }
    setIsThemeDialogOpen(true);
  }, [addItem]);

  const applyTheme = useCallback(
    (themeName: string | undefined) => {
      if (!themeManager.setActiveTheme(themeName)) {
        // If theme is not found, open the theme selection dialog and set error message
        setIsThemeDialogOpen(true);
        setThemeError(`Theme "${themeName}" not found.`);
      } else {
        setThemeError(null); // Clear any previous theme error on success
      }
    },
    [setThemeError],
  );

  const handleThemeHighlight = useCallback(
    (themeName: string | undefined) => {
      applyTheme(themeName);
    },
    [applyTheme],
  );

  const handleThemeSelect = useCallback(
    (themeName: string | undefined, scope: SettingScope) => {
      try {
        // Merge user and workspace custom themes (workspace takes precedence)
        const mergedCustomThemes = {
          ...(loadedSettings.user.settings.customThemes || {}),
          ...(loadedSettings.workspace.settings.customThemes || {}),
        };
        // Only allow selecting themes available in the merged custom themes or built-in themes
        const isBuiltIn = themeManager.findThemeByName(themeName);
        const isCustom = themeName && mergedCustomThemes[themeName];
        if (!isBuiltIn && !isCustom) {
          setThemeError(`Theme "${themeName}" not found in selected scope.`);
          setIsThemeDialogOpen(true);
          return;
        }
        loadedSettings.setValue(scope, 'theme', themeName); // Update the merged settings
        if (loadedSettings.merged.customThemes) {
          themeManager.loadCustomThemes(loadedSettings.merged.customThemes);
        }
        applyTheme(loadedSettings.merged.theme); // Apply the current theme
        setThemeError(null);
      } finally {
        // Delay closing the dialog to prevent the Enter key from being processed by InputPrompt
        setImmediate(() => {
          setIsThemeDialogOpen(false); // Close the dialog
        });
      }
    },
    [applyTheme, loadedSettings, setThemeError],
  );

  return {
    isThemeDialogOpen,
    openThemeDialog,
    handleThemeSelect,
    handleThemeHighlight,
  };
};
