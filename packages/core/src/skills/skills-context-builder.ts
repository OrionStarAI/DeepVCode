/**
 * Skills Context Builder
 * Reads installed skills and generates context information for AI
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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

  constructor() {
    const homeDir = os.homedir();
    this.skillsDir = path.join(homeDir, '.deepv', 'skills');
    this.marketplaceDir = path.join(homeDir, '.deepv', 'marketplace');
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
   * Get all available and enabled skills
   */
  private getAvailableSkills(): SkillInfo[] {
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

      // Get marketplace info
      const marketplace = settings.marketplaces.find(
        (m) => m.id === pluginInfo.marketplaceId
      );
      if (!marketplace || !marketplace.enabled) continue;

      // Read marketplace manifest
      const marketplacePath = path.join(
        this.marketplaceDir,
        marketplace.id,
        '.claude-plugin',
        'marketplace.json'
      );

      if (!fs.existsSync(marketplacePath)) continue;

      const manifest: MarketplaceManifest = JSON.parse(
        fs.readFileSync(marketplacePath, 'utf-8')
      );

      // Find plugin definition
      const pluginDef = manifest.plugins.find(
        (p) => p.name === pluginInfo.name
      );
      if (!pluginDef) continue;

      // Process each skill in the plugin
      let skillsList = pluginDef.skills || [];

      // Auto-discovery fallback if no skills defined
      if (!Array.isArray(skillsList) || skillsList.length === 0) {
        const pluginRoot = path.join(
          this.marketplaceDir,
          marketplace.id,
          pluginDef.source || ''
        );
        skillsList = this.discoverComponents(pluginRoot);
      }

      if (!Array.isArray(skillsList)) continue;

      for (const skillRelPath of skillsList) {
        // Construct skill path, taking plugin source into account
        let skillPath = path.join(
          this.marketplaceDir,
          marketplace.id
        );

        // If plugin has a source directory, append it
        if (pluginDef.source) {
          skillPath = path.join(skillPath, pluginDef.source);
        }

        skillPath = path.join(skillPath, skillRelPath);

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

        if (!fs.existsSync(skillMdPath)) continue;

        // Extract skill name from path
        let skillName = path.basename(skillRelPath);
        if (isFileComponent) {
          skillName = path.basename(skillRelPath, '.md');
        }

        skills.push({
          id: `${pluginId}:${skillName}`,
          name: skillName,
          pluginId: pluginInfo.id,
          marketplaceId: marketplace.id,
          description: pluginDef.description,
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
          if (dirName === 'skills' && fs.statSync(fullPath).isDirectory()) {
             if (fs.existsSync(path.join(fullPath, 'SKILL.md')) || fs.existsSync(path.join(fullPath, 'skill.md'))) {
               components.push(path.join(dirName, file));
             }
          }
          // Agents/Commands (markdown files)
          else if ((dirName === 'agents' || dirName === 'commands') && file.endsWith('.md')) {
             components.push(path.join(dirName, file));
          }
        }
      }
    };

    scanDir('skills');
    scanDir('agents');
    scanDir('commands');

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

    // Group skills by plugin
    const skillsByPlugin = new Map<string, SkillInfo[]>();
    for (const skill of skills) {
      if (!skillsByPlugin.has(skill.pluginId)) {
        skillsByPlugin.set(skill.pluginId, []);
      }
      skillsByPlugin.get(skill.pluginId)!.push(skill);
    }

    // Generate output for each plugin
    for (const [pluginId, pluginSkills] of skillsByPlugin) {
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
   * List all available skills (for tool use)
   */
  public listSkills(): SkillInfo[] {
    return this.getAvailableSkills();
  }
}
