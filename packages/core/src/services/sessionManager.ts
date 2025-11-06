/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import { getProjectTempDir } from '../utils/paths.js';
import { getErrorMessage } from '../utils/errors.js';

export interface SessionMetadata {
  sessionId: string;
  title: string;
  createdAt: string;
  lastActiveAt: string;
  messageCount: number;
  totalTokens: number;
  model?: string;
  hasCheckpoint: boolean;
  firstUserMessage?: string;
  lastAssistantMessage?: string;
  workdirHash?: string;
}

export interface SessionIndex {
  lastActiveSession?: string;
  sessions: SessionMetadata[];
}

export interface SessionTokenData {
  sessionId: string;
  startTime: string;
  models: Record<string, {
    tokens: {
      prompt: number;
      candidates: number;
      total: number;
      cached: number;
      thoughts: number;
      tool: number;
    };
    apiCalls: number;
    lastUpdate: string;
  }>;
}

export interface SessionData {
  sessionId: string;
  metadata: SessionMetadata;
  history?: any[];
  clientHistory?: any[];
  checkpoints: any[];
  tokens: SessionTokenData;
}

export class SessionManager {
  private projectRoot: string;
  private sessionsDir: string;
  private indexPath: string;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
    const projectTempDir = getProjectTempDir(this.projectRoot);
    this.sessionsDir = path.join(projectTempDir, 'sessions');
    this.indexPath = path.join(this.sessionsDir, 'index.json');
  }

  /**
   * 生成新的session ID (使用标准UUID格式)
   */
  private generateSessionId(): string {
    return randomUUID();
  }

  /**
   * 计算workdir的hash值
   */
  private getWorkdirHash(workdir?: string): string {
    const dirToHash = workdir || process.cwd();
    return createHash('sha256').update(dirToHash).digest('hex');
  }

  /**
   * 获取session目录路径
   */
  private getSessionDir(sessionId: string): string {
    return path.join(this.sessionsDir, sessionId);
  }

  /**
   * 确保sessions目录存在
   */
  private async ensureSessionsDir(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
  }

  /**
   * 加载session索引
   */
  private async loadIndex(): Promise<SessionIndex> {
    try {
      const content = await fs.readFile(this.indexPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return {
        sessions: []
      };
    }
  }

  /**
   * 保存session索引
   */
  private async saveIndex(index: SessionIndex): Promise<void> {
    await this.ensureSessionsDir();
    await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2));
  }

  /**
   * 获取最后活跃的session ID
   * 对于-c参数，优先返回最近的有实际对话内容的session
   */
  async getLastActiveSession(requireContent: boolean = false): Promise<string | undefined> {
    const index = await this.loadIndex();

    if (!requireContent) {
      return index.lastActiveSession;
    }

    // 查找最近的有实际对话内容的session
    for (const session of index.sessions) {
      try {
        const sessionDir = this.getSessionDir(session.sessionId);
        const historyFile = path.join(sessionDir, 'history.json');

        // 检查是否存在history文件且有实际对话内容
        const historyContent = await fs.readFile(historyFile, 'utf-8');
        const history = JSON.parse(historyContent);

        // 检查是否有用户消息（type为'user'）
        if (Array.isArray(history) && history.some(item => item.type === 'user')) {
          return session.sessionId;
        }
      } catch {
        // 文件不存在或无法读取，跳过
        continue;
      }
    }

    // 如果没有找到有内容的session，返回最后活跃的session
    return index.lastActiveSession;
  }

  /**
   * 创建新session
   */
  async createNewSession(title?: string, workdir?: string): Promise<SessionData> {
    const sessionId = this.generateSessionId();
    const now = new Date().toISOString();
    const sessionDir = this.getSessionDir(sessionId);

    await fs.mkdir(sessionDir, { recursive: true });

    const metadata: SessionMetadata = {
      sessionId,
      title: title || `Session ${new Date().toLocaleString()}`,
      createdAt: now,
      lastActiveAt: now,
      messageCount: 0,
      totalTokens: 0,
      hasCheckpoint: false,
      workdirHash: this.getWorkdirHash(workdir)
    };

    const tokens: SessionTokenData = {
      sessionId,
      startTime: now,
      models: {}
    };

    // 保存metadata
    await fs.writeFile(
      path.join(sessionDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    // 保存初始token数据
    await fs.writeFile(
      path.join(sessionDir, 'tokens.json'),
      JSON.stringify(tokens, null, 2)
    );

    // 保存初始历史
    await fs.writeFile(
      path.join(sessionDir, 'history.json'),
      JSON.stringify([], null, 2)
    );

    // 保存初始上下文
    await fs.writeFile(
      path.join(sessionDir, 'context.json'),
      JSON.stringify([], null, 2)
    );

    // 更新索引
    await this.updateSessionIndex(sessionId, metadata);

    return {
      sessionId,
      metadata,
      history: [],
      clientHistory: [],
      checkpoints: [],
      tokens
    };
  }

  /**
   * 加载指定session，若缺失文件或目录则自动创建
   */
  async loadSession(sessionId: string): Promise<SessionData | null> {
    const sessionDir = this.getSessionDir(sessionId);

    try {
      // 确保session目录存在
      await fs.mkdir(sessionDir, { recursive: true });

      const metadataPath = path.join(sessionDir, 'metadata.json');
      const tokensPath = path.join(sessionDir, 'tokens.json');
      const historyPath = path.join(sessionDir, 'history.json');
      const contextPath = path.join(sessionDir, 'context.json');

      // 尝试读取所有文件，缺失则创建
      let metadata: SessionMetadata;
      let tokens: SessionTokenData;
      let history: any[];
      let clientHistory: any[];

      // 读取或创建metadata
      try {
        const content = await fs.readFile(metadataPath, 'utf-8');
        metadata = JSON.parse(content);
        // 兼容旧数据：如果缺少workdirHash，补充当前的
        if (!metadata.workdirHash) {
          metadata.workdirHash = this.getWorkdirHash();
        }
      } catch {
        // metadata不存在，创建一个默认的
        const now = new Date().toISOString();
        metadata = {
          sessionId,
          title: `Session ${new Date().toLocaleString()}`,
          createdAt: now,
          lastActiveAt: now,
          messageCount: 0,
          totalTokens: 0,
          hasCheckpoint: false,
          workdirHash: this.getWorkdirHash()
        };
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
      }

      // 读取或创建tokens
      try {
        const content = await fs.readFile(tokensPath, 'utf-8');
        tokens = JSON.parse(content);
      } catch {
        // tokens不存在，创建一个默认的
        const now = new Date().toISOString();
        tokens = {
          sessionId,
          startTime: now,
          models: {}
        };
        await fs.writeFile(tokensPath, JSON.stringify(tokens, null, 2));
      }

      // 读取或创建history
      try {
        const content = await fs.readFile(historyPath, 'utf-8');
        history = JSON.parse(content);
      } catch {
        // history不存在，创建一个空数组
        history = [];
        await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
      }

      // 读取或创建context
      try {
        const content = await fs.readFile(contextPath, 'utf-8');
        clientHistory = JSON.parse(content);
      } catch {
        // context不存在，创建一个空数组
        clientHistory = [];
        await fs.writeFile(contextPath, JSON.stringify(clientHistory, null, 2));
      }

      // 获取checkpoints列表
      const checkpoints = await this.getSessionCheckpoints(sessionId);

      // 更新最后活跃时间
      metadata.lastActiveAt = new Date().toISOString();
      await this.updateSessionMetadata(sessionId, metadata);

      return {
        sessionId,
        metadata,
        history,
        clientHistory,
        checkpoints,
        tokens
      };
    } catch (error) {
      console.error(`[SessionManager] Failed to load session ${sessionId}:`, getErrorMessage(error));
      return null;
    }
  }

  /**
   * 保存session历史
   */
  async saveSessionHistory(sessionId: string, history: any[], clientHistory?: any[]): Promise<void> {
    const sessionDir = this.getSessionDir(sessionId);

    await fs.writeFile(
      path.join(sessionDir, 'history.json'),
      JSON.stringify(history, null, 2)
    );

    if (clientHistory) {
      await fs.writeFile(
        path.join(sessionDir, 'context.json'),
        JSON.stringify(clientHistory, null, 2)
      );
    }

    // 提取第一条用户消息和最后一条助手消息
    let firstUserMessage: string | undefined;
    let lastAssistantMessage: string | undefined;

    if (history && history.length > 0) {
      // 查找第一条用户消息
      for (const item of history) {
        if (item.type === 'user' && item.text) {
          firstUserMessage = item.text.slice(0, 100); // 限制长度
          break;
        }
      }

      // 查找最后一条助手消息
      for (let i = history.length - 1; i >= 0; i--) {
        const item = history[i];
        if (item.type === 'user' && item.text) {
          lastAssistantMessage = item.text.slice(0, 100);
          break;
        }
      }
    }

    // 更新消息计数和消息预览
    await this.updateSessionMetadata(sessionId, {
      messageCount: history.length,
      firstUserMessage,
      lastAssistantMessage,
      lastActiveAt: new Date().toISOString()
    });
  }

  /**
   * 保存session检查点（添加到列表中，不覆盖）
   */
  async saveSessionCheckpoint(sessionId: string, checkpoint: any): Promise<void> {
    const sessionDir = this.getSessionDir(sessionId);
    const checkpointsFile = path.join(sessionDir, 'checkpoints.json');

    // 读取现有的checkpoints列表
    let checkpoints: any[] = [];
    try {
      const content = await fs.readFile(checkpointsFile, 'utf-8');
      checkpoints = JSON.parse(content);
    } catch (error) {
      // 文件不存在或格式错误，使用空数组
      checkpoints = [];
    }

    // 添加新的checkpoint到列表
    checkpoints.push(checkpoint);

    // 保存更新后的列表
    await fs.writeFile(
      checkpointsFile,
      JSON.stringify(checkpoints, null, 2)
    );

    await this.updateSessionMetadata(sessionId, {
      hasCheckpoint: true,
      lastActiveAt: new Date().toISOString()
    });
  }

  /**
   * 获取session的所有checkpoints
   */
  async getSessionCheckpoints(sessionId: string): Promise<any[]> {
    const sessionDir = this.getSessionDir(sessionId);
    const checkpointsFile = path.join(sessionDir, 'checkpoints.json');

    try {
      const content = await fs.readFile(checkpointsFile, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return [];
    }
  }

  /**
   * 更新token统计
   */
  async updateTokenStats(sessionId: string, model: string, tokenData: {
    input_token_count: number;
    output_token_count: number;
    total_token_count: number;
    cached_content_token_count?: number;
    thoughts_token_count?: number;
    tool_token_count?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  }): Promise<void> {
    const sessionDir = this.getSessionDir(sessionId);
    const tokenFile = path.join(sessionDir, 'tokens.json');

    // 确保session目录存在，解决并发初始化时的竞态条件
    await fs.mkdir(sessionDir, { recursive: true });

    let existingTokens: SessionTokenData;
    try {
      const content = await fs.readFile(tokenFile, 'utf-8');
      existingTokens = JSON.parse(content);
    } catch {
      existingTokens = {
        sessionId,
        startTime: new Date().toISOString(),
        models: {}
      };
    }

    // 初始化模型数据
    if (!existingTokens.models[model]) {
      existingTokens.models[model] = {
        tokens: {
          prompt: 0,
          candidates: 0,
          total: 0,
          cached: 0,
          thoughts: 0,
          tool: 0
        },
        apiCalls: 0,
        lastUpdate: new Date().toISOString()
      };
    }

    // 累加token统计
    const modelStats = existingTokens.models[model];
    modelStats.tokens.prompt += tokenData.input_token_count;
    modelStats.tokens.candidates += tokenData.output_token_count;
    modelStats.tokens.total += tokenData.total_token_count;
    modelStats.tokens.cached += tokenData.cached_content_token_count || 0;
    modelStats.tokens.thoughts += tokenData.thoughts_token_count || 0;
    modelStats.tokens.tool += tokenData.tool_token_count || 0;
    modelStats.apiCalls++;
    modelStats.lastUpdate = new Date().toISOString();

    // 写入文件
    await fs.writeFile(tokenFile, JSON.stringify(existingTokens, null, 2));

    // 计算总token数
    const totalTokens = Object.values(existingTokens.models)
      .reduce((sum, m) => sum + m.tokens.total, 0);

    // 更新session元数据
    await this.updateSessionMetadata(sessionId, {
      totalTokens,
      model,
      lastActiveAt: new Date().toISOString()
    });
  }

  /**
   * 更新session元数据
   */
  private async updateSessionMetadata(sessionId: string, updates: Partial<SessionMetadata>): Promise<void> {
    const sessionDir = this.getSessionDir(sessionId);
    const metadataFile = path.join(sessionDir, 'metadata.json');

    // 确保session目录存在，解决并发初始化时的竞态条件
    await fs.mkdir(sessionDir, { recursive: true });

    let metadata: SessionMetadata;
    try {
      const content = await fs.readFile(metadataFile, 'utf-8');
      metadata = JSON.parse(content);
    } catch {
      return; // 元数据不存在，跳过更新
    }

    // 合并更新
    Object.assign(metadata, updates);

    // 写入文件
    await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2));

    // 同时更新索引
    await this.updateSessionIndex(sessionId, metadata);
  }

  /**
   * 更新session索引
   */
  private async updateSessionIndex(sessionId: string, metadata: SessionMetadata): Promise<void> {
    const index = await this.loadIndex();

    // 更新或添加session记录
    const existingIndex = index.sessions.findIndex(s => s.sessionId === sessionId);
    if (existingIndex >= 0) {
      index.sessions[existingIndex] = metadata;
    } else {
      index.sessions.push(metadata);
    }

    // 按最后活跃时间排序
    index.sessions.sort((a, b) =>
      new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
    );

    // 更新最后活跃的session
    index.lastActiveSession = sessionId;

    await this.saveIndex(index);
  }

  /**
   * 获取所有sessions
   */
  async listSessions(): Promise<SessionMetadata[]> {
    const index = await this.loadIndex();
    return index.sessions;
  }

  /**
   * 列出指定workdir下的所有session
   */
  async listSessionsByWorkdir(workdir?: string): Promise<SessionMetadata[]> {
    const index = await this.loadIndex();
    const workdirHash = this.getWorkdirHash(workdir);

    // 过滤出workdirHash匹配的session，向下兼容旧的没有workdirHash的session
    return index.sessions.filter(session => {
      if (!session.workdirHash) {
        // 旧数据兼容：如果session没有workdirHash，只在workdir为当前工作目录时显示
        return workdir ? false : workdirHash === this.getWorkdirHash();
      }
      return session.workdirHash === workdirHash;
    });
  }

  /**
   * 重建session索引（从实际的session目录重新扫描）
   */
  async rebuildIndex(): Promise<void> {
    console.log('[SessionManager] Rebuilding session index...');

    try {
      await this.ensureSessionsDir();

      // 读取sessions目录下的所有session文件夹
      const sessionDirs = await fs.readdir(this.sessionsDir, { withFileTypes: true });
      const sessions: SessionMetadata[] = [];

      for (const dirent of sessionDirs) {
        if (dirent.isDirectory() && dirent.name !== 'index.json') {
          const sessionId = dirent.name;
          const sessionDir = this.getSessionDir(sessionId);
          const metadataFile = path.join(sessionDir, 'metadata.json');

          try {
            const metadataContent = await fs.readFile(metadataFile, 'utf-8');
            const metadata: SessionMetadata = JSON.parse(metadataContent);
            sessions.push(metadata);
          } catch (error) {
            console.warn(`[SessionManager] Failed to read metadata for session ${sessionId}:`, getErrorMessage(error));
          }
        }
      }

      // 按最后活跃时间排序
      sessions.sort((a, b) =>
        new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
      );

      // 重建索引
      const newIndex: SessionIndex = {
        sessions,
        lastActiveSession: sessions.length > 0 ? sessions[0].sessionId : undefined
      };

      await this.saveIndex(newIndex);
      console.log(`[SessionManager] Rebuilt index with ${sessions.length} sessions`);
    } catch (error) {
      console.error('[SessionManager] Failed to rebuild index:', getErrorMessage(error));
      throw error;
    }
  }

  /**
   * 清理不存在的session记录
   */
  async cleanupMissingSessions(excludeSessionId?: string): Promise<void> {
    const index = await this.loadIndex();
    const validSessions: SessionMetadata[] = [];

    for (const session of index.sessions) {
      // 排除当前正在使用的session
      if (excludeSessionId && session.sessionId === excludeSessionId) {
        validSessions.push(session);
        continue;
      }

      const sessionDir = this.getSessionDir(session.sessionId);
      try {
        await fs.access(sessionDir);
        // 目录存在，保留
        validSessions.push(session);
      } catch {
        // 目录不存在，跳过（将被清理）

      }
    }

    if (validSessions.length !== index.sessions.length) {
      index.sessions = validSessions;
      await this.saveIndex(index);

    }
  }

  /**
   * 清理超出数量限制的session（滚动删除，先进先出）
   */
  async cleanupOldSessions(maxSessions: number = 500, excludeSessionId?: string): Promise<void> {
    const index = await this.loadIndex();

    // 如果session数量未超过限制，直接返回
    if (index.sessions.length <= maxSessions) {
      return;
    }

    // 按lastActiveAt排序，最老的在前面
    const sortedSessions = [...index.sessions].sort((a, b) => {
      return new Date(a.lastActiveAt).getTime() - new Date(b.lastActiveAt).getTime();
    });

    const sessionsToKeep: SessionMetadata[] = [];
    const sessionsToDelete: SessionMetadata[] = [];

    // 首先保留排除的session（当前正在使用的）
    if (excludeSessionId) {
      const excludedSession = sortedSessions.find(s => s.sessionId === excludeSessionId);
      if (excludedSession) {
        sessionsToKeep.push(excludedSession);
      }
    }

    // 从最新的session开始，保留到maxSessions数量
    const remainingSessions = sortedSessions.filter(s =>
      !excludeSessionId || s.sessionId !== excludeSessionId
    );

    // 保留最新的sessions，删除最老的
    const keepCount = maxSessions - sessionsToKeep.length;
    if (keepCount > 0) {
      sessionsToKeep.push(...remainingSessions.slice(-keepCount));
    }

    // 其余的都标记为删除
    sessionsToDelete.push(...remainingSessions.slice(0, remainingSessions.length - keepCount));

    // 删除过期session目录
    for (const session of sessionsToDelete) {
      try {
        const sessionDir = this.getSessionDir(session.sessionId);
        await fs.rm(sessionDir, { recursive: true, force: true });

      } catch (error) {
        console.warn(`[SessionManager] Failed to delete session ${session.sessionId}:`, getErrorMessage(error));
      }
    }

    // 更新索引
    if (sessionsToDelete.length > 0) {
      index.sessions = sessionsToKeep;
      await this.saveIndex(index);
      console.log(`[SessionManager] 清理了 ${sessionsToDelete.length} 个旧会话，当前保留 ${sessionsToKeep.length} 个会话`);
    }
  }

  /**
   * 执行完整的session清理
   */
  async performSessionCleanup(maxSessions: number = 500, preserveLatestEmpty: boolean = false, excludeSessionId?: string): Promise<void> {

    if (excludeSessionId) {

    }

    try {
      // 1. 清理不存在的session记录
      await this.cleanupMissingSessions(excludeSessionId);

      // 2. 清理没有对话内容的session
      await this.cleanupEmptySessions(preserveLatestEmpty, excludeSessionId);

      // 3. 清理超出数量限制的session（滚动删除）
      await this.cleanupOldSessions(maxSessions, excludeSessionId);


    } catch (error) {
      console.warn('[SessionManager] Session cleanup failed:', getErrorMessage(error));
    }
  }

  /**
   * 清理没有对话内容的session
   */
  async cleanupEmptySessions(preserveLatestEmpty: boolean = false, excludeSessionId?: string): Promise<void> {
    const index = await this.loadIndex();
    const activeSessions: SessionMetadata[] = [];
    const emptySessions: SessionMetadata[] = [];

    for (const session of index.sessions) {
      // 排除当前正在使用的session
      if (excludeSessionId && session.sessionId === excludeSessionId) {
        activeSessions.push(session);
        continue;
      }

      try {
        const sessionDir = this.getSessionDir(session.sessionId);
        const historyFile = path.join(sessionDir, 'history.json');

        // 检查是否存在history文件且有实际对话内容
        let hasRealConversation = false;
        try {
          const historyContent = await fs.readFile(historyFile, 'utf-8');
          const history = JSON.parse(historyContent);

          // 检查是否有用户消息（type为'user'）
          if (Array.isArray(history)) {
            hasRealConversation = history.some(item => item.type === 'user');
          }
        } catch {
          // history文件不存在或无法读取，视为空session
          hasRealConversation = false;
        }

        if (hasRealConversation) {
          activeSessions.push(session);
        } else {
          emptySessions.push(session);
        }
      } catch (error) {
        console.warn(`[SessionManager] Error checking session ${session.sessionId}:`, getErrorMessage(error));
        // 出错时保留session，避免误删
        activeSessions.push(session);
      }
    }

    // 如果需要保留最新的空session，则从删除列表中移除最近的一个
    let sessionsToDelete = emptySessions;
    if (preserveLatestEmpty && emptySessions.length > 0) {
      // 按最后活跃时间排序，保留最新的一个
      emptySessions.sort((a, b) =>
        new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
      );
      const latestEmptySession = emptySessions[0];
      activeSessions.push(latestEmptySession);
      sessionsToDelete = emptySessions.slice(1);
      console.log(`[SessionManager] Preserving latest empty session: ${latestEmptySession.sessionId} for continue operation`);
    }

    // 删除空session目录
    for (const session of sessionsToDelete) {
      try {
        const sessionDir = this.getSessionDir(session.sessionId);
        await fs.rm(sessionDir, { recursive: true, force: true });

      } catch (error) {
        console.warn(`[SessionManager] Failed to delete empty session ${session.sessionId}:`, getErrorMessage(error));
      }
    }

    // 更新索引
    if (sessionsToDelete.length > 0) {
      index.sessions = activeSessions;
      await this.saveIndex(index);

    }
  }

  /**
   * 保存AI请求日志
   */
  async saveRequestLog(sessionId: string, logData: {
    timestamp: string;
    turn: number;
    request: {
      history: any[];
      messageParts: any[];
    };
    response?: {
      content: any;
      tokenUsage?: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
      };
    };
  }): Promise<void> {
    const sessionDir = this.getSessionDir(sessionId);
    const logFile = path.join(sessionDir, 'subagent-request-log.json');

    try {
      await fs.writeFile(logFile, JSON.stringify(logData, null, 2));
    } catch (error) {
      console.warn(`[SessionManager] Failed to save request log for session ${sessionId}:`, getErrorMessage(error));
    }
  }

  /**
   * 获取session目录路径（用于外部访问）
   */
  getSessionDirectory(sessionId: string): string {
    return this.getSessionDir(sessionId);
  }

  /**
   * 检查指定session是否为空（没有实际对话内容）
   */
  async isSessionEmpty(sessionId: string): Promise<boolean> {
    try {
      const sessionDir = this.getSessionDir(sessionId);
      const historyFile = path.join(sessionDir, 'history.json');

      // 检查是否存在history文件且有实际对话内容
      const historyContent = await fs.readFile(historyFile, 'utf-8');
      const history = JSON.parse(historyContent);

      // 检查是否有用户消息（type为'user'）
      if (Array.isArray(history)) {
        return !history.some(item => item.type === 'user');
      }

      return true; // 如果history不是数组，视为空session
    } catch {
      // history文件不存在或无法读取，视为空session
      return true;
    }
  }

  /**
   * 在程序退出时清理当前空会话
   * 只有当前会话为空且没有任何对话内容时才删除
   */
  async cleanupCurrentEmptySessionOnExit(sessionId: string): Promise<void> {
    try {
      const isEmpty = await this.isSessionEmpty(sessionId);

      if (isEmpty) {
        // console.log(`[SessionManager] 清理空会话: ${sessionId}`);

        // 删除session目录
        const sessionDir = this.getSessionDir(sessionId);
        await fs.rm(sessionDir, { recursive: true, force: true });

        // 从索引中移除
        const index = await this.loadIndex();
        index.sessions = index.sessions.filter(s => s.sessionId !== sessionId);

        // 如果删除的是最后活跃的session，清除lastActiveSession
        if (index.lastActiveSession === sessionId) {
          index.lastActiveSession = index.sessions.length > 0 ? index.sessions[0].sessionId : undefined;
        }

        await this.saveIndex(index);
        // console.log(`[SessionManager] 空会话已清理: ${sessionId}`);
      }
    } catch (error) {
      // 清理失败时静默处理，避免影响程序正常退出
      // console.warn(`[SessionManager] 清理空会话失败: ${sessionId}`, getErrorMessage(error));
    }
  }

  /**
   * 初始化session（启动时调用）
   */
  async initializeSession(continueLastSession = false, sessionId?: string): Promise<SessionData> {
    // 在初始化session前，先清理空session（但保留最新的空session以备继续使用）
    try {
      await this.cleanupEmptySessions(true); // preserveLatestEmpty = true
      console.log('[SessionManager] Completed cleanup of empty sessions on startup');
    } catch (error) {
      console.warn('[SessionManager] Failed to cleanup empty sessions on startup:', getErrorMessage(error));
    }

    // 如果指定了sessionId，直接加载
    if (sessionId) {
      const session = await this.loadSession(sessionId);
      if (session) {
        return session;
      }
      console.warn(`[SessionManager] Session ${sessionId} not found, creating new session`);
    }

    // 如果要继续上次session
    if (continueLastSession) {
      // 优先查找有实际对话内容的最近session
      const lastSessionId = await this.getLastActiveSession(true);
      if (lastSessionId) {
        const session = await this.loadSession(lastSessionId);
        if (session) {
          console.log(`[SessionManager] Continuing session with content: ${lastSessionId}`);
          return session;
        }
      }

      // 如果没有找到有内容的session，尝试获取最后活跃的session
      const fallbackSessionId = await this.getLastActiveSession(false);
      if (fallbackSessionId && fallbackSessionId !== lastSessionId) {
        const session = await this.loadSession(fallbackSessionId);
        if (session) {
          console.log(`[SessionManager] Continuing last active session: ${fallbackSessionId}`);
          return session;
        }
      }
    }

    // 创建新session
    const newSession = await this.createNewSession();
    console.log(`[SessionManager] Created new session ${newSession.sessionId}`);
    return newSession;
  }
}
