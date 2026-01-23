/**
 * Skills Context Builder
 * Reads installed skills and generates context information for AI
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import matter from 'gray-matter';
import { getProjectSkillsDir } from '../utils/paths.js';
import type {
  SkillsSettings,
  InstalledPlugins,
  MarketplaceManifest,
  SkillInfo,
  SkillsContext,
} from './types.js';

export class SkillsContextBuilder {
  private readonly skillsDir: string;
  private readonly marketplaceDir: string;
  private readonly userGlobalSkillsDir: string;
  private readonly projectSkillsDir: string;

  constructor(projectRoot?: string) {
    const homeDir = os.homedir();
    this.skillsDir = path.join(homeDir, '.deepv', 'skills');
    this.marketplaceDir = path.join(homeDir, '.deepv', 'marketplace');
    this.userGlobalSkillsDir = path.join(homeDir, '.deepv', 'skills');
    this.projectSkillsDir = getProjectSkillsDir(projectRoot || process.cwd());
  }

  /**
   * Build complete skills context for AI
   */
  public buildContext(): SkillsContext {
    try {
      const skills = this.getAvailableSkills();

      if (skills.length === 0) {
        return {
          available: false,
          skills: [],
          summary: 'No skills are currently installed.',
        };
      }

      const summary = this.generateSummary(skills);

      return {
        available: true,
        skills,
        summary,
      };
    } catch (error) {
      console.error('Error building skills context:', error);
      return {
        available: false,
        skills: [],
        summary: 'Failed to load skills information.',
      };
    }
  }

  /**
   * Get all available and enabled skills from all sources
   */
  private getAvailableSkills(): SkillInfo[] {
    const allSkills: SkillInfo[] = [];

    // 1. Load marketplace/plugin skills
    allSkills.push(...this.getMarketplaceSkills());

    // 2. Load user global skills
    allSkills.push(...this.getUserGlobalSkills());

    // 3. Load project skills
    allSkills.push(...this.getProjectSkills());

    return allSkills;
  }

  /**
   * Get marketplace skills (original logic)
   */
  private getMarketplaceSkills(): SkillInfo[] {
    const settingsPath = path.join(this.skillsDir, 'settings.json');
    const installedPath = path.join(this.skillsDir, 'installed_plugins.json');

    // Check if files exist
    if (!fs.existsSync(settingsPath) || !fs.existsSync(installedPath)) {
      return [];
    }

    // Read settings and installed plugins
    const settings: SkillsSettings = JSON.parse(
      fs.readFileSync(settingsPath, 'utf-8')
    );
    const installed: InstalledPlugins = JSON.parse(
      fs.readFileSync(installedPath, 'utf-8')
    );

    const skills: SkillInfo[] = [];

    // Iterate through enabled plugins
    for (const [pluginId, enabled] of Object.entries(settings.enabledPlugins)) {
      if (!enabled) continue;

      const pluginInfo = installed.plugins[pluginId];
      if (!pluginInfo) continue;

      // 使用 installPath，如果不存在则 fallback 到 marketplace 目录（向后兼容）
      let pluginRoot: string | undefined = pluginInfo.installPath;
      let skillsList: string[] = [];

      if (!pluginRoot) {
        // 旧数据没有 installPath，尝试从 marketplace.json 中查找
        const found = this.findPluginInMarketplace(
          pluginInfo.marketplaceId,
          pluginInfo.name
        );

        if (!found) {
          console.warn(`[SkillsContextBuilder] Cannot find plugin ${pluginId} in marketplace`);
          continue;
        }

        pluginRoot = found.pluginRoot;
        skillsList = found.skillsList;
        console.log(`[SkillsContextBuilder] No installPath for ${pluginId}, using marketplace path: ${pluginRoot}`);
        console.log(`[SkillsContextBuilder]   - skills from marketplace.json: ${skillsList.length > 0 ? skillsList.join(', ') : '(none, will auto-discover)'}`);
      }

      // 检查插件目录是否存在
      if (!fs.existsSync(pluginRoot)) {
        console.warn(`[SkillsContextBuilder] Plugin directory not found: ${pluginRoot}`);
        continue;
      }

      // 优先使用 marketplace.json 的 skills 数组，如果为空则自动发现
      let discoveredPaths: string[];
      if (skillsList.length > 0) {
        // 使用 marketplace.json 提供的 skills 列表（相对于 pluginRoot）
        discoveredPaths = skillsList;
        console.log(`[SkillsContextBuilder] Using skills from marketplace.json: ${discoveredPaths.length} skill(s)`);
      } else {
        // 自动发现（fallback）
        discoveredPaths = this.discoverComponents(pluginRoot);
        console.log(`[SkillsContextBuilder] Auto-discovered: ${discoveredPaths.length} component(s)`);
      }

      if (discoveredPaths.length === 0) {
        continue;
      }

      console.log(`[SkillsContextBuilder] Processing plugin ${pluginId}: found ${discoveredPaths.length} component(s)`);

      // 处理每个发现的组件
      for (const relPath of discoveredPaths) {
        // relPath 是相对于 pluginRoot 的路径，如 "agents/code-explorer.md"
        const skillPath = path.join(pluginRoot, relPath);

        // Determine MD file path
        let skillMdPath = '';
        let isFileComponent = false;

        if (fs.existsSync(skillPath) && fs.statSync(skillPath).isFile()) {
           // It's a file (Agent/Command)
           skillMdPath = skillPath;
           isFileComponent = true;
        } else {
           // It's a directory (Skill)
           skillMdPath = path.join(skillPath, 'skill.md'); // Try lowercase first as per original code? No, original was 'skill.md'
           if (!fs.existsSync(skillMdPath)) {
             skillMdPath = path.join(skillPath, 'SKILL.md');
           }
        }

        if (!fs.existsSync(skillMdPath)) {
          continue;
        }

        // Extract skill name from path
        let skillName = path.basename(relPath);
        if (isFileComponent) {
          skillName = path.basename(relPath, '.md');
        }

        skills.push({
          id: `${pluginId}:${skillName}`,
          name: skillName,
          pluginId: pluginInfo.id,
          marketplaceId: pluginInfo.marketplaceId,
          description: pluginInfo.description || `Skill from ${pluginInfo.name}`,
          path: isFileComponent ? path.dirname(skillPath) : skillPath,
          skillMdPath: skillMdPath,
          enabled: true,
        });
      }
    }

    return skills;
  }

  /**
   * Discover components in plugin directory
   *
   * 支持两种目录结构（向后兼容）：
   *
   * 新结构（推荐）：
   *   pluginRoot/skills/skill-name/SKILL.md
   *   pluginRoot/agents/agent-name.md
   *   pluginRoot/commands/command-name.md
   *
   * 旧结构（兼容）：
   *   pluginRoot/skill-name/SKILL.md (直接在 pluginRoot 下)
   */
  private discoverComponents(pluginRoot: string): string[] {
    const components: string[] = [];

    if (!fs.existsSync(pluginRoot)) return components;

    const scanDir = (dirName: string) => {
      const dirPath = path.join(pluginRoot, dirName);
      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          if (file.startsWith('.')) continue;
          const fullPath = path.join(dirPath, file);

          // Skills (directories)
          if (dirName.endsWith('skills') && fs.statSync(fullPath).isDirectory()) {
             if (fs.existsSync(path.join(fullPath, 'SKILL.md')) || fs.existsSync(path.join(fullPath, 'skill.md'))) {
               components.push(path.join(dirName, file));
             }
          }
          // Agents/Commands (markdown files)
          else if ((dirName.endsWith('agents') || dirName.endsWith('commands')) && file.endsWith('.md')) {
             components.push(path.join(dirName, file));
          }
        }
      }
    };

    // 优先扫描标准目录（新结构）
    // 增加对 .claude, .cursor, .roo 下约定目录的支持
    const standardDirs = [
      'skills', 'agents', 'commands',
      '.claude/skills', '.claude/agents', '.claude/commands',
      '.cursor/commands', '.roo/commands'
    ];

    for (const dir of standardDirs) {
      scanDir(dir);
    }

    // 兼容旧结构：如果没有找到任何组件，扫描 pluginRoot 的直接子目录
    // 这种情况对应旧版 marketplace.json: "skills": ["./codex-mcp", "./git-commit"]
    if (components.length === 0) {
      console.log(`[SkillsContextBuilder] No components found in standard directories, trying legacy structure...`);

      const files = fs.readdirSync(pluginRoot);
      for (const file of files) {
        if (file.startsWith('.')) continue;
        // 跳过标准目录名（避免重复扫描）
        if (file === 'skills' || file === 'agents' || file === 'commands') continue;
        // 跳过常见的非 skill 目录
        if (file === 'src' || file === 'node_modules' || file === 'dist') continue;

        const fullPath = path.join(pluginRoot, file);
        if (fs.statSync(fullPath).isDirectory()) {
          // 检查是否是 skill (包含 SKILL.md 或 skill.md)
          if (fs.existsSync(path.join(fullPath, 'SKILL.md')) || fs.existsSync(path.join(fullPath, 'skill.md'))) {
            components.push(file); // 旧结构：直接用目录名
            console.log(`[SkillsContextBuilder] ✓ Found legacy skill: ${file}`);
          }
        }
      }
    }

    return components;
  }

  /**
   * Generate summary text for AI context
   */
  private generateSummary(skills: SkillInfo[]): string {
    const lines: string[] = [
      '# 📦 Available Skills',
      '',
      '🚨 **CRITICAL REQUIREMENT - READ THIS CAREFULLY** 🚨',
      '',
      'You have access to pre-installed skills. When a user requests functionality covered by these skills, you MUST follow this exact workflow:',
      '',
      '## Mandatory Workflow:',
      '',
      '1. ✅ **FIRST: Read the COMPLETE skill.md file**',
      '   - Use `read_file` to read the skill\'s `skill.md` file',
      '   - **CRITICAL**: Read the ENTIRE file from start to finish',
      '   - **NEVER set any range limits (offset/limit) when reading skill.md**',
      '   - The skill.md contains essential instructions, workflows, and script usage details',
      '   - Example: `read_file(path="/path/to/skill/skill.md")` - NO offset, NO limit',
      '',
      '2. ✅ **SECOND: Follow EXACT instructions from skill.md**',
      '   - Execute the scripts specified in skill.md',
      '   - Use the exact commands and parameters documented',
      '   - Follow the workflow steps in the order specified',
      '   - Pay attention to "MANDATORY", "CRITICAL", and "IMPORTANT" sections',
      '',
      '3. ❌ **FORBIDDEN: Do NOT write your own implementation**',
      '   - DO NOT create new scripts when a skill provides them',
      '   - DO NOT use alternative libraries or tools',
      '   - DO NOT skip reading the skill.md file',
      '   - DO NOT assume you know how to use the skill without reading documentation',
      '',
      '## Why This Matters:',
      '',
      '- Skills contain **pre-tested, production-ready scripts** that handle edge cases',
      '- skill.md files often contain **critical warnings and requirements** (300-500+ lines)',
      '- Skipping documentation leads to **incorrect implementations** and wasted effort',
      '- Users expect you to use **existing tools correctly**, not reinvent them',
      '',
      '## Installed Skills:',
      '',
    ];

    // Group skills by source/plugin
    const userGlobalSkills: SkillInfo[] = [];
    const projectSkills: SkillInfo[] = [];
    const marketplaceSkillsByPlugin = new Map<string, SkillInfo[]>();

    for (const skill of skills) {
      if (skill.marketplaceId === 'user-global') {
        userGlobalSkills.push(skill);
      } else if (skill.marketplaceId === 'user-project') {
        projectSkills.push(skill);
      } else {
        if (!marketplaceSkillsByPlugin.has(skill.pluginId)) {
          marketplaceSkillsByPlugin.set(skill.pluginId, []);
        }
        marketplaceSkillsByPlugin.get(skill.pluginId)!.push(skill);
      }
    }

    // Output user global skills
    if (userGlobalSkills.length > 0) {
      lines.push(`### User Global Skills (~/.deepv/skills/)`);
      lines.push(`*Custom skills installed globally for this user*`);
      lines.push('');

      for (const skill of userGlobalSkills) {
        lines.push(`- **${skill.name}** (ID: \`${skill.id}\`)`);
        lines.push(`  - 📍 **Skill Path**: \`${skill.path}\``);
        lines.push(`  - 📖 **Documentation**: \`${skill.skillMdPath}\``);
        lines.push(`  - 🔧 **Usage Instructions**:`);
        lines.push(`    1. Read the COMPLETE skill.md: \`read_file("${skill.skillMdPath}")\` (NO offset/limit!)`);
        lines.push(`    2. Follow ALL instructions, workflows, and requirements in skill.md`);
        lines.push(`    3. Execute the scripts specified in the documentation`);
        lines.push(`    4. DO NOT create your own implementation`);
        lines.push('');
      }
    }

    // Output project skills
    if (projectSkills.length > 0) {
      lines.push(`### Project Skills (.deepvcode/skills/)`);
      lines.push(`*Custom skills specific to this project*`);
      lines.push('');

      for (const skill of projectSkills) {
        lines.push(`- **${skill.name}** (ID: \`${skill.id}\`)`);
        lines.push(`  - 📍 **Skill Path**: \`${skill.path}\``);
        lines.push(`  - 📖 **Documentation**: \`${skill.skillMdPath}\``);
        lines.push(`  - 🔧 **Usage Instructions**:`);
        lines.push(`    1. Read the COMPLETE skill.md: \`read_file("${skill.skillMdPath}")\` (NO offset/limit!)`);
        lines.push(`    2. Follow ALL instructions, workflows, and requirements in skill.md`);
        lines.push(`    3. Execute the scripts specified in the documentation`);
        lines.push(`    4. DO NOT create your own implementation`);
        lines.push('');
      }
    }

    // Output marketplace/plugin skills
    for (const [pluginId, pluginSkills] of marketplaceSkillsByPlugin) {
      const firstSkill = pluginSkills[0];
      lines.push(`### ${pluginId}`);
      lines.push(`*${firstSkill.description}*`);
      lines.push('');

      for (const skill of pluginSkills) {
        lines.push(`- **${skill.name}** (ID: \`${skill.id}\`)`);
        lines.push(`  - 📍 **Skill Path**: \`${skill.path}\``);
        lines.push(`  - 📖 **Documentation**: \`${skill.skillMdPath}\``);
        lines.push(`  - 🔧 **Usage Instructions**:`);
        lines.push(`    1. Read the COMPLETE skill.md: \`read_file("${skill.skillMdPath}")\` (NO offset/limit!)`);
        lines.push(`    2. Follow ALL instructions, workflows, and requirements in skill.md`);
        lines.push(`    3. Execute the scripts specified in the documentation`);
        lines.push(`    4. DO NOT create your own implementation`);
        lines.push('');
      }
    }

    lines.push('---');
    lines.push('');
    lines.push('## 🎯 Example: Correct Workflow');
    lines.push('');
    lines.push('```');
    lines.push('User: "Create a PowerPoint presentation about AI"');
    lines.push('');
    lines.push('✅ CORRECT approach:');
    lines.push('1. AI sees "pptx" skill is available');
    lines.push('2. AI reads COMPLETE skill.md: read_file("~/.deepv/marketplace/skills/document-skills/pptx/skill.md")');
    lines.push('3. AI discovers the skill.md contains 300+ lines with detailed workflows');
    lines.push('4. AI reads sections marked "MANDATORY - READ ENTIRE FILE"');
    lines.push('5. AI follows the documented workflow (e.g., html2pptx method)');
    lines.push('6. AI uses the exact scripts specified in skill.md');
    lines.push('');
    lines.push('❌ WRONG approach:');
    lines.push('1. AI sees "pptx" skill exists');
    lines.push('2. AI assumes it knows how PowerPoint works');
    lines.push('3. AI writes custom Node.js script using pptxgenjs');
    lines.push('4. AI violates skill usage requirements');
    lines.push('```');
    lines.push('');
    lines.push('## ⚠️ Critical Reminders:');
    lines.push('');
    lines.push('- 📚 **Read skill.md COMPLETELY** - these files are 100-500+ lines with critical details');
    lines.push('- 🚫 **NEVER use offset/limit** when reading skill.md - you MUST read the entire file');
    lines.push('- ⚡ **Follow workflows exactly** - skills provide tested, production-ready solutions');
    lines.push('- 🔍 **Pay attention to warnings** - skill.md files contain "MANDATORY", "CRITICAL", "IMPORTANT" sections');
    lines.push('- 💡 **Use provided scripts** - do not reinvent what already exists and works');
    lines.push('- ❌ **Creating your own implementation when a skill exists is a violation of system rules**');

    return lines.join('\n');
  }

  /**
   * Get detailed information about a specific skill
   */
  public getSkillDetails(skillId: string): SkillInfo | null {
    const skills = this.getAvailableSkills();
    return skills.find((s) => s.id === skillId) || null;
  }

  /**
   * Get user global skills (from ~/.deepv/skills/)
   */
  private getUserGlobalSkills(): SkillInfo[] {
    return this.scanCustomSkills(this.userGlobalSkillsDir, 'user-global');
  }

  /**
   * Get project skills (from {project}/.deepvcode/skills/)
   */
  private getProjectSkills(): SkillInfo[] {
    return this.scanCustomSkills(this.projectSkillsDir, 'user-project');
  }

  /**
   * Scan custom skill directories (user global or project level)
   * 从 SKILL.md 的 frontmatter 中提取描述
   */
  private scanCustomSkills(rootDir: string, source: string): SkillInfo[] {
    const skills: SkillInfo[] = [];

    if (!fs.existsSync(rootDir)) {
      return skills;
    }

    try {
      const entries = fs.readdirSync(rootDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const skillDir = path.join(rootDir, entry.name);
        const skillMdPath = path.join(skillDir, 'SKILL.md');

        if (!fs.existsSync(skillMdPath)) {
          continue;
        }

        const skillName = entry.name;
        const skillId = `${source}:${skillName}`;

        // 从 SKILL.md 的 frontmatter 中提取描述
        let description = `Skill from ${source}`;
        try {
          const content = fs.readFileSync(skillMdPath, 'utf-8');
          const parsed = matter(content);

          // 使用 frontmatter 中的 description
          if (parsed.data.description && typeof parsed.data.description === 'string') {
            description = parsed.data.description;
          }
        } catch (error) {
          console.warn(`[SkillsContextBuilder] Failed to parse frontmatter from ${skillMdPath}:`, error);
          // 降级：使用默认描述
        }

        skills.push({
          id: skillId,
          name: skillName,
          pluginId: source,
          marketplaceId: source,
          description,
          path: skillDir,
          skillMdPath: skillMdPath,
          enabled: true,
        });
      }
    } catch (error) {
      console.warn(`[SkillsContextBuilder] Failed to scan ${source} skills at ${rootDir}:`, error);
    }

    return skills;
  }

  /**
   * 查找插件在 marketplace 中的路径（用于向后兼容旧数据）
   * @param marketplaceId Marketplace ID
   * @param pluginName Plugin name
   * @returns Plugin info with root path and skills list, or null
   */
  private findPluginInMarketplace(
    marketplaceId: string,
    pluginName: string
  ): { pluginRoot: string; skillsList: string[] } | null {
    const marketplacePath = path.join(this.marketplaceDir, marketplaceId);
    const marketplaceJsonPath = path.join(marketplacePath, '.claude-plugin', 'marketplace.json');

    // 检查 marketplace.json 是否存在
    if (!fs.existsSync(marketplaceJsonPath)) {
      // Fallback: 尝试常见路径（没有 marketplace.json，只能用自动发现）
      const fallbackPaths = [
        path.join(marketplacePath, 'plugins', pluginName),
        path.join(marketplacePath, pluginName),
      ];

      for (const fallbackPath of fallbackPaths) {
        if (fs.existsSync(fallbackPath)) {
          // 返回路径和空的 skills 列表（触发自动发现）
          return { pluginRoot: fallbackPath, skillsList: [] };
        }
      }

      return null;
    }

    try {
      const marketplaceJson = JSON.parse(fs.readFileSync(marketplaceJsonPath, 'utf-8')) as MarketplaceManifest;
      const plugin = marketplaceJson.plugins?.find((p: any) => p.name === pluginName);

      if (!plugin?.source) {
        return null;
      }

      // 解析 source 路径
      if (typeof plugin.source === 'string') {
        // 相对路径，如 "./plugins/ccode-skills"
        const sourcePath = plugin.source.startsWith('./') || plugin.source.startsWith('../')
          ? path.join(marketplacePath, plugin.source)
          : path.join(marketplacePath, plugin.source);

        if (!fs.existsSync(sourcePath)) {
          return null;
        }

        // 获取 skills 列表（如果有）
        const skillsList = Array.isArray(plugin.skills) ? plugin.skills : [];

        return {
          pluginRoot: sourcePath,
          skillsList: skillsList  // 可能是空数组，会触发自动发现
        };
      }

      return null;
    } catch (error) {
      console.warn(`[SkillsContextBuilder] Failed to parse marketplace.json for ${marketplaceId}:`, error);
      return null;
    }
  }

  /**
   * List all available skills (for tool use)
   */
  public listSkills(): SkillInfo[] {
    return this.getAvailableSkills();
  }
}
