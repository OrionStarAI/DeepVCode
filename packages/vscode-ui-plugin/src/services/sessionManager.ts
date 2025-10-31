/**
 * Session Manager Service
 * 多会话管理核心服务
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { Logger } from '../utils/logger';
import { AIService } from './aiService';
import { MultiSessionCommunicationService } from './multiSessionCommunicationService';
import {
  Config,
  ApprovalMode,
  ToolRegistry,
  FileDiscoveryService,
  loadServerHierarchicalMemory,
  DEFAULT_MEMORY_FILE_FILTERING_OPTIONS
} from 'deepv-code-core';
import {
  SessionState,
  SessionInfo,
  CreateSessionRequest,
  UpdateSessionRequest,
  SwitchSessionRequest,
  SessionManagerState,
  SessionEvent,
  SessionMessage,
  SessionModelConfig
} from '../types/sessionTypes';
import {
  SessionStatus,
  SessionType,
  SESSION_CONSTANTS,
  SESSION_ERROR_MESSAGES
} from '../constants/sessionConstants';
// 临时注释掉未实现的依赖
// import { SessionFactory } from './sessionFactory';
import { SessionPersistenceService } from './sessionPersistence';

/**
 * SessionManager - 多会话管理核心类
 *
 * 职责：
 * - 管理多个AI会话实例
 * - 处理会话切换和状态同步
 * - 提供统一的会话操作接口
 * - 管理会话生命周期
 */
export class SessionManager extends EventEmitter {
  private readonly sessions: Map<string, SessionState> = new Map();
  private readonly aiServices: Map<string, AIService> = new Map();
  private currentSessionId: string | null = null;
  private isInitialized = false;

  // 🎯 用户内存/上下文内容缓存（全局共享）
  private userMemoryContent: string = '';
  private userMemoryFileCount: number = 0;
  private memoryInitialized = false;

  // 🎯 等待UI历史记录的Promise映射
  private readonly pendingHistoryRequests: Map<string, {
    resolve: (uiHistory: SessionMessage[]) => void;
    reject: (error: Error) => void;
    aiClientHistory: unknown[];
    timeout?: NodeJS.Timeout;
  }> = new Map();

  private readonly persistenceService: SessionPersistenceService;

  // 🎯 版本控制管理器引用
  private versionControlManager?: any;

  constructor(
    private readonly logger: Logger,
    private readonly communicationService: MultiSessionCommunicationService,
    private readonly extensionContext: vscode.ExtensionContext,
    // private readonly sessionFactory: SessionFactory,
  ) {
    super();

    // 初始化持久化服务
    this.persistenceService = new SessionPersistenceService(this.logger, extensionContext);

    this.setupEventHandlers();
  }

  /**
   * 🎯 设置版本控制管理器
   */
  setVersionControlManager(versionControlManager: any) {
    this.versionControlManager = versionControlManager;
    this.logger.info('✅ Version Control Manager set for SessionManager');
  }

  /**
   * 🎯 获取VSCode工作区根目录
   */
  private getWorkspaceRoot(): string {
    // 优先使用第一个工作区文件夹
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      return workspaceFolder.uri.fsPath;
    }

    // 回退到rootPath（已废弃但作为兼容）
    if (vscode.workspace.rootPath) {
      return vscode.workspace.rootPath;
    }

