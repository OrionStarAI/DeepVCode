/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { RadioButtonSelect, type RadioSelectItem } from './shared/RadioButtonSelect.js';
import { SettingScope, type LoadedSettings } from '../../config/settings.js';
import { Config, ApprovalMode, getCoreSystemPrompt } from 'deepv-code-core';
import { Colors } from '../colors.js';
import { t } from '../utils/i18n.js';
import { getModelDisplayName } from '../../utils/modelUtils.js';

interface SettingsMenuDialogProps {
  onClose: () => void;
  settings: LoadedSettings;
  config: Config;
  terminalWidth: number;
  availableTerminalHeight?: number;
  // 回调函数用于打开其他对话框
  onOpenTheme: () => void;
  onOpenEditor: () => void;
  onOpenModel: () => void;
}

/**
 * 交互式设置菜单面板
 * 使用键盘上下移动、回车进入子菜单
 */
export const SettingsMenuDialog = React.memo(function SettingsMenuDialog({
  onClose,
  settings,
  config,
  terminalWidth,
  availableTerminalHeight,
  onOpenTheme,
  onOpenEditor,
  onOpenModel,
}: SettingsMenuDialogProps) {

  // Calculate display values
  const themeValue = settings.merged.theme || t('config.value.default');
  const editorValue = settings.merged.preferredEditor || t('config.value.auto');
  const modelValue = settings.merged.preferredModel
    ? getModelDisplayName(settings.merged.preferredModel, config)
    : t('config.value.auto');

  // 主菜单选项
  const menuItems: RadioSelectItem<string>[] = [
    { label: t('config.menu.theme'), value: 'theme', rightText: `(${themeValue})` },
    { label: t('config.menu.editor'), value: 'editor', rightText: `(${editorValue})` },
    { label: t('config.menu.model'), value: 'model', rightText: `(${modelValue})` },
    { label: `${settings.merged.vimMode ? '✅' : '❌'} ${t('config.menu.vim')}`, value: 'vim', rightText: settings.merged.vimMode ? `(${t('config.value.on')})` : `(${t('config.value.off')})` },
    { label: `${config.getAgentStyle() === 'codex' ? '⚡' : '🧠'} ${t('config.menu.agent.style')}`, value: 'agent-style', rightText: config.getAgentStyle() === 'codex' ? `(${t('config.value.codex')})` : `(${t('config.value.default')})` },
    { label: `${config.getApprovalMode() === ApprovalMode.YOLO ? '🚀' : '🛡️'} ${t('config.menu.yolo')}`, value: 'yolo', rightText: config.getApprovalMode() === ApprovalMode.YOLO ? `(${t('config.value.on')})` : `(${t('config.value.off')})` },
    { label: `${config.getHealthyUseEnabled() ? '✅' : '❌'} ${t('config.menu.healthy.use')}`, value: 'healthy-use', rightText: config.getHealthyUseEnabled() ? `(${t('config.value.on')})` : `(${t('config.value.off')})` },
  ];

  // YOLO 模式选项
  const yoloModeItems: RadioSelectItem<string>[] = [
    { label: t('config.option.yolo.enable'), value: 'on' },
    { label: t('config.option.yolo.disable'), value: 'off' },
  ];

  // Agent Style 选项
  const agentStyleItems: RadioSelectItem<string>[] = [
    { label: t('config.option.agent.style.default'), value: 'default' },
    { label: t('config.option.agent.style.codex'), value: 'codex' },
  ];

  // Healthy Use 选项
  const healthyUseItems: RadioSelectItem<string>[] = [
    { label: t('config.option.healthy.use.enable'), value: 'on' },
    { label: t('config.option.healthy.use.disable'), value: 'off' },
  ];

  // 菜单状态
  type MenuView = 'main' | 'yolo' | 'agent-style' | 'healthy-use';
  const [currentView, setCurrentView] = useState<MenuView>('main');
  const [selectedMain, setSelectedMain] = useState<string>('theme');

  // 🆕 当进入子菜单前记录当前选择，返回时恢复
  const handleEnterSubMenu = (subMenu: MenuView, selectedValue: string) => {
    setLastSelectedBeforeSubMenu(selectedValue);
    setCurrentView(subMenu);
  };
  const [lastSelectedBeforeSubMenu, setLastSelectedBeforeSubMenu] = useState<string>('theme');
  const [selectedYolo, setSelectedYolo] = useState<string>(
    config.getApprovalMode() === ApprovalMode.YOLO ? 'on' : 'off'
  );
  const [selectedAgentStyle, setSelectedAgentStyle] = useState<string>(
    config.getAgentStyle() === 'default' ? 'default' : 'codex'
  );
  const [selectedHealthyUse, setSelectedHealthyUse] = useState<string>(
    config.getHealthyUseEnabled() ? 'on' : 'off'
  );

  const [statusMessage, setStatusMessage] = useState<string>('');

  // 处理主菜单选择
  const handleMainMenuSelect = useCallback(
    async (value: string) => {
      // 🆕 更新 selectedMain 状态，这样菜单光标会跟踪到正确位置
      setSelectedMain(value);

      if (value === 'theme') {
        onOpenTheme();
      } else if (value === 'editor') {
        onOpenEditor();
      } else if (value === 'model') {
        onOpenModel();
      } else if (value === 'vim') {
        // Toggle vim mode
        const newValue = !settings.merged.vimMode;
        settings.setValue(SettingScope.User, 'vimMode', newValue);
        setStatusMessage(newValue ? t('config.status.vim.enabled') : t('config.status.vim.disabled'));
        // 重新渲染主菜单
        setTimeout(() => setStatusMessage(''), 1500);
      } else if (value === 'yolo') {
        handleEnterSubMenu('yolo', value);
      } else if (value === 'agent-style') {
        handleEnterSubMenu('agent-style', value);
      } else if (value === 'healthy-use') {
        handleEnterSubMenu('healthy-use', value);
      }
    },
    [settings]
  );

  // 处理 YOLO 模式选择
  const handleYoloSelect = useCallback(
    async (value: string) => {
      setSelectedYolo(value);
      const newMode = value === 'on' ? ApprovalMode.YOLO : ApprovalMode.DEFAULT;
      config.setApprovalModeWithProjectSync(newMode, true);
      setStatusMessage(
        value === 'on'
          ? t('config.status.yolo.enabled')
          : t('config.status.yolo.disabled')
      );
      setTimeout(() => {
        setCurrentView('main');
        setStatusMessage('');
      }, 1000);
    },
    [config]
  );

  // 处理 Agent Style 选择
  const handleAgentStyleSelect = useCallback(
    async (value: string) => {
      setSelectedAgentStyle(value);
      const newStyle = value === 'default' ? 'default' : 'codex';
      config.setAgentStyle(newStyle as any);

      // Codex 模式自动启用 YOLO
      if (newStyle === 'codex') {
        config.setApprovalModeWithProjectSync(ApprovalMode.YOLO, true);
      }

      const { getCoreSystemPrompt } = await import('deepv-code-core');
      const geminiClient = await config.getGeminiClient();
      if (geminiClient) {
        const chat = geminiClient.getChat();
        if (chat) {
          const isVSCode = config.getVsCodePluginMode();
          const userMemory = config.getUserMemory();
          const updatedSystemPrompt = getCoreSystemPrompt(
            userMemory,
            isVSCode,
            undefined,
            newStyle as any
          );
          chat.setSystemInstruction(updatedSystemPrompt);
        }
      }

      const yoloNote = newStyle === 'codex' ? t('config.status.agent.style.yolo.note') : '';
      setStatusMessage(
        newStyle === 'default'
          ? `${t('config.status.agent.style.default')}${yoloNote}`
          : `${t('config.status.agent.style.codex')}${yoloNote}`
      );
      setTimeout(() => {
        setCurrentView('main');
        setStatusMessage('');
      }, 1000);
    },
    [config]
  );

  // 处理 Healthy Use 选择
  const handleHealthyUseSelect = useCallback(
    async (value: string) => {
      setSelectedHealthyUse(value);
      settings.setValue(SettingScope.User, 'healthyUse', value === 'on');
      (config as any).healthyUse = value === 'on';

      setStatusMessage(
        value === 'on'
          ? t('config.status.healthy.use.enabled')
          : t('config.status.healthy.use.disabled')
      );
      setTimeout(() => {
        setCurrentView('main');
        setStatusMessage('');
      }, 1000);
    },
    [settings, config]
  );

  // 处理键盘输入
  useInput((input, key) => {
    // Only handle ESC here, let RadioButtonSelect handle Enter/Return/Arrows
    if (key.escape) {
      if (currentView === 'main') {
        onClose();
      } else {
        // Return to main menu and restore selection
        setSelectedMain(lastSelectedBeforeSubMenu);
        setCurrentView('main');
      }
    }
  });

  const dialogWidth = Math.min(terminalWidth - 4, 60);
  const dialogHeight = availableTerminalHeight || 20;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={Colors.Gray} padding={1} width={dialogWidth}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color={Colors.AccentBlue}>
          {t('config.menu.title')}
        </Text>
      </Box>

      {/* Main Menu */}
      {currentView === 'main' && (
        <Box flexDirection="column" marginBottom={1}>
          <RadioButtonSelect<string>
            items={menuItems}
            onSelect={handleMainMenuSelect}
            isFocused
            initialIndex={menuItems.findIndex(item => item.value === selectedMain)}
          />
        </Box>
      )}

      {/* YOLO Mode Menu */}
      {currentView === 'yolo' && (
        <Box flexDirection="column" marginBottom={1}>
          <Box marginBottom={1}>
            <Text color={Colors.AccentCyan}>
              {t('config.submenu.yolo.title')}
            </Text>
          </Box>
          <RadioButtonSelect<string>
            items={yoloModeItems}
            onSelect={handleYoloSelect}
            isFocused
            initialIndex={yoloModeItems.findIndex(item => item.value === selectedYolo)}
          />
          <Box marginTop={1}>
            <Text color={Colors.Foreground}>
              {t('config.hint.press.esc')}
            </Text>
          </Box>
        </Box>
      )}

      {/* Agent Style Menu */}
      {currentView === 'agent-style' && (
        <Box flexDirection="column" marginBottom={1}>
          <Box marginBottom={1}>
            <Text color={Colors.AccentCyan}>
              {t('config.submenu.agent.style.title')}
            </Text>
          </Box>
          <RadioButtonSelect<string>
            items={agentStyleItems}
            onSelect={handleAgentStyleSelect}
            isFocused
            initialIndex={agentStyleItems.findIndex(item => item.value === selectedAgentStyle)}
          />
          <Box marginTop={1}>
            <Text color={Colors.Foreground}>
              {t('config.hint.press.esc')}
            </Text>
          </Box>
        </Box>
      )}

      {/* Healthy Use Menu */}
      {currentView === 'healthy-use' && (
        <Box flexDirection="column" marginBottom={1}>
          <Box marginBottom={1}>
            <Text color={Colors.AccentCyan}>
              {t('config.submenu.healthy.use.title')}
            </Text>
          </Box>
          <RadioButtonSelect<string>
            items={healthyUseItems}
            onSelect={handleHealthyUseSelect}
            isFocused
            initialIndex={healthyUseItems.findIndex(item => item.value === selectedHealthyUse)}
          />
          <Box marginTop={1}>
            <Text color={Colors.Foreground}>
              {t('config.hint.press.esc')}
            </Text>
          </Box>
        </Box>
      )}

      {/* Status Message */}
      {statusMessage && (
        <Box marginTop={1}>
          <Text color={Colors.AccentGreen}>{statusMessage}</Text>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1} justifyContent="space-between">
        <Text color={Colors.Gray}>
          {currentView === 'main'
            ? t('config.hint.navigate')
            : t('config.hint.back')}
        </Text>
      </Box>
    </Box>
  );
});
