/**
 * DeepV Code Skills System - Plugin Installer
 *
 * Manages Plugin lifecycle:
 * - Install/Uninstall plugins from marketplaces
 * - Enable/Disable plugins
 * - Plugin structure validation
 * - Update installed_plugins.json
 * - Dependency checking (YAML frontmatter)
 */

import fs from 'fs-extra';
import path from 'path';
import {
  Plugin,
  InstalledPluginInfo,
  PluginError,
  SkillErrorCode,
  ValidationError,
  SkillType,
  PluginSource,
  MarketplaceSource,
} from './types.js';
import { SettingsManager, SkillsPaths } from './settings-manager.js';
import { MarketplaceManager } from './marketplace-manager.js';

/**
 * PluginInstaller - Plugin 生命周期管理器
 *
 * 职责:
 * 1. 安装 Plugin（从 Marketplace 复制到个人目录）
 * 2. 卸载 Plugin（删除个人目录副本）
 * 3. 启用/禁用 Plugin
 * 4. Plugin 结构验证
 * 5. 更新 installed_plugins.json
 */
export class PluginInstaller {
  constructor(
    private settingsManager: SettingsManager,
    private marketplaceManager: MarketplaceManager,
  ) {}

  // ============================================================================
  // 安装 Plugin
  // ============================================================================

  /**
   * 安装 Plugin 到个人目录
   */
  async installPlugin(marketplaceId: string, pluginName: string): Promise<Plugin> {
    try {
      // 获取 Plugin 信息
      const plugins = await this.marketplaceManager.getPlugins(marketplaceId);
      const plugin = plugins.find((p) => p.name === pluginName);

      if (!plugin) {
        const availablePlugins = plugins.map((p) => `${p.name} (id: ${p.id})`).join(', ');
        throw new PluginError(
          `Plugin "${pluginName}" not found in marketplace "${marketplaceId}"\n` +
          `Available plugins: ${availablePlugins || 'none'}`,
          SkillErrorCode.PLUGIN_NOT_FOUND,
        );
      }

      // 检查是否已安装
      const existingPlugin = await this.settingsManager.getInstalledPlugin(plugin.id);
      if (existingPlugin) {
        throw new PluginError(
          `Plugin ${plugin.id} is already installed`,
          SkillErrorCode.PLUGIN_ALREADY_INSTALLED,
        );
      }

      // 验证 Plugin 结构
      await this.validatePlugin(plugin, marketplaceId);

      // 复制 Plugin 到个人目录（如果是 Git Marketplace）
      const marketplace = await this.marketplaceManager.getMarketplace(marketplaceId);
      if (marketplace.source === 'git') {
        await this.copyPluginToPersonalDir(plugin, marketplaceId);
      }

      // 确定插件的本地安装路径
      let installPath: string;

      // 判断是否为远程 Git source（使用缓存路径）
      if (this.isRemoteGitSource(plugin.source)) {
        // 远程插件：使用 cache 路径
        const version = plugin.version || '0.0.0';
        installPath = SkillsPaths.getPluginCachePath(marketplaceId, plugin.name, version);
      } else if (typeof plugin.source === 'string') {
        // 字符串：使用 source 作为相对路径
        const pluginLocalPath = plugin.source;
        installPath = path.join(
          SkillsPaths.MARKETPLACE_ROOT,
          marketplaceId,
          pluginLocalPath
        );
      } else {
        // 兜底：使用插件名
        installPath = path.join(
          SkillsPaths.MARKETPLACE_ROOT,
          marketplaceId,
          plugin.name
        );
      }

      // 判断是否为本地插件
      const isLocal = marketplace.source === MarketplaceSource.LOCAL;

      // 记录已安装 Plugin
      const installedInfo: InstalledPluginInfo = {
        id: plugin.id,
        name: plugin.name,
        description: plugin.description,
        marketplaceId,
        installPath,
        installedAt: new Date().toISOString(),
        enabled: true, // 默认启用
        skillCount: plugin.skillPaths.length,
        version: plugin.version || 'unknown', // 默认 'unknown'
        isLocal, // 本地插件标记
      };
      await this.settingsManager.addInstalledPlugin(installedInfo);

      // 启用 Plugin
      await this.settingsManager.enablePlugin(plugin.id);

      // 更新 Plugin 状态
      plugin.installed = true;
      plugin.enabled = true;
      plugin.installedAt = new Date(installedInfo.installedAt);

      return plugin;
    } catch (error) {
      if (error instanceof PluginError) {
        throw error;
      }
      throw new PluginError(
        `Failed to install plugin: ${error instanceof Error ? error.message : String(error)}`,
        SkillErrorCode.PLUGIN_INSTALL_FAILED,
        { marketplaceId, pluginName, originalError: error },
      );
    }
  }

