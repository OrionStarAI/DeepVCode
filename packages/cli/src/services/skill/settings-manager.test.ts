/**
 * SettingsManager Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { SettingsManager, SkillsPaths } from './settings-manager.js';
import {
  MarketplaceConfig,
  MarketplaceSource,
  InstalledPluginInfo,
  SkillErrorCode,
} from './types.js';

describe('SettingsManager', () => {
  let manager: SettingsManager;
  let testRoot: string;

  beforeEach(async () => {
    // 创建临时测试目录
    testRoot = path.join(os.tmpdir(), `deepv-test-${Date.now()}`);

    // Mock SkillsPaths 使用测试目录
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

    manager = new SettingsManager();
  });

  afterEach(async () => {
    // 清理测试目录
    await fs.remove(testRoot);
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should create directory structure', async () => {
      await manager.initialize();

      expect(await fs.pathExists(SkillsPaths.DEEPV_HOME)).toBe(true);
      expect(await fs.pathExists(SkillsPaths.SKILLS_ROOT)).toBe(true);
      expect(await fs.pathExists(SkillsPaths.MARKETPLACE_ROOT)).toBe(true);
      expect(await fs.pathExists(SkillsPaths.BACKUP_DIR)).toBe(true);
    });

    it('should create default config files', async () => {
      await manager.initialize();

      expect(await fs.pathExists(SkillsPaths.SETTINGS_FILE)).toBe(true);
      expect(await fs.pathExists(SkillsPaths.INSTALLED_PLUGINS_FILE)).toBe(true);
    });

    it('should not overwrite existing config files', async () => {
      await manager.initialize();

      const originalSettings = await manager.readSettings();
      originalSettings.enabledPlugins = { 'test:plugin': true };
      await manager.writeSettings(originalSettings);

      // 重新初始化不应覆盖
      const newManager = new SettingsManager();
      await newManager.initialize();

      const settings = await newManager.readSettings();
      expect(settings.enabledPlugins['test:plugin']).toBe(true);
    });
  });

  describe('settings operations', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should read and write settings', async () => {
      const settings = await manager.readSettings();
      settings.enabledPlugins = { 'test:plugin': true };
      await manager.writeSettings(settings);

      const loaded = await manager.readSettings();
      expect(loaded.enabledPlugins['test:plugin']).toBe(true);
    });

    it('should update settings with updater function', async () => {
      await manager.updateSettings((settings) => ({
        ...settings,
        enabledPlugins: { 'test:plugin': true },
      }));

      const settings = await manager.readSettings();
      expect(settings.enabledPlugins['test:plugin']).toBe(true);
    });

    it('should backup settings before writing', async () => {
      const settings = await manager.readSettings();
      await manager.writeSettings(settings);

      // 第二次写入应该创建备份
      await manager.writeSettings(settings);

      const backups = await fs.readdir(SkillsPaths.BACKUP_DIR);
      expect(backups.length).toBeGreaterThan(0);
    });
  });

  describe('enabledPlugins management', () => {
    beforeEach(async () => {
      await manager.initialize();
      manager.clearCache(); // 清除缓存确保干净状态
    });

    it('should enable plugin', async () => {
      await manager.enablePlugin('test:plugin');

      expect(await manager.isPluginEnabled('test:plugin')).toBe(true);
    });

    it('should disable plugin', async () => {
      await manager.enablePlugin('test:plugin');
      await manager.disablePlugin('test:plugin');

      expect(await manager.isPluginEnabled('test:plugin')).toBe(false);
    });

    it('should get all enabled plugins', async () => {
      await manager.enablePlugin('test:plugin1');
      await manager.enablePlugin('test:plugin2');
      await manager.disablePlugin('test:plugin1');

      const enabled = await manager.getEnabledPlugins();
      expect(enabled).toContain('test:plugin2');
      expect(enabled).not.toContain('test:plugin1');
    });
  });

  describe('marketplace configuration', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    const mockMarketplace: MarketplaceConfig = {
      id: 'test-marketplace',
      name: 'Test Marketplace',
      source: MarketplaceSource.GIT,
      location: 'https://github.com/test/repo.git',
      enabled: true,
      addedAt: new Date().toISOString(),
    };

    it('should add marketplace', async () => {
      await manager.addMarketplace(mockMarketplace);

      const marketplaces = await manager.getMarketplaces();
      expect(marketplaces).toHaveLength(1);
      expect(marketplaces[0].id).toBe('test-marketplace');
    });

    it('should throw error when adding duplicate marketplace', async () => {
      await manager.addMarketplace(mockMarketplace);

      await expect(manager.addMarketplace(mockMarketplace)).rejects.toThrow();
    });

    it('should remove marketplace', async () => {
      await manager.addMarketplace(mockMarketplace);
      await manager.removeMarketplace('test-marketplace');

      const marketplaces = await manager.getMarketplaces();
      expect(marketplaces).toHaveLength(0);
    });

    it('should update marketplace', async () => {
      await manager.addMarketplace(mockMarketplace);
      await manager.updateMarketplace('test-marketplace', (config) => ({
        ...config,
        enabled: false,
      }));

      const marketplaces = await manager.getMarketplaces();
      expect(marketplaces[0].enabled).toBe(false);
    });
  });

  describe('installed plugins', () => {
    let mockPlugin: InstalledPluginInfo;

    beforeEach(async () => {
      await manager.initialize();
      manager.clearCache(); // 清除缓存确保干净状态

      // 每次测试创建新的 mock plugin
      mockPlugin = {
        id: `test:plugin-${Date.now()}`,
        name: 'Test Plugin',
        marketplaceId: 'test-marketplace',
        installedAt: new Date().toISOString(),
        enabled: true,
        skillCount: 5,
      };
    });

    it('should add installed plugin', async () => {
      await manager.addInstalledPlugin(mockPlugin);

      const plugin = await manager.getInstalledPlugin(mockPlugin.id);
      expect(plugin?.name).toBe('Test Plugin');
    });

    it('should throw error when adding duplicate plugin', async () => {
      await manager.addInstalledPlugin(mockPlugin);

      await expect(manager.addInstalledPlugin(mockPlugin)).rejects.toThrow();
    });

    it('should remove installed plugin', async () => {
      await manager.addInstalledPlugin(mockPlugin);
      await manager.removeInstalledPlugin(mockPlugin.id);

      const plugin = await manager.getInstalledPlugin(mockPlugin.id);
      expect(plugin).toBeNull();
    });

    it('should update installed plugin', async () => {
      await manager.addInstalledPlugin(mockPlugin);
      await manager.updateInstalledPlugin(mockPlugin.id, (info) => ({
        ...info,
        enabled: false,
      }));

      const plugin = await manager.getInstalledPlugin(mockPlugin.id);
      expect(plugin?.enabled).toBe(false);
    });

    it('should get all installed plugins', async () => {
      const plugin1 = { ...mockPlugin, id: `test:plugin1-${Date.now()}` };
      const plugin2 = { ...mockPlugin, id: `test:plugin2-${Date.now()}`, name: 'Test Plugin 2' };

      await manager.addInstalledPlugin(plugin1);
      await manager.addInstalledPlugin(plugin2);

      const plugins = await manager.getInstalledPlugins();
      expect(plugins.length).toBeGreaterThanOrEqual(2);
      expect(plugins.some(p => p.id === plugin1.id)).toBe(true);
      expect(plugins.some(p => p.id === plugin2.id)).toBe(true);
    });
  });

  describe('cache management', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should cache settings', async () => {
      const settings1 = await manager.readSettings();
      const settings2 = await manager.readSettings();

      expect(settings1).toBe(settings2); // 同一对象引用
    });

    it('should clear cache', async () => {
      await manager.readSettings();
      manager.clearCache();

      const settings1 = await manager.readSettings();
      const settings2 = await manager.readSettings();

      expect(settings1).toBe(settings2); // 重新缓存
    });

    it('should reload configurations', async () => {
      await manager.enablePlugin('test:plugin');

      // 手动修改文件
      const settings = await manager.readSettings();
      settings.enabledPlugins = { 'manual:plugin': true };
      await fs.writeFile(
        SkillsPaths.SETTINGS_FILE,
        JSON.stringify(settings, null, 2),
      );

      // 重新加载
      await manager.reload();

      const loaded = await manager.readSettings();
      expect(loaded.enabledPlugins['manual:plugin']).toBe(true);
    });
  });

  describe('InstalledPluginInfo schema', () => {
    it('should include installPath and isLocal fields', async () => {
      const manager = new SettingsManager();
      await manager.initialize();

      const pluginInfo: InstalledPluginInfo = {
        id: 'test:plugin',
        name: 'plugin',
        marketplaceId: 'test',
        installedAt: new Date().toISOString(),
        enabled: true,
        skillCount: 1,
        version: 'unknown',
        installPath: '/test/path',
        isLocal: false,
      };

      expect(pluginInfo.installPath).toBeDefined();
      expect(pluginInfo.isLocal).toBeDefined();
      expect(pluginInfo.version).toBe('unknown');
    });
  });
});
