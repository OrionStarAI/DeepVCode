/**
 * @license
 * Copyright 2025 DeepV Code
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import { InlineCompletionService, InlineCompletionRequest } from 'deepv-code-core';
import { CompletionCache, buildCacheKeys, CachedCompletion, isSoftMatchValid } from './completionCache';
import { Logger } from '../utils/logger';

/**
 * 文件 Session 状态
 */
interface FileSession {
  uri: string;
  lastPosition: vscode.Position;
  lastLineText: string;
  charDelta: number;
  lastRequestTime: number;
  pendingController: AbortController | null;
  debounceTimer: NodeJS.Timeout | null;
  requestCount: number;
  cacheHits: number;
  skippedRequests: number;
}

/**
 * 补全调度器（后台，推模式）
 *
 * 职责：
 * - 监听文档变化事件
 * - 防抖 200ms
 * - 智能判断是否需要请求
 * - 发起 API 请求
 * - 结果写入缓存
 * - 安全地主动触发
 */
export class CompletionScheduler {
  private sessions = new Map<string, FileSession>();
  private cache: CompletionCache;
  private completionService: InlineCompletionService;
  private logger: Logger;

  // 主动触发控制
  private lastTriggerAt = 0;
  private readonly TRIGGER_COOLDOWN_MS = 100;  // 🆕 从 250 降到 100，更快触发补全显示

  // 配置参数（可根据需要调整）
  // 🆕 优化：降低防抖时间，让请求更快发出；降低最小间隔，允许更频繁请求
  // Codestral FIM 模型响应快，可以更激进一些
  private readonly DEBOUNCE_MS = 150;       // 防抖时间（ms）- 从 300 降到 150
  private readonly THROTTLE_CHARS = 3;      // 节流字符数 - 从 6 降到 3
  private readonly MIN_INTERVAL_MS = 100;   // 最小间隔（ms）- 从 200 降到 100

  constructor(
    cache: CompletionCache,
    completionService: InlineCompletionService,
    logger: Logger
  ) {
    this.cache = cache;
    this.completionService = completionService;
    this.logger = logger;
  }

  /**
   * 初始化调度器
   */
  init(context: vscode.ExtensionContext) {
    // 监听文档变化
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(
        this.handleDocumentChange.bind(this)
      )
    );

