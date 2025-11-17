/**
 * DeepV Code Skills System - Marketplace Manager
 *
 * Manages Marketplace lifecycle:
 * - Git clone and update
 * - Discover marketplace structure (scan directories, parse marketplace.json)
 * - CRUD operations (add/remove/update/list)
 * - Plugin discovery within marketplaces
 */

import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  Marketplace,
  MarketplaceSource,
  MarketplaceConfig,
  Plugin,
  MarketplaceError,
  SkillErrorCode,
  MarketplaceScanResult,
  ValidationError,
} from './types.js';
import { SettingsManager, SkillsPaths } from './settings-manager.js';

const execAsync = promisify(exec);

/**
 * Marketplace 配置文件路径
 */
const MARKETPLACE_CONFIG_FILE = '.claude-plugin/marketplace.json';

/**
 * Marketplace JSON 格式
 */
interface MarketplaceJson {
  name: string;
  owner?: {
    name: string;
    email?: string;
  };
  metadata?: {
    description?: string;
    version?: string;
  };
  plugins: Array<{
    name: string;
    description: string;
    source: string;
    strict: boolean;
    skills: string[];
  }>;
}

/**
 * MarketplaceManager - Marketplace 管理器
 *
 * 职责:
 * 1. Git 仓库克隆和更新
 * 2. 发现 Marketplace 结构（扫描目录、解析 marketplace.json）
 * 3. CRUD 操作（添加/删除/更新/列出 Marketplace）
 * 4. Plugin 发现
 */
export class MarketplaceManager {
  constructor(private settingsManager: SettingsManager) {}

  // ============================================================================
  // 添加 Marketplace
  // ============================================================================

  /**
   * 添加 Git Marketplace
   */
  async addGitMarketplace(url: string, name?: string): Promise<Marketplace> {
    try {
      // 生成 Marketplace ID
      const marketplaceId = name || this.extractRepoName(url);
      const marketplacePath = path.join(SkillsPaths.MARKETPLACE_ROOT, marketplaceId);

      // 检查是否已存在
      if (await fs.pathExists(marketplacePath)) {
        throw new MarketplaceError(
          `Marketplace ${marketplaceId} already exists`,
          SkillErrorCode.ALREADY_EXISTS,
          { path: marketplacePath },
        );
      }

      // 克隆仓库
      await this.cloneRepository(url, marketplacePath);

      // 扫描 Marketplace 结构
      const marketplace = await this.scanMarketplace(marketplaceId, marketplacePath, {
        source: MarketplaceSource.GIT,
        url,
      });

      // 保存配置
      const config: MarketplaceConfig = {
        id: marketplaceId,
        name: marketplace.name,
        source: MarketplaceSource.GIT,
        location: url,
        enabled: true,
        addedAt: new Date().toISOString(),
      };
      await this.settingsManager.addMarketplace(config);

      return marketplace;
    } catch (error) {
      throw new MarketplaceError(
        `Failed to add Git marketplace: ${error instanceof Error ? error.message : String(error)}`,
        SkillErrorCode.MARKETPLACE_CLONE_FAILED,
        { url, originalError: error },
      );
    }
  }

  /**
   * 添加本地 Marketplace
   */
  async addLocalMarketplace(localPath: string, name?: string): Promise<Marketplace> {
    try {
      // 检查路径是否存在
      if (!(await fs.pathExists(localPath))) {
        throw new MarketplaceError(
          `Local path does not exist: ${localPath}`,
          SkillErrorCode.DIRECTORY_NOT_FOUND,
          { path: localPath },
        );
      }

      // 生成 Marketplace ID
      const marketplaceId = name || path.basename(localPath);

      // 扫描 Marketplace 结构
      const marketplace = await this.scanMarketplace(marketplaceId, localPath, {
        source: MarketplaceSource.LOCAL,
        path: localPath,
      });

      // 保存配置
      const config: MarketplaceConfig = {
        id: marketplaceId,
        name: marketplace.name,
        source: MarketplaceSource.LOCAL,
        location: localPath,
        enabled: true,
        addedAt: new Date().toISOString(),
      };
      await this.settingsManager.addMarketplace(config);

      return marketplace;
    } catch (error) {
      throw new MarketplaceError(
        `Failed to add local marketplace: ${error instanceof Error ? error.message : String(error)}`,
        SkillErrorCode.MARKETPLACE_PARSE_FAILED,
        { path: localPath, originalError: error },
      );
    }
  }

  // ============================================================================
  // 移除 Marketplace
  // ============================================================================

  /**
   * 移除 Marketplace（删除配置和文件）
   */
  async removeMarketplace(marketplaceId: string, deleteFiles = false): Promise<void> {
    try {
      // 获取 Marketplace 配置
      const marketplaces = await this.settingsManager.getMarketplaces();
      const config = marketplaces.find((m) => m.id === marketplaceId);

      if (!config) {
        throw new MarketplaceError(
          `Marketplace ${marketplaceId} not found`,
          SkillErrorCode.MARKETPLACE_NOT_FOUND,
        );
      }

      // 删除配置
      await this.settingsManager.removeMarketplace(marketplaceId);

      // 删除文件（仅对 Git Marketplace）
      if (deleteFiles && config.source === MarketplaceSource.GIT) {
        const marketplacePath = path.join(SkillsPaths.MARKETPLACE_ROOT, marketplaceId);
        await fs.remove(marketplacePath);
      }
    } catch (error) {
      throw new MarketplaceError(
        `Failed to remove marketplace: ${error instanceof Error ? error.message : String(error)}`,
        SkillErrorCode.UNKNOWN,
        { marketplaceId, originalError: error },
      );
    }
  }

