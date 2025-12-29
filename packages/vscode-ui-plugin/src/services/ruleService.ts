/**
 * Custom Rules Management Service
 * 自定义规则管理服务
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as yaml from 'js-yaml';
import { minimatch } from 'minimatch';
import {
  CustomRule,
  RuleFrontmatter,
  RuleApplyType,
  RulePriority,
  RuleLoadResult,
  RuleApplyResult,
  RuleMatchContext,
  RULE_FILE_LOCATIONS,
  DEFAULT_RULE_FRONTMATTER
} from '../types/rules';
import { Logger } from '../utils/logger';

export class RuleService {
  private rules: Map<string, CustomRule> = new Map();
  private logger: Logger;
  private workspaceRoot?: string;
  private fileWatcher?: vscode.FileSystemWatcher;
  private onRulesChangedCallback?: () => void;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * 设置规则变化时的回调函数
   */
  onRulesChanged(callback: () => void): void {
    this.onRulesChangedCallback = callback;
  }

  /**
   * 初始化规则服务
   */
  async initialize(workspaceRoot?: string): Promise<void> {
    this.workspaceRoot = workspaceRoot;

    if (!workspaceRoot) {
      this.logger.warn('No workspace root provided, rules service will operate in limited mode');
      return;
    }

    // 加载所有规则
    await this.loadAllRules();

    // 设置文件监听
    this.setupFileWatcher();

    this.logger.info(`Rule service initialized with ${this.rules.size} rules`);
  }

  /**
   * 加载所有规则
   */
  async loadAllRules(): Promise<RuleLoadResult> {
    const result: RuleLoadResult = {
      success: true,
      rules: [],
      errors: []
    };

    if (!this.workspaceRoot) {
      return result;
    }

    // 清空现有规则，重新加载（确保删除的文件被正确移除）
    this.rules.clear();

    // 1. 加载主配置文件
    await this.loadRuleFile(
      path.join(this.workspaceRoot, RULE_FILE_LOCATIONS.MAIN_CONFIG),
      result
    );

    // 2. 加载代理配置文件
    await this.loadRuleFile(
      path.join(this.workspaceRoot, RULE_FILE_LOCATIONS.AGENTS_CONFIG),
      result
    );

    // 3. 加载规则目录中的所有文件
    const rulesDir = path.join(this.workspaceRoot, RULE_FILE_LOCATIONS.RULES_DIR);
    await this.loadRulesFromDirectory(rulesDir, result);

    result.success = result.errors.length === 0;
    this.logger.info(`Loaded ${this.rules.size} rules`);
    return result;
  }

  /**
   * 从目录加载规则
   */
  private async loadRulesFromDirectory(
    dirPath: string,
    result: RuleLoadResult
  ): Promise<void> {
    try {
      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) {
        return;
      }

      const files = await fs.readdir(dirPath);
      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = path.join(dirPath, file);
          await this.loadRuleFile(filePath, result);
        }
      }
    } catch (error) {
      // 目录不存在是正常的
      if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') {
        this.logger.error(`Error loading rules from directory ${dirPath}:`, error instanceof Error ? error : undefined);
      }
    }
  }

  /**
   * 加载单个规则文件
   */
  private async loadRuleFile(
    filePath: string,
    result: RuleLoadResult
  ): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const rule = this.parseRuleFile(content, filePath);

      if (rule) {
        this.rules.set(rule.id, rule);
        result.rules.push(rule);
        this.logger.info(`Loaded rule: ${rule.frontmatter.title || rule.id} from ${filePath}`);
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        result.errors.push({
          filePath,
          error: error.message
        });
        this.logger.error(`Error loading rule file ${filePath}:`, error);
      }
    }
  }

  /**
   * 解析规则文件（Markdown + YAML Frontmatter）
   */
  private parseRuleFile(content: string, filePath: string): CustomRule | null {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    let frontmatter: RuleFrontmatter = { ...DEFAULT_RULE_FRONTMATTER };
    let markdownContent = content;

    // 解析 YAML frontmatter
    if (frontmatterMatch) {
      try {
        const yamlContent = frontmatterMatch[1];
        const parsedFrontmatter = yaml.load(yamlContent) as Partial<RuleFrontmatter>;
        frontmatter = { ...frontmatter, ...parsedFrontmatter };
        markdownContent = frontmatterMatch[2].trim();
      } catch (error) {
        this.logger.error(`Error parsing YAML frontmatter in ${filePath}:`, error instanceof Error ? error : undefined);
      }
    }

    // 如果没有 frontmatter，内容作为规则正文
    if (!frontmatterMatch) {
      markdownContent = content.trim();
    }

    // 生成唯一 ID
    const id = this.generateRuleId(filePath);

    return {
      id,
      frontmatter,
      content: markdownContent,
      filePath: this.getRelativePath(filePath),
      isBuiltIn: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  /**
   * 生成规则 ID（基于文件路径，保持稳定）
   */
  private generateRuleId(filePath: string): string {
    const relativePath = this.getRelativePath(filePath);
    // 使用完整相对路径生成稳定的 ID，支持中文路径
    // 只移除文件系统不允许的特殊字符
    return relativePath.replace(/[/\\:*?"<>|]/g, '_').replace(/\.md$/, '');
  }

  /**
   * 获取相对路径
   */
  private getRelativePath(absolutePath: string): string {
    if (!this.workspaceRoot) {
      return absolutePath;
    }
    return path.relative(this.workspaceRoot, absolutePath);
  }

  /**
   * 获取应应用的规则
   */
  async getApplicableRules(context: RuleMatchContext): Promise<RuleApplyResult> {
    const appliedRules: CustomRule[] = [];
    const warnings: string[] = [];

    for (const rule of this.rules.values()) {
      if (!rule.frontmatter.enabled) {
        continue;
      }

      // 1. always_apply 规则始终应用
      if (rule.frontmatter.type === RuleApplyType.ALWAYS_APPLY) {
        appliedRules.push(rule);
        continue;
      }

      // 2. context_aware 规则根据上下文匹配
      if (rule.frontmatter.type === RuleApplyType.CONTEXT_AWARE) {
        if (this.matchesContext(rule, context)) {
          appliedRules.push(rule);
        }
      }

      // 3. manual_apply 规则不自动应用
    }

    // 按优先级排序
    appliedRules.sort((a, b) => {
      const priorityOrder = {
        [RulePriority.HIGH]: 3,
        [RulePriority.MEDIUM]: 2,
        [RulePriority.LOW]: 1
      };
      const aPriority = priorityOrder[a.frontmatter.priority || RulePriority.MEDIUM];
      const bPriority = priorityOrder[b.frontmatter.priority || RulePriority.MEDIUM];
      return bPriority - aPriority;
    });

    // 拼接规则文本
    const combinedText = this.combineRules(appliedRules);

    return {
      appliedRules,
      combinedText,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * 检查规则是否匹配上下文
   */
  private matchesContext(rule: CustomRule, context: RuleMatchContext): boolean {
    const triggers = rule.frontmatter.triggers;
    if (!triggers) {
      return false;
    }

    // 检查文件扩展名
    if (triggers.fileExtensions && context.fileExtension) {
      if (triggers.fileExtensions.includes(context.fileExtension)) {
        return true;
      }
    }

    // 检查编程语言
    if (triggers.languages && context.language) {
      if (triggers.languages.includes(context.language)) {
        return true;
      }
    }

    // 检查路径模式
    if (triggers.pathPatterns && context.activeFilePath && context.workspaceRoot) {
      const relativePath = path.relative(context.workspaceRoot, context.activeFilePath);
      for (const pattern of triggers.pathPatterns) {
        if (minimatch(relativePath, pattern)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 拼接规则文本
   */
  private combineRules(rules: CustomRule[]): string {
    if (rules.length === 0) {
      return '';
    }

    const sections = rules.map(rule => {
      const title = rule.frontmatter.title || 'Custom Rule';
      return `## ${title}\n\n${rule.content}`;
    });

    return `# Custom Rules and Guidelines\n\n${sections.join('\n\n---\n\n')}`;
  }

  /**
   * 获取所有规则
   */
  getAllRules(): CustomRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 根据 ID 获取规则
   */
  getRuleById(id: string): CustomRule | undefined {
    return this.rules.get(id);
  }

  /**
   * 创建或更新规则
   */
  async saveRule(rule: CustomRule): Promise<void> {
    if (!this.workspaceRoot) {
      throw new Error('No workspace root available');
    }

    // 确定保存路径
    let filePath: string;
    if (rule.filePath) {
      filePath = path.join(this.workspaceRoot, rule.filePath);
    } else {
      // 默认保存到 .deepvcode/rules/ 目录
      const rulesDir = path.join(this.workspaceRoot, RULE_FILE_LOCATIONS.RULES_DIR);
      await fs.mkdir(rulesDir, { recursive: true });

      // 生成安全的文件名：支持中文，移除特殊字符
      let fileName = rule.frontmatter.title || rule.id;
      // 移除文件系统不允许的特殊字符：/ \ : * ? " < > |
      fileName = fileName.replace(/[/\\:*?"<>|]/g, '_');
      // 如果文件名为空或全是下划线，使用 rule.id
      if (!fileName || /^_+$/.test(fileName)) {
        fileName = rule.id;
      }
      fileName = `${fileName}.md`;

      filePath = path.join(rulesDir, fileName);
      rule.filePath = this.getRelativePath(filePath);
    }

    // 根据文件路径重新生成规则 ID，确保 ID 与文件路径一致
    const newId = this.generateRuleId(filePath);

    // 如果 ID 发生变化（新建规则时），删除旧的 ID
    if (rule.id !== newId && this.rules.has(rule.id)) {
      this.rules.delete(rule.id);
    }

    rule.id = newId;
    rule.filePath = this.getRelativePath(filePath);

    // 生成文件内容
    const content = this.serializeRule(rule);

    // 写入文件
    await fs.writeFile(filePath, content, 'utf-8');

    // 更新内存中的规则
    rule.updatedAt = Date.now();
    this.rules.set(rule.id, rule);

    this.logger.info(`Rule saved: ${rule.frontmatter.title || rule.id} (ID: ${rule.id})`);
  }

  /**
   * 序列化规则为 Markdown + YAML Frontmatter
   */
  private serializeRule(rule: CustomRule): string {
    const frontmatter = yaml.dump(rule.frontmatter, {
      indent: 2,
      lineWidth: -1
    });

    return `---\n${frontmatter}---\n\n${rule.content}`;
  }

  /**
   * 删除规则
   */
  async deleteRule(id: string): Promise<void> {
    const rule = this.rules.get(id);
    if (!rule) {
      throw new Error(`Rule not found: ${id}`);
    }

    if (rule.isBuiltIn) {
      throw new Error('Cannot delete built-in rule');
    }

    if (!rule.filePath || !this.workspaceRoot) {
      throw new Error('Cannot delete rule without file path');
    }

    const filePath = path.join(this.workspaceRoot, rule.filePath);

    try {
      await fs.unlink(filePath);
      this.rules.delete(id);
      this.logger.info(`Rule deleted: ${rule.frontmatter.title || id}`);
    } catch (error) {
      this.logger.error(`Error deleting rule file ${filePath}:`, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * 设置文件监听
   */
  private setupFileWatcher(): void {
    if (!this.workspaceRoot) {
      return;
    }

    // 监听规则文件变化
    const pattern = new vscode.RelativePattern(
      this.workspaceRoot,
      `{${RULE_FILE_LOCATIONS.MAIN_CONFIG},${RULE_FILE_LOCATIONS.AGENTS_CONFIG},${RULE_FILE_LOCATIONS.RULES_DIR}/**/*.md}`
    );

    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

    this.fileWatcher.onDidCreate(async () => {
      this.logger.info('Rule file created, reloading rules...');
      await this.loadAllRules();
      this.onRulesChangedCallback?.();
    });

    this.fileWatcher.onDidChange(async () => {
      this.logger.info('Rule file changed, reloading rules...');
      await this.loadAllRules();
      this.onRulesChangedCallback?.();
    });

    this.fileWatcher.onDidDelete(async () => {
      this.logger.info('Rule file deleted, reloading rules...');
      await this.loadAllRules();
      this.onRulesChangedCallback?.();
    });
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.fileWatcher?.dispose();
    this.rules.clear();
  }
}
