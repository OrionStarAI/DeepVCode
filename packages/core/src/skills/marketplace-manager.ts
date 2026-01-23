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
  PluginSource,
  PluginItem,
  SkillType,
  MarketplaceError,
  SkillErrorCode,
  MarketplaceScanResult,
  ValidationError,
} from './skill-types.js';
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
    url?: string;
  };
  metadata?: {
    description?: string;
    version?: string;
    pluginRoot?: string;
  };
  plugins: Array<MarketplacePluginEntry>;
}

interface MarketplacePluginEntry {
  name: string;
  source: PluginSource;
  description?: string;
  version?: string;
  author?: { name: string; email?: string; };
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  category?: string;
  tags?: string[];
  strict?: boolean;
  // Component config
  commands?: string | string[];
  agents?: string | string[];
  hooks?: unknown;
  mcpServers?: unknown;
  // Legacy/DeepV specific
  skills?: string[];
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
   *
   * 行为说明：
   * - 总是删除：marketplace 配置 + 相关的 installed plugins 记录
   * - 条件删除：仅删除 Git Marketplace 的克隆目录（~/.deepv/marketplace/{id}）
   * - 保护策略：本地 Marketplace 的原始目录永远不会被删除（用户拥有的文件）
   *
   * @param marketplaceId Marketplace ID
   * @param preserveFiles 是否保留 Git Marketplace 的克隆目录（默认 false = 删除）
   */
  async removeMarketplace(marketplaceId: string, preserveFiles = false): Promise<void> {
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

      // 删除该 Marketplace 下的所有已安装 Plugin 记录
      await this.settingsManager.removeInstalledPluginsByMarketplace(marketplaceId);

      // 删除配置
      await this.settingsManager.removeMarketplace(marketplaceId);

      // 安全的文件删除：仅删除我们管理的 Git Marketplace 克隆目录
      // 本地 Marketplace 的文件永远不会被删除，因为它们是用户拥有的原始文件
      if (!preserveFiles && config.source === MarketplaceSource.GIT) {
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
   * @param url Git 仓库 URL
   * @param targetPath 目标路径
   * @param ref 可选的分支、tag 或 commit hash
   */
  private async cloneRepository(url: string, targetPath: string, ref?: string): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(targetPath));

      // 构建 git clone 命令
      // 添加参数：
      // --depth 1: 浅克隆，只获取最新提交，加快速度
      // --no-single-branch: 允许后续 fetch 其他分支（如果需要）
      // -c core.askpass=true: 禁用交互式密码提示（对于公开仓库不需要）
      const baseArgs = ['clone', '--depth', '1', '-c', 'core.askPass=true'];

      if (ref) {
        baseArgs.push('--branch', ref);
      }

      baseArgs.push(url, targetPath);

      const cloneCommand = `git ${baseArgs.join(' ')}`;

      const { stdout, stderr } = await execAsync(cloneCommand, {
        maxBuffer: 10 * 1024 * 1024, // 10MB
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0', // 禁用终端提示（避免要求输入密码）
        },
      });

