/**
 * Use Skill Tool
 *
 * Allows AI to activate a skill and load its full instructions (Level 2).
 * Similar to Claude Code's Skill tool.
 */

import {
  BaseTool,
  Icon,
  type ToolResult,
  type ToolCallConfirmationDetails,
  type ToolLocation,
} from './tools.js';
import { Type } from '@google/genai';

interface UseSkillParams {
  /** The skill name to activate (e.g., "pdf" or "test-pdf") */
  skillName: string;
}

/**
 * UseSkillTool - Activate a skill and load its instructions
 *
 * This tool provides a clean interface for AI to activate skills,
 * similar to Claude Code's implementation.
 */
export class UseSkillTool extends BaseTool<UseSkillParams, ToolResult> {
  constructor() {
    super(
      'use_skill',
      'Use Skill',
      `Execute a skill and MUST follow its scripts if provided

<skills_instructions>
When users ask you to perform tasks, check if any available skills can help.

🚨 CRITICAL RULE FOR SKILLS WITH SCRIPTS (marked with 📜 or <has_scripts>true</has_scripts>):

YOU MUST FOLLOW THIS WORKFLOW - NO EXCEPTIONS:
1. Invoke the skill using use_skill(skillName="...")
2. Wait for the skill to load (you'll see <skill_loaded> message with scripts info)
3. READ the script usage instructions carefully
4. EXECUTE the script using run_shell_command with the EXACT syntax from the docs
5. ❌ NEVER write new JavaScript/Python/Bash code
6. ❌ NEVER use alternative libraries (pptxgenjs, puppeteer, html-to-pptx, etc.)
7. ❌ NEVER create helper scripts or duplicate existing scripts

The skill loads will show you the exact scripts available and their exact file paths.

Important:
- Only use skills listed in <available_skills>
- Skills with 📜 or <has_scripts>true</has_scripts> MUST use their scripts
- Do not guess script syntax - always use_skill first to see exact commands
- For knowledge-only skills (no scripts), follow the guidance provided
</skills_instructions>`,
      Icon.LightBulb,
      {
        type: Type.OBJECT,
        properties: {
          skillName: {
            type: Type.STRING,
            description: 'The skill name to activate (no arguments). E.g., "pdf", "test-pdf", "xlsx"',
          },
        },
        required: ['skillName'],
      },
      false, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  override validateToolParams(params: UseSkillParams): string | null {
    if (!params.skillName || typeof params.skillName !== 'string') {
      return 'skillName is required and must be a string';
    }

    if (params.skillName.trim().length === 0) {
      return 'skillName cannot be empty';
    }

    return null;
  }

  override getDescription(params: UseSkillParams): string {
    return `Loading skill: ${params.skillName}`;
  }

  override toolLocations(params: UseSkillParams): ToolLocation[] {
    return []; // Skills don't affect file system
  }

  override async shouldConfirmExecute(
    params: UseSkillParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    // No confirmation needed - just loading documentation
    return false;
  }

  override async execute(
    params: UseSkillParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `❌ Invalid parameters: ${validationError}`,
        returnDisplay: `Invalid parameters: ${validationError}`,
      };
    }

    try {
      // Dynamic import with runtime path resolution to avoid TypeScript compile-time errors
      // This works because at runtime, both packages are compiled
      const path = await import('path');
      const { pathToFileURL } = await import('url');

      // Get skill module path using cross-platform safe method
      // In VSCode extension: use global __extensionPath if available
      // In CLI: use process.cwd() based resolution
      // In dev: use relative path from __dirname
      let skillModulePath: string;

      // Check if we're in VSCode extension environment (extensionPath is set globally)
      const extensionPath = (globalThis as any).__extensionPath;
      if (extensionPath) {
        // VSCode extension environment - skills are not available in bundled extension
        // The skill system is only available in CLI mode
        return {
          llmContent: `❌ Skill system is not available in VSCode extension mode.

The skill system requires the CLI environment to function.
Skills are designed for the DeepV Code CLI, not the VSCode extension.

To use skills, please run DeepV Code from the command line.`,
          returnDisplay: 'Skill system not available in VSCode extension',
        };
      }

      // CLI environment - resolve path relative to process.cwd() or known CLI structure
      // Try multiple possible locations
      const possiblePaths = [
        // When running from CLI dist
        path.resolve(process.cwd(), 'dist', 'src', 'services', 'skill', 'index.js'),
        // When running from monorepo root
        path.resolve(process.cwd(), 'packages', 'cli', 'dist', 'src', 'services', 'skill', 'index.js'),
        // Fallback: try to find via node_modules resolution
      ];

      const fs = await import('fs');
      skillModulePath = '';
      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          skillModulePath = testPath;
          break;
        }
      }

