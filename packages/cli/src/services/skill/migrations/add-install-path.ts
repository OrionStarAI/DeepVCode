/**
 * Migration: Add installPath and isLocal fields to installed plugins
 *
 * This migration adds the new schema fields introduced in Task 1-2:
 * - installPath: Absolute path to plugin installation directory
 * - isLocal: Boolean indicating local vs Git source
 * - version: Updates '1.0.0' default to 'unknown'
 */

import { SettingsManager } from '../settings-manager.js';
import { MarketplaceManager } from '../marketplace-manager.js';
import { MarketplaceSource } from '../types.js';
import path from 'path';
import { SkillsPaths } from '../settings-manager.js';

export class AddInstallPathMigration {
  constructor(
    private settingsManager: SettingsManager,
    private marketplaceManager: MarketplaceManager,
  ) {}

  async run(): Promise<void> {
    const installed = await this.settingsManager.readInstalledPlugins();
    let updated = false;

    for (const [pluginId, info] of Object.entries(installed.plugins)) {
      // Skip if already has installPath
      if (info.installPath) {
        continue;
      }

      try {
        const [marketplaceId, pluginName] = pluginId.split(':');
        const marketplace = await this.marketplaceManager.getMarketplace(marketplaceId);

        // Determine isLocal
        const isLocal = marketplace.source === MarketplaceSource.LOCAL;

        // Find plugin in marketplace
        const plugin = marketplace.plugins.find((p) => p.name === pluginName);
        if (!plugin) {
          console.warn(`[Migration] Plugin ${pluginId} not found in marketplace`);
          continue;
        }

        // Calculate installPath based on plugin source
        let installPath: string;

        if (typeof plugin.source === 'string') {
          // Local path source
          const basePath = marketplace.path || path.join(SkillsPaths.MARKETPLACE_ROOT, marketplaceId);
          installPath = path.join(basePath, plugin.source);
        } else if (plugin.source && typeof plugin.source === 'object') {
          // Git source - use cache path
          const version = info.version || 'unknown';
          installPath = SkillsPaths.getPluginCachePath(marketplaceId, pluginName, version);
        } else {
          // Fallback: use plugin name
          const basePath = marketplace.path || path.join(SkillsPaths.MARKETPLACE_ROOT, marketplaceId);
          installPath = path.join(basePath, pluginName);
        }

        // Update plugin info
        info.installPath = installPath;
        info.isLocal = isLocal;

        // Update version if it's the old default '1.0.0'
        if (info.version === '1.0.0') {
          info.version = plugin.version || 'unknown';
        }

        updated = true;
        console.log(`[Migration] Updated ${pluginId}: installPath=${installPath}, isLocal=${isLocal}`);
      } catch (error) {
        console.warn(`[Migration] Failed to migrate plugin ${pluginId}:`, error);
      }
    }

    if (updated) {
      await this.settingsManager.writeInstalledPlugins(installed);
      console.log('[Migration] Successfully migrated installed plugins schema');
    } else {
      console.log('[Migration] No plugins needed migration');
    }
  }
}
