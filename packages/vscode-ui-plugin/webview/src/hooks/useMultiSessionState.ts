/**
 * Multi-Session State Management Hook
 * 多Session状态管理Hook
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { SessionInfo } from '../../../src/types/sessionTypes';
import { SessionStatus } from '../../../src/constants/sessionConstants';
import { messageContentToString, createTextMessageContent } from '../utils/messageContentUtils';
import {
  ChatMessage,
  ToolCall,
  ToolCallStatus,
  ContextInfo
} from '../types';
// SESSION_CONSTANTS import removed - not used

// 🎯 移除复杂的FlowState枚举，使用简单的布尔值状态

// =============================================================================
// 多Session应用状态接口
// =============================================================================

interface MultiSessionAppState {
  /** 所有Session状态映射 */
  sessions: Map<string, SessionData>;

  /** 当前活跃Session ID */
  currentSessionId: string | null;

  /** Session列表（按最后活跃时间排序） */
  sessionList: SessionInfo[];

  /** 全局加载状态 */
  isLoading: boolean;

  /** 全局上下文信息 */
  globalContext: ContextInfo;

  /** UI状态 */
  ui: {
    sidebarExpanded: boolean;
    showSessionManager: boolean;
    showProjectSettings: boolean;
    showConfirmationDialog: boolean;
    currentConfirmationTool?: ToolCall;
  };

  /** 统计信息 */
  stats: {
    totalSessions: number;
    totalMessages: number;
    processingMessages: number;  // 🎯 正在处理工具的AI消息数
  };
}

/** 单个Session的数据结构 */
interface SessionData {
  /** Session基础信息 */
  info: SessionInfo;

  /** 🎯 Session内容是否已加载 - 区分session元数据和session内容 */
  isContentLoaded: boolean;

  /** 聊天消息列表 - 只有在isContentLoaded=true时才有实际内容 */
  messages: ChatMessage[];

  /** 🎯 可回滚的消息ID列表 */
  rollbackableMessageIds: string[];

  /** 🎯 文件变更跟踪 */
  lastAcceptedMessageId: string | null;  // 最后接受的消息ID，用于文件变更diff计算

  /** 🎯 简化的流程控制 */
  isProcessing: boolean;  // 是否正在处理（AI响应、工具调用等）
  currentProcessingMessageId: string | null;  // 当前正在处理工具的AI消息ID
  canAbort: boolean;  // 是否可以中断当前处理

  /** 加载状态 */
  isLoading: boolean;

  /** 🎯 Plan模式 - 只讨论不改代码 */
  isPlanMode: boolean;  // 是否在Plan模式（只读分析模式）
}

const initialState: MultiSessionAppState = {
  sessions: new Map(),
  currentSessionId: null,
  sessionList: [],
  isLoading: false,
  globalContext: {},
  ui: {
    sidebarExpanded: true,
    showSessionManager: false,
    showProjectSettings: false,
    showConfirmationDialog: false
  },
  stats: {
    totalSessions: 0,
    totalMessages: 0,
    processingMessages: 0  // 🎯 更新统计字段
  }
};

// =============================================================================
// 多Session状态管理Hook
// =============================================================================