  // ============================================================================
  // 更新 Marketplace
  // ============================================================================

  /**
   * 更新 Git Marketplace（git pull）
   */
  async updateMarketplace(marketplaceId: string): Promise<Marketplace> {
    try {
      // 获取 Marketplace 配置
      const marketplaces = await this.settingsManager.getMarketplaces();
      const config = marketplaces.find((m) => m.id === marketplaceId);

      if (!config) {
        throw new MarketplaceError(
          `Marketplace ${marketplaceId} not found`,
          SkillErrorCode.MARKETPLACE_NOT_FOUND,
        );
      }

      if (config.source !== MarketplaceSource.GIT) {
        throw new MarketplaceError(
          `Cannot update local marketplace: ${marketplaceId}`,
          SkillErrorCode.INVALID_INPUT,
        );
      }

      const marketplacePath = path.join(SkillsPaths.MARKETPLACE_ROOT, marketplaceId);

      // Git pull
      await this.pullRepository(marketplacePath);

      // 重新扫描
      const marketplace = await this.scanMarketplace(marketplaceId, marketplacePath, {
        source: MarketplaceSource.GIT,
        url: config.location,
      });

      return marketplace;
    } catch (error) {
      throw new MarketplaceError(
        `Failed to update marketplace: ${error instanceof Error ? error.message : String(error)}`,
        SkillErrorCode.MARKETPLACE_UPDATE_FAILED,
        { marketplaceId, originalError: error },
      );
    }
  }

  // ============================================================================
  // 查询 Marketplace
  // ============================================================================

  /**
   * 列出所有 Marketplaces
   */
  async listMarketplaces(): Promise<Marketplace[]> {
    const configs = await this.settingsManager.getMarketplaces();
    const marketplaces: Marketplace[] = [];

    for (const config of configs) {
      try {
        const marketplace = await this.getMarketplace(config.id);
        marketplaces.push(marketplace);
      } catch (error) {
        console.warn(`Failed to load marketplace ${config.id}:`, error);
      }
    }

    return marketplaces;
  }

  /**
   * 获取单个 Marketplace
   */
  async getMarketplace(marketplaceId: string): Promise<Marketplace> {
    const configs = await this.settingsManager.getMarketplaces();
    const config = configs.find((m) => m.id === marketplaceId);

    if (!config) {
      throw new MarketplaceError(
        `Marketplace ${marketplaceId} not found`,
        SkillErrorCode.MARKETPLACE_NOT_FOUND,
      );
    }

    const marketplacePath =
      config.source === MarketplaceSource.GIT
        ? path.join(SkillsPaths.MARKETPLACE_ROOT, marketplaceId)
        : config.location;

    return this.scanMarketplace(marketplaceId, marketplacePath, {
      source: config.source,
      url: config.source === MarketplaceSource.GIT ? config.location : undefined,
      path: config.source === MarketplaceSource.LOCAL ? config.location : undefined,
    });
  }

  /**
   * 获取 Marketplace 中的所有 Plugins
   */
  async getPlugins(marketplaceId: string): Promise<Plugin[]> {
    const marketplace = await this.getMarketplace(marketplaceId);
    return marketplace.plugins;
  }

  // ============================================================================
  // Git 操作
  // ============================================================================

