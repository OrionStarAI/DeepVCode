/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'path';
import fs from 'fs-extra';
import { spawnSync } from 'child_process';
import {
  UnifiedComponent,
  UnifiedPlugin,
  ComponentSource,
  ComponentType,
  ComponentLoadLevel,
  PluginStructure
} from '../models/unified.js';
import { IPluginLoader } from './types.js';
import { SettingsManager, SkillsPaths } from '../settings-manager.js';
import { PluginStructureAnalyzer, ComponentParser } from '../parsers/index.js';
import { PluginSource } from '../skill-types.js';

/**
 * Marketplace 加载器
 * 负责从 ~/.deepv/marketplace 加载插件和组件
 */
export class MarketplaceLoader implements IPluginLoader {
  private componentParser: ComponentParser;

  constructor(private settingsManager: SettingsManager) {
    this.componentParser = new ComponentParser();
  }

  async loadPlugins(): Promise<UnifiedPlugin[]> {
    const plugins: UnifiedPlugin[] = [];

    // 1. 获取已安装的插件列表（仅加载已安装的插件）
    const installedPlugins = await this.settingsManager.readInstalledPlugins();
    const installedPluginIds = new Set(Object.keys(installedPlugins.plugins));

    // 2. 获取已安装的 Marketplace
    const marketplaces = await this.settingsManager.getMarketplaces();

    for (const mp of marketplaces) {
      if (!mp.enabled) continue;

      const mpPath = mp.source === 'local' ? mp.location : path.join(SkillsPaths.MARKETPLACE_ROOT, mp.id);
      if (!(await fs.pathExists(mpPath))) continue;

      // 3. 尝试从 marketplace.json 加载插件定义
      const manifestPath = path.join(mpPath, '.claude-plugin', 'marketplace.json');
      const loadedPluginIds = new Set<string>();

      // 🔧 新增：检查是否为 Claude Code marketplace
      const isClaudeCodeMarketplace = mp.id === 'claude-code' || mp.id?.includes('claude-code');

      if (await fs.pathExists(manifestPath)) {
        try {
          const manifest = await fs.readJson(manifestPath);
          if (manifest.plugins && Array.isArray(manifest.plugins)) {
            for (const pluginDef of manifest.plugins) {
              try {
                const pluginId = `${mp.id}:${pluginDef.name}`;

                // 🔧 优化：Claude Code marketplace 自动加载所有插件（不检查 installed_plugins.json）
                // 其他 marketplace 仍然遵循原有逻辑
                if (!isClaudeCodeMarketplace && !installedPluginIds.has(pluginId)) {
                  continue;
                }

                const plugin = await this.loadPluginFromManifest(mp.id, mpPath, pluginDef);
                if (plugin) {
                  plugins.push(plugin);
                  loadedPluginIds.add(plugin.id);
                }
              } catch (error) {
                console.warn(`Failed to load plugin ${pluginDef.name} from manifest:`, error);
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to read marketplace.json for ${mp.id}:`, error);
        }
      }

      // 4. 扫描目录以发现未在 manifest 中定义的插件
      const pluginDirs = await this.discoverPluginDirs(mpPath);

      for (const pluginDir of pluginDirs) {
        const pluginName = path.basename(pluginDir);
        const pluginId = `${mp.id}:${pluginName}`;

        // 跳过已从 manifest 加载的插件
        if (loadedPluginIds.has(pluginId)) continue;

        // 🔧 优化：Claude Code marketplace 自动加载所有插件（不检查 installed_plugins.json）
        // 其他 marketplace 仍然遵循原有逻辑
        if (!isClaudeCodeMarketplace && !installedPluginIds.has(pluginId)) {
          continue;
        }

        try {
          const plugin = await this.loadPluginFromDir(mp.id, pluginDir);
          if (plugin) {
            plugins.push(plugin);
          }
        } catch (error) {
          console.warn(`Failed to load plugin from ${pluginDir}:`, error);
        }
      }
    }

    return plugins;
  }

  async loadPlugin(pluginId: string): Promise<UnifiedPlugin | null> {
    // TODO: Implement single plugin loading
    return null;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * 从 marketplace.json 的 plugin entry 加载插件
   * 支持官方文档中的所有 source 类型和内联配置
   */
  private async loadPluginFromManifest(
    marketplaceId: string,
    mpPath: string,
    pluginDef: any
  ): Promise<UnifiedPlugin | null> {
    const id = `${marketplaceId}:${pluginDef.name}`;
    const source = pluginDef.source;
    let pluginDir = mpPath;

    // 0. 优先使用 installPath（如果已安装）
    const installedInfo = await this.settingsManager.getInstalledPlugin(id);
    if (installedInfo?.installPath && await fs.pathExists(installedInfo.installPath)) {
      // Startup log suppressed for clean CLI output
      // console.log(`[MarketplaceLoader] Using installPath from installed plugin: ${installedInfo.installPath}`);
      pluginDir = installedInfo.installPath;
    } else if (this.isRemoteGitSource(source)) {
      // 1. 远程 Git source（需要缓存）
      const version = pluginDef.version || 'unknown';
      const cachePath = SkillsPaths.getPluginCachePath(marketplaceId, pluginDef.name, version);

      // 检查缓存是否存在
      if (await fs.pathExists(cachePath)) {
        // Startup log suppressed for clean CLI output
        // console.log(`[MarketplaceLoader] Using cached plugin: ${cachePath}`);
        pluginDir = cachePath;
      } else {
        // 克隆到缓存目录
        const gitUrl = this.extractGitUrl(source);
        if (gitUrl) {
          await this.clonePluginToCache(gitUrl, cachePath, source);
          pluginDir = cachePath;
        } else {
          console.warn(`Cannot extract Git URL from source: ${JSON.stringify(source)}`);
          return null;
        }
      }
    } else if (typeof source === 'string') {
      // 2. 字符串类型：相对路径
      if (source.startsWith('./') || source.startsWith('../')) {
        pluginDir = path.join(mpPath, source);
      } else {
        pluginDir = path.join(mpPath, source);
      }
    } else {
      // 3. 未知类型，回退到插件名
      pluginDir = path.join(mpPath, pluginDef.name);
    }

    if (!(await fs.pathExists(pluginDir))) {
      console.warn(`Plugin directory not found: ${pluginDir}`);
      return null;
    }

    const components: UnifiedComponent[] = [];

    // 2. 处理显式定义的组件
    // 按照官方文档，可以在 manifest 中定义 commands, agents, hooks 等
    // 支持字符串数组或对象数组（对象包含 path 属性）

    // 🔧 新增：支持 marketplace.json 中的 metadata.pluginRoot
    const pluginRootPrefix = pluginDef.metadata?.pluginRoot || '';

    // Helper to get full path respecting pluginRoot
    const getFullPath = (p: string) => {
      const targetPath = pluginRootPrefix ? path.join(pluginRootPrefix, p) : p;
      return path.isAbsolute(targetPath) ? targetPath : path.join(pluginDir, targetPath);
    };

    // Commands
    if (pluginDef.commands && (Array.isArray(pluginDef.commands) || typeof pluginDef.commands === 'string')) {
      const cmdItems = Array.isArray(pluginDef.commands) ? pluginDef.commands : [pluginDef.commands];
      for (const cmdItem of cmdItems) {
        // 支持字符串或对象格式：{ path: "commands/foo.md" }
        const cmdPath = typeof cmdItem === 'string' ? cmdItem : cmdItem?.path;
        if (!cmdPath || typeof cmdPath !== 'string') {
          console.warn(`Invalid command path in plugin ${id}:`, cmdItem);
          continue;
        }
        const fullPath = getFullPath(cmdPath);
        const component = await this.componentParser.parse(
          fullPath,
          ComponentType.COMMAND,
          id,
          marketplaceId,
          pluginDir
        );
        if (component) {
          components.push(component);
        }
      }
    }

    // Agents
    if (pluginDef.agents && (Array.isArray(pluginDef.agents) || typeof pluginDef.agents === 'string')) {
      const agentItems = Array.isArray(pluginDef.agents) ? pluginDef.agents : [pluginDef.agents];
      for (const agentItem of agentItems) {
        // 支持字符串或对象格式：{ path: "agents/foo.md" }
        const agentPath = typeof agentItem === 'string' ? agentItem : agentItem?.path;
        if (!agentPath || typeof agentPath !== 'string') {
          console.warn(`Invalid agent path in plugin ${id}:`, agentItem);
          continue;
        }
        const fullPath = getFullPath(agentPath);
        const component = await this.componentParser.parse(
          fullPath,
          ComponentType.AGENT,
          id,
          marketplaceId,
          pluginDir
        );
        if (component) {
          components.push(component);
        }
      }
    }

    // Skills (如果显式定义了)
    if (pluginDef.skills && (Array.isArray(pluginDef.skills) || typeof pluginDef.skills === 'string')) {
      const skillItems = Array.isArray(pluginDef.skills) ? pluginDef.skills : [pluginDef.skills];
      for (const skillItem of skillItems) {
        // 支持字符串或对象格式：{ path: "skills/foo.md" }
        const skillPath = typeof skillItem === 'string' ? skillItem : skillItem?.path;
        if (!skillPath || typeof skillPath !== 'string') {
          console.warn(`Invalid skill path in plugin ${id}:`, skillItem);
          continue;
        }
        const fullPath = getFullPath(skillPath);
        const component = await this.componentParser.parse(
          fullPath,
          ComponentType.SKILL,
          id,
          marketplaceId,
          pluginDir
        );
        if (component) {
          components.push(component);
        }
      }
    }

    // 3. 如果没有显式定义组件，且 strict !== false，则自动发现
    const isStrictMode = pluginDef.strict !== false;

    if (components.length === 0 || !isStrictMode) {
      // 自动发现标准目录
      // 按照标准目录和常见第三方工具目录进行自动发现
      const discoveryTasks = [
        { name: 'agents', type: ComponentType.AGENT },
        { name: 'commands', type: ComponentType.COMMAND },
        { name: 'skills', type: ComponentType.SKILL },
        { name: '.claude/agents', type: ComponentType.AGENT },
        { name: '.claude/commands', type: ComponentType.COMMAND },
        { name: '.claude/skills', type: ComponentType.SKILL },
        { name: '.cursor/commands', type: ComponentType.COMMAND },
        { name: '.roo/commands', type: ComponentType.COMMAND },
      ];

      for (const task of discoveryTasks) {
        components.push(...await this.scanComponents(
          pluginDir, task.name, task.type, id, marketplaceId
        ));
      }
    }

    // 4. 构建 UnifiedPlugin
    return {
      id,
      name: pluginDef.name,
      description: pluginDef.description || '',
      version: pluginDef.version || 'unknown',
      author: pluginDef.author,
      source: ComponentSource.MARKETPLACE,
      location: {
        type: 'directory',
        path: pluginDir
      },
      components,
      structure: {
        hasMarketplaceJson: true,
        hasPluginJson: false,
        hasClaudePluginDir: false,
        directories: {
          agents: pluginDef.agents ? true : false,
          commands: pluginDef.commands ? true : false,
          skills: pluginDef.skills ? true : false,
          hooks: pluginDef.hooks ? true : false,
          scripts: false
        },
        detectedFormat: 'deepv-code'
      },
      installed: true,
      enabled: true,
      marketplace: {
        id: marketplaceId,
        name: marketplaceId
      },
      rawConfig: pluginDef
    };
  }

  private async discoverPluginDirs(mpPath: string): Promise<string[]> {
    const dirs: string[] = [];

    // 1. 检查根目录下的插件 (DeepV Code 风格)
    const rootEntries = await fs.readdir(mpPath, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        // 排除 plugins 目录，因为它会被单独处理
        if (entry.name !== 'plugins') {
          dirs.push(path.join(mpPath, entry.name));
        }
      }
    }

    // 2. 检查 plugins/ 子目录 (Claude Code 风格)
    const pluginsPath = path.join(mpPath, 'plugins');
    if (await fs.pathExists(pluginsPath)) {
      const pluginEntries = await fs.readdir(pluginsPath, { withFileTypes: true });
      for (const entry of pluginEntries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          dirs.push(path.join(pluginsPath, entry.name));
        }
      }
    }

    return dirs;
  }

  private async loadPluginFromDir(marketplaceId: string, pluginDir: string): Promise<UnifiedPlugin | null> {
    const pluginName = path.basename(pluginDir);
    const id = `${marketplaceId}:${pluginName}`;

    // 1. 分析结构 (使用 PluginStructureAnalyzer)
    const analyzer = new PluginStructureAnalyzer(pluginDir);
    const structure = await analyzer.analyze();

    // 2. 读取元数据 (plugin.json)
    let metadata: any = { name: pluginName, description: '', version: 'unknown' };
    if (structure.hasPluginJson) {
      metadata = await fs.readJson(path.join(pluginDir, 'plugin.json'));
    } else if (structure.hasClaudePluginDir) {
      metadata = await fs.readJson(path.join(pluginDir, '.claude-plugin', 'plugin.json'));
    }

    // 3. 发现组件 (使用 ComponentParser)
    const components: UnifiedComponent[] = [];

    // Agents
    if (structure.directories.agents) {
      if (await fs.pathExists(path.join(pluginDir, 'agents'))) {
        components.push(...await this.scanComponents(pluginDir, 'agents', ComponentType.AGENT, id, marketplaceId));
      }
      if (await fs.pathExists(path.join(pluginDir, '.claude/agents'))) {
        components.push(...await this.scanComponents(pluginDir, '.claude/agents', ComponentType.AGENT, id, marketplaceId));
      }
    }

    // Commands
    if (structure.directories.commands) {
      const commandDirs = ['commands', '.claude/commands', '.cursor/commands', '.roo/commands'];
      for (const dir of commandDirs) {
        if (await fs.pathExists(path.join(pluginDir, dir))) {
          components.push(...await this.scanComponents(pluginDir, dir, ComponentType.COMMAND, id, marketplaceId));
        }
      }
    }

    // Skills
    if (structure.directories.skills) {
      if (await fs.pathExists(path.join(pluginDir, 'skills'))) {
        components.push(...await this.scanComponents(pluginDir, 'skills', ComponentType.SKILL, id, marketplaceId));
      }
      if (await fs.pathExists(path.join(pluginDir, '.claude/skills'))) {
        components.push(...await this.scanComponents(pluginDir, '.claude/skills', ComponentType.SKILL, id, marketplaceId));
      }
    } else {
      // 尝试扫描根目录下的 Skills (DeepV Code 扁平结构)
      // 这种结构常见于旧的 DeepV Code 插件，如 document-skills
      const skills = await this.scanComponents(
        pluginDir, '.', ComponentType.SKILL, id, marketplaceId
      );
      if (skills.length > 0) {
        components.push(...skills);
      }
    }

    // 4. 构建 UnifiedPlugin
    return {
      id,
      name: metadata.name || pluginName,
      description: metadata.description || '',
      version: metadata.version || 'unknown',
      author: metadata.author,
      source: ComponentSource.MARKETPLACE,
      location: {
        type: 'directory',
        path: pluginDir
      },
      components,
      structure,
      installed: true,
      enabled: true,
      marketplace: {
        id: marketplaceId,
        name: marketplaceId
      }
    };
  }

  private async scanComponents(
    pluginDir: string,
    subDir: string,
    type: ComponentType,
    pluginId: string,
    marketplaceId: string
  ): Promise<UnifiedComponent[]> {
    const dirPath = path.join(pluginDir, subDir);
    const components: UnifiedComponent[] = [];

    if (!(await fs.pathExists(dirPath))) return components;

    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dirPath, entry.name);

      // 使用 ComponentParser 解析组件
      const component = await this.componentParser.parse(
        fullPath,
        type,
        pluginId,
        marketplaceId,
        pluginDir
      );

      if (component) {
        components.push(component);
      }
    }

    return components;
  }

  // ==========================================================================
  // Plugin Caching Helpers
  // ==========================================================================

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

  /**
   * 从 plugin source 提取 Git URL
   * @param source Plugin source
   * @returns Git URL 或 null
   */
  private extractGitUrl(source: PluginSource): string | null {
    if (typeof source === 'object' && source !== null) {
      if (source.source === 'github') {
        return `https://github.com/${source.repo}.git`;
      } else if (source.source === 'git') {
        return source.url;
      } else if (source.source === 'url') {
        return source.url;
      }
    }
    return null;
  }

  /**
   * 克隆插件到缓存目录
   * @param gitUrl Git 仓库 URL
   * @param cachePath 缓存目录路径
   * @param source Plugin source 对象
   */
  private async clonePluginToCache(
    gitUrl: string,
    cachePath: string,
    source: PluginSource
  ): Promise<void> {
    try {
      console.log(`[MarketplaceLoader] Cloning plugin from ${gitUrl} to ${cachePath}`);
      await fs.ensureDir(path.dirname(cachePath));

      // 构建 git clone 参数数组（防止命令注入）
      const args: string[] = ['clone', '--depth', '1'];

      // 添加 ref (分支/tag) 如果指定
      if (typeof source === 'object' && 'ref' in source && source.ref) {
        args.push('--branch', source.ref);
      }

      args.push(gitUrl, cachePath);

      // 执行克隆 - 使用 spawnSync 而不是 execSync 以防止 shell 注入
      const result = spawnSync('git', args, {
        stdio: 'pipe',
        encoding: 'utf-8'
      });

      if (result.status !== 0) {
        const errorMsg = result.stderr || result.error?.message || 'Unknown error';
        throw new Error(`Git clone failed: ${errorMsg}`);
      }

      // 如果指定了 path，需要进入子目录
      if (typeof source === 'object' && 'path' in source && source.path) {
        const subPath = path.join(cachePath, source.path);
        if (await fs.pathExists(subPath)) {
          // 将子目录内容移到 cachePath 根目录
          const tempDir = cachePath + '_temp';
          await fs.move(subPath, tempDir);
          await fs.remove(cachePath);
          await fs.move(tempDir, cachePath);
        }
      }

      console.log(`[MarketplaceLoader] Plugin cached successfully: ${cachePath}`);
    } catch (error) {
      console.error(`[MarketplaceLoader] Failed to clone plugin to cache:`, error);
      // 清理失败的缓存
      if (await fs.pathExists(cachePath)) {
        await fs.remove(cachePath);
      }
      throw error;
    }
  }
}