      if (stderr && stderr.includes('fatal')) {
        throw new Error(stderr);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 提供更友好的错误信息
      let friendlyMessage = `Git clone failed: ${errorMessage}`;

      if (errorMessage.includes('Repository not found') || errorMessage.includes('404')) {
        friendlyMessage = `Repository not found: ${url}\n\n请检查：\n  1. 仓库名是否正确\n  2. 仓库是否存在\n  3. 仓库是否为公开访问`;
      } else if (errorMessage.includes('Could not resolve host') || errorMessage.includes('network')) {
        friendlyMessage = `Network error: 无法连接到 ${url}\n\n请检查网络连接`;
      } else if (errorMessage.includes('authentication') || errorMessage.includes('credential')) {
        friendlyMessage = `Authentication required for ${url}\n\n此仓库需要认证访问，请确保：\n  1. 仓库是公开的，或\n  2. 已配置 Git 凭证（git config credential.helper）`;
      }

      throw new MarketplaceError(
        friendlyMessage,
        SkillErrorCode.MARKETPLACE_CLONE_FAILED,
        { url, targetPath, ref, originalError: error },
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
    pluginDef: MarketplacePluginEntry,
  ): Promise<Plugin> {
    const pluginId = `${marketplaceId}:${pluginDef.name}`;
    let finalPluginDef = { ...pluginDef };

    // 1. Resolve Source Path
    let sourcePath = '';
    if (typeof pluginDef.source === 'string') {
      // Local relative path
      sourcePath = path.join(marketplacePath, pluginDef.source);

      // Fallback: Check if 'plugins' directory should be 'skills' (common in some marketplaces)
      if (!(await fs.pathExists(sourcePath)) && pluginDef.source.startsWith('./plugins/')) {
        const altSource = pluginDef.source.replace('./plugins/', './skills/');
        const altPath = path.join(marketplacePath, altSource);
        if (await fs.pathExists(altPath)) {
          sourcePath = altPath;
        }
      }
    } else if (typeof pluginDef.source === 'object') {
      // Remote Git source (github/git/url)
      const source = pluginDef.source;

      // 确定基础目录名（使用 path 字段或插件名）
      const baseDirName = ('path' in source && source.path) ? source.path : pluginDef.name;

      // 🔑 关键修复：优先检查 cache 目录（远程插件下载后的位置）
      const version = pluginDef.version || 'unknown';
      const cachePath = SkillsPaths.getPluginCachePath(marketplaceId, pluginDef.name, version);

      if (await fs.pathExists(cachePath)) {
        // 远程插件已下载到 cache
        sourcePath = cachePath;
      } else {
        // 可能的插件位置（兼容旧结构）
        const possiblePaths = [
          path.join(marketplacePath, baseDirName), // Direct: marketplace/plugin-name
          path.join(marketplacePath, 'plugins', baseDirName), // Common: marketplace/plugins/plugin-name
          path.join(marketplacePath, 'skills', baseDirName), // Alternative: marketplace/skills/plugin-name
        ];

        for (const possiblePath of possiblePaths) {
          if (await fs.pathExists(possiblePath)) {
            sourcePath = possiblePath;
            break;
          }
        }
      }

      if (!sourcePath) {
        // Plugin directory not found - 不自动克隆远程插件
        // 远程插件将在用户安装时按需克隆（由 PluginInstaller 处理）
        console.log(
          `[MarketplaceManager] Remote plugin ${pluginDef.name} not yet downloaded\n` +
          `  Will be cloned when user installs this plugin\n` +
          `  Source: ${JSON.stringify(pluginDef.source)}`
        );
        // sourcePath 保持为空，后续逻辑会跳过此插件的详细解析
      }
    } else {
      console.warn(`Unsupported plugin source type: ${pluginDef.name}`);
    }

    // 2. Handle Strict Mode & plugin.json
    const isStrict = pluginDef.strict !== false; // Default to true

    if (sourcePath && await fs.pathExists(sourcePath)) {
      // Try two locations: plugin.json (DeepV Code) and .claude-plugin/plugin.json (Claude Code)
      let manifestPath = path.join(sourcePath, 'plugin.json');
      let hasManifest = await fs.pathExists(manifestPath);

      // Fallback to Claude Code convention
      if (!hasManifest) {
        manifestPath = path.join(sourcePath, '.claude-plugin', 'plugin.json');
        hasManifest = await fs.pathExists(manifestPath);
      }

      if (hasManifest) {
        try {
          const manifest = await fs.readJson(manifestPath);
          // Marketplace definition supplements/overrides manifest?
          // Doc: "marketplace fields supplement those values" -> Manifest is base
          finalPluginDef = { ...manifest, ...pluginDef };
        } catch (e) {
          console.warn(
            `Failed to read plugin.json for ${pluginDef.name}\n` +
            `  Path: ${manifestPath}\n` +
            `  Error: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
      // Note: If no plugin.json found, that's OK for Claude Code plugins
      // They use directory convention (agents/, commands/, skills/) instead
    } else {
      console.warn(
        `Plugin source path does not exist: ${pluginDef.name}\n` +
        `  Expected source: ${sourcePath}\n` +
        `  Marketplace path: ${marketplacePath}\n` +
        `  Source definition: ${pluginDef.source}`
      );
    }

    // 3. Resolve Skills/Commands/Agents
    const skillPaths: string[] = [];
    const items: PluginItem[] = [];
    const basePath = sourcePath || marketplacePath;

    const processItems = async (list: string[] | string | undefined, type: SkillType) => {
      if (!list) return;
      const candidates = Array.isArray(list) ? list : [list];

      for (const candidate of candidates) {
        if (typeof candidate !== 'string') continue;

        const fullPath = path.join(basePath, candidate);
        if (await fs.pathExists(fullPath)) {
          const stat = await fs.stat(fullPath);

          // 如果是一个目录，且类型是 SKILL，且该目录下没有 SKILL.md
          // 尝试扫描子目录（支持 everything-claude-code 这种 "skills": "./skills" 的配置）
          let isContainerDir = false;
          if (type === SkillType.SKILL && stat.isDirectory()) {
            const hasSkillFile = await fs.pathExists(path.join(fullPath, 'SKILL.md'));
            if (!hasSkillFile) {
              isContainerDir = true;
              const children = await fs.readdir(fullPath);
              for (const child of children) {
                if (child.startsWith('.')) continue;
                const childPath = path.join(fullPath, child);
                const childStat = await fs.stat(childPath);
                if (childStat.isDirectory() && await fs.pathExists(path.join(childPath, 'SKILL.md'))) {
                  const relPath = path.relative(marketplacePath, childPath);
                  skillPaths.push(relPath);
                  items.push({ path: relPath, type });
                }
              }
            }
          }

          // 如果不是容器目录（即是普通 Skill 或 Command/Agent），或者是容器目录但我们仍然保留其作为入口（不太可能，但为了兼容性）
          // 通常如果是容器目录，我们就不把容器本身加进去了，只加子元素
          // 但原逻辑是只要存在就加进去。为了安全起见，如果不含 SKILL.md 的目录被视为容器，我们只加子元素。
          // 如果它包含 SKILL.md，它就是一个 Skill。
          if (!isContainerDir) {
            const relPath = path.relative(marketplacePath, fullPath);
            skillPaths.push(relPath);
            items.push({ path: relPath, type });
          }
        } else {
          console.warn(`${type} path not found: ${fullPath}`);
        }
      }
    };

    // 如果 plugin.json 中没有明确定义，则自动发现
    if (!finalPluginDef.skills && !finalPluginDef.commands && !finalPluginDef.agents) {
      // 自动发现：检查常见的目录名称
      const autoDiscoverDirs = async (dirName: string, type: SkillType) => {
        const dirPath = path.join(basePath, dirName);
        if (await fs.pathExists(dirPath)) {
          const stat = await fs.stat(dirPath);
          if (stat.isDirectory()) {
            const items_in_dir = await fs.readdir(dirPath);
            for (const item of items_in_dir) {
              // 跳过隐藏文件和特殊目录
              if (item.startsWith('.')) continue;

              const itemPath = path.join(dirPath, item);
              const itemStat = await fs.stat(itemPath);

              if (itemStat.isDirectory()) {
                // 对于 skills，检查是否有 SKILL.md
                if (type === SkillType.SKILL) {
                  const skillFile = path.join(itemPath, 'SKILL.md');
                  if (await fs.pathExists(skillFile)) {
                    const relPath = path.relative(marketplacePath, itemPath);
                    skillPaths.push(relPath);
                    items.push({ path: relPath, type });
                  }
                } else {
                  // 对于 commands/agents，只需要目录存在
                  const relPath = path.relative(marketplacePath, itemPath);
                  skillPaths.push(relPath);
                  items.push({ path: relPath, type });
                }
              } else if (itemStat.isFile() && (item.endsWith('.md') || item.endsWith('.py') || item.endsWith('.sh'))) {
                // 对于 commands/agents，也支持文件
                if (type !== SkillType.SKILL) {
                  const relPath = path.relative(marketplacePath, itemPath);
                  skillPaths.push(relPath);
                  items.push({ path: relPath, type });
                }
              }
            }
          }
        }
      };

      // 按照 Claude Code 的约定发现 agents, commands, skills
      // 支持标准目录、.claude/ 以及 .cursor/ 下的目录
      const discoveryTasks = [
        { name: 'agents', type: SkillType.AGENT },
        { name: 'commands', type: SkillType.COMMAND },
        { name: 'skills', type: SkillType.SKILL },
        { name: '.claude/agents', type: SkillType.AGENT },
        { name: '.claude/commands', type: SkillType.COMMAND },
        { name: '.claude/skills', type: SkillType.SKILL },
        { name: '.cursor/commands', type: SkillType.COMMAND },
        { name: '.cursor/rules', type: SkillType.COMMAND }, // .cursor/rules also treated as commands
      ];

      for (const task of discoveryTasks) {
        await autoDiscoverDirs(task.name, task.type);
      }
    } else {
      // 如果明确定义了，使用明确的定义
      await processItems(finalPluginDef.skills, SkillType.SKILL);
      await processItems(finalPluginDef.commands, SkillType.COMMAND);
      await processItems(finalPluginDef.agents, SkillType.AGENT);
    }

    // 检查是否已安装
    const installedPlugin = await this.settingsManager.getInstalledPlugin(pluginId);
    const isInstalled = !!installedPlugin;
    const isEnabled = installedPlugin?.enabled ?? false;

    const plugin: Plugin = {
      id: pluginId,
      name: finalPluginDef.name,
      description: finalPluginDef.description || '',
      marketplaceId,
      source: finalPluginDef.source,
      strict: isStrict,
      skillPaths,
      items,
      installed: isInstalled,
      enabled: isEnabled,
      version: finalPluginDef.version,
      author: finalPluginDef.author,
      homepage: finalPluginDef.homepage,
      repository: finalPluginDef.repository,
      license: finalPluginDef.license,
      keywords: finalPluginDef.keywords,
      category: finalPluginDef.category,
      tags: finalPluginDef.tags,
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
        p.description.toLowerCase().includes(lowerQuery) ||
        (p.keywords && p.keywords.some(k => k.toLowerCase().includes(lowerQuery)))
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