  /**
   * 克隆 Git 仓库
   */
  private async cloneRepository(url: string, targetPath: string): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(targetPath));
      const { stdout, stderr } = await execAsync(`git clone "${url}" "${targetPath}"`, {
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      if (stderr && stderr.includes('fatal')) {
        throw new Error(stderr);
      }
    } catch (error) {
      throw new MarketplaceError(
        `Git clone failed: ${error instanceof Error ? error.message : String(error)}`,
        SkillErrorCode.MARKETPLACE_CLONE_FAILED,
        { url, targetPath, originalError: error },
      );
    }
  }

  /**
   * 拉取 Git 仓库更新
   */
  private async pullRepository(repoPath: string): Promise<void> {
    try {
      const { stdout, stderr } = await execAsync('git pull', {
        cwd: repoPath,
        maxBuffer: 10 * 1024 * 1024,
      });

      if (stderr && stderr.includes('fatal')) {
        throw new Error(stderr);
      }
    } catch (error) {
      throw new MarketplaceError(
        `Git pull failed: ${error instanceof Error ? error.message : String(error)}`,
        SkillErrorCode.MARKETPLACE_UPDATE_FAILED,
        { repoPath, originalError: error },
      );
    }
  }

  /**
   * 从 Git URL 提取仓库名称
   */
  private extractRepoName(url: string): string {
    const match = url.match(/\/([^/]+?)(\.git)?$/);
    if (!match) {
      throw new ValidationError(`Invalid Git URL: ${url}`);
    }
    return match[1];
  }

  // ============================================================================
  // Marketplace 扫描
  // ============================================================================

  /**
   * 扫描 Marketplace 结构
   */
  private async scanMarketplace(
    marketplaceId: string,
    marketplacePath: string,
    options: { source: MarketplaceSource; url?: string; path?: string },
  ): Promise<Marketplace> {
    const startTime = Date.now();

    try {
      // 读取 marketplace.json
      const configPath = path.join(marketplacePath, MARKETPLACE_CONFIG_FILE);
      const marketplaceJson = await this.readMarketplaceJson(configPath);

      // 解析 Plugins
      const plugins: Plugin[] = [];
      for (const pluginDef of marketplaceJson.plugins) {
        try {
          const plugin = await this.parsePlugin(
            marketplaceId,
            marketplacePath,
            pluginDef,
          );
          plugins.push(plugin);
        } catch (error) {
          console.warn(`Failed to parse plugin ${pluginDef.name}:`, error);
        }
      }

      const marketplace: Marketplace = {
        id: marketplaceId,
        name: marketplaceJson.name,
        description: marketplaceJson.metadata?.description,
        version: marketplaceJson.metadata?.version,
        owner: marketplaceJson.owner,
        source: options.source,
        url: options.url,
        path: options.path,
        plugins,
        configPath,
        lastUpdated: new Date(),
        official: marketplaceJson.name.toLowerCase().includes('anthropic'),
      };

      return marketplace;
    } catch (error) {
      throw new MarketplaceError(
        `Failed to scan marketplace: ${error instanceof Error ? error.message : String(error)}`,
        SkillErrorCode.MARKETPLACE_PARSE_FAILED,
        { marketplaceId, marketplacePath, originalError: error },
      );
    }
  }

  /**
   * 读取 marketplace.json
   */
  private async readMarketplaceJson(configPath: string): Promise<MarketplaceJson> {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const json = JSON.parse(content) as MarketplaceJson;

      // 验证必需字段
      if (!json.name || !json.plugins) {
        throw new ValidationError('Invalid marketplace.json: missing required fields');
      }

      return json;
    } catch (error) {
      throw new MarketplaceError(
        `Failed to read marketplace.json: ${error instanceof Error ? error.message : String(error)}`,
        SkillErrorCode.FILE_READ_FAILED,
        { path: configPath, originalError: error },
      );
    }
  }

  /**
   * 解析 Plugin 定义
   */
  private async parsePlugin(
    marketplaceId: string,
    marketplacePath: string,
    pluginDef: MarketplaceJson['plugins'][0],
  ): Promise<Plugin> {
    const pluginId = `${marketplaceId}:${pluginDef.name}`;

    // 检查 skills 是否存在
    const skillPaths: string[] = [];
    for (const skillPath of pluginDef.skills) {
      const fullPath = path.join(marketplacePath, skillPath);
      if (await fs.pathExists(fullPath)) {
        skillPaths.push(skillPath);
      } else {
        console.warn(`Skill path not found: ${fullPath}`);
      }
    }

    const plugin: Plugin = {
      id: pluginId,
      name: pluginDef.name,
      description: pluginDef.description,
      marketplaceId,
      source: pluginDef.source,
      strict: pluginDef.strict,
      skillPaths,
      installed: false,
      enabled: false,
    };

    return plugin;
  }

  // ============================================================================
  // 浏览功能
  // ============================================================================

  /**
   * 浏览 Marketplace（搜索 Plugins）
   */
  async browseMarketplace(
    marketplaceId: string,
    query?: string,
  ): Promise<Plugin[]> {
    const plugins = await this.getPlugins(marketplaceId);

    if (!query) {
      return plugins;
    }

    const lowerQuery = query.toLowerCase();
    return plugins.filter(
      (p) =>
        p.name.toLowerCase().includes(lowerQuery) ||
        p.description.toLowerCase().includes(lowerQuery),
    );
  }

  /**
   * 扫描 Marketplace 并返回详细报告
   */
  async scanMarketplaceDetailed(marketplaceId: string): Promise<MarketplaceScanResult> {
    const startTime = Date.now();
    const errors: Array<{ path: string; error: string }> = [];

    try {
      const marketplace = await this.getMarketplace(marketplaceId);
      const scanDuration = Date.now() - startTime;

      return {
        marketplace,
        pluginCount: marketplace.plugins.length,
        skillCount: marketplace.plugins.reduce((sum, p) => sum + p.skillPaths.length, 0),
        scanDuration,
        hasErrors: errors.length > 0,
        errors,
      };
    } catch (error) {
      throw new MarketplaceError(
        `Failed to scan marketplace: ${error instanceof Error ? error.message : String(error)}`,
        SkillErrorCode.MARKETPLACE_PARSE_FAILED,
        { marketplaceId, originalError: error },
      );
    }
  }
}

/**
 * 单例实例
 */
export const marketplaceManager = new MarketplaceManager(
  // 需要在实际使用时注入 settingsManager
  {} as SettingsManager,
);