  /**
   * 批量安装 Plugins
   */
  async installPlugins(
    marketplaceId: string,
    pluginNames: string[],
  ): Promise<Plugin[]> {
    const results: Plugin[] = [];
    const errors: Array<{ pluginName: string; error: Error }> = [];

    for (const pluginName of pluginNames) {
      try {
        const plugin = await this.installPlugin(marketplaceId, pluginName);
        results.push(plugin);
      } catch (error) {
        errors.push({
          pluginName,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    if (errors.length > 0) {
      console.warn('Some plugins failed to install:', errors);
    }

    return results;
  }

  // ============================================================================
  // 卸载 Plugin
  // ============================================================================

  /**
   * 卸载 Plugin
   */
  async uninstallPlugin(pluginId: string, deleteFiles = false): Promise<void> {
    try {
      // 检查是否已安装
      const installedPlugin = await this.settingsManager.getInstalledPlugin(pluginId);
      if (!installedPlugin) {
        throw new PluginError(
          `Plugin ${pluginId} is not installed`,
          SkillErrorCode.PLUGIN_NOT_FOUND,
        );
      }

      // 禁用 Plugin
      await this.settingsManager.disablePlugin(pluginId);

      // 删除已安装记录
      await this.settingsManager.removeInstalledPlugin(pluginId);

      // 删除个人目录副本（如果请求）
      if (deleteFiles) {
        await this.deletePluginFromPersonalDir(pluginId);
      }
    } catch (error) {
      if (error instanceof PluginError) {
        throw error;
      }
      throw new PluginError(
        `Failed to uninstall plugin: ${error instanceof Error ? error.message : String(error)}`,
        SkillErrorCode.UNKNOWN,
        { pluginId, originalError: error },
      );
    }
  }

  // ============================================================================
  // 启用/禁用 Plugin
  // ============================================================================

  /**
   * 启用 Plugin
   */
  async enablePlugin(pluginId: string): Promise<void> {
    try {
      // 检查是否已安装
      const installedPlugin = await this.settingsManager.getInstalledPlugin(pluginId);
      if (!installedPlugin) {
        throw new PluginError(
          `Plugin ${pluginId} is not installed`,
          SkillErrorCode.PLUGIN_NOT_FOUND,
        );
      }

      // 更新配置
      await this.settingsManager.enablePlugin(pluginId);
      await this.settingsManager.updateInstalledPlugin(pluginId, (info) => ({
        ...info,
        enabled: true,
      }));
    } catch (error) {
      if (error instanceof PluginError) {
        throw error;
      }
      throw new PluginError(
        `Failed to enable plugin: ${error instanceof Error ? error.message : String(error)}`,
        SkillErrorCode.UNKNOWN,
        { pluginId, originalError: error },
      );
    }
  }

  /**
   * 禁用 Plugin
   */
  async disablePlugin(pluginId: string): Promise<void> {
    try {
      // 检查是否已安装
      const installedPlugin = await this.settingsManager.getInstalledPlugin(pluginId);
      if (!installedPlugin) {
        throw new PluginError(
          `Plugin ${pluginId} is not installed`,
          SkillErrorCode.PLUGIN_NOT_FOUND,
        );
      }

      // 更新配置
      await this.settingsManager.disablePlugin(pluginId);
      await this.settingsManager.updateInstalledPlugin(pluginId, (info) => ({
        ...info,
        enabled: false,
      }));
    } catch (error) {
      if (error instanceof PluginError) {
        throw error;
      }
      throw new PluginError(
        `Failed to disable plugin: ${error instanceof Error ? error.message : String(error)}`,
        SkillErrorCode.UNKNOWN,
        { pluginId, originalError: error },
      );
    }
  }

  // ============================================================================
  // 查询 Plugin
  // ============================================================================

  /**
   * 获取已安装 Plugin 列表
   */
  async getInstalledPlugins(): Promise<InstalledPluginInfo[]> {
    return this.settingsManager.getInstalledPlugins();
  }

  /**
   * 获取已启用 Plugin 列表
   */
  async getEnabledPlugins(): Promise<InstalledPluginInfo[]> {
    const installed = await this.getInstalledPlugins();
    return installed.filter((p) => p.enabled);
  }

  /**
   * 获取 Plugin 信息
   */
  async getPluginInfo(pluginId: string): Promise<InstalledPluginInfo | null> {
    return this.settingsManager.getInstalledPlugin(pluginId);
  }

  /**
   * 检查 Plugin 是否已安装
   */
  async isPluginInstalled(pluginId: string): Promise<boolean> {
    const plugin = await this.getPluginInfo(pluginId);
    return plugin !== null;
  }

  /**
   * 检查 Plugin 是否已启用
   */
  async isPluginEnabled(pluginId: string): Promise<boolean> {
    return this.settingsManager.isPluginEnabled(pluginId);
  }

  // ============================================================================
  // 私有方法 - Plugin Source 判断
  // ============================================================================

  /**
   * 判断 plugin source 是否为远程 Git 类型（需要缓存）
   * @param source Plugin source
   * @returns true 如果是远程 Git source（需要缓存），false 如果是本地路径（不需要缓存）
   */
  private isRemoteGitSource(source: string | PluginSource): boolean {
    if (typeof source === 'string') {
      // 字符串类型：相对路径不缓存
      return false;
    }

    if (typeof source === 'object' && source !== null) {
      // GitHub、Git、URL 都需要缓存
      return source.source === 'github' || source.source === 'git' || source.source === 'url';
    }

    return false;
  }

  // ============================================================================
  // 私有方法 - Plugin 验证
  // ============================================================================

  /**
   * 验证 Plugin 结构
   */
  private async validatePlugin(plugin: Plugin, marketplaceId: string): Promise<void> {
    // 验证必需字段
    if (!plugin.id || !plugin.name || !plugin.marketplaceId) {
      throw new ValidationError(
        `Invalid plugin: missing required fields\n` +
        `Plugin: ${JSON.stringify(plugin, null, 2)}`,
        {
          plugin,
          marketplaceId,
        },
      );
    }

    // 验证 Skill 路径
    if (!plugin.skillPaths || plugin.skillPaths.length === 0) {
      throw new ValidationError(
        `Invalid plugin: no skills found\n` +
        `Plugin ID: ${plugin.id}\n` +
        `Plugin Name: ${plugin.name}\n` +
        `Marketplace: ${marketplaceId}\n` +
        `Skill Paths: ${JSON.stringify(plugin.skillPaths)}\n` +
        `Items: ${JSON.stringify(plugin.items)}`,
        {
          plugin,
          marketplaceId,
        },
      );
    }

    // 获取 Marketplace 路径
    const marketplace = await this.marketplaceManager.getMarketplace(marketplaceId);
    const marketplacePath =
      marketplace.source === 'git'
        ? path.join(SkillsPaths.MARKETPLACE_ROOT, marketplaceId)
        : marketplace.path!;

    // 验证 Skill 路径是否存在
    // Use new items structure if available
    if (plugin.items && plugin.items.length > 0) {
      for (const item of plugin.items) {
        const fullPath = path.join(marketplacePath, item.path);

        // Check existence based on type
        if (item.type === SkillType.SKILL) {
          // Skills must be directories with SKILL.md
          const skillFile = path.join(fullPath, 'SKILL.md');
          if (!(await fs.pathExists(skillFile))) {
            throw new ValidationError(
              `Skill file not found: ${skillFile}`,
              { skillPath: item.path },
            );
          }
        } else {
          // Commands and Agents can be files or directories
          // If it's a file path (ends in .md), check file existence
          // If it's a directory, check for SKILL.md (legacy support)

          let exists = await fs.pathExists(fullPath);
          if (!exists && fullPath.endsWith('.md')) {
             // It's a missing file
             throw new ValidationError(
              `File not found: ${fullPath}`,
              { path: item.path },
            );
          } else if (exists) {
             const stat = await fs.stat(fullPath);
             if (stat.isDirectory()) {
                const skillFile = path.join(fullPath, 'SKILL.md');
                if (!(await fs.pathExists(skillFile))) {
                   throw new ValidationError(
                    `Skill file not found in directory: ${skillFile}`,
                    { path: item.path },
                  );
                }
             }
             // If it's a file and exists, we are good.
          } else {
             // Path doesn't exist and doesn't end in .md - assume directory missing SKILL.md
             const skillFile = path.join(fullPath, 'SKILL.md');
             throw new ValidationError(
                `Skill file not found: ${skillFile}`,
                { path: item.path },
              );
          }
        }
      }
    } else {
      // Legacy validation
      for (const skillPath of plugin.skillPaths) {
        const fullPath = path.join(marketplacePath, skillPath);
        const skillFile = path.join(fullPath, 'SKILL.md');

        if (!(await fs.pathExists(skillFile))) {
          throw new ValidationError(
            `Skill file not found: ${skillFile}`,
            { skillPath },
          );
        }
      }
    }
  }

  // ============================================================================
  // 私有方法 - 文件操作
  // ============================================================================

  /**
   * 复制 Plugin 到个人目录
   * 注意: 目前 Skills 不支持项目级，仅在个人级 ~/.deepv/skills/ 管理
   * 但为了未来扩展性，保留此方法（当前可选）
   */
  private async copyPluginToPersonalDir(
    plugin: Plugin,
    marketplaceId: string,
  ): Promise<void> {
    try {
      // 个人 Skills 目录
      const personalSkillsDir = SkillsPaths.SKILLS_ROOT;
      await fs.ensureDir(personalSkillsDir);

      // 源路径（Marketplace）
      const marketplacePath = path.join(SkillsPaths.MARKETPLACE_ROOT, marketplaceId);

      // 目标路径（个人目录）
      const targetPluginDir = path.join(
        personalSkillsDir,
        `${marketplaceId}_${plugin.name}`,
      );

      // 注意：由于 Skills 设计为统一在 Marketplace 管理，
      // 这里实际上不需要复制文件，仅记录引用即可
      // 但保留此方法为未来可能的需求（如离线使用）

      // 复制 Skill 目录（可选，当前注释掉）
      // for (const skillPath of plugin.skillPaths) {
      //   const srcPath = path.join(marketplacePath, skillPath);
      //   const destPath = path.join(targetPluginDir, path.basename(skillPath));
      //   await fs.copy(srcPath, destPath);
      // }
    } catch (error) {
      throw new PluginError(
        `Failed to copy plugin to personal directory: ${error instanceof Error ? error.message : String(error)}`,
        SkillErrorCode.FILE_WRITE_FAILED,
        { pluginId: plugin.id, originalError: error },
      );
    }
  }

  /**
   * 从个人目录删除 Plugin
   */
  private async deletePluginFromPersonalDir(pluginId: string): Promise<void> {
    try {
      const [marketplaceId, pluginName] = pluginId.split(':');
      const personalSkillsDir = SkillsPaths.SKILLS_ROOT;
      const targetPluginDir = path.join(
        personalSkillsDir,
        `${marketplaceId}_${pluginName}`,
      );

      if (await fs.pathExists(targetPluginDir)) {
        await fs.remove(targetPluginDir);
      }
    } catch (error) {
      console.warn(`Failed to delete plugin from personal directory: ${error}`);
      // 不抛出错误，仅记录警告
    }
  }
}

/**
 * 单例实例（需要在使用时注入依赖）
 */
export const pluginInstaller = new PluginInstaller(
  {} as SettingsManager,
  {} as MarketplaceManager,
);
