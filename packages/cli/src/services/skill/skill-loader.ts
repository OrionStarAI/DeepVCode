/**
 * DeepV Code Skills System - Skill Loader
 *
 * Manages Skill discovery and parsing:
 * - Scan enabled plugins and discover skills
 * - Parse SKILL.md files (YAML frontmatter + Markdown body)
 * - Validate skill structure and metadata
 * - Cache metadata for performance
 * - Support multi-layer storage (project + user global + marketplace)
 */

import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';
import {
  Skill,
  SkillMetadata,
  SkillLoadLevel,
  SkillScript,
  ScriptType,
  SkillError,
  SkillErrorCode,
  ValidationError,
  SkillType,
  SkillSource,
} from './types.js';
import { SettingsManager, SkillsPaths } from './settings-manager.js';
import { MarketplaceManager } from './marketplace-manager.js';
import { MarketplaceLoader } from './loaders/marketplace-loader.js';
import { UnifiedComponent, ComponentType } from './models/unified.js';
import { getProjectSkillsDir } from 'deepv-code-core';

/**
 * Skill 缓存项
 */
interface SkillCacheItem {
  skill: Skill;
  timestamp: number;
  loadLevel: SkillLoadLevel;
}

/**
 * SkillLoader - Skill 加载器
 *
 * 职责:
 * 1. 扫描已启用的 Plugins 并发现 Skills
 * 2. 解析 SKILL.md 文件（YAML frontmatter + Markdown body）
 * 3. 验证 Skill 结构（名称规则、必需字段）
 * 4. 元数据缓存机制
 * 5. 三层存储扫描（项目级 .deepvcode/skills/ + 用户级 ~/.deepv/skills/ + Marketplace）
 */
export class SkillLoader {
  private cache: Map<string, SkillCacheItem> = new Map();
  private readonly cacheTTL: number;
  private marketplaceLoader: MarketplaceLoader;
  private customSkillPaths: Map<SkillSource, string> = new Map();

  constructor(
    private settingsManager: SettingsManager,
    private marketplaceManager: MarketplaceManager,
    cacheTTL = 3600000, // 默认 1 小时
  ) {
    this.cacheTTL = cacheTTL;
    this.marketplaceLoader = new MarketplaceLoader(settingsManager);
    this.initializeCustomSkillPaths();
  }

  /**
   * 初始化自定义技能路径
   */
  private initializeCustomSkillPaths() {
    // 用户全局技能路径
    this.customSkillPaths.set(SkillSource.USER_GLOBAL, path.join(process.env.HOME || '', '.deepv', 'skills'));

    // 项目技能路径（使用工具函数，与命令处理保持一致）
    this.customSkillPaths.set(SkillSource.USER_PROJECT, getProjectSkillsDir(process.cwd()));
  }

  // ============================================================================
  // 加载 Skills
  // ============================================================================

  /**
   * 加载所有已启用的 Skills（支持多来源）
   * @param loadLevel 加载级别（默认仅元数据）
   */
  async loadEnabledSkills(
    loadLevel: SkillLoadLevel = SkillLoadLevel.METADATA,
  ): Promise<Skill[]> {
    try {
      const allSkills: Skill[] = [];

      // 按优先级加载：项目级 > 用户级 > 市场级
      const sources = [
        SkillSource.USER_PROJECT,
        SkillSource.USER_GLOBAL,
        SkillSource.MARKETPLACE,
      ];

      for (const source of sources) {
        const skills = await this.loadSkillsFromSource(source, loadLevel);
        allSkills.push(...skills);
      }

      return allSkills;
    } catch (error) {
      throw new SkillError(
        `Failed to load enabled skills: ${error instanceof Error ? error.message : String(error)}`,
        SkillErrorCode.SKILL_LOAD_FAILED,
        { originalError: error },
      );
    }
  }

  /**
   * 从特定来源加载技能
   */
  private async loadSkillsFromSource(
    source: SkillSource,
    loadLevel: SkillLoadLevel,
  ): Promise<Skill[]> {
    // 如果是市场技能，使用现有的加载逻辑
    if (source === SkillSource.MARKETPLACE) {
      return await this.loadMarketplaceSkills(loadLevel);
    }

    const rootPath = this.customSkillPaths.get(source);
    if (!rootPath || !(await fs.pathExists(rootPath))) {
      return [];
    }

    const skills: Skill[] = [];
    const skillDirs = await this.scanSkillDirectories(rootPath);

    for (const skillDir of skillDirs) {
      const skill = await this.parseCustomSkill(skillDir, source, loadLevel);
      if (skill) skills.push(skill);
    }

    return skills;
  }

