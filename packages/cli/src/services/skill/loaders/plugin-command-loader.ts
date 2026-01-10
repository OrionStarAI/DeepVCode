/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */
import { ICommandLoader } from '../../types.js';
import { SlashCommand, CommandContext, CommandKind, SubmitPromptActionReturn } from '../../../ui/commands/types.js';
import { SkillLoader } from '../skill-loader.js';
import { SkillType, SkillLoadLevel } from '../types.js';
import { SettingsManager } from '../settings-manager.js';

/**
 * 插件命令加载器
 * 负责将已安装插件中的 Commands 注册为系统斜杠命令
 */
export class PluginCommandLoader implements ICommandLoader {
  constructor(
    private skillLoader: SkillLoader,
    private settingsManager: SettingsManager
  ) {}

  async loadCommands(signal: AbortSignal): Promise<SlashCommand[]> {
    const commands: SlashCommand[] = [];

    try {
      // 确保设置已初始化
      await this.settingsManager.initialize();

      // 加载所有已启用的组件 (需要 FULL 级别以获取 content)
      const skills = await this.skillLoader.loadEnabledSkills(SkillLoadLevel.FULL);

      for (const skill of skills) {
        // 只处理 COMMAND 类型的组件
        if (skill.type === SkillType.COMMAND) {
          commands.push(this.createCommandFromSkill(skill));
        }
      }
    } catch (error) {
      console.warn('Failed to load plugin commands:', error);
    }

    return commands;
  }

  private createCommandFromSkill(skill: any): SlashCommand {
    return {
      name: skill.name,
      description: skill.description,
      kind: CommandKind.PLUGIN,

      action: async (context: CommandContext, args?: string): Promise<SubmitPromptActionReturn> => {
        // 简单的参数替换逻辑
        // Claude Code 的命令通常在 Markdown 中使用 $ARGUMENTS 占位符
        let prompt = skill.content || '';
        const userArgs = args || '';

        // 替换占位符
        prompt = prompt.replace(/\$ARGUMENTS/g, userArgs);

        // 如果没有占位符但有参数，追加到末尾 (简单的 fallback)
        if (!skill.content?.includes('$ARGUMENTS') && userArgs) {
          prompt += `\n\nContext: ${userArgs}`;
        }

        // 返回 SubmitPromptActionReturn，让系统自动提交 Prompt
        return {
          type: 'submit_prompt',
          content: prompt
        };
      }
    };
  }
}