export const useMultiSessionState = () => {
  const [state, setState] = useState<MultiSessionAppState>(initialState);
  const stateRef = useRef(state);

  // 保持ref同步，用于在回调中获取最新状态
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  /**
   * 更新状态的通用方法
   */
  const updateState = useCallback((updates: Partial<MultiSessionAppState> | ((prev: MultiSessionAppState) => MultiSessionAppState)) => {
    setState(prev => {
      const newState = typeof updates === 'function' ? updates(prev) : { ...prev, ...updates };

      // 自动更新统计信息
      newState.stats = {
        totalSessions: newState.sessions.size,
        totalMessages: Array.from(newState.sessions.values()).reduce((sum, session) => sum + session.messages.length, 0),
        processingMessages: Array.from(newState.sessions.values()).reduce((sum, session) =>
          sum + session.messages.filter(msg => msg.type === 'assistant' && msg.isProcessingTools).length, 0
        )
      };

      // 自动更新Session列表 - 保持后端原有排序
      newState.sessionList = Array.from(newState.sessions.values())
        .map(session => session.info);

      return newState;
    });
  }, []);

  // =============================================================================
  // Session管理方法
  // =============================================================================

  /**
   * 创建新Session
   * @param sessionInfo Session基础信息
   * @param loadContent 是否立即加载Session内容，默认false（启动时只加载元数据）
   */
  const createSession = useCallback((sessionInfo: SessionInfo, loadContent = false): string => {
    const sessionData: SessionData = {
      info: sessionInfo,
      isContentLoaded: loadContent,
      messages: [],  // 🎯 如果loadContent=false，这个数组保持空状态直到真正加载
      rollbackableMessageIds: [],  // 🎯 初始无可回滚消息
      lastAcceptedMessageId: null,  // 🎯 初始无接受的消息
      isProcessing: false,  // 🎯 初始不在处理中
      currentProcessingMessageId: null,  // 🎯 无正在处理的消息
      canAbort: false,  // 🎯 初始不可中断
      isLoading: false,
      isPlanMode: false,  // 🎯 初始不在Plan模式
    };

    updateState(prev => {
      const newSessions = new Map(prev.sessions);
      newSessions.set(sessionInfo.id, sessionData);

      return {
        ...prev,
        sessions: newSessions,
        currentSessionId: prev.currentSessionId || sessionInfo.id
      };
    });

    return sessionInfo.id;
  }, [updateState]);

  /**
   * 🎯 按需加载Session内容
   */
  const loadSessionContent = useCallback((sessionId: string) => {
    updateState(prev => {
      const session = prev.sessions.get(sessionId);
      if (!session || session.isContentLoaded) {
        return prev; // 已加载或不存在，无需处理
      }

      const newSessions = new Map(prev.sessions);
      newSessions.set(sessionId, {
        ...session,
        isContentLoaded: true,
        isLoading: true // 设置加载状态，等待后端返回实际消息
      });

      return {
        ...prev,
        sessions: newSessions
      };
    });
  }, [updateState]);

  /**
   * 删除Session
   */
  const deleteSession = useCallback((sessionId: string) => {
    updateState(prev => {
      const newSessions = new Map(prev.sessions);
      newSessions.delete(sessionId);

      let newCurrentSessionId = prev.currentSessionId;
      if (prev.currentSessionId === sessionId) {
        const remainingIds = Array.from(newSessions.keys());
        newCurrentSessionId = remainingIds.length > 0 ? remainingIds[0] : null;
      }

      return {
        ...prev,
        sessions: newSessions,
        currentSessionId: newCurrentSessionId
      };
    });
  }, [updateState]);

  /**
   * 切换到指定Session
   * 🎯 切换时自动按需加载Session内容
   */
  const switchToSession = useCallback((sessionId: string) => {
    updateState(prev => {
      if (!prev.sessions.has(sessionId)) {
        console.warn(`Session ${sessionId} not found`);
        return prev;
      }

      const newSessions = new Map(prev.sessions);
      const targetSession = newSessions.get(sessionId)!;

      // 🎯 如果目标session内容未加载，触发按需加载但保留现有数据
      if (!targetSession.isContentLoaded) {
        console.log('🔄 [SWITCH] Loading content for session:', sessionId);
        targetSession.isContentLoaded = true;
        targetSession.isLoading = true;

        // ✅ 保留现有messages，不清空数据，但如果没有消息则显示加载状态
        if (targetSession.messages.length === 0) {
          console.log('📥 [SWITCH] Empty session, will load from backend:', sessionId);
        } else {
          console.log('✅ [SWITCH] Preserving existing messages, count:', targetSession.messages.length);
          // 如果已有消息，取消loading状态，直接显示现有内容
          targetSession.isLoading = false;
        }
      }

      // 更新当前Session状态为active，其他为idle
      newSessions.forEach((sessionData, id) => {
        if (id === sessionId) {
          sessionData.info.status = SessionStatus.ACTIVE;
          sessionData.info.lastActivity = Date.now();
        } else if (sessionData.info.status === SessionStatus.ACTIVE) {
          sessionData.info.status = SessionStatus.IDLE;
        }
      });

      return {
        ...prev,
        sessions: newSessions,
        currentSessionId: sessionId
      };
    });
  }, [updateState]);

  /**
   * 更新Session信息
   */
  const updateSessionInfo = useCallback((sessionId: string, updates: Partial<SessionInfo>) => {
    updateState(prev => {
      const sessionData = prev.sessions.get(sessionId);
      if (!sessionData) return prev;

      const newSessions = new Map(prev.sessions);
      const updatedSessionData = {
        ...sessionData,
        info: { ...sessionData.info, ...updates, lastActivity: Date.now() }
      };
      newSessions.set(sessionId, updatedSessionData);

      return { ...prev, sessions: newSessions };
    });
  }, [updateState]);

  // =============================================================================
  // 消息管理方法
  // =============================================================================

  /**
   * 添加消息到指定Session
   */
  const addMessage = useCallback((sessionId: string, message: ChatMessage) => {
    updateState(prev => {
      const sessionData = prev.sessions.get(sessionId);
      if (!sessionData) return prev;
      console.log('🔧 [ADD-MSG] Adding message to session:', sessionId, 'message:', message);

      // 🛑 去重检查：防止添加已存在的消息
      const existingMessage = sessionData.messages.find(m => m.id === message.id);
      if (existingMessage) {
        console.warn(`🚨 [DEDUP] Message with ID ${message.id} already exists, skipping add`);
        console.warn(`🚨 [DEDUP] Existing:`, { id: existingMessage.id, type: existingMessage.type, content: messageContentToString(existingMessage.content).substring(0, 50) });
        console.warn(`🚨 [DEDUP] New:`, { id: message.id, type: message.type, content: messageContentToString(message.content).substring(0, 50) });
        return prev; // 不添加重复消息
      }

      const newSessions = new Map(prev.sessions);
      const updatedSessionData = {
        ...sessionData,
        messages: [...sessionData.messages, message],
        info: {
          ...sessionData.info,
          messageCount: sessionData.messages.length + 1,
          lastActivity: Date.now()
        }
      };
      newSessions.set(sessionId, updatedSessionData);

      console.log(`✅ [ADD-MSG] Added message ${message.id} to session ${sessionId}:`, {
        type: message.type,
        content: messageContentToString(message.content).substring(0, 50),
        totalMessages: updatedSessionData.messages.length
      });

      // 🎯 移除频繁的单个消息保存，统一由后端在chat流程结束时保存
      console.log(`✅ [ADD-MSG] Added message ${message.id} to session ${sessionId} (backend will save at chat completion)`);

      return { ...prev, sessions: newSessions };
    });
  }, [updateState]);

  /**
   * 更新指定Session的消息
   */
  const updateMessage = useCallback((sessionId: string, messageId: string, updates: Partial<ChatMessage>) => {
    updateState(prev => {
      const sessionData = prev.sessions.get(sessionId);
      if (!sessionData) return prev;

      const messageIndex = sessionData.messages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) return prev;

      const newSessions = new Map(prev.sessions);
      const updatedMessages = [...sessionData.messages];
      updatedMessages[messageIndex] = { ...updatedMessages[messageIndex], ...updates };

      const updatedSessionData = {
        ...sessionData,
        messages: updatedMessages,
        info: { ...sessionData.info, lastActivity: Date.now() }
      };
      newSessions.set(sessionId, updatedSessionData);

      // 🎯 移除频繁的消息更新保存，统一由后端在chat流程结束时保存
      console.log(`🔄 [UPDATE-MSG] Updated message ${messageId} (backend will save at chat completion)`);

      return { ...prev, sessions: newSessions };
    });
  }, [updateState]);

  /**
   * 更新消息内容（用于流式聊天）
   */
  const updateMessageContent = useCallback((sessionId: string, messageId: string, content: string, isStreaming: boolean) => {
    updateMessage(sessionId, messageId, {
      content: createTextMessageContent(content),
      isStreaming
    });
  }, [updateMessage]);

  /**
   * 清空指定Session的消息
   */
  const clearMessages = useCallback((sessionId: string) => {
    updateState(prev => {
      const sessionData = prev.sessions.get(sessionId);
      if (!sessionData) return prev;

      const newSessions = new Map(prev.sessions);
      const updatedSessionData = {
        ...sessionData,
        messages: [],
        rollbackableMessageIds: [],  // 🎯 重置可回滚消息列表
        isProcessing: false,  // 🎯 重置处理状态
        currentProcessingMessageId: null,  // 🎯 清除正在处理的消息
        canAbort: false,  // 🎯 重置中断标志
        isPlanMode: false,  // 🎯 重置Plan模式
        info: {
          ...sessionData.info,
          messageCount: 0,
          lastActivity: Date.now()
        }
      };
      newSessions.set(sessionId, updatedSessionData);

      return { ...prev, sessions: newSessions };
    });
  }, [updateState]);

  // =============================================================================
  // 🎯 简化的流程状态管理方法
  // =============================================================================

  /**
   * 🎯 设置Session处理状态
   */
  const setProcessingState = useCallback((sessionId: string, isProcessing: boolean, messageId: string | null = null, canAbort = false) => {
    updateState(prev => {
      const sessionData = prev.sessions.get(sessionId);
      if (!sessionData) return prev;

      const newSessions = new Map(prev.sessions);
      const updatedSessionData = {
        ...sessionData,
        isProcessing,
        currentProcessingMessageId: messageId,
        canAbort,
        info: { ...sessionData.info, lastActivity: Date.now() }
      };
      newSessions.set(sessionId, updatedSessionData);

      return { ...prev, sessions: newSessions };
    });
  }, [updateState]);

  /**
   * 🎯 更新指定AI消息的工具调用状态
   */
  const updateMessageToolCalls = useCallback((sessionId: string, messageId: string, toolCalls: ToolCall[]) => {
    console.log('🔧 [updateMessageToolCalls] Called with:', { sessionId, messageId, toolCallsCount: toolCalls.length });
    console.log('🔧 [updateMessageToolCalls] ToolCalls details:', toolCalls.map(t => ({ id: t.id, status: t.status })));

    updateState(prev => {
      const sessionData = prev.sessions.get(sessionId);
      if (!sessionData) {
        console.warn('🔧 [updateMessageToolCalls] Session not found:', sessionId);
        return prev;
      }

      const messageIndex = sessionData.messages.findIndex(m => m.id === messageId);
      if (messageIndex === -1) {
        console.warn('🔧 [updateMessageToolCalls] Message not found:', messageId);
        console.log('🔧 [updateMessageToolCalls] Available messages:', sessionData.messages.map(m => ({ id: m.id, type: m.type })));
        return prev;
      }

      const currentMessage = sessionData.messages[messageIndex];
      console.log('🔧 [updateMessageToolCalls] Found message:', { id: currentMessage.id, type: currentMessage.type, hasToolCalls: !!currentMessage.associatedToolCalls });
      console.log('🔧 [updateMessageToolCalls] Current associatedToolCalls:', currentMessage.associatedToolCalls?.map(t => ({ id: t.id, status: t.status })));

      const newSessions = new Map(prev.sessions);
      const updatedMessages = [...sessionData.messages];
      const allToolsCompleted = toolCalls.every(tool =>
        tool.status === ToolCallStatus.Success ||
        tool.status === ToolCallStatus.Error ||
        tool.status === ToolCallStatus.Canceled
      );

      // 🎯 智能合并工具调用：保留现有的liveOutput
      const existingToolCalls = updatedMessages[messageIndex].associatedToolCalls || [];
      const mergedToolCalls = toolCalls.map(newTool => {
        const existingTool = existingToolCalls.find(t => t.id === newTool.id);

        // 🎯 智能合并：保留现有的liveOutput（只在工具仍在执行中时）
        const shouldKeepLiveOutput = newTool.status === ToolCallStatus.Executing;

        return {
          ...newTool,
          liveOutput: shouldKeepLiveOutput ? (existingTool?.liveOutput || newTool.liveOutput) : undefined
        };
      });

      // 🎯 强制创建全新的消息对象，确保 React 检测到变化
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        associatedToolCalls: mergedToolCalls,
        isProcessingTools: !allToolsCompleted,
        toolsCompleted: allToolsCompleted
      };

      console.log('🔧 [updateMessageToolCalls] Updated message with tools:', updatedMessages[messageIndex].associatedToolCalls?.map(t => ({ id: t.id, status: t.status })));

      const updatedSessionData = {
        ...sessionData,
        messages: updatedMessages,
        info: { ...sessionData.info, lastActivity: Date.now() }
      };
      newSessions.set(sessionId, updatedSessionData);

      console.log('🔧 [updateMessageToolCalls] State update completed');
      return { ...prev, sessions: newSessions };
    });
  }, [updateState]);

  /**
   * 🎯 更新工具实时输出
   */
  const updateToolLiveOutput = useCallback((sessionId: string, toolId: string, output: string) => {
    console.log('🔧 [updateToolLiveOutput] Called with:', { sessionId, toolId, outputLength: output.length });

    updateState(prev => {
      const sessionData = prev.sessions.get(sessionId);
      if (!sessionData) {
        console.warn('🔧 [updateToolLiveOutput] Session not found:', sessionId);
        return prev;
      }

      // 查找包含目标工具的消息
      let messageIndex = -1;
      let toolIndex = -1;

      for (let i = 0; i < sessionData.messages.length; i++) {
        const message = sessionData.messages[i];
        if (message.associatedToolCalls) {
          const tIndex = message.associatedToolCalls.findIndex(t => t.id === toolId);
          if (tIndex !== -1) {
            messageIndex = i;
            toolIndex = tIndex;
            break;
          }
        }
      }

      if (messageIndex === -1 || toolIndex === -1) {
        console.warn('🔧 [updateToolLiveOutput] Tool not found:', toolId);
        return prev;
      }

      const newSessions = new Map(prev.sessions);
      const updatedMessages = [...sessionData.messages];
      const currentMessage = updatedMessages[messageIndex];
      const updatedToolCalls = [...(currentMessage.associatedToolCalls || [])];

      // 🎯 更新工具的实时输出，完全覆盖（因为后端发送的是全量数据）
      const currentTool = updatedToolCalls[toolIndex];

      // 限制实时输出长度（最大50KB）
      const maxOutputLength = 50 * 1024;
      const truncatedOutput = output.length > maxOutputLength
        ? '...(输出过长，已截断)\n' + output.slice(-maxOutputLength + 100)
        : output;

      updatedToolCalls[toolIndex] = {
        ...currentTool,
        liveOutput: truncatedOutput
      };

      updatedMessages[messageIndex] = {
        ...currentMessage,
        associatedToolCalls: updatedToolCalls
      };

      const updatedSessionData = {
        ...sessionData,
        messages: updatedMessages,
        info: { ...sessionData.info, lastActivity: Date.now() }
      };
      newSessions.set(sessionId, updatedSessionData);

      return { ...prev, sessions: newSessions };
    });
  }, [updateState]);

  /**
   * 🎯 中断当前处理流程
   */
  const abortCurrentProcess = useCallback((sessionId: string) => {
    updateState(prev => {
      const sessionData = prev.sessions.get(sessionId);
      if (!sessionData || !sessionData.canAbort) return prev;

      const newSessions = new Map(prev.sessions);
      const updatedSessionData = {
        ...sessionData,
        isProcessing: false,
        canAbort: false,
        currentProcessingMessageId: null,
        // 将当前处理中的AI消息的工具调用标记为取消
        messages: sessionData.messages.map(msg =>
          msg.id === sessionData.currentProcessingMessageId && msg.isProcessingTools ? {
            ...msg,
            isProcessingTools: false,
            toolsCompleted: true,
            associatedToolCalls: msg.associatedToolCalls?.map(tool => ({
              ...tool,
              status: ToolCallStatus.Canceled,
              result: {
                success: false,
                error: 'Process aborted by user',
                executionTime: Date.now() - (tool.startTime || Date.now()),
                toolName: tool.toolName
              }
            }))
          } : msg
        ),
        info: { ...sessionData.info, lastActivity: Date.now() }
      };
      newSessions.set(sessionId, updatedSessionData);

      return { ...prev, sessions: newSessions };
    });
  }, [updateState]);

  // =============================================================================
  // 上下文管理方法
  // =============================================================================

  /**
   * 更新全局上下文
   */
  const updateGlobalContext = useCallback((context: ContextInfo) => {
    updateState(prev => ({ ...prev, globalContext: context }));
  }, [updateState]);

  /**
   * 更新指定Session的上下文
   */
  const updateSessionContext = useCallback((sessionId: string, context: ContextInfo) => {
    updateState(prev => {
      const sessionData = prev.sessions.get(sessionId);
      if (!sessionData) return prev;

      const newSessions = new Map(prev.sessions);
      const updatedSessionData = {
        ...sessionData,
        context,
        info: { ...sessionData.info, lastActivity: Date.now() }
      };
      newSessions.set(sessionId, updatedSessionData);

      return { ...prev, sessions: newSessions };
    });
  }, [updateState]);

  // =============================================================================
  // 加载状态管理方法
  // =============================================================================

  /**
   * 设置全局加载状态
   */
  const setGlobalLoading = useCallback((isLoading: boolean) => {
    updateState(prev => ({ ...prev, isLoading }));
  }, [updateState]);

  /**
   * 设置指定Session的加载状态
   */
  const setSessionLoading = useCallback((sessionId: string, isLoading: boolean) => {
    updateState(prev => {
      const sessionData = prev.sessions.get(sessionId);
      if (!sessionData) return prev;

      const newSessions = new Map(prev.sessions);
      const updatedSessionData = {
        ...sessionData,
        isLoading,
        info: { ...sessionData.info, lastActivity: Date.now() }
      };
      newSessions.set(sessionId, updatedSessionData);

      return { ...prev, sessions: newSessions };
    });
  }, [updateState]);

  // =============================================================================
  // UI状态管理方法
  // =============================================================================

  /**
   * 切换侧边栏展开状态
   */
  const toggleSidebar = useCallback(() => {
    updateState(prev => ({
      ...prev,
      ui: { ...prev.ui, sidebarExpanded: !prev.ui.sidebarExpanded }
    }));
  }, [updateState]);

  /**
   * 显示/隐藏Session管理器
   */
  const toggleSessionManager = useCallback((show?: boolean) => {
    updateState(prev => ({
      ...prev,
      ui: { ...prev.ui, showSessionManager: show !== undefined ? show : !prev.ui.showSessionManager }
    }));
  }, [updateState]);

  /**
   * 显示/隐藏项目设置
   */
  const toggleProjectSettings = useCallback((show?: boolean) => {
    console.log('toggleProjectSettings called with:', show);
    updateState(prev => {
      const newShowState = show !== undefined ? show : !prev.ui.showProjectSettings;
      console.log('toggleProjectSettings: current state:', prev.ui.showProjectSettings, 'new state:', newShowState);
      return {
        ...prev,
        ui: { ...prev.ui, showProjectSettings: newShowState }
      };
    });
  }, [updateState]);

  /**
   * 显示工具确认对话框
   */
  const showConfirmationFor = useCallback((sessionId: string, toolCall: ToolCall) => {
    updateState(prev => ({
      ...prev,
      ui: {
        ...prev.ui,
        showConfirmationDialog: true,
        currentConfirmationTool: toolCall
      }
    }));
  }, [updateState]);

  /**
   * 隐藏工具确认对话框
   */
  const hideConfirmationDialog = useCallback(() => {
    updateState(prev => ({
      ...prev,
      ui: {
        ...prev.ui,
        showConfirmationDialog: false,
        currentConfirmationTool: undefined
      }
    }));
  }, [updateState]);

  // =============================================================================
  // 查询方法
  // =============================================================================

  /**
   * 获取当前活跃Session数据
   */
  const getCurrentSession = useCallback((): SessionData | null => {
    // 🎯 总是使用stateRef获取最新状态，避免闭包问题
    const currentState = stateRef.current;
    if (!currentState.currentSessionId) return null;
    return currentState.sessions.get(currentState.currentSessionId) || null;
  }, []); // 空依赖数组，因为总是使用ref

  /**
   * 获取指定Session数据
   */
  const getSession = useCallback((sessionId: string): SessionData | null => {
    // 🎯 总是使用stateRef获取最新状态，避免闭包问题
    return stateRef.current.sessions.get(sessionId) || null;
  }, []); // 空依赖数组，因为总是使用ref

  /**
   * 检查Session是否存在
   */
  const hasSession = useCallback((sessionId: string): boolean => {
    // 🎯 总是使用stateRef获取最新状态，避免闭包问题
    return stateRef.current.sessions.has(sessionId);
  }, []); // 空依赖数组，因为总是使用ref

  // =============================================================================
  // 持久化方法（可选）
  // =============================================================================

  /**
   * 持久化状态到VSCode
   */
  useEffect(() => {
    if (typeof window !== 'undefined' && window.vscode) {
      try {
        const persistData = {
          sessionList: state.sessionList,
          currentSessionId: state.currentSessionId,
          uiState: state.ui
        };
        window.vscode.setState(persistData);
      } catch (error) {
        console.warn('Failed to persist state:', error);
      }
    }
  }, [state.sessionList, state.currentSessionId, state.ui]);

  return {
    // 状态
    state,

    // Session管理
    createSession,
    deleteSession,
    switchToSession,
    updateSessionInfo,
    loadSessionContent, // 🎯 新增：按需加载Session内容

    // 消息管理
    addMessage,
    updateMessage,
    updateMessageContent,

    // 🎯 UI历史恢复 - 智能合并，避免覆盖现有数据
    restoreSessionMessages: useCallback((sessionId: string, messages: ChatMessage[]) => {
      updateState(prev => {
        const sessionData = prev.sessions.get(sessionId);
        if (!sessionData) return prev;

        // 🎯 如果当前已有消息且数量相等或更多，跳过恢复（保护现有数据）
        if (sessionData.messages.length >= messages.length && sessionData.messages.length > 0) {
          console.log(`⏭️ [RESTORE] Skipping restore for session ${sessionId}: existing ${sessionData.messages.length} >= incoming ${messages.length}`);
          // 只重置loading状态，不覆盖消息
          const newSessions = new Map(prev.sessions);
          const updatedSessionData = {
            ...sessionData,
            isLoading: false
          };
          newSessions.set(sessionId, updatedSessionData);
          return { ...prev, sessions: newSessions };
        }

        // 🎯 清理历史消息的临时状态字段
        const cleanedMessages = messages.map(msg => {
          if (msg.type === 'assistant') {
            return {
              ...msg,
              isStreaming: false,  // 清除流式状态
              isProcessingTools: false,  // 清除工具处理状态
              toolsCompleted: true  // 标记工具已完成
            };
          }
          return msg;
        });

        const newSessions = new Map(prev.sessions);
        const updatedSessionData = {
          ...sessionData,
          messages: cleanedMessages,  // 使用清理后的消息
          // 🎯 Session恢复时，设置lastAcceptedMessageId为最后一条消息，确保diff状态为空
          lastAcceptedMessageId: messages.length > 0 ? messages[messages.length - 1].id : null,
          isLoading: false, // 🎯 恢复消息完成后重置loading状态
          info: {
            ...sessionData.info,
            messageCount: messages.length,
            lastActivity: Date.now()
          }
        };
        newSessions.set(sessionId, updatedSessionData);

        console.log(`🔄 [RESTORE] Restored ${messages.length} UI messages for session ${sessionId}, loading state reset`);
        return { ...prev, sessions: newSessions };
      });
    }, [updateState]),

    // 🎯 更新可回滚消息ID列表
    updateRollbackableIds: useCallback((sessionId: string, rollbackableMessageIds: string[]) => {
      updateState(prev => {
        const sessionData = prev.sessions.get(sessionId);
        if (!sessionData) return prev;

        const newSessions = new Map(prev.sessions);
        const updatedSessionData = {
          ...sessionData,
          rollbackableMessageIds
        };
        newSessions.set(sessionId, updatedSessionData);

        console.log(`🔄 [ROLLBACK] Updated rollbackable IDs for session ${sessionId}: ${rollbackableMessageIds.length} messages`);
        return { ...prev, sessions: newSessions };
      });
    }, [updateState]),

    // 🎯 强制覆盖会话消息（用于编辑功能）
    forceUpdateSessionMessages: useCallback((sessionId: string, messages: ChatMessage[]) => {
      updateState(prev => {
        const sessionData = prev.sessions.get(sessionId);
        if (!sessionData) {
          console.warn(`⚠️ [FORCE_UPDATE] Session ${sessionId} not found`);
          return prev;
        }

        console.log(`🔄 [FORCE_UPDATE] Force updating session ${sessionId} with ${messages.length} messages (was ${sessionData.messages.length})`);

        const newSessions = new Map(prev.sessions);
        const updatedSessionData = {
          ...sessionData,
          messages: messages, // 🎯 强制覆盖，不做任何检查
          isLoading: false,
          info: {
            ...sessionData.info,
            messageCount: messages.length,
            lastActivity: Date.now()
          }
        };
        newSessions.set(sessionId, updatedSessionData);

        console.log(`✅ [FORCE_UPDATE] Force updated session ${sessionId} with ${messages.length} messages`);
        return { ...prev, sessions: newSessions };
      });
    }, [updateState]),

    clearMessages,

    // 🎯 文件变更跟踪
    setLastAcceptedMessageId: useCallback((sessionId: string, messageId: string) => {
      updateState(prev => {
        const sessionData = prev.sessions.get(sessionId);
        if (!sessionData) return prev;

        const newSessions = new Map(prev.sessions);
        const updatedSessionData = {
          ...sessionData,
          lastAcceptedMessageId: messageId
        };
        newSessions.set(sessionId, updatedSessionData);

        console.log(`🎯 [FILE-TRACK] Set lastAcceptedMessageId for session ${sessionId}: ${messageId}`);
        return { ...prev, sessions: newSessions };
      });
    }, [updateState]),

    // 🎯 简化的流程状态管理
    setProcessingState,
    updateMessageToolCalls,
    updateToolLiveOutput,
    abortCurrentProcess,

    // 🎯 Plan模式管理
    togglePlanMode: useCallback((sessionId: string, enabled: boolean) => {
      updateState(prev => {
        const sessionData = prev.sessions.get(sessionId);
        if (!sessionData) return prev;

        const newSessions = new Map(prev.sessions);
        const updatedSessionData = {
          ...sessionData,
          isPlanMode: enabled,
          info: { ...sessionData.info, lastActivity: Date.now() }
        };
        newSessions.set(sessionId, updatedSessionData);

        console.log(`🎯 [PLAN-MODE] Session ${sessionId} Plan mode toggled to: ${enabled}`);
        return { ...prev, sessions: newSessions };
      });
    }, [updateState]),

    // 上下文管理
    updateGlobalContext,
    updateSessionContext,

    // 加载状态管理
    setGlobalLoading,
    setSessionLoading,

    // UI状态管理
    toggleSidebar,
    toggleSessionManager,
    toggleProjectSettings,
    showConfirmationFor,
    hideConfirmationDialog,

    // 查询方法
    getCurrentSession,
    getSession,
    hasSession,

    // 通用更新方法
    updateState
  };
};
