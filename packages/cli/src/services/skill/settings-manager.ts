/**
 * DeepV Code Skills System - Settings Manager
 *
 * Manages Skills system configuration:
 * - settings.json (enabledPlugins, marketplaces, security, performance)
 * - installed_plugins.json (installed plugins metadata)
 * - Directory initialization and backup
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  SkillsSettings,
  InstalledPluginsRecord,
  DEFAULT_SKILLS_SETTINGS,
  DEFAULT_INSTALLED_PLUGINS,
  SkillError,
  SkillErrorCode,
  MarketplaceConfig,
  InstalledPluginInfo,
} from './types.js';

/**
 * Skills 系统路径常量
 */
export class SkillsPaths {
  /** 用户主目录 ~/.deepv */
  static readonly DEEPV_HOME = path.join(os.homedir(), '.deepv');

  /** Skills 根目录 ~/.deepv/skills */
  static readonly SKILLS_ROOT = path.join(SkillsPaths.DEEPV_HOME, 'skills');

  /** Marketplace 根目录 ~/.deepv/marketplace */
  static readonly MARKETPLACE_ROOT = path.join(SkillsPaths.DEEPV_HOME, 'marketplace');

  /** Plugin 缓存根目录 ~/.deepv/skills/cache */
  static readonly PLUGIN_CACHE_ROOT = path.join(SkillsPaths.SKILLS_ROOT, 'cache');

  /** 配置文件 ~/.deepv/skills/settings.json */
  static readonly SETTINGS_FILE = path.join(SkillsPaths.SKILLS_ROOT, 'settings.json');

  /** 已安装插件记录 ~/.deepv/skills/installed_plugins.json */
  static readonly INSTALLED_PLUGINS_FILE = path.join(
    SkillsPaths.SKILLS_ROOT,
    'installed_plugins.json',
  );

  /** 备份目录 ~/.deepv/skills/backups */
  static readonly BACKUP_DIR = path.join(SkillsPaths.SKILLS_ROOT, 'backups');

  /**
   * 获取插件的缓存路径
   * @param marketplaceId Marketplace ID
   * @param pluginName 插件名称
   * @param version 版本号
   * @returns 缓存路径 ~/.deepv/skills/cache/{marketplaceId}/{pluginName}/{version}
   */
  static getPluginCachePath(marketplaceId: string, pluginName: string, version: string): string {
    return path.join(this.PLUGIN_CACHE_ROOT, marketplaceId, pluginName, version);
  }
}

/**
 * Settings Manager - 配置管理器
 *
 * 职责:
 * 1. 读写 settings.json 和 installed_plugins.json
 * 2. 管理 enabledPlugins 状态
 * 3. 配置验证和备份
 * 4. 目录结构初始化
 */
export class SettingsManager {
  private settingsCache: SkillsSettings | null = null;
  private installedPluginsCache: InstalledPluginsRecord | null = null;
  private readonly backupRetention = 10; // 保留最近 10 个备份

  constructor() {}

  // ============================================================================
  // 初始化
  // ============================================================================

  /**
   * 初始化 Skills 系统目录结构和配置文件
   */
  async initialize(): Promise<void> {
    try {
      // 创建目录结构
      await this.ensureDirectories();

      // 创建默认配置文件（如果不存在）
      await this.ensureConfigFiles();

      // 验证配置文件
      await this.validateConfigs();
    } catch (error) {
      throw new SkillError(
        `Failed to initialize Skills system: ${error instanceof Error ? error.message : String(error)}`,
        SkillErrorCode.UNKNOWN,
        { originalError: error },
      );
    }
  }

  /**
   * 确保所有必需目录存在
   */
  private async ensureDirectories(): Promise<void> {
    const directories = [
      SkillsPaths.DEEPV_HOME,
      SkillsPaths.SKILLS_ROOT,
      SkillsPaths.MARKETPLACE_ROOT,
      SkillsPaths.PLUGIN_CACHE_ROOT,
      SkillsPaths.BACKUP_DIR,
    ];

    for (const dir of directories) {
      await fs.ensureDir(dir);
    }
  }

