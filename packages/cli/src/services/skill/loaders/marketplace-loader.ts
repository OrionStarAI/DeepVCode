import path from 'path';
import fs from 'fs-extra';
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

    // 1. 获取已安装的 Marketplace
    const marketplaces = await this.settingsManager.getMarketplaces();

    for (const mp of marketplaces) {
      if (!mp.enabled) continue;

      const mpPath = path.join(SkillsPaths.MARKETPLACE_ROOT, mp.id);
      if (!(await fs.pathExists(mpPath))) continue;

      // 2. 尝试从 marketplace.json 加载插件定义
      const manifestPath = path.join(mpPath, '.claude-plugin', 'marketplace.json');
      const loadedPluginIds = new Set<string>();

      if (await fs.pathExists(manifestPath)) {
        try {
          const manifest = await fs.readJson(manifestPath);
          if (manifest.plugins && Array.isArray(manifest.plugins)) {
            for (const pluginDef of manifest.plugins) {
              try {
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

      // 3. 扫描目录以发现未在 manifest 中定义的插件
      const pluginDirs = await this.discoverPluginDirs(mpPath);

      for (const pluginDir of pluginDirs) {
        const pluginName = path.basename(pluginDir);
        const pluginId = `${mp.id}:${pluginName}`;

        if (loadedPluginIds.has(pluginId)) continue;

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

  private async loadPluginFromManifest(
    marketplaceId: string,
    mpPath: string,
    pluginDef: any
  ): Promise<UnifiedPlugin | null> {
    const id = `${marketplaceId}:${pluginDef.name}`;

    // 确定插件根目录
    let pluginDir = mpPath;
    if (pluginDef.source && pluginDef.source !== './') {
      pluginDir = path.join(mpPath, pluginDef.source);
    }

    if (!(await fs.pathExists(pluginDir))) return null;

    const components: UnifiedComponent[] = [];

    // 1. 处理显式定义的 Skills
    if (pluginDef.skills && Array.isArray(pluginDef.skills)) {
      for (const skillRelPath of pluginDef.skills) {
        const skillPath = path.join(pluginDir, skillRelPath);
        // 尝试解析为 Skill
        const component = await this.componentParser.parse(
           skillPath,
           ComponentType.SKILL,
           id,
           marketplaceId,
           pluginDir
        );
        if (component) {
          components.push(component);
        }
      }
    } else {
      // 2. 自动发现 (如果 manifest 中未定义 skills)
      // 这对于 Claude Code 插件 (通常包含 agents/commands 目录) 是必需的

      // Agents
      components.push(...await this.scanComponents(
        pluginDir, 'agents', ComponentType.AGENT, id, marketplaceId
      ));

      // Commands
      components.push(...await this.scanComponents(
        pluginDir, 'commands', ComponentType.COMMAND, id, marketplaceId
      ));

      // Skills
      components.push(...await this.scanComponents(
        pluginDir, 'skills', ComponentType.SKILL, id, marketplaceId
      ));
    }

    // 3. 构建 UnifiedPlugin
    return {
      id,
      name: pluginDef.name,
      description: pluginDef.description || '',
      version: '1.0.0',
      author: undefined,
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
          agents: false,
          commands: false,
          skills: true,
          hooks: false,
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

  async loadPlugin(pluginId: string): Promise<UnifiedPlugin | null> {
    // TODO: Implement single plugin loading
    return null;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

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
    let metadata: any = { name: pluginName, description: '', version: '0.0.0' };
    if (structure.hasPluginJson) {
      metadata = await fs.readJson(path.join(pluginDir, 'plugin.json'));
    } else if (structure.hasClaudePluginDir) {
      metadata = await fs.readJson(path.join(pluginDir, '.claude-plugin', 'plugin.json'));
    }

    // 3. 发现组件 (使用 ComponentParser)
    const components: UnifiedComponent[] = [];

    // Agents
    if (structure.directories.agents) {
      components.push(...await this.scanComponents(
        pluginDir, 'agents', ComponentType.AGENT, id, marketplaceId
      ));
    }

    // Commands
    if (structure.directories.commands) {
      components.push(...await this.scanComponents(
        pluginDir, 'commands', ComponentType.COMMAND, id, marketplaceId
      ));
    }

    // Skills
    if (structure.directories.skills) {
      components.push(...await this.scanComponents(
        pluginDir, 'skills', ComponentType.SKILL, id, marketplaceId
      ));
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
      version: metadata.version || '0.0.0',
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
}