    // 最后的回退选项
    return process.cwd();
  }

  // =============================================================================
  // 初始化和生命周期管理
  // =============================================================================

  /**
   * 初始化SessionManager
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('🚀 Initializing SessionManager...');

      // 🎯 首先初始化持久化服务
      await this.persistenceService.initialize();

      // 🎯 初始化用户内存/上下文内容（在创建AI服务之前）
      await this.initializeUserMemory();

      // 🎯 加载持久化的会话数据
      try {
        const persistedSessions = await this.persistenceService.loadSessions();
        if (persistedSessions.length > 0) {
          await this.restoreSessions(persistedSessions);
          this.logger.info(`📦 Restored ${persistedSessions.length} persisted sessions`);
        } else {
          // 没有持久化会话，创建默认会话
          // await this.createDefaultSession();
        }
      } catch (error) {
        this.logger.warn('⚠️ Failed to load persisted sessions, creating default session', error instanceof Error ? error : undefined);
      //  await this.createDefaultSession();
      }

      // 🎯 移除初始化时的备份创建

      this.isInitialized = true;
      this.logger.info(`✅ SessionManager initialized with ${this.sessions.size} sessions`);

    } catch (error) {
      this.logger.error('❌ Failed to initialize SessionManager', error instanceof Error ? error : undefined);
      throw new Error(`SessionManager initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 🎯 初始化用户内存/上下文内容
   * 只初始化一次，所有session共享同一份内存内容
   */
  private async initializeUserMemory(): Promise<void> {
    if (this.memoryInitialized) {
      this.logger.debug('📝 User memory already initialized, skipping...');
      return;
    }

    await this.doLoadUserMemory(true);
  }

  /**
   * 🎯 执行实际的用户内存加载逻辑
   */
  private async doLoadUserMemory(isInitialLoad: boolean = false): Promise<void> {
    try {
      if (isInitialLoad) {
        this.logger.info('📖 Initializing user memory/context content...');
      } else {
        this.logger.info('🔄 Refreshing user memory/context content...');
      }

      const workspaceRoot = this.getWorkspaceRoot();
      const fileService = new FileDiscoveryService(workspaceRoot);

      const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
        workspaceRoot,
        false, // debugMode - 在生产环境中关闭
        fileService,
        [], // extensionContextFilePaths - VSCode插件暂时不支持扩展
        DEFAULT_MEMORY_FILE_FILTERING_OPTIONS
      );

      this.userMemoryContent = memoryContent;
      this.userMemoryFileCount = fileCount;
      this.memoryInitialized = true;

      if (memoryContent.length > 0) {
        const action = isInitialLoad ? 'loaded' : 'refreshed';
        this.logger.info(`✅ User memory ${action}: ${Math.round(memoryContent.length / 1024)}KB from ${fileCount} file(s)`);
      } else {
        const action = isInitialLoad ? 'found' : 'refreshed';
        this.logger.info(`ℹ️ No user memory content ${action} (no DEEPV.md/GEMINI.md files)`);
      }

    } catch (error) {
      const action = isInitialLoad ? 'initialize' : 'refresh';
      this.logger.warn(`⚠️ Failed to ${action} user memory, continuing without context files`, error instanceof Error ? error : undefined);
      // 不抛出错误，允许系统在没有内存文件的情况下继续运行
      this.userMemoryContent = '';
      this.userMemoryFileCount = 0;
      this.memoryInitialized = true;
    }
  }

  /**
   * 🎯 刷新用户内存内容并更新所有活跃的AI服务
   * 当memoryTool执行完成后调用此方法
   */
  public async refreshUserMemory(): Promise<void> {
    try {
      // 重新加载内存内容
      await this.doLoadUserMemory(false);

      // 更新所有活跃AI服务的内存内容
      const updatePromises: Promise<void>[] = [];

      for (const [sessionId, aiService] of this.aiServices) {
        const session = this.sessions.get(sessionId);
        if (session && session.info.status !== SessionStatus.CLOSED) {
          updatePromises.push(this.updateAIServiceMemory(sessionId, aiService));
        }
      }

      // 等待所有更新完成
      await Promise.all(updatePromises);

      this.logger.info(`🔄 Memory refresh completed for ${updatePromises.length} active sessions`);

    } catch (error) {
      this.logger.error('❌ Failed to refresh user memory', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * 🎯 更新单个AI服务的内存内容
   */
  private async updateAIServiceMemory(sessionId: string, aiService: AIService): Promise<void> {
    try {
      // 获取AI服务的config实例并更新内存内容
      const config = aiService.getConfig();
      if (config) {
        config.setUserMemory(this.userMemoryContent);
        config.setGeminiMdFileCount(this.userMemoryFileCount);
        this.logger.debug(`📝 Updated memory for session ${sessionId}`);
      }
    } catch (error) {
      this.logger.warn(`⚠️ Failed to update memory for session ${sessionId}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 销毁SessionManager和所有会话
   */
  async dispose(): Promise<void> {
    try {
      this.logger.info('🔄 Disposing SessionManager...');

      // 🎯 清理所有等待中的UI历史记录请求
      for (const [sessionId, pendingRequest] of this.pendingHistoryRequests) {
        if (pendingRequest.timeout) {
          clearTimeout(pendingRequest.timeout);
        }
        pendingRequest.reject(new Error('SessionManager is being disposed'));
        this.logger.debug(`🧹 Cleaned pending history request for session: ${sessionId}`);
      }
      this.pendingHistoryRequests.clear();

      // 销毁所有AI服务实例
      for (const [sessionId, aiService] of this.aiServices) {
        try {
          await aiService.dispose();
          this.logger.info(`✅ Disposed AIService for session: ${sessionId}`);
        } catch (error) {
          this.logger.error(`❌ Error disposing AIService for session ${sessionId}`, error instanceof Error ? error : undefined);
        }
      }

      // 清理所有状态
      this.sessions.clear();
      this.aiServices.clear();
      this.currentSessionId = null;
      this.isInitialized = false;

      // 移除所有事件监听器
      this.removeAllListeners();

      this.logger.info('✅ SessionManager disposed successfully');

    } catch (error) {
      this.logger.error('❌ Error during SessionManager disposal', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 🎯 重新初始化所有Session的AI服务（登录后调用）
   */
  async reinitializeAllSessions(): Promise<void> {
    try {
      this.logger.info('🔄 Reinitializing all sessions after login...');

      const sessionIds = Array.from(this.aiServices.keys());

      for (const sessionId of sessionIds) {
        try {
          // 销毁旧的AI服务
          const oldAiService = this.aiServices.get(sessionId);
          if (oldAiService) {
            await oldAiService.dispose();
          }

          // 创建新的AI服务实例
          const newAiService = new AIService(this.logger, this.extensionContext.extensionPath);

          // 设置通信服务
          newAiService.setCommunicationService(this.communicationService);
          newAiService.setSessionHistoryManager(this);
          newAiService.setSessionId(sessionId);

          // 🎯 使用正确的VSCode工作区根目录初始化AI服务
          const workspaceRoot = this.getWorkspaceRoot();
          await newAiService.initialize(workspaceRoot);

          // 更新映射
          this.aiServices.set(sessionId, newAiService);

          this.logger.info(`✅ Reinitialized AIService for session: ${sessionId}`);

        } catch (error) {
          this.logger.error(`❌ Failed to reinitialize session ${sessionId}`, error instanceof Error ? error : undefined);
        }
      }

      this.logger.info('✅ All sessions reinitialized successfully');

    } catch (error) {
      this.logger.error('❌ Error during session reinitialization', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * 🎯 设置项目级别的YOLO模式并同步到所有session
   */
  async setProjectYoloMode(enabled: boolean): Promise<void> {
    try {
      this.logger.info(`🚀 Setting project YOLO mode: ${enabled ? 'enabled' : 'disabled'}`);

      const sessionIds = Array.from(this.aiServices.keys());
      if (sessionIds.length === 0) {
        this.logger.warn('No AI services available for YOLO mode setting');
        return;
      }

      let projectConfigUpdated = false;

      // 🎯 遍历所有session，同步YOLO模式设置
      for (const sessionId of sessionIds) {
        try {
          const aiService = this.aiServices.get(sessionId);
          if (aiService) {
            const config = aiService.getConfig();
            if (config) {
              const targetMode = enabled ? ApprovalMode.YOLO : ApprovalMode.DEFAULT;

              // 🎯 只在第一个session上保存到项目配置，避免重复写入
              if (!projectConfigUpdated) {
                config.setApprovalModeWithProjectSync(targetMode, true);
                projectConfigUpdated = true;
                this.logger.info(`✅ YOLO mode set to: ${targetMode}, saved to project config`);
              } else {
                // 其他session只设置内存中的模式，不重复写项目文件
                config.setApprovalModeWithProjectSync(targetMode, false);
              }

              this.logger.debug(`📝 Updated YOLO mode for session: ${sessionId}`);
            }
          }
        } catch (error) {
          this.logger.error(`❌ Failed to set YOLO mode for session ${sessionId}`, error instanceof Error ? error : undefined);
        }
      }

      // 🎯 通知SessionManager层面的状态变更（不需要通知前端，因为前端触发的）
      this.logger.info(`✅ Project YOLO mode synchronized to all ${sessionIds.length} sessions`);

    } catch (error) {
      this.logger.error('❌ Failed to set project YOLO mode', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  // =============================================================================
  // Session创建和管理
  // =============================================================================

  /**
   * 创建新会话
   * 🎯 优化：创建时只做本地操作，延迟初始化AIService到真正需要时
   */
  async createSession(request: CreateSessionRequest): Promise<string> {
    try {
      this.validateSessionLimits();

      // TODO: 使用SessionFactory创建Session
      // const sessionState = await this.sessionFactory.createSession(request);

      // 🎯 快速创建本地Session状态，不涉及服务器连接
      const sessionId = this.generateSessionId();

      // 🎯 新创建的session通常应该立即激活并切换
      // 只有在明确指定不切换时才保持IDLE状态
      const shouldActivate = request.activateImmediately !== false;

      const sessionState: SessionState = {
        info: {
          id: sessionId,
          name: request.name || 'New Session',
          type: request.type,
          status: shouldActivate ? SessionStatus.ACTIVE : SessionStatus.IDLE,
          createdAt: Date.now(),
          lastActivity: Date.now(),
          messageCount: 0
        },
        messages: [],
        activeToolCalls: [],
        isLoading: false,
        context: {}
      };

      // 🎯 延迟初始化：只创建AIService实例，不立即初始化
      const aiService = this.createLightweightAIService(sessionState.info.id);

      this.sessions.set(sessionState.info.id, sessionState);
      this.aiServices.set(sessionState.info.id, aiService);

      // 🎯 如果需要激活，设置为当前session并将之前的session设为IDLE
      if (shouldActivate) {
        // 将之前的current session设为IDLE
        if (this.currentSessionId && this.currentSessionId !== sessionId) {
          const previousSession = this.sessions.get(this.currentSessionId);
          if (previousSession) {
            previousSession.info.status = SessionStatus.IDLE;
          }
        }

        this.currentSessionId = sessionState.info.id;
      }

      // 🎯 持久化保存新创建的session（这是本地操作，很快）
      try {
        await this.persistenceService.saveSession(sessionState);
      } catch (error) {
        this.logger.warn('Failed to persist new session, continuing...', error instanceof Error ? error : undefined);
      }

      this.emitSessionEvent('created', sessionState.info.id, sessionState);
      this.logger.info(`✅ Created session: ${sessionState.info.name} (${sessionState.info.id}) - Status: ${shouldActivate ? 'ACTIVE' : 'IDLE'}`);

      return sessionId;

    } catch (error) {
      this.logger.error('❌ Failed to create session', error instanceof Error ? error : undefined);
      throw new Error(`${SESSION_ERROR_MESSAGES.SESSION_CREATION_FAILED}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      this.validateSessionExists(sessionId);

      // 不能删除最后一个会话
      if (this.sessions.size <= 1) {
        throw new Error(SESSION_ERROR_MESSAGES.CANNOT_DELETE_LAST_SESSION);
      }

      const sessionState = this.sessions.get(sessionId)!;

      // 销毁AI服务实例
      const aiService = this.aiServices.get(sessionId);
      if (aiService) {
        await aiService.dispose();
        this.aiServices.delete(sessionId);
      }

      // 删除会话状态
      this.sessions.delete(sessionId);

      // 🎯 从持久化存储中删除session
      await this.persistenceService.deleteSession(sessionId);

      // 如果删除的是当前会话，切换到第一个可用会话
      if (this.currentSessionId === sessionId) {
        const remainingSessions = Array.from(this.sessions.keys());
        if (remainingSessions.length > 0) {
          await this.switchToSession({ sessionId: remainingSessions[0] });
        }
      }

      this.emitSessionEvent('deleted', sessionId, sessionState);
      this.logger.info(`✅ Deleted session: ${sessionState.info.name} (${sessionId})`);

    } catch (error) {
      this.logger.error(`❌ Failed to delete session ${sessionId}`, error instanceof Error ? error : undefined);
      throw new Error(`${SESSION_ERROR_MESSAGES.SESSION_DELETION_FAILED}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 切换到指定会话
   */
  async switchToSession(request: SwitchSessionRequest): Promise<void> {
    try {
      this.validateSessionExists(request.sessionId);

      const previousSessionId = this.currentSessionId;

      // 保存当前会话状态（如果需要）
      if (previousSessionId && request.saveCurrentSession !== false) {
        // TODO: 实现Session状态保存
        // await this.saveSessionState(previousSessionId);
      }

      // 切换当前会话
      this.currentSessionId = request.sessionId;

      // 更新会话活跃时间
      const sessionState = this.sessions.get(request.sessionId)!;
      sessionState.info.lastActivity = Date.now();
      sessionState.info.status = SessionStatus.ACTIVE;

      // 如果之前有活跃会话，将其状态设置为空闲
      if (previousSessionId && previousSessionId !== request.sessionId) {
        const previousSession = this.sessions.get(previousSessionId);
        if (previousSession) {
          previousSession.info.status = SessionStatus.IDLE;
        }
      }

      this.emitSessionEvent('switched', request.sessionId, {
        from: previousSessionId,
        to: request.sessionId
      });

      this.logger.info(`✅ Switched to session: ${sessionState.info.name} (${request.sessionId})`);

    } catch (error) {
      this.logger.error(`❌ Failed to switch to session ${request.sessionId}`, error instanceof Error ? error : undefined);
      throw new Error(`${SESSION_ERROR_MESSAGES.SESSION_SWITCH_FAILED}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 更新会话信息
   */
  async updateSession(request: UpdateSessionRequest): Promise<void> {
    try {
      this.validateSessionExists(request.sessionId);

      const sessionState = this.sessions.get(request.sessionId)!;
      const originalInfo = { ...sessionState.info };

      // 应用更新
      if (request.updates.name !== undefined) {
        this.validateSessionName(request.updates.name);
        sessionState.info.name = request.updates.name;
      }

      if (request.updates.type !== undefined) {
        sessionState.info.type = request.updates.type;
      }

      if (request.updates.description !== undefined) {
        sessionState.info.description = request.updates.description;
      }

      if (request.updates.systemPrompt !== undefined) {
        sessionState.systemPrompt = request.updates.systemPrompt;
      }

      if (request.updates.modelConfig !== undefined) {
        sessionState.modelConfig = request.updates.modelConfig;
      }

      if (request.updates.settings !== undefined) {
        sessionState.settings = { ...sessionState.settings, ...request.updates.settings };
      }

      // 更新时间戳
      sessionState.info.lastActivity = Date.now();

      // 🎯 持久化保存更新后的session
      await this.persistenceService.saveSession(sessionState);

      this.emitSessionEvent('updated', request.sessionId, {
        original: originalInfo,
        updated: sessionState.info
      });

      this.logger.info(`✅ Updated session: ${sessionState.info.name} (${request.sessionId})`);

    } catch (error) {
      this.logger.error(`❌ Failed to update session ${request.sessionId}`, error instanceof Error ? error : undefined);
      throw new Error(`${SESSION_ERROR_MESSAGES.SESSION_RENAME_FAILED}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 更新会话基础信息 (用于AI服务等内部更新)
   */
  async updateSessionInfo(sessionId: string, updates: Partial<SessionInfo>): Promise<void> {
    try {
      this.validateSessionExists(sessionId);

      const sessionState = this.sessions.get(sessionId)!;
      const originalInfo = { ...sessionState.info };

      // 应用更新到session信息
      sessionState.info = { ...sessionState.info, ...updates, lastActivity: Date.now() };

      // 发送更新事件到UI
      this.emitSessionEvent('updated', sessionId, {
        original: originalInfo,
        updated: sessionState.info
      });

      // 如果是当前活跃会话，自动保存到持久化存储
      // if (sessionId === this.currentSessionId) {
      //   await this.persistenceService.saveSession(sessionState);
      // }

      this.communicationService.sendSessionUpdated(sessionId, sessionState.info);

      this.logger.info(`📝 Session info updated: ${sessionId}`, {
        updates,
        finalInfo: sessionState.info,
        hasTokenUsage: !!sessionState.info.tokenUsage
      });

    } catch (error) {
      this.logger.error(`❌ Failed to update session info ${sessionId}`, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  // =============================================================================
  // Session查询和访问方法
  // =============================================================================

  /**
   * 获取当前活跃会话状态
   */
  getCurrentSession(): SessionState | null {
    if (!this.currentSessionId) {
      return null;
    }
    return this.sessions.get(this.currentSessionId) || null;
  }



  /**
   * 获取所有会话信息列表
   */
  getAllSessionsInfo(): SessionInfo[] {
    return Array.from(this.sessions.values())
      .map(session => session.info)
      .sort((a, b) => b.lastActivity - a.lastActivity);
  }

  /**
   * 获取当前会话的AI服务实例
   */
  getCurrentAIService(): AIService | null {
    if (!this.currentSessionId) {
      return null;
    }
    return this.aiServices.get(this.currentSessionId) || null;
  }

  /**
   * 获取指定会话的AI服务实例
   */
  getAIService(sessionId: string): AIService | null {
    return this.aiServices.get(sessionId) || null;
  }

  /**
   * 🎯 获取已初始化的AI服务实例（用于需要AI功能的操作）
   */
  async getInitializedAIService(sessionId: string): Promise<AIService> {
    return await this.ensureAIServiceInitialized(sessionId);
  }

  /**
   * 🎯 获取当前会话的已初始化AI服务实例
   */
  async getCurrentInitializedAIService(): Promise<AIService> {
    if (!this.currentSessionId) {
      throw new Error('No current session available');
    }
    return await this.ensureAIServiceInitialized(this.currentSessionId);
  }

  /**
   * 获取所有session ID列表
   */
  getSessionIds(): string[] {
    return Array.from(this.aiServices.keys());
  }

  /**
   * 获取指定session的状态
   */
  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 获取SessionManager状态
   */
  getManagerState(): SessionManagerState {
    return {
      sessions: new Map(this.sessions),
      currentSessionId: this.currentSessionId,
      sessionList: this.getAllSessionsInfo(),
      isInitializing: !this.isInitialized,
      lastError: undefined
    };
  }

  // =============================================================================
  // 消息历史管理方法
  // =============================================================================

  /**
   * 添加消息到指定会话并持久化保存
   */
  async addMessageToSession(sessionId: string, message: SessionMessage): Promise<void> {
    try {
      this.validateSessionExists(sessionId);

      const sessionState = this.sessions.get(sessionId)!;
      sessionState.messages.push(message);
      sessionState.info.messageCount = sessionState.messages.length;
      sessionState.info.lastActivity = Date.now();

      // 🎯 持久化保存session状态（包含消息历史）
      await this.persistenceService.saveSession(sessionState);

      this.logger.debug(`💬 Added message to session ${sessionId}, total: ${sessionState.messages.length}`);

    } catch (error) {
      this.logger.error(`❌ Failed to add message to session ${sessionId}`, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * 更新指定会话的模型配置
   */
  async updateSessionModelConfig(sessionId: string, modelConfig: SessionModelConfig): Promise<void> {
    try {
      this.validateSessionExists(sessionId);

      const sessionState = this.sessions.get(sessionId)!;
      sessionState.modelConfig = { ...sessionState.modelConfig, ...modelConfig };
      sessionState.info.lastActivity = Date.now();

      // 🎯 持久化保存session状态
      await this.persistenceService.saveSession(sessionState);

      this.logger.info(`🎯 Updated model config for session ${sessionId}: ${modelConfig.modelName}`);

    } catch (error) {
      this.logger.error(`❌ Failed to update model config for session ${sessionId}`, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * 保存会话的完整历史记录（UI历史 + AI Client历史）
   */
  async saveSessionHistory(sessionId: string, uiHistory: SessionMessage[], aiClientHistory?: unknown[]): Promise<void> {
    try {
      this.validateSessionExists(sessionId);

      const sessionState = this.sessions.get(sessionId)!;

      // 🎯 更新session的消息历史
      sessionState.messages = uiHistory || [];
      sessionState.info.messageCount = sessionState.messages.length;
      sessionState.info.lastActivity = Date.now();

      // 🎯 保存AI Client的对话历史到context
      if (aiClientHistory) {
        sessionState.context = {
          ...sessionState.context,
          aiClientHistory: aiClientHistory
        };
      }

      // 🎯 持久化保存完整的session状态
      await this.persistenceService.saveSession(sessionState);

      this.logger.info(`📝 Saved session history for ${sessionId}: UI(${uiHistory.length}) + AI(${aiClientHistory?.length || 0})`);

    } catch (error) {
      this.logger.error(`❌ Failed to save session history for ${sessionId}`, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * 🎯 统一保存session的完整状态（AI历史 + UI历史）
   * 由aiService在chat流程结束时调用
   */
  async saveCompleteSessionHistory(sessionId: string): Promise<void> {
    try {
      this.validateSessionExists(sessionId);

      this.logger.debug(`📋 Starting complete session history save for: ${sessionId}`);

      // 1. 获取AI Service实例和AI历史记录
      const aiService = this.aiServices.get(sessionId);
      let aiClientHistory: unknown[] = [];
      if (aiService) {
        try {
          const geminiClient = aiService.getGeminiClient();
          if (geminiClient) {
            aiClientHistory = await geminiClient.getHistory() || [];
            this.logger.debug(`📚 Retrieved AI client history: ${aiClientHistory.length} items`);
          }
        } catch (error) {
          this.logger.warn('Failed to get AI client history', error instanceof Error ? error : undefined);
        }
      }

      // 2. 🎯 等待前端提供UI历史记录（使用Promise机制）
      const uiHistory = await this.requestAndWaitForUIHistory(sessionId, aiClientHistory);

      // 3. 🎯 统一保存AI历史 + UI历史
      await this.saveSessionHistory(sessionId, uiHistory, aiClientHistory);

      this.logger.info(`✅ Complete session history saved for: ${sessionId} - UI:${uiHistory.length}, AI:${aiClientHistory.length}`);

    } catch (error) {
      this.logger.error(`❌ Failed to save complete session history for ${sessionId}`, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * 🎯 请求前端UI历史记录并等待响应
   */
  private async requestAndWaitForUIHistory(sessionId: string, aiClientHistory: unknown[]): Promise<SessionMessage[]> {
    return new Promise<SessionMessage[]>((resolve, reject) => {
      // 设置超时机制（10秒）
      const timeout = setTimeout(() => {
        this.pendingHistoryRequests.delete(sessionId);
        this.logger.warn(`⏰ UI history request timeout for session: ${sessionId}, proceeding without UI history`);
        resolve([]); // 超时时返回空数组，不阻塞保存流程
      }, 10000);

      // 存储Promise的resolve/reject
      this.pendingHistoryRequests.set(sessionId, {
        resolve: (uiHistory: SessionMessage[]) => {
          clearTimeout(timeout);
          this.pendingHistoryRequests.delete(sessionId);
          resolve(uiHistory);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          this.pendingHistoryRequests.delete(sessionId);
          reject(error);
        },
        aiClientHistory,
        timeout
      });

      // 发送请求给前端
      this.requestUIHistoryFromFrontend(sessionId).catch(error => {
        clearTimeout(timeout);
        this.pendingHistoryRequests.delete(sessionId);
        reject(error);
      });
    });
  }

  /**
   * 🎯 处理前端发送的UI历史记录（由extension.ts调用）
   */
  async handleUIHistoryResponse(sessionId: string, uiMessages: SessionMessage[]): Promise<void> {
    const pendingRequest = this.pendingHistoryRequests.get(sessionId);
    if (pendingRequest) {
      this.logger.debug(`📥 Received UI history from frontend: ${uiMessages.length} messages for session ${sessionId}`);
      pendingRequest.resolve(uiMessages);
    } else {
      this.logger.debug(`📥 Received unexpected UI history for session: ${sessionId}`);
      // 即使没有等待的请求，也直接保存UI历史记录
      await this.saveSessionHistory(sessionId, uiMessages);
    }
  }

  /**
   * 🎯 请求前端发送UI历史记录
   */
  private async requestUIHistoryFromFrontend(sessionId: string): Promise<void> {
    try {
      // 通过communication service向前端发送请求UI历史的消息
      await this.communicationService.sendRequestUIHistory(sessionId);
    } catch (error) {
      this.logger.error(`Failed to request UI history from frontend for session ${sessionId}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * 获取会话的历史记录
   */
  getSessionHistory(sessionId: string): { uiHistory: SessionMessage[], aiClientHistory?: unknown[] } {
    try {
      this.validateSessionExists(sessionId);

      const sessionState = this.sessions.get(sessionId)!;
      return {
        uiHistory: sessionState.messages || [],
        aiClientHistory: sessionState.context?.aiClientHistory
      };

    } catch (error) {
      this.logger.error(`❌ Failed to get session history for ${sessionId}`, error instanceof Error ? error : undefined);
      return { uiHistory: [] };
    }
  }

  /**
   * 清空会话历史记录
   */
  async clearSessionHistory(sessionId: string): Promise<void> {
    try {
      this.validateSessionExists(sessionId);

      const sessionState = this.sessions.get(sessionId)!;
      sessionState.messages = [];
      sessionState.info.messageCount = 0;
      sessionState.info.lastActivity = Date.now();

      // 清空AI Client历史
      if (sessionState.context) {
        sessionState.context.aiClientHistory = [];
      }

      // 🎯 持久化保存清空后的状态
      await this.persistenceService.saveSession(sessionState);

      this.logger.info(`🗑️ Cleared session history for ${sessionId}`);

    } catch (error) {
      this.logger.error(`❌ Failed to clear session history for ${sessionId}`, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  // =============================================================================
  // 私有辅助方法
  // =============================================================================

  /**
   * 创建默认会话
   */
  // private async createDefaultSession(): Promise<void> {
  //   const defaultRequest: CreateSessionRequest = {
  //     name: SESSION_CONSTANTS.DEFAULT_SESSION_NAME,
  //     type: SessionType.CHAT,
  //     fromTemplate: true
  //   };

  //   await this.createSession(defaultRequest);
  // }

  /**
   * 恢复持久化的会话
   */
  private async restoreSessions(sessionStates: SessionState[]): Promise<void> {
    for (const sessionState of sessionStates) {
      try {
        // 创建AI服务实例
        const aiService = await this.createAIServiceForSession(sessionState.info.id);

        // 恢复会话状态
        this.sessions.set(sessionState.info.id, sessionState);
        this.aiServices.set(sessionState.info.id, aiService);

        // 设置第一个会话为当前会话
        if (!this.currentSessionId) {
          this.currentSessionId = sessionState.info.id;
          sessionState.info.status = SessionStatus.ACTIVE;
        } else {
          sessionState.info.status = SessionStatus.IDLE;
        }

        // 类型安全地恢复AI客户端历史记录
        const history = sessionState.context?.aiClientHistory;
        if (history && Array.isArray(history)) {
          aiService.getGeminiClient()?.setHistory(history as any[]);
        }

        this.logger.info(`✅ Restored session: ${sessionState.info.name} (${sessionState.info.id})`);

      } catch (error) {
        this.logger.error(`❌ Failed to restore session ${sessionState.info.id}`, error instanceof Error ? error : undefined);
      }
    }
  }

  /**
   * 🎯 创建轻量级AI服务实例（不立即初始化）
   */
  private createLightweightAIService(sessionId: string): AIService {
    const aiService = new AIService(this.logger, this.extensionContext.extensionPath);

    // 设置通信服务引用
    aiService.setCommunicationService(this.communicationService);

    // 🎯 设置SessionHistoryManager引用
    aiService.setSessionHistoryManager(this);

    // 🎯 设置版本控制管理器引用
    if (this.versionControlManager) {
      aiService.setVersionControlManager(this.versionControlManager);
    }

    // 设置Session ID
    aiService.setSessionId(sessionId);

    // 🎯 设置内存刷新回调
    aiService.setMemoryRefreshCallback(() => this.refreshUserMemory());

    // 🎯 不进行完整初始化，留到真正需要时再做
    this.logger.debug(`📦 Created lightweight AIService for session: ${sessionId}`);

    return aiService;
  }

  /**
   * 🎯 确保AI服务已完全初始化（延迟初始化）
   * 当真正需要AI功能时调用（如发送消息）
   */
  private async ensureAIServiceInitialized(sessionId: string): Promise<AIService> {
    const aiService = this.aiServices.get(sessionId);
    if (!aiService) {
      throw new Error(`AIService not found for session: ${sessionId}`);
    }

    // 如果已经初始化，直接返回
    if (aiService.isServiceInitialized) {
      return aiService;
    }

    try {
      this.logger.info(`🚀 Initializing AIService for session: ${sessionId}`);

      // 🎯 使用正确的VSCode工作区根目录初始化AI服务，并传递共享的用户内存内容和session模型配置
      const workspaceRoot = this.getWorkspaceRoot();
      const sessionState = this.sessions.get(sessionId);
      const sessionModel = sessionState?.modelConfig?.modelName;

      await aiService.initialize(workspaceRoot, {
        userMemory: this.userMemoryContent,
        geminiMdFileCount: this.userMemoryFileCount,
        sessionModel: sessionModel
      });

      this.logger.info(`✅ AIService initialized for session: ${sessionId}`);
      return aiService;

    } catch (error) {
      this.logger.error(`❌ Failed to initialize AI service for session ${sessionId}`, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * 为会话创建AI服务实例（保留用于恢复session）
   */
  private async createAIServiceForSession(sessionId: string): Promise<AIService> {
    try {
      const aiService = new AIService(this.logger, this.extensionContext.extensionPath);

      // 设置通信服务引用
      aiService.setCommunicationService(this.communicationService);

      // 🎯 设置SessionHistoryManager引用
      aiService.setSessionHistoryManager(this);

      // 设置Session ID
      aiService.setSessionId(sessionId);

      // 🎯 设置内存刷新回调
      aiService.setMemoryRefreshCallback(() => this.refreshUserMemory());

      // 🎯 使用正确的VSCode工作区根目录初始化AI服务，并传递共享的用户内存内容和session模型配置
      const workspaceRoot = this.getWorkspaceRoot();
      const sessionState = this.sessions.get(sessionId);
      const sessionModel = sessionState?.modelConfig?.modelName;

      await aiService.initialize(workspaceRoot, {
        userMemory: this.userMemoryContent,
        geminiMdFileCount: this.userMemoryFileCount,
        sessionModel: sessionModel
      });

      return aiService;

    } catch (error) {
      this.logger.error(`❌ Failed to create AI service for session ${sessionId}`, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * 验证会话限制，如果达到限制则自动踢出最老的非活跃session
   * 注意：只从内存中移除，磁盘数据保留（最多保留50个）
   */
  private validateSessionLimits(): void {
    if (this.sessions.size < SESSION_CONSTANTS.MAX_SESSIONS) {
      return; // 未达到限制，无需处理
    }

    this.logger.info(`Session数量达到限制 ${SESSION_CONSTANTS.MAX_SESSIONS}，尝试踢出最老的非活跃session`);

    // 查找可以删除的session（不在执行中且不是当前session）
    const removableSessions = Array.from(this.sessions.values()).filter(session =>
      session.info.id !== this.currentSessionId &&  // 不是当前session
      session.info.status !== SessionStatus.PROCESSING  // 不在执行中
    );

    if (removableSessions.length === 0) {
      this.logger.error('无法创建新session：所有session都在执行中或是当前session');
      throw new Error('无法创建新会话：所有会话都在使用中，请先关闭一些会话');
    }

    // 按最后活跃时间排序，最老的在前面
    const sortedSessions = removableSessions.sort((a, b) => a.info.lastActivity - b.info.lastActivity);
    const oldestSession = sortedSessions[0];

    this.logger.info(`自动踢出最老的session: ${oldestSession.info.id} (${oldestSession.info.name}), lastActivity: ${new Date(oldestSession.info.lastActivity)}`);

    try {
      // 🎯 只从内存中移除session，保留磁盘数据
      this.sessions.delete(oldestSession.info.id);

      // 销毁AI服务实例释放内存
      const aiService = this.aiServices.get(oldestSession.info.id);
      if (aiService) {
        aiService.dispose().catch(error => {
          this.logger.error(`销毁AI服务失败: ${oldestSession.info.id}`, error instanceof Error ? error : undefined);
        });
        this.aiServices.delete(oldestSession.info.id);
      }

      // 🎯 异步清理磁盘上的旧session（保留最近50个）
      this.cleanupOldSessionsAsync();

      this.logger.info(`成功踢出session: ${oldestSession.info.id}（磁盘数据已保留）`);
    } catch (error) {
      this.logger.error('踢出session失败:', error instanceof Error ? error : undefined);
      throw new Error('创建新会话失败：清理旧会话时出错');
    }
  }

  /**
   * 异步清理磁盘上过多的session（保留最近50个）
   */
  private async cleanupOldSessionsAsync(): Promise<void> {
    try {
      await this.persistenceService.cleanupOldSessions(50);
      this.logger.info('已清理磁盘上的过期session数据');
    } catch (error) {
      this.logger.error('清理磁盘session数据失败:', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 验证会话是否存在
   */
  private validateSessionExists(sessionId: string): void {
    if (!this.sessions.has(sessionId)) {
      throw new Error(SESSION_ERROR_MESSAGES.SESSION_NOT_FOUND);
    }
  }

  /**
   * 验证会话名称
   */
  private validateSessionName(name: string): void {
    if (!name || name.trim().length === 0 || name.length > SESSION_CONSTANTS.MAX_SESSION_NAME_LENGTH) {
      throw new Error(SESSION_ERROR_MESSAGES.INVALID_SESSION_NAME);
    }
  }

  /**
   * 发送会话事件
   */
  private emitSessionEvent(type: SessionEvent['type'], sessionId: string, data?: any): void {
    const event: SessionEvent = {
      type,
      sessionId,
      data,
      timestamp: Date.now()
    };

    this.emit('sessionEvent', event);
  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    // 🎯 移除所有定时保存和备份机制
    // 现在只依赖即时保存
    this.logger.info('📋 Session persistence: immediate save only, no periodic saves or backups');
  }


  /**
   * 保存所有会话状态（仅在需要时手动调用）
   */
  private async saveAllSessions(): Promise<void> {
    try {
      const sessionStates = Array.from(this.sessions.values());
      await this.persistenceService.saveSessions(sessionStates);
      this.logger.debug(`💾 Manual saved ${sessionStates.length} sessions`);
    } catch (error) {
      this.logger.error('❌ Failed to save sessions', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 生成Session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${SESSION_CONSTANTS.DEFAULT_SESSION_PREFIX}-${timestamp}-${random}`;
  }
}