  /**
   * 确保配置文件存在（不存在则创建默认配置）
   */
  private async ensureConfigFiles(): Promise<void> {
    // 创建 settings.json
    if (!(await fs.pathExists(SkillsPaths.SETTINGS_FILE))) {
      await this.writeSettings(DEFAULT_SKILLS_SETTINGS);
    }

    // 创建 installed_plugins.json
    if (!(await fs.pathExists(SkillsPaths.INSTALLED_PLUGINS_FILE))) {
      await this.writeInstalledPlugins(DEFAULT_INSTALLED_PLUGINS);
    }
  }

  /**
   * 验证配置文件格式
   */
  private async validateConfigs(): Promise<void> {
    // 验证 settings.json
    const settings = await this.readSettings();
    if (!settings.enabledPlugins || !settings.marketplaces) {
      throw new SkillError(
        'Invalid settings.json format',
        SkillErrorCode.VALIDATION_FAILED,
      );
    }

    // 验证 installed_plugins.json
    const installedPlugins = await this.readInstalledPlugins();
    if (!installedPlugins.plugins) {
      throw new SkillError(
        'Invalid installed_plugins.json format',
        SkillErrorCode.VALIDATION_FAILED,
      );
    }
  }

  // ============================================================================
  // Settings 操作
  // ============================================================================

  /**
   * 读取 settings.json
   */
  async readSettings(): Promise<SkillsSettings> {
    if (this.settingsCache) {
      return this.settingsCache;
    }

    try {
      const content = await fs.readFile(SkillsPaths.SETTINGS_FILE, 'utf-8');
      const settings = JSON.parse(content) as SkillsSettings;
      this.settingsCache = settings;
      return settings;
    } catch (error) {
      throw new SkillError(
        `Failed to read settings.json: ${error instanceof Error ? error.message : String(error)}`,
        SkillErrorCode.FILE_READ_FAILED,
        { path: SkillsPaths.SETTINGS_FILE, originalError: error },
      );
    }
  }

  /**
   * 写入 settings.json（自动备份）
   */
  async writeSettings(settings: SkillsSettings): Promise<void> {
    try {
      // 备份现有配置
      if (await fs.pathExists(SkillsPaths.SETTINGS_FILE)) {
        await this.backupSettings();
      }

      // 更新时间戳
      settings.lastUpdated = new Date().toISOString();

      // 写入文件
      await fs.writeFile(
        SkillsPaths.SETTINGS_FILE,
        JSON.stringify(settings, null, 2),
        'utf-8',
      );

      // 更新缓存
      this.settingsCache = settings;

      // 清理旧备份
      await this.cleanupBackups();
    } catch (error) {
      throw new SkillError(
        `Failed to write settings.json: ${error instanceof Error ? error.message : String(error)}`,
        SkillErrorCode.FILE_WRITE_FAILED,
        { path: SkillsPaths.SETTINGS_FILE, originalError: error },
      );
    }
  }

  /**
   * 更新部分 settings
   */
  async updateSettings(
    updater: (settings: SkillsSettings) => SkillsSettings,
  ): Promise<void> {
    const settings = await this.readSettings();
    const updated = updater(settings);
    await this.writeSettings(updated);
  }

  // ============================================================================
  // EnabledPlugins 管理
  // ============================================================================

  /**
   * 启用 Plugin
   */
  async enablePlugin(pluginId: string): Promise<void> {
    await this.updateSettings((settings) => ({
      ...settings,
      enabledPlugins: {
        ...settings.enabledPlugins,
        [pluginId]: true,
      },
    }));
  }

  /**
   * 禁用 Plugin
   */
  async disablePlugin(pluginId: string): Promise<void> {
    await this.updateSettings((settings) => ({
      ...settings,
      enabledPlugins: {
        ...settings.enabledPlugins,
        [pluginId]: false,
      },
    }));
  }

  /**
   * 检查 Plugin 是否启用
   */
  async isPluginEnabled(pluginId: string): Promise<boolean> {
    const settings = await this.readSettings();
    return settings.enabledPlugins[pluginId] ?? false;
  }

