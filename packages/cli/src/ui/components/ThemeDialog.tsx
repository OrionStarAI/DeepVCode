/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { themeManager, DEFAULT_THEME } from '../themes/theme-manager.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { DiffRenderer } from './messages/DiffRenderer.js';
import { colorizeCode } from '../utils/CodeColorizer.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { useSmallWindowOptimization, WindowSizeLevel } from '../hooks/useSmallWindowOptimization.js';

interface ThemeDialogProps {
  /** Callback function when a theme is selected */
  onSelect: (themeName: string | undefined, scope: SettingScope) => void;

  /** Callback function when a theme is highlighted */
  onHighlight: (themeName: string | undefined) => void;
  /** The settings object */
  settings: LoadedSettings;
  availableTerminalHeight?: number;
  terminalWidth: number;
}

export function ThemeDialog({
  onSelect,
  onHighlight,
  settings,
  availableTerminalHeight,
  terminalWidth,
}: ThemeDialogProps): React.JSX.Element {
  const smallWindowConfig = useSmallWindowOptimization();
  
  const [selectedScope, setSelectedScope] = useState<SettingScope>(
    SettingScope.User,
  );

  // Track the currently highlighted theme name
  const [highlightedThemeName, setHighlightedThemeName] = useState<
    string | undefined
  >(settings.merged.theme || DEFAULT_THEME.name);

  // Generate theme items filtered by selected scope
  const customThemes =
    selectedScope === SettingScope.User
      ? settings.user.settings.customThemes || {}
      : settings.merged.customThemes || {};
  const builtInThemes = themeManager
    .getAvailableThemes()
    .filter((theme) => theme.type !== 'custom');
  const customThemeNames = Object.keys(customThemes);
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  // Generate theme items
  const themeItems = [
    ...builtInThemes.map((theme) => ({
      label: theme.name,
      value: theme.name,
      themeNameDisplay: theme.name,
      themeTypeDisplay: capitalize(theme.type),
    })),
    ...customThemeNames.map((name) => ({
      label: name,
      value: name,
      themeNameDisplay: name,
      themeTypeDisplay: 'Custom',
    })),
  ];
  const [selectInputKey, setSelectInputKey] = useState(Date.now());

  // Find the index of the selected theme, but only if it exists in the list
  const selectedThemeName = settings.merged.theme || DEFAULT_THEME.name;
  const initialThemeIndex = themeItems.findIndex(
    (item) => item.value === selectedThemeName,
  );
  // If not found, fall back to the first theme
  const safeInitialThemeIndex = initialThemeIndex >= 0 ? initialThemeIndex : 0;

  const scopeItems = [
    { label: '用户设置', value: SettingScope.User },
    { label: '工作区设置', value: SettingScope.Workspace },
    { label: 'System Settings', value: SettingScope.System },
  ];

  const handleThemeSelect = useCallback(
    (themeName: string) => {
      onSelect(themeName, selectedScope);
    },
    [onSelect, selectedScope],
  );

  const handleThemeHighlight = (themeName: string) => {
    setHighlightedThemeName(themeName);
    onHighlight(themeName);
  };

  const handleScopeHighlight = useCallback((scope: SettingScope) => {
    setSelectedScope(scope);
    setSelectInputKey(Date.now());
  }, []);

  const handleScopeSelect = useCallback(
    (scope: SettingScope) => {
      handleScopeHighlight(scope);
      setFocusedSection('theme'); // Reset focus to theme section
    },
    [handleScopeHighlight],
  );

  const [focusedSection, setFocusedSection] = useState<'theme' | 'scope'>(
    'theme',
  );

  useInput((input, key) => {
    if (key.tab) {
      setFocusedSection((prev) => (prev === 'theme' ? 'scope' : 'theme'));
    }
    if (key.escape) {
      onSelect(undefined, selectedScope);
    }
  });

  const otherScopes = Object.values(SettingScope).filter(
    (scope) => scope !== selectedScope,
  );

  const modifiedInOtherScopes = otherScopes.filter(
    (scope) => settings.forScope(scope).settings.theme !== undefined,
  );

  let otherScopeModifiedMessage = '';
  if (modifiedInOtherScopes.length > 0) {
    const modifiedScopesStr = modifiedInOtherScopes.join(', ');
    otherScopeModifiedMessage =
      settings.forScope(selectedScope).settings.theme !== undefined
        ? `(Also modified in ${modifiedScopesStr})`
        : `(Modified in ${modifiedScopesStr})`;
  }

  // Constants for calculating preview pane layout.
  // These values are based on the JSX structure below.
  const PREVIEW_PANE_WIDTH_PERCENTAGE = 0.55;
  // A safety margin to prevent text from touching the border.
  // This is a complete hack unrelated to the 0.9 used in App.tsx
  const PREVIEW_PANE_WIDTH_SAFETY_MARGIN = 0.9;
  // Combined horizontal padding from the dialog and preview pane.
  const TOTAL_HORIZONTAL_PADDING = 4;
  const colorizeCodeWidth = Math.max(
    Math.floor(
      (terminalWidth - TOTAL_HORIZONTAL_PADDING) *
        PREVIEW_PANE_WIDTH_PERCENTAGE *
        PREVIEW_PANE_WIDTH_SAFETY_MARGIN,
    ),
    1,
  );

  // 根据窗口大小调整显示项数和布局
  const getMaxItemsToShow = () => {
    switch (smallWindowConfig.sizeLevel) {
      case WindowSizeLevel.TINY:
        return 3; // 极小窗口显示3个主题选项
      case WindowSizeLevel.SMALL:
        return 5; // 小窗口显示5个主题选项
      case WindowSizeLevel.NORMAL:
      default:
        return 8; // 正常窗口显示8个主题选项
    }
  };

  const maxItemsToShow = getMaxItemsToShow();
  const DIALOG_PADDING = smallWindowConfig.sizeLevel === WindowSizeLevel.TINY ? 1 : 2;
  const selectThemeHeight = Math.min(themeItems.length, maxItemsToShow) + 1;
  const SCOPE_SELECTION_HEIGHT = 4; // Height for the scope selection section + margin.
  const SPACE_BETWEEN_THEME_SELECTION_AND_APPLY_TO = 1;
  const TAB_TO_SELECT_HEIGHT = 2;
  availableTerminalHeight = availableTerminalHeight ?? Number.MAX_SAFE_INTEGER;
  availableTerminalHeight -= 2; // Top and bottom borders.
  availableTerminalHeight -= TAB_TO_SELECT_HEIGHT;

  let totalLeftHandSideHeight =
    DIALOG_PADDING +
    selectThemeHeight +
    SCOPE_SELECTION_HEIGHT +
    SPACE_BETWEEN_THEME_SELECTION_AND_APPLY_TO;

  let showScopeSelection = true;
  let includePadding = true;
  let showPreview = true;

  // 小窗口下的激进优化策略
  if (smallWindowConfig.sizeLevel === WindowSizeLevel.TINY) {
    // 极小窗口：隐藏预览面板，只显示主题选择
    showPreview = false;
    showScopeSelection = false;
    includePadding = false;
  } else if (smallWindowConfig.sizeLevel === WindowSizeLevel.SMALL) {
    // 小窗口：简化预览，可能隐藏scope选择
    includePadding = false;
  }

  // Remove content from the LHS that can be omitted if it exceeds the available height.
  if (totalLeftHandSideHeight > availableTerminalHeight) {
    includePadding = false;
    totalLeftHandSideHeight -= DIALOG_PADDING;
  }

  if (totalLeftHandSideHeight > availableTerminalHeight) {
    // First, try hiding the scope selection
    totalLeftHandSideHeight -= SCOPE_SELECTION_HEIGHT;
    showScopeSelection = false;
  }

  if (totalLeftHandSideHeight > availableTerminalHeight) {
    // If still too tall, hide preview in small windows
    if (smallWindowConfig.sizeLevel !== WindowSizeLevel.NORMAL) {
      showPreview = false;
    }
  }

  // Don't focus the scope selection if it is hidden due to height constraints.
  const currentFocusedSection = !showScopeSelection ? 'theme' : focusedSection;

  // Vertical space taken by elements other than the two code blocks in the preview pane.
  // Includes "Preview" title, borders, and margin between blocks.
  const PREVIEW_PANE_FIXED_VERTICAL_SPACE = 8;

  // The right column doesn't need to ever be shorter than the left column.
  availableTerminalHeight = Math.max(
    availableTerminalHeight,
    totalLeftHandSideHeight,
  );
  const availableTerminalHeightCodeBlock =
    availableTerminalHeight -
    PREVIEW_PANE_FIXED_VERTICAL_SPACE -
    (includePadding ? 2 : 0) * 2;

  // Subtract margin between code blocks from available height.
  const availableHeightForPanes = Math.max(
    0,
    availableTerminalHeightCodeBlock - 1,
  );

  // The code block is slightly longer than the diff, so give it more space.
  const codeBlockHeight = Math.ceil(availableHeightForPanes * 0.6);
  const diffHeight = Math.floor(availableHeightForPanes * 0.4);
  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      paddingTop={includePadding ? 1 : 0}
      paddingBottom={includePadding ? 1 : 0}
      paddingLeft={1}
      paddingRight={1}
      width="100%"
    >
      <Box flexDirection="row">
        {/* Left Column: Selection */}
        <Box 
          flexDirection="column" 
          width={showPreview ? "45%" : "100%"} 
          paddingRight={showPreview ? 2 : 0}
        >
          <Text bold={currentFocusedSection === 'theme'} wrap="truncate">
            {currentFocusedSection === 'theme' ? '> ' : '  '}Select Theme{' '}
            <Text color={Colors.Gray}>{otherScopeModifiedMessage}</Text>
          </Text>
          <RadioButtonSelect
            key={selectInputKey}
            items={themeItems}
            initialIndex={safeInitialThemeIndex}
            onSelect={handleThemeSelect}
            onHighlight={handleThemeHighlight}
            isFocused={currentFocusedSection === 'theme'}
            maxItemsToShow={maxItemsToShow}
            showScrollArrows={smallWindowConfig.sizeLevel === WindowSizeLevel.NORMAL} // 小窗口下隐藏滚动箭头
            showNumbers={currentFocusedSection === 'theme' && smallWindowConfig.sizeLevel === WindowSizeLevel.NORMAL} // 小窗口下隐藏数字
          />

          {/* Scope Selection */}
          {showScopeSelection && (
            <Box marginTop={1} flexDirection="column">
              <Text bold={currentFocusedSection === 'scope'} wrap="truncate">
                {currentFocusedSection === 'scope' ? '> ' : '  '}应用到
              </Text>
              <RadioButtonSelect
                items={scopeItems}
                initialIndex={0} // Default to User Settings
                onSelect={handleScopeSelect}
                onHighlight={handleScopeHighlight}
                isFocused={currentFocusedSection === 'scope'}
                showNumbers={currentFocusedSection === 'scope'}
              />
            </Box>
          )}
        </Box>

        {/* Right Column: Preview - 只在有足够空间时显示 */}
        {showPreview && (
          <Box flexDirection="column" width="55%" paddingLeft={2}>
            <Text bold>Preview</Text>
            {/* Get the Theme object for the highlighted theme, fall back to default if not found */}
            {(() => {
              const previewTheme =
                themeManager.getTheme(
                  highlightedThemeName || DEFAULT_THEME.name,
                ) || DEFAULT_THEME;
              return (
                <Box
                  borderStyle="single"
                  borderColor={Colors.Gray}
                  paddingTop={includePadding ? 1 : 0}
                  paddingBottom={includePadding ? 1 : 0}
                  paddingLeft={1}
                  paddingRight={1}
                  flexDirection="column"
                >
                  {/* 小窗口下简化预览内容 */}
                  {smallWindowConfig.sizeLevel === WindowSizeLevel.SMALL ? (
                    // 小窗口：只显示简化的代码示例
                    <Box>
                      <Text color={Colors.AccentBlue}>def</Text>
                      <Text> fibonacci(n):</Text>
                      <Text>    a, b = </Text>
                      <Text color={Colors.AccentYellow}>0</Text>
                      <Text>, </Text>
                      <Text color={Colors.AccentYellow}>1</Text>
                    </Box>
                  ) : (
                    // 正常窗口：显示完整预览
                    <>
                      {colorizeCode(
                        `# function
def fibonacci(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a`,
                        'python',
                        codeBlockHeight,
                        colorizeCodeWidth,
                      )}
                      <Box marginTop={1} />
                      <DiffRenderer
                        diffContent={`--- a/util.py
+++ b/util.py
@@ -1,2 +1,2 @@
- print("Hello, " + name)
+ print(f"Hello, {name}!")
`}
                        availableTerminalHeight={diffHeight}
                        terminalWidth={colorizeCodeWidth}
                        theme={previewTheme}
                      />
                    </>
                  )}
                </Box>
              );
            })()}
          </Box>
        )}
      </Box>
      <Box marginTop={smallWindowConfig.sizeLevel === WindowSizeLevel.TINY ? 0 : 1}>
        <Text color={Colors.Gray} wrap="truncate">
          {smallWindowConfig.sizeLevel === WindowSizeLevel.TINY 
            ? '(回车选择，ESC退出)'
            : `(按回车键选择${showScopeSelection ? '，按Tab键切换焦点' : ''})`
          }
        </Text>
      </Box>
    </Box>
  );
}
