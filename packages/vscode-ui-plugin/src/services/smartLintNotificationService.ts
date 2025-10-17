/**
 * @license
 * Copyright 2025 DeepV Code
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from '../utils/logger';
import { MultiSessionCommunicationService } from './multiSessionCommunicationService';
import { DiagnosticChange, DiagnosticsMonitorService, LintDiagnostic } from './diagnosticsMonitorService';

export interface SmartNotificationConfig {
  enableAutoNotifications: boolean;
  minErrorThreshold: number;           // 最少错误数才通知
  notificationCooldown: number;        // 通知冷却时间（毫秒）
  onlyNotifyOnDegradation: boolean;    // 只在质量恶化时通知
  enableSaveNotifications: boolean;    // 保存时是否通知
  enableFileOpenNotifications: boolean; // 打开文件时是否通知
}

export interface SmartNotificationData {
  type: 'smart_lint_notification' | 'project_quality_overview' | 'lint_suggestion';
  message: string;
  timestamp: number;
  actionSuggestions: Array<{
    action: string;
    label: string;
    command?: string;
  }>;
  metadata: {
    [key: string]: any;
  };
  change?: DiagnosticChange;
  summary?: any;
}

/**
 * 智能 Lint 通知服务 - 将诊断变化智能地推送到聊天界面
 */
export class SmartLintNotificationService {
  private lastNotificationTime: Map<string, number> = new Map();
  private config: SmartNotificationConfig;

  constructor(
    private logger: Logger,
    private communicationService: MultiSessionCommunicationService,
    private diagnosticsMonitor: DiagnosticsMonitorService,
    config?: Partial<SmartNotificationConfig>
  ) {
    this.config = {
      enableAutoNotifications: true,
      minErrorThreshold: 1,
      notificationCooldown: 30000, // 30秒
      onlyNotifyOnDegradation: false,
      enableSaveNotifications: true,
      enableFileOpenNotifications: false,
      ...config
    };
  }

  /**
   * 初始化通知服务
   */
  async initialize(): Promise<void> {
    this.logger.info('🔔 Initializing SmartLintNotificationService');

    // 注册诊断变化监听器
    this.diagnosticsMonitor.addChangeListener(async (changes) => {
      await this.handleDiagnosticChanges(changes);
    });

    this.logger.info('✅ SmartLintNotificationService initialized');
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<SmartNotificationConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('⚙️ SmartLintNotificationService config updated', this.config);
  }

  /**
   * 处理诊断变化
   */
  private async handleDiagnosticChanges(changes: DiagnosticChange[]): Promise<void> {
    if (!this.config.enableAutoNotifications) return;

    for (const change of changes) {
      await this.processChange(change);
    }
  }

  /**
   * 处理单个变化
   */
  private async processChange(change: DiagnosticChange): Promise<void> {
    // 检查是否需要通知
    if (!this.shouldNotify(change)) {
      return;
    }

    // 检查冷却时间
    if (!this.checkCooldown(change.file)) {
      return;
    }

    // 生成通知消息
    const notification = this.generateNotificationMessage(change);

    if (notification) {
      await this.sendNotification(notification, change);
      this.updateLastNotificationTime(change.file);
    }
  }

  /**
   * 判断是否应该通知
   */
  private shouldNotify(change: DiagnosticChange): boolean {
    // 基本配置检查
    if (!this.config.enableAutoNotifications) return false;

    // 错误数量阈值检查
    if (change.newErrorCount < this.config.minErrorThreshold) return false;

    // 只在恶化时通知的配置
    if (this.config.onlyNotifyOnDegradation && change.changeType !== 'degraded') {
      return false;
    }

    // 特殊情况：文件完全修复总是值得通知
    if (change.changeType === 'fixed_file') return true;

    // 显著恶化：错误增加 >= 3
    if (change.changeType === 'degraded' && (change.newErrorCount - change.oldErrorCount) >= 3) {
      return true;
    }

    // 新文件出现错误
    if (change.oldErrorCount === 0 && change.newErrorCount > 0) return true;

    // 显著改进：错误减少 >= 2
    if (change.changeType === 'improved' && (change.oldErrorCount - change.newErrorCount) >= 2) {
      return true;
    }

    return false;
  }

  /**
   * 检查冷却时间
   */
  private checkCooldown(filePath: string): boolean {
    const lastTime = this.lastNotificationTime.get(filePath) || 0;
    const now = Date.now();

    return (now - lastTime) >= this.config.notificationCooldown;
  }

  /**
   * 生成通知消息
   */
  private generateNotificationMessage(change: DiagnosticChange): string | null {
    const { file, oldErrorCount, newErrorCount, changeType, addedErrors, resolvedErrors } = change;

    switch (changeType) {
      case 'fixed_file':
        return `🎉 **代码质量改进** - \`${file}\` 中的所有错误已修复！之前有 ${oldErrorCount} 个错误。`;

      case 'improved':
        const fixedCount = oldErrorCount - newErrorCount;
        if (fixedCount >= 2) {
          return `✨ **代码质量提升** - \`${file}\` 修复了 ${fixedCount} 个错误，当前还有 ${newErrorCount} 个错误。`;
        }
        break;

      case 'degraded':
        const newIssuesCount = newErrorCount - oldErrorCount;
        if (newIssuesCount >= 3) {
          return `⚠️ **代码质量下降** - \`${file}\` 新增 ${newIssuesCount} 个错误，当前共 ${newErrorCount} 个错误。\n\n` +
                 `新增的主要错误:\n${this.formatTopErrors(addedErrors, 3)}` +
                 `\n\n需要我帮您检查和修复这些问题吗？`;
        } else if (newIssuesCount >= 1) {
          return `🔍 **发现新错误** - \`${file}\` 新增 ${newIssuesCount} 个错误。\n\n` +
                 `错误详情:\n${this.formatTopErrors(addedErrors, 2)}` +
                 `\n\n是否需要帮助修复？`;
        }
        break;

      case 'new_file':
        if (newErrorCount >= 2) {
          return `📋 **新文件质量检查** - \`${file}\` 发现 ${newErrorCount} 个错误。\n\n` +
                 `主要问题:\n${this.formatTopErrors(addedErrors, 3)}` +
                 `\n\n要我帮您优化代码质量吗？`;
        }
        break;
    }

    return null;
  }

