/**
 * @license
 * Copyright 2025 DeepV Code
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import { InlineCompletionService, InlineCompletionRequest } from 'deepv-code-core';
import { CompletionCache, buildCacheKeys, CachedCompletion } from './completionCache';
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
  private readonly TRIGGER_COOLDOWN_MS = 250;
  
  // 配置参数（可根据需要调整）
  // 推荐值：DEBOUNCE_MS=300, THROTTLE_CHARS=6, MIN_INTERVAL_MS=200
  // 激进值：DEBOUNCE_MS=500, THROTTLE_CHARS=8, MIN_INTERVAL_MS=300
  private readonly DEBOUNCE_MS = 300;       // 防抖时间（ms）
  private readonly THROTTLE_CHARS = 6;      // 节流字符数
  private readonly MIN_INTERVAL_MS = 200;   // 最小间隔（ms）
  
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
    // 只处理代码文件
    if (!this.isCodeFile(event.document)) {
      return;
    }
    
    const uri = event.document.uri.toString();
    const session = this.getOrCreateSession(uri, event.document);
    
    // 智能判断：是否需要请求？
    if (!this.shouldRequest(session, event.document)) {
      return;
    }
    
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
    const editor = vscode.window.visibleTextEditors.find(
      ed => ed.document === document
    );
    if (!editor) return false;
    
    const position = editor.selection.active;
    
    // === 第一步：快速拦截 ===
    
    // 时间间隔太短
    if (now - session.lastRequestTime < this.MIN_INTERVAL_MS) {
      session.skippedRequests++;
      return false;
    }
    
    // 只是光标移动，内容未变
    const currentLine = document.lineAt(position.line).text;
    if (currentLine === session.lastLineText && 
        !position.isEqual(session.lastPosition)) {
      return false;
    }
    
    // === 第二步：节流检查 ===
    
    const charDelta = Math.abs(currentLine.length - session.lastLineText.length);
    const isStrongTrigger = this.isStrongTrigger(currentLine);
    
    // 字符增量 < 阈值 且非强触发
    if (charDelta < this.THROTTLE_CHARS && !isStrongTrigger) {
      session.skippedRequests++;
      return false;
    }
    
    // === 第三步：缓存检查 ===
    
    const keys = buildCacheKeys(document, position);
    if (this.cache.has(keys.hard) || this.cache.has(keys.soft)) {
      session.cacheHits++;
      session.skippedRequests++;
      return false;
    }
    
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
    // 获取目标编辑器和位置
    const targetEditor = vscode.window.visibleTextEditors.find(
      ed => ed.document === document
    );
    if (!targetEditor) return;
    
    const targetPosition = targetEditor.selection.active;
    
    try {
      // 创建 AbortController
      const controller = new AbortController();
      session.pendingController = controller;
      
      // 构建请求
      const request = this.buildRequest(document, targetPosition);
      
      this.logger.debug('Executing completion request', {
        file: document.uri.fsPath,
        position: `${targetPosition.line}:${targetPosition.character}`,
      });
      
      const startTime = Date.now();
      
      // 调用 API
      const result = await this.completionService.generateCompletion(
        request,
        controller.signal
      );
      
      const duration = Date.now() - startTime;
      
      if (result && !controller.signal.aborted) {
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
        
        this.logger.info(`✅ Completion cached in ${duration}ms`, {
          requestCount: session.requestCount,
          cacheSize: this.cache.size(),
        });
        
        // ✅ 安全地主动触发
        this.safeTriggerInlineSuggest(targetEditor, targetPosition, keys.hard);
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
    
    // 提取上下文 - 后缀（⚠️ 修复：必须取到行尾）
    const endLine = Math.min(document.lineCount - 1, position.line + 20);
    const endChar = document.lineAt(endLine).range.end.character;  // ← 修复点
    const suffixRange = new vscode.Range(
      position,
      new vscode.Position(endLine, endChar)
    );
    const suffix = document.getText(suffixRange).slice(0, 1200);
    
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
    
    // 条件 1：编辑器必须仍然是激活状态
    if (targetEditor !== vscode.window.activeTextEditor) {
      this.logger.debug('Skip trigger: editor not active');
      return;
    }
    
    // 条件 2：光标必须仍在原位置附近
    const currentPos = targetEditor.selection.active;
    if (currentPos.line !== targetPosition.line) {
      this.logger.debug('Skip trigger: line changed');
      return;
    }
    if (Math.abs(currentPos.character - targetPosition.character) > 2) {
      this.logger.debug('Skip trigger: cursor moved too far');
      return;
    }
    
    // 条件 3：限频检查
    if (now - this.lastTriggerAt < this.TRIGGER_COOLDOWN_MS) {
      this.logger.debug('Skip trigger: cooldown');
      return;
    }
    
    // 条件 4：确认有新缓存
    if (!this.cache.has(cacheKey)) {
      this.logger.debug('Skip trigger: no cache');
      return;
    }
    
    // ✅ 所有条件满足，安全触发
    this.lastTriggerAt = now;
    this.logger.debug('✨ Triggering inline suggest');
    vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
  }
  
  /**
   * 取消进行中的请求
   */
  private cancelPending(session: FileSession) {
    if (session.debounceTimer) {
      clearTimeout(session.debounceTimer);
      session.debounceTimer = null;
    }
    
    if (session.pendingController) {
      session.pendingController.abort();
      session.pendingController = null;
    }
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

