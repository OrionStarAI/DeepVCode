/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */
import path from 'path';
import fs from 'fs-extra';
import { PluginStructure } from '../models/unified.js';

/**
 * 插件结构分析器
 * 负责分析插件目录结构，确定插件类型和包含的内容
 */
export class PluginStructureAnalyzer {
  constructor(private pluginDir: string) {}

  /**
   * 分析插件结构
   */
  async analyze(): Promise<PluginStructure> {
    const exists = async (p: string) => fs.pathExists(path.join(this.pluginDir, p));
    const isDir = async (p: string) => {
      const fullPath = path.join(this.pluginDir, p);
      return (await exists(p)) && (await fs.stat(fullPath)).isDirectory();
    };

    // 检查关键文件和目录
    const hasPluginJson = await exists('plugin.json');
    const hasClaudePluginDir = await isDir('.claude-plugin');

    // 检查组件目录
    const hasAgents = await isDir('agents');
    const hasCommands = await isDir('commands');
    const hasSkills = await isDir('skills');
    const hasHooks = await isDir('hooks');
    const hasScripts = await isDir('scripts');

    // 确定格式类型
    let detectedFormat: 'claude-code' | 'deepv-code' | 'hybrid' | 'unknown' = 'unknown';

    if (hasClaudePluginDir) {
      // 标准 Claude Code 格式 (带 .claude-plugin)
      detectedFormat = 'claude-code';
    } else if (hasAgents || hasCommands) {
      // 隐式 Claude Code 格式 (如 plugin-dev)
      detectedFormat = 'claude-code';
    } else if (hasPluginJson && hasSkills && !hasAgents && !hasCommands) {
      // 传统 DeepV Code 格式
      detectedFormat = 'deepv-code';
    } else if (hasPluginJson && (hasAgents || hasCommands)) {
      // 混合格式
      detectedFormat = 'hybrid';
    }

    return {
      hasMarketplaceJson: false, // 在插件级别不相关
      hasPluginJson,
      hasClaudePluginDir,
      directories: {
        agents: hasAgents,
        commands: hasCommands,
        skills: hasSkills,
        hooks: hasHooks,
        scripts: hasScripts
      },
      detectedFormat
    };
  }
}
