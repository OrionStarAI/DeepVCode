/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import * as fs from 'fs';
import * as path from 'path';
import { ApprovalMode } from './config.js';
import { HookEventName, HookDefinition } from '../hooks/types.js';

/**
 * Agent 风格类型
 * - default: Claude-style，强调计划、解释、todo 管理（默认）
 * - codex: Codex-style，快速确认后静默执行，减少过程输出
 * - cursor: Cursor-style，强调语义搜索、高并发工具调用、详细代码规范
 * - augment: Augment-style，强调任务列表驱动、严格的版本管理和验证
 * - claude-code: Claude Code-style，极简、直接、高性能 CLI 风格
 * - antigravity: Antigravity-style，强调知识库（KI）优先、高端美学、系统化工作流
 * - windsurf: Windsurf-style，基于 AI Flow 范式，强调独立与协作平衡
 */
export type AgentStyle = 'default' | 'codex' | 'cursor' | 'augment' | 'claude-code' | 'antigravity' | 'windsurf';

/**
 * 项目级配置接口
 */
export interface ProjectSettings {
  yolo?: boolean;  // YOLO模式开关
  autoTrimTrailingSpaces?: boolean;  // 自动删除行末空格（适用于C++、Python等源代码）
  hooks?: { [K in HookEventName]?: HookDefinition[] };  // Hook配置
  agentStyle?: AgentStyle;  // Agent 风格：default（Claude）或 codex
}


export const PROJECT_CONFIG_DIR_NAME = '.deepvcode';
/**
 * 项目级配置管理器
 * 负责读写项目根目录下的 ./deepvcode/settings.json 文件
 */
export class ProjectSettingsManager {
  private readonly configFileName = 'settings.json';
  private readonly workspaceDir: string;
  private settings: ProjectSettings = {};

  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
  }

  /**
   * 获取配置文件路径
   */
  private getConfigFilePath(): string {
    return path.join(this.workspaceDir, PROJECT_CONFIG_DIR_NAME, this.configFileName);
  }

  /**
   * 获取配置目录路径
   */
  public getConfigDirPath(): string {
    return path.join(this.workspaceDir, PROJECT_CONFIG_DIR_NAME);
  }

  /**
   * 确保配置目录存在
   */
  private ensureConfigDir(): void {
    const configDir = this.getConfigDirPath();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }

  /**
   * 从文件加载配置
   */
  load(): ProjectSettings {
    try {
      const configPath = this.getConfigFilePath();

      if (!fs.existsSync(configPath)) {
        // 文件不存在，返回默认配置
        this.settings = {};
        return this.settings;
      }

      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(content) as ProjectSettings;

      // 验证配置格式
      const validAgentStyles: AgentStyle[] = ['default', 'codex', 'cursor', 'augment', 'claude-code', 'antigravity', 'windsurf'];
      this.settings = {
        yolo: typeof parsed.yolo === 'boolean' ? parsed.yolo : undefined,
        autoTrimTrailingSpaces: typeof parsed.autoTrimTrailingSpaces === 'boolean' ? parsed.autoTrimTrailingSpaces : undefined,
        hooks: parsed.hooks ? JSON.parse(JSON.stringify(parsed.hooks)) : undefined,
        agentStyle: validAgentStyles.includes(parsed.agentStyle as any) ? parsed.agentStyle : undefined,
      };

      return this.settings;
    } catch (error) {
      console.warn('Failed to load project settings:', error);
      this.settings = {};
      return this.settings;
    }
  }

  /**
   * 保存配置到文件
   */
  save(settings: ProjectSettings): void {
    try {
      this.ensureConfigDir();

      const configPath = this.getConfigFilePath();
      const content = JSON.stringify(settings, null, 2);

      fs.writeFileSync(configPath, content, 'utf-8');
      this.settings = { ...settings };
    } catch (error) {
      console.warn('Failed to save project settings:', error);
      throw new Error(`无法保存项目配置: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取当前YOLO模式设置
   */
  getYoloMode(): boolean | undefined {
    return this.settings.yolo;
  }

  /**
   * 设置YOLO模式
   */
  setYoloMode(enabled: boolean): void {
    const newSettings = {
      ...this.settings,
      yolo: enabled,
    };
    this.save(newSettings);
  }

  /**
   * 获取自动删除行末空格设置
   */
  getAutoTrimTrailingSpaces(): boolean | undefined {
    return this.settings.autoTrimTrailingSpaces;
  }

  /**
   * 设置自动删除行末空格
   */
  setAutoTrimTrailingSpaces(enabled: boolean): void {
    const newSettings = {
      ...this.settings,
      autoTrimTrailingSpaces: enabled,
    };
    this.save(newSettings);
  }

  /**
   * 获取当前所有设置
   */
  getSettings(): ProjectSettings {
    return { ...this.settings };
  }

  /**
   * 将项目配置转换为ApprovalMode
   */
  static toApprovalMode(yolo: boolean | undefined): ApprovalMode | undefined {
    if (yolo === true) return ApprovalMode.YOLO;
    if (yolo === false) return ApprovalMode.DEFAULT;
    return undefined; // 未设置，使用默认逻辑
  }

  /**
   * 检查项目配置是否覆盖了YOLO设置
   */
  hasYoloOverride(): boolean {
    return typeof this.settings.yolo === 'boolean';
  }

  /**
   * 获取当前 Agent 风格
   */
  getAgentStyle(): AgentStyle {
    return this.settings.agentStyle ?? 'default';
  }

  /**
   * 设置 Agent 风格
   */
  setAgentStyle(style: AgentStyle): void {
    const newSettings = {
      ...this.settings,
      agentStyle: style,
    };
    this.save(newSettings);
  }
}
