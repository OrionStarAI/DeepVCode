/**
 * List Skills Tool
 *
 * Lists all available and enabled skills for AI to discover.
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

interface ListSkillsParams {
  /** Optional filter by marketplace ID */
  marketplaceId?: string;
  /** Optional filter by plugin ID */
  pluginId?: string;
}

/**
 * ListSkillsTool - List all available skills
 */
export class ListSkillsTool extends BaseTool<ListSkillsParams, ToolResult> {
  private contextBuilder: SkillsContextBuilder;

  constructor() {
    super(
      'list_available_skills',
      'List Available Skills',
      'Lists all installed and enabled skills that you can use. Use this to discover what skills are available before attempting to implement functionality yourself.',
      Icon.List,
      {
        type: Type.OBJECT,
        properties: {
          marketplaceId: {
            type: Type.STRING,
            description: 'Optional: Filter skills by marketplace ID',
          },
          pluginId: {
            type: Type.STRING,
            description: 'Optional: Filter skills by plugin ID',
          },
        },
        required: [],
      },
      false, // isOutputMarkdown
      false, // canUpdateOutput
    );

    this.contextBuilder = new SkillsContextBuilder();
  }

  override validateToolParams(_params: ListSkillsParams): string | null {
    // No validation needed for optional filters
    return null;
  }

  override getDescription(_params: ListSkillsParams): string {
    return 'Listing available skills';
  }

  override toolLocations(_params: ListSkillsParams): ToolLocation[] {
    return []; // Read-only operation
  }

  override async shouldConfirmExecute(
    _params: ListSkillsParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    // No confirmation needed - read-only operation
    return false;
  }

  override async execute(
    params: ListSkillsParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    try {
      let skills = this.contextBuilder.listSkills();

      // Apply filters if provided
      if (params.marketplaceId) {
        skills = skills.filter((s) => s.marketplaceId === params.marketplaceId);
      }

      if (params.pluginId) {
        skills = skills.filter((s) => s.pluginId === params.pluginId);
      }

      if (skills.length === 0) {
        return {
          llmContent: 'No skills are currently installed or match the filter criteria.',
          returnDisplay: 'No skills found',
        };
      }

      // Format output
      const lines: string[] = [
        '# Available Skills',
        '',
        `Found ${skills.length} skill(s):`,
        '',
      ];

      // Group by plugin
      const skillsByPlugin = new Map<string, typeof skills>();
      for (const skill of skills) {
        if (!skillsByPlugin.has(skill.pluginId)) {
          skillsByPlugin.set(skill.pluginId, []);
        }
        skillsByPlugin.get(skill.pluginId)!.push(skill);
      }

      for (const [pluginId, pluginSkills] of skillsByPlugin) {
        lines.push(`## ${pluginId}`);
        lines.push('');

        for (const skill of pluginSkills) {
          lines.push(`### ${skill.name}`);
          lines.push(`- **ID**: \`${skill.id}\``);
          lines.push(`- **Description**: ${skill.description}`);
          lines.push(`- **Path**: \`${skill.path}\``);
          lines.push(`- **Documentation**: \`${skill.skillMdPath}\``);
          lines.push('');
          lines.push('**Usage**:');
          lines.push('1. Use `read_file` to read the skill.md file');
          lines.push('2. Follow the instructions in skill.md');
          lines.push('3. Execute the specified scripts using `run_shell_command`');
          lines.push('');
        }
      }

      lines.push('---');
      lines.push('');
      lines.push('**Remember**: Always read the skill.md file before using a skill!');

      const output = lines.join('\n');

      return {
        llmContent: output,
        returnDisplay: `Found ${skills.length} skill(s)`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        llmContent: `❌ Error listing skills: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }
}
