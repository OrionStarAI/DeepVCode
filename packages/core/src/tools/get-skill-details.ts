/**
 * Get Skill Details Tool
 *
 * Gets detailed information about a specific skill.
 */

import {
  BaseTool,
  Icon,
  type ToolResult,
  type ToolCallConfirmationDetails,
  type ToolLocation,
} from './tools.js';
import { Type } from '@google/genai';
import { SkillsContextBuilder } from '../skills/skills-context-builder.js';

interface GetSkillDetailsParams {
  /** The skill ID to get details for */
  skillId: string;
}

/**
 * GetSkillDetailsTool - Get detailed information about a specific skill
 */
export class GetSkillDetailsTool extends BaseTool<GetSkillDetailsParams, ToolResult> {
  private contextBuilder: SkillsContextBuilder;

  constructor() {
    super(
      'get_skill_details',
      'Get Skill Details',
      'Gets detailed information about a specific skill, including its full path, documentation location, and usage instructions.',
      Icon.Info,
      {
        type: Type.OBJECT,
        properties: {
          skillId: {
            type: Type.STRING,
            description: 'The skill ID (e.g., "skills:document-skills:xlsx")',
          },
        },
        required: ['skillId'],
      },
      false, // isOutputMarkdown
      false, // canUpdateOutput
    );

    this.contextBuilder = new SkillsContextBuilder();
  }

  override validateToolParams(params: GetSkillDetailsParams): string | null {
    if (!params.skillId || typeof params.skillId !== 'string') {
      return 'skillId is required and must be a string';
    }

    if (params.skillId.trim().length === 0) {
      return 'skillId cannot be empty';
    }

    return null;
  }

  override getDescription(params: GetSkillDetailsParams): string {
    return `Getting details for skill: ${params.skillId}`;
  }

  override toolLocations(_params: GetSkillDetailsParams): ToolLocation[] {
    return []; // Read-only operation
  }

  override async shouldConfirmExecute(
    _params: GetSkillDetailsParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    // No confirmation needed - read-only operation
    return false;
  }

  override async execute(
    params: GetSkillDetailsParams,
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
      const skill = this.contextBuilder.getSkillDetails(params.skillId);

      if (!skill) {
        return {
          llmContent: `❌ Skill "${params.skillId}" not found.

Use \`list_available_skills\` to see all available skills.`,
          returnDisplay: `Skill "${params.skillId}" not found`,
        };
      }

      // Format output
      const lines: string[] = [
        `# Skill Details: ${skill.name}`,
        '',
        `**ID**: \`${skill.id}\``,
        `**Plugin**: ${skill.pluginId}`,
        `**Marketplace**: ${skill.marketplaceId}`,
        `**Status**: ${skill.enabled ? '✅ Enabled' : '❌ Disabled'}`,
        '',
        '## Description',
        skill.description,
        '',
        '## Locations',
        `- **Skill Directory**: \`${skill.path}\``,
        `- **Documentation**: \`${skill.skillMdPath}\``,
        '',
        '## How to Use',
        '1. **Activate the skill**:',
        '   ```',
        `   use_skill(skillName="${skill.name}")`,
        '   ```',
        '',
        '2. **Follow the instructions** provided by use_skill to understand:',
        '   - What scripts are available',
        '   - How to execute them',
        '   - What parameters they require',
        '',
        '3. **Execute the scripts** using `run_shell_command`:',
        '   - Use the exact commands specified in the instructions',
        '   - Do NOT write your own implementation',
        '   - Do NOT use alternative libraries',
        '',
        '## Important Reminders',
        '- ✅ Always use `use_skill` to load the skill first',
        '- ✅ Use the provided scripts exactly as documented',
        '- ✅ Follow the workflow described in the instructions',
        '- ❌ Do NOT create your own scripts',
        '- ❌ Do NOT use alternative implementations',
      ];

      const output = lines.join('\n');

      return {
        llmContent: output,
        returnDisplay: `Details for ${skill.name}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        llmContent: `❌ Error getting skill details: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }
}
