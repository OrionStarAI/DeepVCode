/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */
import { ICommandLoader } from '../../types.js';
import { SlashCommand, CommandContext, CommandKind, SubmitPromptActionReturn } from '../../../ui/commands/types.js';
import { SkillLoader, SkillType, SkillLoadLevel, SettingsManager } from 'deepv-code-core';

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

      // 🔍 调试日志：记录所有加载的 skill
      const skillsByType = skills.reduce((acc, skill) => {
        const type = skill.type || 'SKILL';
        if (!acc[type]) acc[type] = [];
        acc[type].push(skill.name);
        return acc;
      }, {} as Record<string, string[]>);

      console.debug('[PluginCommandLoader] Loaded skills by type:');
      Object.entries(skillsByType).forEach(([type, names]) => {
        console.debug(`  ${type}: ${names.length}`);
      });

      for (const skill of skills) {
        // 只处理 COMMAND 类型的组件
        if (skill.type === SkillType.COMMAND) {
          const command = this.createCommandFromSkill(skill);
          commands.push(command);
          console.debug(`  ✓ Registered command: /${command.name}`);
        }
      }

      console.debug(`[PluginCommandLoader] Total commands loaded: ${commands.length}`);
    } catch (error) {
      console.warn('Failed to load plugin commands:', error);
    }

    return commands;
  }

  private createCommandFromSkill(skill: any): SlashCommand {
    // 根据 Claude Code 规范，插件命令应带上插件名前缀: pluginName:commandName
    // 从 pluginId (format: "marketplace:pluginName") 中提取插件名
    const pluginIdParts = skill.pluginId.split(':');
    const pluginName = pluginIdParts.length > 1 ? pluginIdParts[1] : skill.pluginId;

    // 生成带前缀的名称
    const prefixedName = pluginName ? `${pluginName}:${skill.name}` : skill.name;

    return {
      name: prefixedName,
      altNames: [skill.name], // 保留原始名称作为别名，方便用户输入
      description: skill.description,
      kind: CommandKind.PLUGIN,

      action: async (context: CommandContext, args?: string): Promise<SubmitPromptActionReturn> => {
        // 1. 获取插件根路径 (从 ID 或位置信息中提取)
        // 根据官方文档，变量 ${CLAUDE_PLUGIN_ROOT} 指向插件安装目录
        const pluginRoot = skill.location?.rootPath || skill.path;

        // 2. 获取 Markdown 内容
        let prompt = skill.content || '';
        const userArgs = args || '';

        // 3. 变量替换 (对标 Claude Code 规范)
        // 替换参数占位符
        prompt = prompt.replace(/\$ARGUMENTS/g, userArgs);

        // 替换插件根路径占位符
        if (pluginRoot) {
          // 确保使用正斜杠以保持跨平台兼容性
          const normalizedPath = pluginRoot.replace(/\\/g, '/');
          prompt = prompt.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, normalizedPath);
        }

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
