/**
 * PluginInstaller Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { PluginInstaller } from './plugin-installer.js';
import { SettingsManager, SkillsPaths } from './settings-manager.js';
import { MarketplaceManager } from './marketplace-manager.js';

describe('PluginInstaller', () => {
  let installer: PluginInstaller;
  let settingsManager: SettingsManager;
  let marketplaceManager: MarketplaceManager;
  let testRoot: string;
  let testMarketplacePath: string;

  beforeEach(async () => {
    // 创建临时测试目录（使用随机数确保唯一性）
    testRoot = path.join(os.tmpdir(), `deepv-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    testMarketplacePath = path.join(testRoot, 'test-marketplace');

    // Mock SkillsPaths
    vi.spyOn(SkillsPaths, 'DEEPV_HOME', 'get').mockReturnValue(testRoot);
    vi.spyOn(SkillsPaths, 'SKILLS_ROOT', 'get').mockReturnValue(path.join(testRoot, 'skills'));
    vi.spyOn(SkillsPaths, 'MARKETPLACE_ROOT', 'get').mockReturnValue(
      path.join(testRoot, 'marketplace'),
    );
    vi.spyOn(SkillsPaths, 'SETTINGS_FILE', 'get').mockReturnValue(
      path.join(testRoot, 'skills', 'settings.json'),
    );
    vi.spyOn(SkillsPaths, 'INSTALLED_PLUGINS_FILE', 'get').mockReturnValue(
      path.join(testRoot, 'skills', 'installed_plugins.json'),
    );
    vi.spyOn(SkillsPaths, 'BACKUP_DIR', 'get').mockReturnValue(
      path.join(testRoot, 'skills', 'backups'),
    );

    settingsManager = new SettingsManager();
    await settingsManager.initialize();
    settingsManager.clearCache(); // 确保干净状态

    marketplaceManager = new MarketplaceManager(settingsManager);
    installer = new PluginInstaller(settingsManager, marketplaceManager);
  });

  afterEach(async () => {
    // 清理测试目录
    await fs.remove(testRoot);
    vi.restoreAllMocks();
  });

  /**
   * 创建测试用的 Marketplace
   */
  async function createTestMarketplace() {
    await fs.ensureDir(testMarketplacePath);
    await fs.ensureDir(path.join(testMarketplacePath, '.claude-plugin'));
    await fs.ensureDir(path.join(testMarketplacePath, 'test-plugin', 'skill1'));

    const marketplaceJson = {
      name: 'test-marketplace',
      plugins: [
        {
          name: 'test-plugin',
          description: 'Test Plugin',
          source: './',
          strict: false,
          skills: ['./test-plugin/skill1'],
        },
      ],
    };

    await fs.writeFile(
      path.join(testMarketplacePath, '.claude-plugin', 'marketplace.json'),
      JSON.stringify(marketplaceJson, null, 2),
    );

    await fs.writeFile(
      path.join(testMarketplacePath, 'test-plugin', 'skill1', 'SKILL.md'),
      '---\nname: skill1\ndescription: Test Skill\n---\n\n# Content',
    );

    await marketplaceManager.addLocalMarketplace(testMarketplacePath, 'test-mp');
  }

  describe('installPlugin', () => {
    it('should install plugin successfully', async () => {
      await createTestMarketplace();

      const plugin = await installer.installPlugin('test-mp', 'test-plugin');

      expect(plugin.id).toBe('test-mp:test-plugin');
      expect(plugin.installed).toBe(true);
      expect(plugin.enabled).toBe(true);

      // 验证已安装记录
      const installedInfo = await settingsManager.getInstalledPlugin('test-mp:test-plugin');
      expect(installedInfo).not.toBeNull();
      expect(installedInfo?.enabled).toBe(true);
    });

    it('should throw error if plugin not found', async () => {
      await createTestMarketplace();

      await expect(
        installer.installPlugin('test-mp', 'non-existent'),
      ).rejects.toThrow();
    });

    it('should throw error if plugin already installed', async () => {
      await createTestMarketplace();

      await installer.installPlugin('test-mp', 'test-plugin');

      await expect(
        installer.installPlugin('test-mp', 'test-plugin'),
      ).rejects.toThrow('already installed');
    });

    it('should enable plugin by default', async () => {
      await createTestMarketplace();

      await installer.installPlugin('test-mp', 'test-plugin');

      const isEnabled = await installer.isPluginEnabled('test-mp:test-plugin');
      expect(isEnabled).toBe(true);
    });

    it('should save installPath and isLocal for local plugin', async () => {
      await createTestMarketplace();

      await installer.installPlugin('test-mp', 'test-plugin');

      const installed = await settingsManager.getInstalledPlugin('test-mp:test-plugin');
      expect(installed?.installPath).toBeDefined();
      expect(installed?.installPath).toContain('test-mp'); // Marketplace ID in path
      expect(installed?.isLocal).toBe(true); // Local marketplace
    });

    it('should default version to unknown when not specified', async () => {
      await createTestMarketplace();

      await installer.installPlugin('test-mp', 'test-plugin');

      const installed = await settingsManager.getInstalledPlugin('test-mp:test-plugin');
      expect(installed?.version).toBe('unknown'); // Default version when not specified in plugin
    });
  });

  describe('uninstallPlugin', () => {
    it('should uninstall plugin successfully', async () => {
      await createTestMarketplace();
      await installer.installPlugin('test-mp', 'test-plugin');

      await installer.uninstallPlugin('test-mp:test-plugin');

      const installedInfo = await settingsManager.getInstalledPlugin('test-mp:test-plugin');
      expect(installedInfo).toBeNull();

      const isEnabled = await installer.isPluginEnabled('test-mp:test-plugin');
      expect(isEnabled).toBe(false);
    });

    it('should throw error if plugin not installed', async () => {
      await expect(
        installer.uninstallPlugin('test-mp:non-existent'),
      ).rejects.toThrow('not installed');
    });
  });

  describe('enablePlugin', () => {
    it('should enable plugin', async () => {
      await createTestMarketplace();
      await installer.installPlugin('test-mp', 'test-plugin');
      await installer.disablePlugin('test-mp:test-plugin');

      await installer.enablePlugin('test-mp:test-plugin');

      const isEnabled = await installer.isPluginEnabled('test-mp:test-plugin');
      expect(isEnabled).toBe(true);

      const installedInfo = await settingsManager.getInstalledPlugin('test-mp:test-plugin');
      expect(installedInfo?.enabled).toBe(true);
    });

    it('should throw error if plugin not installed', async () => {
      await expect(
        installer.enablePlugin('test-mp:non-existent'),
      ).rejects.toThrow('not installed');
    });
  });

  describe('disablePlugin', () => {
    it('should disable plugin', async () => {
      await createTestMarketplace();
      await installer.installPlugin('test-mp', 'test-plugin');

      await installer.disablePlugin('test-mp:test-plugin');

      const isEnabled = await installer.isPluginEnabled('test-mp:test-plugin');
      expect(isEnabled).toBe(false);

      const installedInfo = await settingsManager.getInstalledPlugin('test-mp:test-plugin');
      expect(installedInfo?.enabled).toBe(false);
    });

    it('should throw error if plugin not installed', async () => {
      await expect(
        installer.disablePlugin('test-mp:non-existent'),
      ).rejects.toThrow('not installed');
    });
  });

  describe('getInstalledPlugins', () => {
    it('should return all installed plugins', async () => {
      await createTestMarketplace();
      await installer.installPlugin('test-mp', 'test-plugin');

      const plugins = await installer.getInstalledPlugins();

      expect(plugins).toHaveLength(1);
      expect(plugins[0].id).toBe('test-mp:test-plugin');
    });

    it('should return empty array if no plugins installed', async () => {
      const plugins = await installer.getInstalledPlugins();
      expect(plugins).toHaveLength(0);
    });
  });

  describe('getEnabledPlugins', () => {
    it('should return only enabled plugins', async () => {
      await createTestMarketplace();
      await installer.installPlugin('test-mp', 'test-plugin');
      await installer.disablePlugin('test-mp:test-plugin');

      const plugins = await installer.getEnabledPlugins();

      expect(plugins).toHaveLength(0);
    });

    it('should include enabled plugins', async () => {
      await createTestMarketplace();
      await installer.installPlugin('test-mp', 'test-plugin');

      const plugins = await installer.getEnabledPlugins();

      expect(plugins).toHaveLength(1);
      expect(plugins[0].enabled).toBe(true);
    });
  });

  describe('isPluginInstalled', () => {
    it('should return true for installed plugin', async () => {
      await createTestMarketplace();
      await installer.installPlugin('test-mp', 'test-plugin');

      const isInstalled = await installer.isPluginInstalled('test-mp:test-plugin');
      expect(isInstalled).toBe(true);
    });

    it('should return false for non-installed plugin', async () => {
      const isInstalled = await installer.isPluginInstalled('test-mp:non-existent');
      expect(isInstalled).toBe(false);
    });
  });

  describe('installPlugins (batch)', () => {
    it('should install multiple plugins', async () => {
      // 创建包含多个 plugins 的 marketplace
      await fs.ensureDir(testMarketplacePath);
      await fs.ensureDir(path.join(testMarketplacePath, '.claude-plugin'));
      await fs.ensureDir(path.join(testMarketplacePath, 'plugin1', 'skill1'));
      await fs.ensureDir(path.join(testMarketplacePath, 'plugin2', 'skill2'));

      const marketplaceJson = {
        name: 'test-marketplace',
        plugins: [
          {
            name: 'plugin1',
            description: 'Plugin 1',
            source: './',
            strict: false,
            skills: ['./plugin1/skill1'],
          },
          {
            name: 'plugin2',
            description: 'Plugin 2',
            source: './',
            strict: false,
            skills: ['./plugin2/skill2'],
          },
        ],
      };

      await fs.writeFile(
        path.join(testMarketplacePath, '.claude-plugin', 'marketplace.json'),
        JSON.stringify(marketplaceJson, null, 2),
      );

      await fs.writeFile(
        path.join(testMarketplacePath, 'plugin1', 'skill1', 'SKILL.md'),
        '---\nname: skill1\ndescription: Skill 1\n---\n',
      );
      await fs.writeFile(
        path.join(testMarketplacePath, 'plugin2', 'skill2', 'SKILL.md'),
        '---\nname: skill2\ndescription: Skill 2\n---\n',
      );

      await marketplaceManager.addLocalMarketplace(testMarketplacePath, 'test-mp');

      const plugins = await installer.installPlugins('test-mp', ['plugin1', 'plugin2']);

      expect(plugins).toHaveLength(2);
      expect(plugins[0].name).toBe('plugin1');
      expect(plugins[1].name).toBe('plugin2');
    });
  });
});
