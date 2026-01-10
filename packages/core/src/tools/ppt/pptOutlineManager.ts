/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * PPT 大纲状态管理器
 * 单例模式，维护当前 PPT 大纲编辑状态
 */

export interface PPTOutlineState {
  /** 是否在PPT编辑模式 */
  isActive: boolean;
  /** PPT主题 */
  topic: string;
  /** 预计页数 */
  pageCount: number;
  /** 大纲内容 */
  outline: string;
  /** 提交后的任务ID */
  taskId?: number;
  /** 创建时间 */
  createdAt?: Date;
  /** 最后更新时间 */
  lastUpdated?: Date;
}

export class PPTOutlineManager {
  private static instance: PPTOutlineManager;
  private state: PPTOutlineState;

  private constructor() {
    this.state = this.getEmptyState();
  }

  static getInstance(): PPTOutlineManager {
    if (!PPTOutlineManager.instance) {
      PPTOutlineManager.instance = new PPTOutlineManager();
    }
    return PPTOutlineManager.instance;
  }

  private getEmptyState(): PPTOutlineState {
    return {
      isActive: false,
      topic: '',
      pageCount: 5,
      outline: '',
    };
  }

  /**
   * 初始化PPT模式
   * @param topic 可选的初始主题
   */
  init(topic?: string): PPTOutlineState {
    this.state = {
      isActive: true,
      topic: topic || '',
      pageCount: 5,
      outline: '',
      createdAt: new Date(),
      lastUpdated: new Date(),
    };
    return this.state;
  }

  /**
   * 更新大纲内容
   * @param data 要更新的字段
   */
  update(data: Partial<Omit<PPTOutlineState, 'isActive' | 'createdAt'>>): PPTOutlineState {
    if (!this.state.isActive) {
      throw new Error('PPT模式未激活，请先调用 ppt_outline action=init');
    }

    // 只更新提供的非空字段
    if (data.topic !== undefined) {
      this.state.topic = data.topic;
    }
    if (data.pageCount !== undefined) {
      this.state.pageCount = data.pageCount;
    }
    if (data.outline !== undefined) {
      this.state.outline = data.outline;
    }
    if (data.taskId !== undefined) {
      this.state.taskId = data.taskId;
    }

    this.state.lastUpdated = new Date();
    return this.state;
  }

  /**
   * 获取当前状态（返回副本）
   */
  getState(): PPTOutlineState {
    return { ...this.state };
  }

  /**
   * 设置任务ID
   */
  setTaskId(taskId: number): void {
    this.state.taskId = taskId;
    this.state.lastUpdated = new Date();
  }

  /**
   * 清理/退出PPT模式
   */
  clear(): void {
    this.state = this.getEmptyState();
  }

  /**
   * 检查是否激活
   */
  isActive(): boolean {
    return this.state.isActive;
  }

  /**
   * 格式化大纲预览
   */
  formatPreview(): string {
    if (!this.state.isActive) {
      return '⚠️ PPT模式未激活';
    }

    const lines: string[] = [
      '📊 PPT大纲状态',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `📝 主题: ${this.state.topic || '(未设置)'}`,
      `📄 页数: ${this.state.pageCount}`,
      `🕐 更新时间: ${this.state.lastUpdated?.toLocaleString('zh-CN') || '-'}`,
    ];

    if (this.state.taskId) {
      lines.push(`🆔 任务ID: ${this.state.taskId}`);
    }

    lines.push('');
    lines.push('📋 大纲内容:');
    lines.push(this.state.outline || '(暂无内容)');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return lines.join('\n');
  }

  /**
   * 验证大纲是否可以提交
   * @returns 错误消息，如果验证通过则返回null
   */
  validateForSubmission(): string | null {
    if (!this.state.isActive) {
      return 'PPT模式未激活，请先使用 ppt_outline 初始化大纲';
    }
    if (!this.state.topic || this.state.topic.trim().length === 0) {
      return '请先设置PPT主题';
    }
    if (!this.state.outline || this.state.outline.trim().length === 0) {
      return '请先设置PPT大纲内容';
    }
    if (this.state.pageCount < 1 || this.state.pageCount > 100) {
      return '页数必须在 1-100 之间';
    }
    return null;
  }
}
