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
      for (const skillRelPath of pluginDef.skills) {
        const skillPath = path.join(
          this.marketplaceDir,
          marketplace.id,
          skillRelPath
        );
        const skillMdPath = path.join(skillPath, 'skill.md');

        if (!fs.existsSync(skillMdPath)) continue;

        // Extract skill name from path
        const skillName = path.basename(skillRelPath);

        skills.push({
          id: `${pluginId}:${skillName}`,
          name: skillName,
          pluginId: pluginInfo.id,
          marketplaceId: marketplace.id,
          description: pluginDef.description,
          path: skillPath,
          skillMdPath: skillMdPath,
          enabled: true,
        });
      }
    }

    return skills;
  }

  /**
   * Generate summary text for AI context
   */
  private generateSummary(skills: SkillInfo[]): string {
    const lines: string[] = [
      '# 📦 Available Skills',
      '',
      'You have access to pre-installed skills. When a user requests functionality covered by these skills, you MUST:',
      '1. **First**, use `read_file` to read the skill\'s `skill.md` file',
      '2. **Follow** the exact instructions in `skill.md` to use the provided scripts',
      '3. **DO NOT** write your own scripts when a skill already provides the functionality',
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
        lines.push(`- **${skill.name}**`);
        lines.push(`  - Path: \`${skill.path}\``);
        lines.push(`  - Documentation: \`${skill.skillMdPath}\``);
        lines.push(`  - Usage: Read skill.md first, then execute the scripts specified within`);
        lines.push('');
      }
    }

    lines.push('## ⚠️ Important:');
    lines.push('- Always check if a skill exists for the requested functionality');
    lines.push('- Read the skill.md file to understand how to use the skill');
    lines.push('- Use `run_shell_command` to execute the scripts specified in skill.md');
    lines.push('- Only create your own implementation if no suitable skill exists');

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