  /**
   * 格式化错误信息
   */
  private formatTopErrors(errors: LintDiagnostic[], maxCount: number): string {
    return errors.slice(0, maxCount).map((error, index) =>
      `${index + 1}. **行 ${error.line}**: ${error.message} \`[${error.source}]\``
    ).join('\n');
  }

  /**
   * 发送通知到聊天界面
   */
  private async sendNotification(message: string, change: DiagnosticChange): Promise<void> {
    try {
      // 构建智能通知消息
      const notificationData: SmartNotificationData = {
        type: 'smart_lint_notification',
        message,
        timestamp: Date.now(),
        actionSuggestions: this.generateActionSuggestions(change),
        metadata: {
          file: change.file,
          changeType: change.changeType,
          severity: this.getChangeSeverity(change)
        },
        change
      };

      // 发送到当前活跃的 session
      await this.communicationService.sendSmartNotification(notificationData);

      this.logger.info(`📨 Sent lint notification for ${change.file}: ${change.changeType}`);

    } catch (error) {
      this.logger.error('❌ Failed to send lint notification', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 生成行动建议
   */
  private generateActionSuggestions(change: DiagnosticChange): Array<{
    action: string;
    label: string;
    command?: string;
  }> {
    const suggestions: Array<{ action: string; label: string; command?: string }> = [];

    switch (change.changeType) {
      case 'degraded':
      case 'new_file':
        suggestions.push(
          { action: 'check_lint', label: '📋 检查详细错误', command: 'read_lints' },
          { action: 'auto_fix', label: '🔧 自动修复', command: 'lint_fix' },
          { action: 'explain_errors', label: '💡 解释错误原因' }
        );
        break;

      case 'improved':
        suggestions.push(
          { action: 'continue_improvements', label: '🚀 继续优化' },
          { action: 'check_remaining', label: '📋 检查剩余问题', command: 'read_lints' }
        );
        break;

      case 'fixed_file':
        suggestions.push(
          { action: 'celebrate', label: '🎉 太棒了！' },
          { action: 'check_other_files', label: '📁 检查其他文件' }
        );
        break;
    }

    return suggestions;
  }

  /**
   * 获取变化严重性
   */
  private getChangeSeverity(change: DiagnosticChange): 'info' | 'warning' | 'error' {
    switch (change.changeType) {
      case 'fixed_file':
      case 'improved':
        return 'info';
      case 'degraded':
        return change.newErrorCount >= 5 ? 'error' : 'warning';
      case 'new_file':
        return change.newErrorCount >= 3 ? 'warning' : 'info';
      default:
        return 'info';
    }
  }

  /**
   * 更新最后通知时间
   */
  private updateLastNotificationTime(filePath: string): void {
    this.lastNotificationTime.set(filePath, Date.now());
  }

  /**
   * 手动触发项目质量概览通知
   */
  async sendProjectQualityOverview(): Promise<void> {
    try {
      const summary = await this.diagnosticsMonitor.getCurrentDiagnosticsSummary();

      let message = `📊 **项目代码质量概览**\n\n`;
      message += `📁 总文件数: ${summary.totalFiles}\n`;
      message += `❌ 错误总数: ${summary.totalErrors}\n`;
      message += `⚠️ 警告总数: ${summary.totalWarnings}\n\n`;

      if (summary.hotspots.length > 0) {
        message += `🔥 **需要关注的文件:**\n`;
        summary.hotspots.forEach((hotspot, index) => {
          message += `${index + 1}. \`${hotspot.file}\` - ${hotspot.errorCount} 个错误\n`;
        });
        message += `\n要我帮您优先处理这些问题吗？`;
      } else {
        message += `✨ **恭喜！** 当前没有严重的代码质量问题。`;
      }

      const notificationData: SmartNotificationData = {
        type: 'project_quality_overview',
        message,
        timestamp: Date.now(),
        actionSuggestions: [
          { action: 'fix_hotspots', label: '🔧 修复热点问题' },
          { action: 'detailed_analysis', label: '📋 详细分析', command: 'read_lints' }
        ],
        metadata: {
          messageType: 'quality_overview',
          severity: summary.totalErrors > 10 ? 'error' : (summary.totalErrors > 0 ? 'warning' : 'info')
        },
        summary
      };

      await this.communicationService.sendSmartNotification(notificationData);
      this.logger.info('📊 Sent project quality overview notification');

    } catch (error) {
      this.logger.error('❌ Failed to send project quality overview', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.lastNotificationTime.clear();
    this.logger.info('🧹 SmartLintNotificationService disposed');
  }
}