  /**
   * 获取所有启用的 Plugins
   */
  async getEnabledPlugins(): Promise<string[]> {
    const settings = await this.readSettings();
    return Object.entries(settings.enabledPlugins)
      .filter(([, enabled]) => enabled)
      .map(([pluginId]) => pluginId);
  }

  // ============================================================================
  // Marketplace 配置管理
  // ============================================================================

  /**
   * 添加 Marketplace 配置
   */
  async addMarketplace(config: MarketplaceConfig): Promise<void> {
    await this.updateSettings((settings) => {
      // 检查是否已存在
      const exists = settings.marketplaces.some((m) => m.id === config.id);
      if (exists) {
        throw new SkillError(
          `Marketplace ${config.id} already exists`,
          SkillErrorCode.ALREADY_EXISTS,
        );
      }

      return {
        ...settings,
        marketplaces: [...settings.marketplaces, config],
      };
    });
  }

  /**
   * 移除 Marketplace 配置
   */
  async removeMarketplace(marketplaceId: string): Promise<void> {
    await this.updateSettings((settings) => ({
      ...settings,
      marketplaces: settings.marketplaces.filter((m) => m.id !== marketplaceId),
    }));
  }

  /**
   * 更新 Marketplace 配置
   */
  async updateMarketplace(
    marketplaceId: string,
    updater: (config: MarketplaceConfig) => MarketplaceConfig,
  ): Promise<void> {
    await this.updateSettings((settings) => ({
      ...settings,
      marketplaces: settings.marketplaces.map((m) =>
        m.id === marketplaceId ? updater(m) : m,
      ),
    }));
  }

  /**
   * 获取所有 Marketplace 配置
   */
  async getMarketplaces(): Promise<MarketplaceConfig[]> {
    const settings = await this.readSettings();
    return settings.marketplaces;
  }

  // ============================================================================
  // InstalledPlugins 操作
  // ============================================================================

  /**
   * 读取 installed_plugins.json
   */
  async readInstalledPlugins(): Promise<InstalledPluginsRecord> {
    if (this.installedPluginsCache) {
      return this.installedPluginsCache;
    }

    try {
      const content = await fs.readFile(SkillsPaths.INSTALLED_PLUGINS_FILE, 'utf-8');
      const record = JSON.parse(content) as InstalledPluginsRecord;
      this.installedPluginsCache = record;
      return record;
    } catch (error) {
      throw new SkillError(
        `Failed to read installed_plugins.json: ${error instanceof Error ? error.message : String(error)}`,
        SkillErrorCode.FILE_READ_FAILED,
        { path: SkillsPaths.INSTALLED_PLUGINS_FILE, originalError: error },
      );
    }
  }

  /**
   * 写入 installed_plugins.json
   */
  async writeInstalledPlugins(record: InstalledPluginsRecord): Promise<void> {
    try {
      // 更新时间戳
      record.lastUpdated = new Date().toISOString();

      // 写入文件
      await fs.writeFile(
        SkillsPaths.INSTALLED_PLUGINS_FILE,
        JSON.stringify(record, null, 2),
        'utf-8',
      );

      // 更新缓存
      this.installedPluginsCache = record;
    } catch (error) {
      throw new SkillError(
        `Failed to write installed_plugins.json: ${error instanceof Error ? error.message : String(error)}`,
        SkillErrorCode.FILE_WRITE_FAILED,
        { path: SkillsPaths.INSTALLED_PLUGINS_FILE, originalError: error },
      );
    }
  }

  /**
   * 添加已安装 Plugin
   */
  async addInstalledPlugin(pluginInfo: InstalledPluginInfo): Promise<void> {
    const record = await this.readInstalledPlugins();

    // 检查是否已存在
    if (record.plugins[pluginInfo.id]) {
      throw new SkillError(
        `Plugin ${pluginInfo.id} already installed`,
        SkillErrorCode.PLUGIN_ALREADY_INSTALLED,
      );
    }

    record.plugins[pluginInfo.id] = pluginInfo;
    await this.writeInstalledPlugins(record);
  }

  /**
   * 移除已安装 Plugin
   */
  async removeInstalledPlugin(pluginId: string): Promise<void> {
    const record = await this.readInstalledPlugins();
    delete record.plugins[pluginId];
    await this.writeInstalledPlugins(record);
  }

