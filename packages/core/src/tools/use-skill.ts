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
      `Activate a skill and load its full instructions and documentation.

**When to use this tool:**
- When you see a skill marked with 📜 (has scripts) in the Available Skills list
- Before executing any skill's scripts - you MUST load the skill first
- To get detailed usage instructions, script syntax, and parameters

**How it works:**
1. You call this tool with the skill name (e.g., "pdf" or "test-pdf")
2. The system loads the skill's full SKILL.md content
3. You receive detailed instructions on how to use the skill's scripts
4. Then you can execute the scripts using run_shell_command

**Example workflow:**
\`\`\`
User: "Fill this PDF form"
AI sees: "test-pdf" skill has fill_form.py script
AI: use_skill(skillName="test-pdf")
System: [Returns full SKILL.md with exact command syntax]
AI: [Reads command: "python3 scripts/fill_form.py input.pdf data.json output.pdf"]
AI: run_shell_command("python3 /path/to/scripts/fill_form.py ...")
\`\`\`

**IMPORTANT:**
- Always use this tool before executing skill scripts
- The skill name is shown in the Available Skills section
- This loads the SKILL.MD which contains exact command syntax
- Do NOT try to guess script commands without loading the skill first`,
      Icon.LightBulb,
      {
        type: Type.OBJECT,
        properties: {
          skillName: {
            type: Type.STRING,
            description: 'The skill name to activate (e.g., "pdf", "test-pdf", "xlsx")',
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
      // Dynamic import to avoid circular dependencies
      const {
        SkillContextInjector,
        SkillLoader,
        SettingsManager,
        MarketplaceManager,
        SkillLoadLevel,
      } = await import('../../../cli/dist/src/services/skill/index.js');

      // Initialize Skills system
      const settings = new SettingsManager();
      await settings.initialize();

      const marketplace = new MarketplaceManager(settings);
      const loader = new SkillLoader(settings, marketplace);
      const injector = new SkillContextInjector(loader, settings);

      // Find the skill by name
      const skills = await loader.loadEnabledSkills(SkillLoadLevel.RESOURCES);
      const matchingSkills = skills.filter(
        (s: any) => s.name === params.skillName || s.id.endsWith(`:${params.skillName}`),
      );

      if (matchingSkills.length === 0) {
        const availableSkills = skills.map((s: any) => s.name).join(', ');
        return {
          llmContent: `❌ Skill "${params.skillName}" not found.

Available skills: ${availableSkills || 'none'}

Possible issues:
- Skill name is incorrect
- Skill is not installed
- Plugin is disabled

Use /skill list to see all available skills.`,
          returnDisplay: `Skill "${params.skillName}" not found`,
        };
      }

      const skill = matchingSkills[0];

      // Load Level 2 (full SKILL.md)
      const fullContent = await injector.loadSkillLevel2(skill.id);

      // Format output
      const output = `✅ Skill "${params.skillName}" loaded successfully!

${fullContent}

---

**Next steps:**
1. Read the instructions above carefully
2. Note the exact command syntax for each script
3. Execute scripts using run_shell_command with the documented syntax
4. DO NOT write new code - use the provided scripts`;

      return {
        llmContent: output,
        returnDisplay: `Loaded skill: ${params.skillName}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        llmContent: `❌ Error loading skill: ${errorMessage}

This could mean:
- Skills system is not initialized
- Skill files are corrupted
- System error occurred

Try:
- Restart the application
- Check skill installation with /skill list
- Verify SKILL.md file exists`,
        returnDisplay: `Error loading skill: ${errorMessage}`,
      };
    }
  }
}