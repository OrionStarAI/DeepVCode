/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { t } from '../utils/i18n.js';
import {
  SettingsManager,
  MarketplaceManager,
  PluginInstaller,
} from '../../services/skill/index.js';
import { clearSkillsContextCache } from '../../services/skill/skills-integration.js';

interface PluginOption {
  name: string;
  marketplaceId: string;
  marketplaceName: string;
  description: string;
}

interface PluginInstallDialogProps {
  /** Callback function when a plugin is installed or dialog is closed */
  onClose: (installed: boolean, message?: string) => void;
  /** Terminal width */
  terminalWidth: number;
  /** Available terminal height */
  availableTerminalHeight?: number;
}

export function PluginInstallDialog({
  onClose,
  terminalWidth,
  availableTerminalHeight,
}: PluginInstallDialogProps): React.JSX.Element {
  const [plugins, setPlugins] = useState<PluginOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [highlightedPlugin, setHighlightedPlugin] = useState<string | undefined>();

  // Load available plugins on mount
  useEffect(() => {
    const loadPlugins = async () => {
      try {
        setLoading(true);
        setError(null);

        const settingsManager = new SettingsManager();
        await settingsManager.initialize();
        const marketplaceManager = new MarketplaceManager(settingsManager);
        const installer = new PluginInstaller(settingsManager, marketplaceManager);

        const allMarketplaces = await marketplaceManager.listMarketplaces();

        if (allMarketplaces.length === 0) {
          setError(t('skill.marketplace.list.empty'));
          return;
        }

        // Get installed plugin IDs
        const installedPlugins = await installer.getInstalledPlugins();
        const installedIds = new Set(installedPlugins.map(p => `${p.marketplaceId}:${p.name}`));

        // Collect all available (not installed) plugins
        const availablePlugins: PluginOption[] = [];
        for (const mp of allMarketplaces) {
          try {
            const mpPlugins = await marketplaceManager.getPlugins(mp.id);
            for (const plugin of mpPlugins) {
              const pluginId = `${mp.id}:${plugin.name}`;
              if (!installedIds.has(pluginId)) {
                availablePlugins.push({
                  name: plugin.name,
                  marketplaceId: mp.id,
                  marketplaceName: mp.name,
                  description: plugin.description || '',
                });
              }
            }
          } catch {
            // Ignore errors for individual marketplaces
          }
        }

        if (availablePlugins.length === 0) {
          setError(t('skill.plugin.install.no.available'));
          return;
        }

        setPlugins(availablePlugins);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    loadPlugins();
  }, []);

  const handleSelect = useCallback(async (value: string | undefined) => {
    if (!value) {
      onClose(false);
      return;
    }

    // Find the selected plugin
    const selected = plugins.find(p => `${p.marketplaceId}:${p.name}` === value);
    if (!selected) {
      onClose(false);
      return;
    }

    try {
      setInstalling(true);

      const settingsManager = new SettingsManager();
      await settingsManager.initialize();
      const marketplaceManager = new MarketplaceManager(settingsManager);
      const installer = new PluginInstaller(settingsManager, marketplaceManager);

      const plugin = await installer.installPlugin(selected.marketplaceId, selected.name);

      // Clear skills context cache
      clearSkillsContextCache();

      const successMessage = `✅ ${t('skill.plugin.install.success')
        .replace('{name}', plugin.name)
        .replace('{id}', plugin.id)
        .replace('{count}', String(plugin.skillPaths.length))}`;

      onClose(true, successMessage);
    } catch (err) {
      const errorMessage = `❌ ${t('skill.plugin.install.failed').replace('{error}', err instanceof Error ? err.message : String(err))}`;
      onClose(false, errorMessage);
    }
  }, [plugins, onClose]);

  const handleHighlight = useCallback((value: string | undefined) => {
    setHighlightedPlugin(value);
  }, []);

  // Calculate available height for the list
  const maxVisibleItems = Math.max(5, (availableTerminalHeight || 20) - 6);

  if (loading) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={Colors.AccentCyan}
        paddingX={1}
        width={Math.min(terminalWidth - 4, 80)}
      >
        <Box justifyContent="center" marginBottom={1}>
          <Text bold color={Colors.AccentCyan}>
            {t('skill.plugin.install.description')}
          </Text>
        </Box>
        <Text color={Colors.Gray}>Loading available plugins...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={Colors.AccentRed}
        paddingX={1}
        width={Math.min(terminalWidth - 4, 80)}
      >
        <Box justifyContent="center" marginBottom={1}>
          <Text bold color={Colors.AccentRed}>
            {t('skill.plugin.install.description')}
          </Text>
        </Box>
        <Text color={Colors.AccentRed}>{error}</Text>
        <Text color={Colors.Gray} dimColor>
          Press Escape to close
        </Text>
      </Box>
    );
  }

  if (installing) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={Colors.AccentCyan}
        paddingX={1}
        width={Math.min(terminalWidth - 4, 80)}
      >
        <Box justifyContent="center" marginBottom={1}>
          <Text bold color={Colors.AccentCyan}>
            {t('skill.plugin.install.description')}
          </Text>
        </Box>
        <Text color={Colors.Gray}>Installing plugin...</Text>
      </Box>
    );
  }

  // Build items for RadioButtonSelect
  const items = plugins.map(p => ({
    label: `${p.name} (${p.marketplaceName})`,
    value: `${p.marketplaceId}:${p.name}`,
    description: p.description,
  }));

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={Colors.AccentCyan}
      paddingX={1}
      width={Math.min(terminalWidth - 4, 80)}
    >
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color={Colors.AccentCyan}>
          {t('skill.plugin.install.select.plugin')}
        </Text>
      </Box>

      <RadioButtonSelect
        items={items}
        onSelect={handleSelect}
        onHighlight={handleHighlight}
      />

      <Box marginTop={1}>
        <Text color={Colors.Gray} dimColor>
          ↑↓ Navigate • Enter Select • Escape Cancel
        </Text>
      </Box>
    </Box>
  );
}