  /**
   * 移除指定 Marketplace 下的所有已安装 Plugins
   */
  async removeInstalledPluginsByMarketplace(marketplaceId: string): Promise<void> {
    if (!marketplaceId?.trim()) {
      throw new SkillError(
        'Marketplace ID cannot be empty',
        SkillErrorCode.INVALID_INPUT,
      );
    }

    // 创建过滤条件：保留不属于该 marketplace 的 plugins
    const isNotFromMarketplace = ([pluginId]: [string, any]) =>
      !pluginId.startsWith(`${marketplaceId}:`);

    // 从 enabledPlugins 中删除相关记录
    await this.updateSettings((settings) => ({
      ...settings,
      enabledPlugins: Object.fromEntries(
        Object.entries(settings.enabledPlugins).filter(isNotFromMarketplace),
      ),
    }));

    // 从 installed_plugins.json 中删除相关记录
    const record = await this.readInstalledPlugins();
    const beforeCount = Object.keys(record.plugins).length;

    const filtered = Object.fromEntries(
      Object.entries(record.plugins).filter(isNotFromMarketplace),
    );
    await this.writeInstalledPlugins({ ...record, plugins: filtered });

    const afterCount = Object.keys(filtered).length;
    const removedCount = beforeCount - afterCount;
    if (removedCount > 0) {
      console.debug(
        `Removed ${removedCount} plugin record(s) from marketplace: ${marketplaceId}`,
      );
    }
  }

  /**
   * 更新已安装 Plugin 信息
   */
  async updateInstalledPlugin(
    pluginId: string,
    updater: (info: InstalledPluginInfo) => InstalledPluginInfo,
  ): Promise<void> {
    const record = await this.readInstalledPlugins();
    const pluginInfo = record.plugins[pluginId];

    if (!pluginInfo) {
      throw new SkillError(
        `Plugin ${pluginId} not found`,
        SkillErrorCode.PLUGIN_NOT_FOUND,
      );
    }

    record.plugins[pluginId] = updater(pluginInfo);
    await this.writeInstalledPlugins(record);
  }

  /**
   * 获取已安装 Plugin 信息
   */
  async getInstalledPlugin(pluginId: string): Promise<InstalledPluginInfo | null> {
    const record = await this.readInstalledPlugins();
    return record.plugins[pluginId] ?? null;
  }

  /**
   * 获取所有已安装 Plugins
   */
  async getInstalledPlugins(): Promise<InstalledPluginInfo[]> {
    const record = await this.readInstalledPlugins();
    return Object.values(record.plugins);
  }

  // ============================================================================
  // 备份管理
  // ============================================================================

  /**
   * 备份 settings.json
   */
  private async backupSettings(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const backupPath = path.join(SkillsPaths.BACKUP_DIR, `settings-${timestamp}.json`);

    await fs.copy(SkillsPaths.SETTINGS_FILE, backupPath);
  }

  /**
   * 清理旧备份（保留最近 N 个）
   */
  private async cleanupBackups(): Promise<void> {
    try {
      const files = await fs.readdir(SkillsPaths.BACKUP_DIR);
      const backupFiles = files
        .filter((f: string) => f.startsWith('settings-') && f.endsWith('.json'))
        .sort()
        .reverse();

      // 删除超过保留数量的备份
      const toDelete = backupFiles.slice(this.backupRetention);
      for (const file of toDelete) {
        await fs.remove(path.join(SkillsPaths.BACKUP_DIR, file));
      }
    } catch (error) {
      // 备份清理失败不影响主流程，仅记录警告
      console.warn(`Failed to cleanup backups: ${error}`);
    }
  }

  // ============================================================================
  // 缓存管理
  // ============================================================================

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.settingsCache = null;
    this.installedPluginsCache = null;
  }

  /**
   * 重新加载配置（清除缓存并重新读取）
   */
  async reload(): Promise<void> {
    this.clearCache();
    await this.readSettings();
    await this.readInstalledPlugins();
  }
}

/**
 * 单例实例
 */
export const settingsManager = new SettingsManager();
