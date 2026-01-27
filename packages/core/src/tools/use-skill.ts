/**
 * Use Skill Tool
 *
 * Allows AI to activate a skill and load its full instructions (Level 2).
 * Similar to Claude Code's Skill tool.
 *
 * This tool now directly imports from the skills module in core package,
 * eliminating the need for dynamic path resolution that was problematic
 * in bundled environments.
 */

import {
  BaseTool,
  Icon,
  type ToolResult,
  type ToolCallConfirmationDetails,
  type ToolLocation,
} from './tools.js';
import { Type } from '@google/genai';

import path from 'path';

// Direct imports from skills module - no dynamic path resolution needed
import {
  SkillContextInjector,
  SkillLoader,
  SettingsManager,
  MarketplaceManager,
  SkillLoadLevel,
  SkillsPaths,
  type Skill,
} from '../skills/index.js';

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

  override toolLocations(_params: UseSkillParams): ToolLocation[] {
    return []; // Skills don't affect file system
  }

  override async shouldConfirmExecute(
    _params: UseSkillParams,
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

      // Initialize Skills system - directly using imported modules
      const settings = new SettingsManager();
      await settings.initialize();

      const marketplace = new MarketplaceManager(settings);
      const loader = new SkillLoader(settings, marketplace);
      const injector = new SkillContextInjector(loader, settings);

      // Find the skill by name
      const skills = await loader.loadEnabledSkills(SkillLoadLevel.RESOURCES);

      // Debug logging for skill discovery issues
      if (process.env.DEBUG_SKILLS) {
        console.log(`[use_skill] Loaded ${skills.length} skills from SkillLoader:`);
        skills.forEach((s: Skill) => {
          console.log(`  - ${s.name} (id: ${s.id}, isCustom: ${s.isCustom}, location: ${s.location?.type || 'N/A'})`);
        });
      }

      // 更健壮的匹配逻辑：支持多种格式
      const normalizedSearchName = params.skillName.toLowerCase().trim();
      const matchingSkills = skills.filter((s: Skill) => {
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
        const availableSkills = skills.map((s: Skill) => `${s.name} (id: ${s.id})`).join(', ');
        const availableNames = skills.map((s: Skill) => s.name).sort().join(', ');
        const availableIds = skills.map((s: Skill) => s.id).sort().join(', ');

        return {
          llmContent: `❌ Skill "${params.skillName}" not found.

📊 Debug Information:
  - Your search: "${params.skillName}"
  - Normalized search: "${normalizedSearchName}"
  - Total skills loaded: ${skills.length}
  - Loader source: SkillLoader.loadEnabledSkills()

📋 Available skills (${skills.length} total):
  By name: ${availableNames || 'none'}

  By ID: ${availableIds || 'none'}

🔍 Possible issues:
  - Skill name is incorrect (check spelling and case-sensitivity)
  - Skill is not installed (use /skill list to see all skills)
  - Plugin is disabled (use /skill plugin list to check status)
  - Skill is in a different location (user-global vs project-level)
  - ⚠️ Inconsistency between list and use_skill (this may be a bug)

💡 Troubleshooting steps:
  1. Run: /skill list (to see all discoverable skills)
  2. If you can see the skill with /skill list but not here, this indicates a
     skill discovery inconsistency - please report this as a bug
  3. Check plugin status: /skill plugin list
  4. Try using the full skill ID instead of just the name

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
      if (!skill.path) {
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
      const skillRootDir = skill.path;
      const scriptsDir = skill.scriptsPath || `${skillRootDir}/scripts`;

      // Determine plugin root directory based on skill source
      let pluginRootDir = '';
      if (skill.marketplaceId) {
        // Marketplace skills: plugin root is ~/.deepv/marketplace/{marketplaceId}
        pluginRootDir = path.join(SkillsPaths.MARKETPLACE_ROOT, skill.marketplaceId);
      } else if (skill.location?.rootPath) {
        // Use location.rootPath if available
        pluginRootDir = skill.location.rootPath;
      }

      // 格式化输出：简洁清晰
      let output = '';

      // Build path info section
      const pathInfoLines = [
        `**Skill directory**: ${skillRootDir}`,
      ];

      if (pluginRootDir && pluginRootDir !== skillRootDir) {
        pathInfoLines.unshift(`**Plugin root directory**: ${pluginRootDir}`);
      }

      if (hasScripts) {
        // For skills with scripts, generate simple script list
        const scriptList = skill.scripts!
          .map((s) => `- ${s.name} (${s.path})`)
          .join('\n');

        pathInfoLines.push(`**Scripts directory**: ${scriptsDir}`);

        output = [
          `## Skill: ${skill.name}`,
          ``,
          ...pathInfoLines,
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
          ...pathInfoLines,
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
