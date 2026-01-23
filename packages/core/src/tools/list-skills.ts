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
import { Config } from '../config/config.js';

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

  constructor(private readonly config: Config) {
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

    this.contextBuilder = new SkillsContextBuilder(this.config.getProjectRoot());
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
        let message = 'No skills are currently installed';
        if (params.marketplaceId || params.pluginId) {
          message += ' or match the filter criteria. Try calling this tool without any arguments to see all available skills.';
        } else {
          message += '.';
        }
        return {
          llmContent: message,
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
          lines.push(`1. Use \`use_skill(skillName="${skill.name}")\` to load the skill`);
          lines.push('2. This will show you the exact scripts and commands to use');
          lines.push('3. Execute the specified scripts using `run_shell_command`');
          lines.push('');
        }
      }

      lines.push('---');
      lines.push('');
      lines.push('**Remember**: Always use `use_skill` to activate a skill before using it!');

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