      if (!skillModulePath) {
        return {
          llmContent: `❌ Skill system module not found.

The skill system requires the CLI to be properly built.
Please ensure you have run 'npm run build' in the project root.`,
          returnDisplay: 'Skill module not found',
        };
      }

      const {
        SkillContextInjector,
        SkillLoader,
        SettingsManager,
        MarketplaceManager,
        SkillLoadLevel,
      } = await import(pathToFileURL(skillModulePath).href);

      // Initialize Skills system
      const settings = new SettingsManager();
      await settings.initialize();

      const marketplace = new MarketplaceManager(settings);
      const loader = new SkillLoader(settings, marketplace);
      const injector = new SkillContextInjector(loader, settings);

      // Find the skill by name
      const skills = await loader.loadEnabledSkills(SkillLoadLevel.RESOURCES);

      // 更健壮的匹配逻辑：支持多种格式
      const normalizedSearchName = params.skillName.toLowerCase().trim();
      const matchingSkills = skills.filter((s: any) => {
        const skillName = (s.name || '').toLowerCase().trim();
        const skillId = (s.id || '').toLowerCase();

        // 精确匹配 name
        if (skillName === normalizedSearchName) return true;

        // 匹配 ID 的末尾部分（支持 user:xxx, project:xxx:xxx 等格式）
        if (skillId.endsWith(`:${normalizedSearchName}`)) return true;

        // 匹配 ID 本身（如果用户输入完整 ID）
        if (skillId === normalizedSearchName) return true;

        // 部分匹配（如果 name 包含搜索词）
        if (skillName.includes(normalizedSearchName)) return true;

        return false;
      });

      if (matchingSkills.length === 0) {
        const availableSkills = skills.map((s: any) => `${s.name} (id: ${s.id})`).join(', ');
        return {
          llmContent: `❌ Skill "${params.skillName}" not found.

Available skills (${skills.length} total): ${availableSkills || 'none'}

Possible issues:
- Skill name is incorrect (check spelling and case)
- Skill is not installed (use /skill list to see all skills)
- Plugin is disabled
- Skill is in a different location (user-global vs project-level)

To see detailed skill information, check the "Available Skills" section in the system context.`,
          returnDisplay: `Skill "${params.skillName}" not found`,
        };
      }

      const skill = matchingSkills[0];

      // Load Level 2 (full SKILL.md)
      const fullContent = await injector.loadSkillLevel2(skill.id);

      // Check if skill has scripts
      const hasScripts = skill.scripts && skill.scripts.length > 0;

      // Get actual skill paths from the skill object
      if (!(skill as any).path) {
        return {
          llmContent: `❌ Internal error: Skill ${skill.id} is missing required 'path' property.

This indicates a corrupted skill installation. Please try:
1. Reinstalling the skill
2. Running /skill list to verify skill status
3. Checking the skill configuration

If the problem persists, this may be a system bug.`,
          returnDisplay: `Skill "${params.skillName}" configuration error`,
        };
      }
      const skillRootDir = (skill as any).path;
      const scriptsDir = (skill as any).scriptsPath || `${skillRootDir}/scripts`;

      // 格式化输出：简洁清晰
      let output = '';

      if (hasScripts) {
        // For skills with scripts, generate simple script list
        const scriptList = skill.scripts!
          .map((s: any) => `- ${s.name}`)
          .join('\n');

        output = [
          `## Skill: ${skill.name}`,
          ``,
          `**Base directory**: ${skillRootDir}`,
          `**Scripts directory**: ${scriptsDir}`,
          ``,
          `**Available scripts**:`,
          scriptList,
          ``,
          fullContent
        ].join('\n');
      } else {
        // For skills without scripts (knowledge-only)
        output = [
          `## Skill: ${skill.name}`,
          ``,
          `**Base directory**: ${skillRootDir}`,
          ``,
          fullContent
        ].join('\n');
      }

      return {
        llmContent: output,
        returnDisplay: `✅ Loaded skill: ${params.skillName}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        llmContent: `❌ Error loading skill: ${errorMessage}

This could mean:
- Skills system is not properly initialized
- Skill files are missing or corrupted
- System configuration error

Troubleshooting steps:
1. Restart the application to reinitialize the skills system
2. Use /skill list to verify the skill is installed
3. Check that the skill's SKILL.md file exists
4. Review application logs for detailed error information`,
        returnDisplay: `❌ Error: ${errorMessage}`,
      };
    }
  }
}