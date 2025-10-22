/**
 * @license
 * Copyright 2025 DeepV Code
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { InlineCompletionService, InlineCompletionRequest } from 'deepv-code-core';

/**
 * VSCode 行内代码补全提供者
 *
 * 实现 VSCode 的 InlineCompletionItemProvider 接口，
 * 提供上下文感知的代码补全建议
 */
export class DeepVInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private logger: Logger;
  private completionService: InlineCompletionService | null = null;

  // 防抖控制
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_DELAY = 300; // 300ms 防抖延迟

  // 取消控制
  private currentAbortController: AbortController | null = null;

  // 性能统计
  private stats = {
    totalRequests: 0,
    successfulCompletions: 0,
    canceledRequests: 0,
    errors: 0,
  };

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * 设置补全服务（延迟初始化）
   */
  setCompletionService(service: InlineCompletionService): void {
    this.completionService = service;
    this.logger.info('InlineCompletionService initialized');
  }

  /**
   * 获取补全服务
   */
  getCompletionService(): InlineCompletionService | null {
    return this.completionService;
  }

  /**
   * 实现 VSCode 的 provideInlineCompletionItems 方法
   */
  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null | undefined> {
    try {
      // 检查是否启用了补全功能
      const config = vscode.workspace.getConfiguration('deepv');
      const enableInlineCompletion = config.get<boolean>('enableInlineCompletion', true);

      if (!enableInlineCompletion) {
        return null;
      }

      // 检查服务是否已初始化
      if (!this.completionService) {
        this.logger.debug('InlineCompletionService not initialized yet');
        return null;
      }

      this.stats.totalRequests++;

      // 检查是否被取消
      if (token.isCancellationRequested) {
        this.stats.canceledRequests++;
        return null;
      }

      // 检查触发原因（只在自动触发或显式调用时响应）
      if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic ||
          context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke) {

        // 获取当前行内容（简单过滤）
        const line = document.lineAt(position.line);
        const lineText = line.text.substring(0, position.character);

        // 跳过空行或只有空格的行
        if (lineText.trim().length === 0) {
          return null;
        }

        // 跳过注释行（简单判断）
        const trimmedLine = lineText.trim();
        if (trimmedLine.startsWith('//') ||
            trimmedLine.startsWith('#') ||
            trimmedLine.startsWith('/*') ||
            trimmedLine.startsWith('*')) {
          return null;
        }

        // 构建请求参数
        const request = this.buildCompletionRequest(document, position);

        // 取消之前的请求
        if (this.currentAbortController) {
          this.currentAbortController.abort();
          this.stats.canceledRequests++;
        }

        // 创建新的 AbortController
        this.currentAbortController = new AbortController();
        const abortSignal = this.currentAbortController.signal;

        // 监听 VSCode 的取消事件
        token.onCancellationRequested(() => {
          if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.stats.canceledRequests++;
          }
        });

        // 调用补全服务
        const startTime = Date.now();
        const completion = await this.completionService.generateCompletion(request, abortSignal);
        const duration = Date.now() - startTime;

        if (token.isCancellationRequested || abortSignal.aborted) {
          this.logger.debug('Completion request was canceled');
          return null;
        }

        if (!completion || !completion.text) {
          this.logger.debug('No completion generated');
          return null;
        }

        this.stats.successfulCompletions++;
        this.logger.debug(`Completion generated in ${duration}ms: "${completion.text.substring(0, 50)}..."`);

        // 创建 VSCode InlineCompletionItem
        const item = new vscode.InlineCompletionItem(
          completion.text,
          completion.range ? new vscode.Range(
            new vscode.Position(completion.range.start.line, completion.range.start.character),
            new vscode.Position(completion.range.end.line, completion.range.end.character)
          ) : undefined
        );

        return [item];
      }

      return null;
    } catch (error) {
      this.stats.errors++;
      this.logger.error('Error providing inline completion', error instanceof Error ? error : undefined);
      return null;
    }
  }

  /**
   * 构建补全请求参数
   */
  private buildCompletionRequest(
    document: vscode.TextDocument,
    position: vscode.Position
  ): InlineCompletionRequest {
    // 获取光标前的文本（最多 2000 个字符）
    const prefixRange = new vscode.Range(
      new vscode.Position(Math.max(0, position.line - 50), 0),
      position
    );
    const prefix = document.getText(prefixRange).slice(-2000);

    // 获取光标后的文本（最多 1000 个字符）
    const suffixRange = new vscode.Range(
      position,
      new vscode.Position(Math.min(document.lineCount - 1, position.line + 30), 0)
    );
    const suffix = document.getText(suffixRange).slice(0, 1000);

    return {
      filePath: document.uri.fsPath,
      position: {
        line: position.line,
        character: position.character,
      },
      prefix,
      suffix,
      language: document.languageId,
      maxLength: 256, // 最大补全长度
    };
  }

  /**
   * 获取性能统计
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      successfulCompletions: 0,
      canceledRequests: 0,
      errors: 0,
    };
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    this.logger.info('InlineCompletionProvider disposed', {
      stats: this.stats,
    });
  }
}