  /**
   * 扫描技能目录
   */
  private async scanSkillDirectories(rootPath: string): Promise<string[]> {
    const skillDirs: string[] = [];

    try {
      const entries = await fs.readdir(rootPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillDir = path.join(rootPath, entry.name);
          const skillPath = path.join(skillDir, 'SKILL.md');

          if (await fs.pathExists(skillPath)) {
            skillDirs.push(skillDir);
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to scan skill directory ${rootPath}:`, error);
    }

    return skillDirs;
  }

  /**
   * 解析自定义技能
   */
  private async parseCustomSkill(
    skillPath: string,
    source: SkillSource,
    loadLevel: SkillLoadLevel,
  ): Promise<Skill | null> {
    try {
      const skillName = path.basename(skillPath);
      const skillId = this.generateCustomSkillId(skillPath, source);

      const skill = await this.parseSkillFile(
        path.join(skillPath, 'SKILL.md'),
        skillName,
        skillName,
        loadLevel,
        SkillType.SKILL,
      );

      if (skill) {
        const rootPath = this.customSkillPaths.get(source)!;

        const customSkill: Skill = {
          ...skill,
          id: skillId,
          location: {
            type: source,
            path: skillPath,
            rootPath: rootPath,
            relativePath: path.relative(rootPath, skillPath),
          },
          isCustom: true,
          isBuiltIn: false,
        };

        // 添加到缓存
        this.addToCache(customSkill);

        return customSkill;
      }

      return null;
    } catch (error) {
      console.warn(`Failed to parse custom skill ${skillPath}:`, error);
      return null;
    }
  }

  /**
   * 生成自定义技能ID
   */
  private generateCustomSkillId(skillPath: string, source: SkillSource): string {
    const rootPath = this.customSkillPaths.get(source)!;
    const relativePath = path.relative(rootPath, skillPath);

    switch (source) {
      case SkillSource.USER_GLOBAL:
        return `user:${relativePath}`;
      case SkillSource.USER_PROJECT:
        const projectName = path.basename(process.cwd());
        return `project:${projectName}:${relativePath}`;
      default:
        return relativePath;
    }
  }

  /**
   * 加载市场技能（保持现有逻辑）
   */
  private async loadMarketplaceSkills(loadLevel: SkillLoadLevel): Promise<Skill[]> {
    try {
      const skills: Skill[] = [];

      // 获取已启用的 Plugins
      const enabledPluginIds = await this.settingsManager.getEnabledPlugins();

      // 遍历每个 Plugin，加载其 Skills
      for (const pluginId of enabledPluginIds) {
        try {
          const pluginSkills = await this.loadPluginSkills(pluginId, loadLevel);
          skills.push(...pluginSkills.map(skill => ({
            ...skill,
            isCustom: false,
            isBuiltIn: true,
          })));
        } catch (error) {
          console.warn(`Failed to load skills for plugin ${pluginId}:`, error);
        }
      }

      return skills;
    } catch (error) {
      console.warn('Failed to load marketplace skills:', error);
      return [];
    }
  }

  /**
   * 加载指定 Plugin 的所有 Skills（保持现有逻辑）
   */
  async loadPluginSkills(
    pluginId: string,
    loadLevel: SkillLoadLevel = SkillLoadLevel.METADATA,
  ): Promise<Skill[]> {
    try {
      // 使用新的 MarketplaceLoader 加载
      const plugins = await this.marketplaceLoader.loadPlugins();
      const targetPlugin = plugins.find(p => p.id === pluginId);

      if (targetPlugin) {
        return targetPlugin.components.map(comp => {
          const skill = this.convertToSkill(comp, loadLevel);
          // 添加到缓存，确保后续 loadSkill 能命中
          this.addToCache(skill);
          return skill;
        });
      }

      return [];
    } catch (error) {
      console.warn(`Failed to load skills for plugin ${pluginId}:`, error);
      return [];
    }
  }

  /**
   * 将 UnifiedComponent 转换为 Skill
   */
  private convertToSkill(component: UnifiedComponent, loadLevel: SkillLoadLevel): Skill {
    // 映射 ComponentType 到 SkillType
    let type = SkillType.SKILL;
    if (component.type === ComponentType.AGENT) type = SkillType.AGENT;
    if (component.type === ComponentType.COMMAND) type = SkillType.COMMAND;

    // 确保 metadata 存在
    const metadata = (component.metadata || {}) as SkillMetadata;
    if (!metadata.name) metadata.name = component.name;
    if (!metadata.description) metadata.description = component.description;

    // 根据加载级别决定是否包含内容 (使用枚举值比较)
    const levelOrder = [
      SkillLoadLevel.METADATA,
      SkillLoadLevel.FULL,
      SkillLoadLevel.RESOURCES,
    ];
    const requestedLevelIndex = levelOrder.indexOf(loadLevel);
    const fullLevelIndex = levelOrder.indexOf(SkillLoadLevel.FULL);

    const content = requestedLevelIndex >= fullLevelIndex ? component.content : undefined;

    return {
      id: component.id,
      type,
      name: component.name,
      description: component.description,
      pluginId: component.pluginId || '',
      marketplaceId: component.marketplaceId || '',
      path: component.location.type === 'directory' ? component.location.path : path.dirname(component.location.path),
      skillFilePath: component.location.path,
      metadata,
      content,
      enabled: component.enabled,
      loadLevel: loadLevel,
      scripts: (component.scripts || []).map(s => ({
        name: s.name,
        path: s.path,
        type: this.detectScriptType(s.name)
      })),
      references: component.references || [],
      isBuiltIn: true,
      isCustom: false,
    };
  }

  /**
   * 加载单个 Skill（按 ID）
   */
  async loadSkill(
    skillId: string,
    loadLevel: SkillLoadLevel = SkillLoadLevel.METADATA,
  ): Promise<Skill | null> {
    // 检查缓存
    const cached = this.getFromCache(skillId, loadLevel);
    if (cached) {
      return cached;
    }

    // 从所有已启用的 Skills 中查找
    const skills = await this.loadEnabledSkills(loadLevel);
    return skills.find((s) => s.id === skillId) || null;
  }

  // ============================================================================
  // 解析 SKILL.md
  // ============================================================================

  /**
   * 解析 SKILL.md 文件
   */
  async parseSkillFile(
    skillPath: string,
    pluginId: string,
    marketplaceId: string,
    loadLevel: SkillLoadLevel = SkillLoadLevel.METADATA,
    type?: SkillType,
  ): Promise<Skill> {
    let skillFilePath = skillPath;
    let skillDirPath = skillPath;

    // Determine path based on type and file existence
    try {
      const stat = await fs.stat(skillPath);
      if (stat.isDirectory()) {
        // If it's a directory, it MUST have a SKILL.md (standard skill structure)
        skillFilePath = path.join(skillPath, 'SKILL.md');
      } else {
        // If it's a file, it IS the skill file (command/agent markdown)
        skillDirPath = path.dirname(skillPath);
      }
    } catch (error) {
      // Path doesn't exist.
      // If type is COMMAND or AGENT, and it ends in .md, assume it's a missing file.
      // Otherwise, assume it's a missing directory that should have SKILL.md
      if ((type === SkillType.COMMAND || type === SkillType.AGENT) && skillPath.endsWith('.md')) {
         skillFilePath = skillPath;
         skillDirPath = path.dirname(skillPath);
      } else {
         skillFilePath = path.join(skillPath, 'SKILL.md');
      }
    }

    try {
      // 检查文件是否存在
      if (!(await fs.pathExists(skillFilePath))) {
        throw new SkillError(
          `Skill file not found: ${skillFilePath}`,
          SkillErrorCode.FILE_NOT_FOUND,
          { path: skillFilePath },
        );
      }

      // 读取文件内容
      const fileContent = await fs.readFile(skillFilePath, 'utf-8');

      // 解析 YAML frontmatter
      const { data, content } = matter(fileContent);

      // 验证元数据（传递文件路径以便从文件名生成 name）
      this.validateMetadata(data, skillFilePath);

      const metadata = data as SkillMetadata;
      const skillName = metadata.name;
      const skillId = `${marketplaceId}:${pluginId.split(':')[1]}:${skillName}`;

      // 构建 Skill 对象（Level 1: 仅元数据）
      const skill: Skill = {
        id: skillId,
        type: type || SkillType.SKILL,
        name: skillName,
        description: metadata.description,
        pluginId,
        marketplaceId,
        path: skillDirPath,
        skillFilePath,
        metadata,
        enabled: true,
        loadLevel: SkillLoadLevel.METADATA,
        isBuiltIn: true,
        isCustom: false,
      };

      // Level 2: 加载完整内容
      if (loadLevel === SkillLoadLevel.FULL || loadLevel === SkillLoadLevel.RESOURCES) {
        skill.content = content.trim();
        skill.loadLevel = SkillLoadLevel.FULL;
      }

      // Level 3: 加载资源和脚本
      if (loadLevel === SkillLoadLevel.RESOURCES) {
        await this.loadSkillResources(skill);
        skill.loadLevel = SkillLoadLevel.RESOURCES;
      }

      // 缓存 Skill
      this.addToCache(skill);

      return skill;
    } catch (error) {
      throw new SkillError(
        `Failed to parse skill file: ${error instanceof Error ? error.message : String(error)}`,
        SkillErrorCode.SKILL_PARSE_FAILED,
        { path: skillFilePath, originalError: error },
      );
    }
  }

  /**
   * 加载 Skill 资源（脚本、引用文档等）
   */
  private async loadSkillResources(skill: Skill): Promise<void> {
    const skillDir = skill.path;

    // 加载脚本
    const scriptsPath = path.join(skillDir, 'scripts');
    if (await fs.pathExists(scriptsPath)) {
      skill.scriptsPath = scriptsPath;
      skill.scripts = await this.discoverScripts(scriptsPath);
    }

    // 加载引用文档
    const references: string[] = [];
    const files = await fs.readdir(skillDir);
    for (const file of files) {
      if (file !== 'SKILL.md' && file.endsWith('.md')) {
        references.push(path.join(skillDir, file));
      }
    }
    if (references.length > 0) {
      skill.references = references;
    }

    // 加载 License
    const licensePath = path.join(skillDir, 'LICENSE.txt');
    if (await fs.pathExists(licensePath)) {
      skill.licensePath = licensePath;
    }
  }

  /**
   * 发现脚本目录中的所有脚本
   */
  private async discoverScripts(scriptsPath: string): Promise<SkillScript[]> {
    const scripts: SkillScript[] = [];

    try {
      const files = await fs.readdir(scriptsPath);

      for (const file of files) {
        const filePath = path.join(scriptsPath, file);
        const stat = await fs.stat(filePath);

        if (stat.isFile()) {
          const scriptType = this.detectScriptType(file);
          scripts.push({
            name: file,
            path: filePath,
            type: scriptType,
          });
        }
      }
    } catch (error) {
      console.warn(`Failed to discover scripts in ${scriptsPath}:`, error);
    }

    return scripts;
  }

  /**
   * 检测脚本类型
   */
  private detectScriptType(filename: string): ScriptType {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case '.py':
        return ScriptType.PYTHON;
      case '.sh':
      case '.bash':
        return ScriptType.BASH;
      case '.js':
      case '.mjs':
      case '.cjs':
        return ScriptType.NODE;
      default:
        return ScriptType.UNKNOWN;
    }
  }

  // ============================================================================
  // 验证
  // ============================================================================

  /**
   * 验证 Skill 元数据
   */
  private validateMetadata(metadata: unknown, skillFilePath?: string): void {
    if (!metadata || typeof metadata !== 'object') {
      throw new ValidationError('Invalid SKILL.md: missing frontmatter');
    }

    const data = metadata as Record<string, unknown>;

    // 验证必需字段
    // 如果没有 name，尝试从文件名生成（支持 Claude Code 格式）
    if (!data.name || typeof data.name !== 'string') {
      if (skillFilePath) {
        // 从文件名生成 name（移除 .md 扩展名，支持 kebab-case）
        const fileName = path.basename(skillFilePath, '.md');
        data.name = fileName;
      } else {
        throw new ValidationError('Invalid SKILL.md: missing or invalid "name" field');
      }
    }

    if (!data.description || typeof data.description !== 'string') {
      throw new ValidationError(
        'Invalid SKILL.md: missing or invalid "description" field',
      );
    }

    // 验证名称规则（小写字母、数字、连字符）
    const nameRegex = /^[a-z0-9-]+$/;
    const nameStr = String(data.name);
    if (!nameRegex.test(nameStr)) {
      throw new ValidationError(
        `Invalid skill name "${nameStr}": must contain only lowercase letters, numbers, and hyphens`,
      );
    }
  }

  // ============================================================================
  // 缓存管理
  // ============================================================================

  /**
   * 添加到缓存
   */
  private addToCache(skill: Skill): void {
    this.cache.set(skill.id, {
      skill: skill,
      timestamp: Date.now(),
      loadLevel: skill.loadLevel,
    });
  }

  /**
   * 从缓存获取
   */
  private getFromCache(skillId: string, loadLevel: SkillLoadLevel): Skill | null {
    const cached = this.cache.get(skillId);

    if (!cached) {
      return null;
    }

    // 检查是否过期
    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.cache.delete(skillId);
      return null;
    }

    // 检查加载级别是否满足
    const levelOrder = [
      SkillLoadLevel.METADATA,
      SkillLoadLevel.FULL,
      SkillLoadLevel.RESOURCES,
    ];
    const cachedLevelIndex = levelOrder.indexOf(cached.loadLevel);
    const requestedLevelIndex = levelOrder.indexOf(loadLevel);

    if (cachedLevelIndex >= requestedLevelIndex) {
      return cached.skill;
    }

    return null;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 清除指定 Skill 的缓存
   */
  clearSkillCache(skillId: string): void {
    this.cache.delete(skillId);
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; skills: string[] } {
    return {
      size: this.cache.size,
      skills: Array.from(this.cache.keys()),
    };
  }

  // ============================================================================
  // 工具方法
  // ============================================================================

  /**
   * 搜索 Skills
   */
  async searchSkills(query: string): Promise<Skill[]> {
    const skills = await this.loadEnabledSkills(SkillLoadLevel.METADATA);
    const lowerQuery = query.toLowerCase();

    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(lowerQuery) ||
        skill.description.toLowerCase().includes(lowerQuery),
    );
  }

  /**
   * 按 Marketplace 分组 Skills
   */
  async getSkillsByMarketplace(): Promise<Map<string, Skill[]>> {
    const skills = await this.loadEnabledSkills(SkillLoadLevel.METADATA);
    const grouped = new Map<string, Skill[]>();

    for (const skill of skills) {
      const marketplaceSkills = grouped.get(skill.marketplaceId) || [];
      marketplaceSkills.push(skill);
      grouped.set(skill.marketplaceId, marketplaceSkills);
    }

    return grouped;
  }

  /**
   * 按 Plugin 分组 Skills
   */
  async getSkillsByPlugin(): Promise<Map<string, Skill[]>> {
    const skills = await this.loadEnabledSkills(SkillLoadLevel.METADATA);
    const grouped = new Map<string, Skill[]>();

    for (const skill of skills) {
      const pluginSkills = grouped.get(skill.pluginId) || [];
      pluginSkills.push(skill);
      grouped.set(skill.pluginId, pluginSkills);
    }

    return grouped;
  }

  /**
   * 获取 Skill 统计信息
   */
  async getSkillStats(): Promise<{
    total: number;
    byMarketplace: Record<string, number>;
    byPlugin: Record<string, number>;
  }> {
    const skills = await this.loadEnabledSkills(SkillLoadLevel.METADATA);

    const byMarketplace: Record<string, number> = {};
    const byPlugin: Record<string, number> = {};

    for (const skill of skills) {
      byMarketplace[skill.marketplaceId] = (byMarketplace[skill.marketplaceId] || 0) + 1;
      byPlugin[skill.pluginId] = (byPlugin[skill.pluginId] || 0) + 1;
    }

    return {
      total: skills.length,
      byMarketplace,
      byPlugin,
    };
  }
}

/**
 * 单例实例（需要在使用时注入依赖）
 */
export const skillLoader = new SkillLoader(
  {} as SettingsManager,
  {} as MarketplaceManager,
);
