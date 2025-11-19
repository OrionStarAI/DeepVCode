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
      const { fileURLToPath } = await import('url');

      // Get current file's directory
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);

      // Resolve path to cli package: from packages/core/dist/src/tools/ to packages/cli/dist/src/services/skill/
      const skillModulePath = path.resolve(__dirname, '../../../../cli/dist/src/services/skill/index.js');

      const {
        SkillContextInjector,
        SkillLoader,
        SettingsManager,
        MarketplaceManager,
        SkillLoadLevel,
      } = await import(skillModulePath);

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
- Skill name is incorrect (check spelling and case)
- Skill is not installed (use /skill list to see all skills)
- Plugin is disabled

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
      const skillRootDir = (skill as any).path || 'skill-directory';
      const scriptsDir = (skill as any).scriptsPath || `${skillRootDir}/scripts`;

      // Format output with clear structure and strong emphasis on scripts
      let output = '';

      if (hasScripts) {
        // For skills with scripts, generate script list with actual paths
        const scriptReferences = skill.scripts!
          .map((s: any) => {
            const scriptPath = `${scriptsDir}/${s.name}`;
            return `  • ${s.name}\n    Path: ${scriptPath}`;
          })
          .join('\n');

        output = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 STOP - READ THIS FIRST - DO NOT SKIP 🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<critical_alert>
This skill has EXECUTABLE SCRIPTS - USE THEM DIRECTLY (DO NOT CREATE NEW SCRIPTS):

${scriptReferences}

❌ YOU MUST NOT WRITE NEW CODE
❌ YOU MUST NOT create JavaScript/Python/Bash scripts
❌ YOU MUST NOT use pptxgenjs, html2pptx npm lib, puppeteer, or ANY other library
❌ DO NOT create helper scripts (generate-ppt.js, create-slides.py, etc.)
❌ DO NOT duplicate or wrap these existing scripts

✅ YOU MUST ONLY use the scripts provided by this skill
✅ YOU MUST ONLY execute them with run_shell_command
✅ YOU MUST read the documentation below to find the exact command syntax

Skill root directory: ${skillRootDir}
Scripts directory: ${scriptsDir}

WHY THIS IS NON-NEGOTIABLE:
- The skill's scripts are pre-tested and production-ready
- They are already optimized and work correctly
- Writing new code violates system rules
- You will be corrected if you write code instead of using scripts
- This is a BINARY choice: use scripts OR refuse (no third option)

NEXT: Read the documentation below to find the exact workflow and command.
Look for "Workflow", "Usage", "Command" sections that show how to run the scripts.
Then execute with: run_shell_command("cd ${skillRootDir} && [exact-command-from-docs]")
</critical_alert>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<skill_loaded>
Skill "${params.skillName}" SKILL.md documentation:
</skill_loaded>

${fullContent}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<mandatory_next_steps>
NOW THAT YOU'VE READ THE SKILL.MD DOCUMENTATION:

1. FIND THE WORKFLOW SECTION
   - Look for sections titled "Workflow", "Usage", "Command", or similar
   - Locate the exact command syntax with the script name and parameters

2. CONSTRUCT THE COMPLETE COMMAND
   - Scripts are located in: ${scriptsDir}/
   - Example command format: cd ${skillRootDir} && node scripts/html2pptx.js input.html output.pptx
   - Example command format: cd ${skillRootDir} && python3 scripts/thumbnail.py presentation.pptx output/
   - Replace placeholders with actual file paths/values

3. EXECUTE THE SCRIPT with run_shell_command
   Exact format: run_shell_command("cd ${skillRootDir} && [full-command-from-docs]")

VERIFICATION CHECKLIST BEFORE EXECUTING:
□ Did you find the exact command from the SKILL.md documentation above?
□ Are you using the scripts from ${scriptsDir}/ (actual paths provided)?
□ Are you about to use run_shell_command (not write_file)?
□ Have you identified all required parameters from the documentation?
□ Did you verify these scripts already exist at ${scriptsDir}/?
□ Did you NOT decide to "write a script" or "create a helper"?

If all checks pass ✓, proceed with run_shell_command.
If any check fails ✗, re-read the SKILL.md documentation above.

⚠️  CRITICAL: If you write any new code files after seeing this message, you are violating instructions.
The scripts are already at ${scriptsDir}/ - use them directly.
</mandatory_next_steps>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
      } else {
        // For skills without scripts (knowledge-only)
        output = `<skill_loaded>
✅ Skill "${params.skillName}" is now active!
</skill_loaded>

${fullContent}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<next_steps>
This skill provides domain knowledge and guidelines.
Follow the instructions above to complete the user's task.
</next_steps>`;
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