    this.logger.info('CompletionScheduler initialized');
  }

  /**
   * 处理文档变化事件
   */
  private handleDocumentChange(event: vscode.TextDocumentChangeEvent) {
    const fileName = event.document.uri.fsPath.split(/[\\/]/).pop() || 'unknown';
    const langId = event.document.languageId;

    // 只处理代码文件
    if (!this.isCodeFile(event.document)) {
      this.logger.debug(`[Scheduler] ⏭️ Skip: not a code file`, {
        file: fileName,
        languageId: langId,
        supportedLanguages: 'js,ts,tsx,jsx,py,java,go,rust,cpp,c,cs,php,rb,swift,kt,scala,dart',
      });
      return;
    }

    const uri = event.document.uri.toString();
    const session = this.getOrCreateSession(uri, event.document);

    this.logger.debug(`[Scheduler] 📝 Document changed`, {
      file: fileName,
      languageId: langId,
      changeCount: event.contentChanges.length,
    });

    // 智能判断：是否需要请求？
    if (!this.shouldRequest(session, event.document)) {
      return;
    }

    this.logger.debug(`[Scheduler] ✅ shouldRequest=true, scheduling request...`, {
      file: fileName,
      debounceMs: this.DEBOUNCE_MS,
    });

    // 取消旧的
    this.cancelPending(session);

    // 设置新的防抖
    session.debounceTimer = setTimeout(() => {
      this.executeRequest(session, event.document);
    }, this.DEBOUNCE_MS);

    // 更新会话状态
    this.updateSession(session, event.document);
  }

  /**
   * 智能判断：是否需要请求
   */
  private shouldRequest(
    session: FileSession,
    document: vscode.TextDocument
  ): boolean {
    const now = Date.now();
    const fileName = document.uri.fsPath.split(/[\\/]/).pop() || 'unknown';

    const editor = vscode.window.visibleTextEditors.find(
      ed => ed.document === document
    );
    if (!editor) {
      this.logger.debug(`[Scheduler] ⏭️ Skip: no visible editor for document`, { file: fileName });
      return false;
    }

    const position = editor.selection.active;

    // === 第一步：快速拦截 ===

    // 时间间隔太短
    const elapsed = now - session.lastRequestTime;
    if (elapsed < this.MIN_INTERVAL_MS) {
      session.skippedRequests++;
      this.logger.debug(`[Scheduler] ⏭️ Skip: interval too short`, {
        file: fileName,
        elapsed: `${elapsed}ms`,
        threshold: `${this.MIN_INTERVAL_MS}ms`,
      });
      return false;
    }

    // 只是光标移动，内容未变
    const currentLine = document.lineAt(position.line).text;
    if (currentLine === session.lastLineText &&
        !position.isEqual(session.lastPosition)) {
      this.logger.debug(`[Scheduler] ⏭️ Skip: cursor moved only (no content change)`, {
        file: fileName,
        position: `${position.line}:${position.character}`,
      });
      return false;
    }

    // === 第二步：节流检查 ===

    const charDelta = Math.abs(currentLine.length - session.lastLineText.length);
    const isStrongTrigger = this.isStrongTrigger(currentLine);

    // 字符增量 < 阈值 且非强触发
    if (charDelta < this.THROTTLE_CHARS && !isStrongTrigger) {
      session.skippedRequests++;
      this.logger.debug(`[Scheduler] ⏭️ Skip: char delta too small`, {
        file: fileName,
        charDelta,
        threshold: this.THROTTLE_CHARS,
        isStrongTrigger,
        lineEnding: currentLine.slice(-3),
      });
      return false;
    }

    // === 第三步：缓存检查 ===

    const keys = buildCacheKeys(document, position);

    // 硬缓存：精确匹配，直接跳过
    if (this.cache.has(keys.hard)) {
      session.cacheHits++;
      session.skippedRequests++;
      this.logger.debug(`[Scheduler] ⏭️ Skip: hard cache exists`, {
        file: fileName,
      });
      return false;
    }

    // 软缓存：需要验证有效性（和 Provider 保持一致）
    const softCached = this.cache.get(keys.soft);
    if (softCached && isSoftMatchValid(softCached, document, position)) {
      session.cacheHits++;
      session.skippedRequests++;
      this.logger.debug(`[Scheduler] ⏭️ Skip: valid soft cache exists`, {
        file: fileName,
        cachedPosition: `${softCached.position.line}:${softCached.position.character}`,
        currentPosition: `${position.line}:${position.character}`,
      });
      return false;
    }

    this.logger.debug(`[Scheduler] ✅ All checks passed`, {
      file: fileName,
      position: `${position.line}:${position.character}`,
      charDelta,
      isStrongTrigger,
      elapsed: `${elapsed}ms`,
    });

    return true;
  }

  /**
   * 检查是否是强触发点
   */
  private isStrongTrigger(lineText: string): boolean {
    const triggers = ['\n', '(', '{', ';', ':', ',', '.'];
    return triggers.some(t => lineText.endsWith(t));
  }

  /**
   * 执行实际的 API 请求
   */
  private async executeRequest(
    session: FileSession,
    document: vscode.TextDocument
  ) {
    const fileName = document.uri.fsPath.split(/[\\/]/).pop() || 'unknown';

    // 获取目标编辑器和位置
    const targetEditor = vscode.window.visibleTextEditors.find(
      ed => ed.document === document
    );
    if (!targetEditor) {
      this.logger.debug(`[Scheduler] ❌ executeRequest: no target editor found`, { file: fileName });
      return;
    }

    const targetPosition = targetEditor.selection.active;

    try {
      // 创建 AbortController
      const controller = new AbortController();
      session.pendingController = controller;

      // 构建请求
      const request = this.buildRequest(document, targetPosition);

      this.logger.info(`[Scheduler] 🚀 API request starting...`, {
        file: fileName,
        position: `${targetPosition.line}:${targetPosition.character}`,
        language: request.language,
        prefixLen: request.prefix.length,
        suffixLen: request.suffix.length,
      });

      const startTime = Date.now();

      // 调用 API
      const result = await this.completionService.generateCompletion(
        request,
        controller.signal
      );

      const duration = Date.now() - startTime;

      // 检查请求是否被中止
      if (controller.signal.aborted) {
        this.logger.debug(`[Scheduler] ⚠️ Request was aborted`, {
          file: fileName,
          duration: `${duration}ms`,
        });
        return;
      }

      if (result) {
        // 写入缓存
        const keys = buildCacheKeys(document, targetPosition);
        const cached: CachedCompletion = {
          text: result.text,
          timestamp: Date.now(),
          position: targetPosition,
          context: request.prefix.slice(-100),
        };

        this.cache.set(keys, cached);
        session.requestCount++;

        this.logger.info(`[Scheduler] ✅ API response received & cached`, {
          file: fileName,
          duration: `${duration}ms`,
          resultLen: result.text.length,
          resultPreview: result.text.slice(0, 50).replace(/\n/g, '\\n') + (result.text.length > 50 ? '...' : ''),
          cacheSize: this.cache.size(),
          hardKey: keys.hard.slice(0, 60) + '...',
        });

        // ✅ 安全地主动触发
        this.safeTriggerInlineSuggest(targetEditor, targetPosition, keys.hard);
      } else {
        this.logger.warn(`[Scheduler] ⚠️ API returned null/empty result`, {
          file: fileName,
          duration: `${duration}ms`,
          position: `${targetPosition.line}:${targetPosition.character}`,
        });
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        this.logger.error('Completion request failed', error);
      }
    } finally {
      session.pendingController = null;
      session.debounceTimer = null;
    }
  }

  /**
   * 构建请求参数
   */
  private buildRequest(
    document: vscode.TextDocument,
    position: vscode.Position
  ): InlineCompletionRequest {
    // 提取上下文 - 前缀
    const prefixRange = new vscode.Range(
      new vscode.Position(Math.max(0, position.line - 50), 0),
      position
    );
    const prefix = document.getText(prefixRange).slice(-4000);

    // 读取配置：是否使用后缀上下文（FIM模式）
    const config = vscode.workspace.getConfiguration('deepv');
    const useSuffix = config.get<boolean>('inlineCompletionUseSuffix', true);

    // 提取上下文 - 后缀（⚠️ 修复：必须取到行尾）
    let suffix = '';
    if (useSuffix) {
      const endLine = Math.min(document.lineCount - 1, position.line + 20);
      const endChar = document.lineAt(endLine).range.end.character;  // ← 修复点
      const suffixRange = new vscode.Range(
        position,
        new vscode.Position(endLine, endChar)
      );
      suffix = document.getText(suffixRange).slice(0, 1200);
    }

    return {
      filePath: document.uri.fsPath,
      position: {
        line: position.line,
        character: position.character,
      },
      prefix,
      suffix,
      language: document.languageId,
      maxLength: 256,
    };
  }

  /**
   * 安全地触发 inline suggest
   */
  private safeTriggerInlineSuggest(
    targetEditor: vscode.TextEditor,
    targetPosition: vscode.Position,
    cacheKey: string
  ) {
    const now = Date.now();
    const fileName = targetEditor.document.uri.fsPath.split(/[\\/]/).pop() || 'unknown';

    // 条件 1：编辑器必须仍然是激活状态
    if (targetEditor !== vscode.window.activeTextEditor) {
      this.logger.debug(`[Scheduler] ⏭️ Skip trigger: editor not active`, {
        file: fileName,
        targetEditor: targetEditor.document.uri.fsPath.split(/[\\/]/).pop(),
        activeEditor: vscode.window.activeTextEditor?.document.uri.fsPath.split(/[\\/]/).pop() || 'none',
      });
      return;
    }

    // 条件 2：光标必须仍在原位置附近
    const currentPos = targetEditor.selection.active;
    if (currentPos.line !== targetPosition.line) {
      this.logger.debug(`[Scheduler] ⏭️ Skip trigger: line changed`, {
        file: fileName,
        originalLine: targetPosition.line,
        currentLine: currentPos.line,
      });
      return;
    }
    const charDiff = Math.abs(currentPos.character - targetPosition.character);
    if (charDiff > 2) {
      this.logger.debug(`[Scheduler] ⏭️ Skip trigger: cursor moved too far`, {
        file: fileName,
        originalChar: targetPosition.character,
        currentChar: currentPos.character,
        diff: charDiff,
      });
      return;
    }

    // 条件 3：限频检查
    const timeSinceLastTrigger = now - this.lastTriggerAt;
    if (timeSinceLastTrigger < this.TRIGGER_COOLDOWN_MS) {
      this.logger.debug(`[Scheduler] ⏭️ Skip trigger: cooldown`, {
        file: fileName,
        timeSinceLastTrigger: `${timeSinceLastTrigger}ms`,
        cooldown: `${this.TRIGGER_COOLDOWN_MS}ms`,
      });
      return;
    }

    // 条件 4：确认有新缓存
    if (!this.cache.has(cacheKey)) {
      this.logger.debug(`[Scheduler] ⏭️ Skip trigger: no cache for key`, {
        file: fileName,
        cacheKey: cacheKey.slice(0, 60) + '...',
      });
      return;
    }

    // ✅ 所有条件满足，安全触发
    this.lastTriggerAt = now;
    this.logger.info(`[Scheduler] 🎯 Triggering inline suggest command`, {
      file: fileName,
      position: `${currentPos.line}:${currentPos.character}`,
      cacheSize: this.cache.size(),
    });
    vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
  }

  /**
   * 取消待处理的防抖定时器
   * 🆕 优化：不再取消正在进行的 API 请求，让它完成并缓存结果
   * 这样即使用户快速输入/删除，之前的请求结果仍然可用
   */
  private cancelPending(session: FileSession) {
    if (session.debounceTimer) {
      clearTimeout(session.debounceTimer);
      session.debounceTimer = null;
    }

    // 🆕 不再取消正在进行的 API 请求
    // 让请求完成并缓存结果，即使用户已经移动了光标
    // 这样下次回到相近位置时可以使用缓存
    // if (session.pendingController) {
    //   session.pendingController.abort();
    //   session.pendingController = null;
    // }
  }

  /**
   * 获取或创建 Session
   */
  private getOrCreateSession(
    uri: string,
    document: vscode.TextDocument
  ): FileSession {
    let session = this.sessions.get(uri);

    if (!session) {
      const editor = vscode.window.visibleTextEditors.find(
        ed => ed.document === document
      );
      const position = editor?.selection.active || new vscode.Position(0, 0);
      const lineText = position.line < document.lineCount
        ? document.lineAt(position.line).text
        : '';

      session = {
        uri,
        lastPosition: position,
        lastLineText: lineText,
        charDelta: 0,
        lastRequestTime: 0,
        pendingController: null,
        debounceTimer: null,
        requestCount: 0,
        cacheHits: 0,
        skippedRequests: 0,
      };

      this.sessions.set(uri, session);
    }

    return session;
  }

  /**
   * 更新 Session 状态
   */
  private updateSession(
    session: FileSession,
    document: vscode.TextDocument
  ) {
    const editor = vscode.window.visibleTextEditors.find(
      ed => ed.document === document
    );
    if (!editor) return;

    const position = editor.selection.active;
    const currentLine = document.lineAt(position.line).text;

    session.charDelta = Math.abs(currentLine.length - session.lastLineText.length);
    session.lastPosition = position;
    session.lastLineText = currentLine;
    session.lastRequestTime = Date.now();
  }

  /**
   * 检查是否是代码文件
   */
  private isCodeFile(document: vscode.TextDocument): boolean {
    const codeLanguages = [
      'javascript', 'typescript', 'javascriptreact', 'typescriptreact',
      'python', 'java', 'go', 'rust', 'cpp', 'c', 'csharp',
      'php', 'ruby', 'swift', 'kotlin', 'scala', 'dart',
    ];
    return codeLanguages.includes(document.languageId);
  }

  /**
   * 获取统计信息
   */
  getStats(uri?: string) {
    if (uri) {
      const session = this.sessions.get(uri);
      return session ? {
        requestCount: session.requestCount,
        cacheHits: session.cacheHits,
        skippedRequests: session.skippedRequests,
      } : null;
    }

    // 全局统计
    let totalRequests = 0;
    let totalCacheHits = 0;
    let totalSkipped = 0;

    this.sessions.forEach(session => {
      totalRequests += session.requestCount;
      totalCacheHits += session.cacheHits;
      totalSkipped += session.skippedRequests;
    });

    return {
      totalRequests,
      totalCacheHits,
      totalSkipped,
      cacheStats: this.cache.getStats(),
    };
  }
}

