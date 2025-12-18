/**
 * Multi-Session Main App Component
 * 多Session主应用组件
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React, { useEffect, useRef, useState } from 'react';
import { Settings, History } from 'lucide-react';
import { useMultiSessionState } from '../hooks/useMultiSessionState';
import { getGlobalMessageService } from '../services/globalMessageService';
import { webviewModelService } from '../services/webViewModelService';
import { useTranslation } from '../hooks/useTranslation';
import { SessionSwitcher } from './SessionSwitcher';
import { SessionManagerDialog } from './SessionManagerDialog';
import { ProjectSettingsDialog } from './ProjectSettingsDialog';
import { RulesManagementDialog } from './RulesManagementDialog';
import { ChatInterface } from './ChatInterface';
import { LoginPage } from './LoginPage';
import { LoadingScreen } from './LoadingScreen';
import { UpdatePrompt } from './UpdatePrompt';

import { MessageInputHandle } from './MessageInput';
import { PlanModeNotification } from './PlanModeNotification';
import { ChatHistoryModal } from './ChatHistoryModal';
import { NanoBananaDialog } from './NanoBananaDialog';
import { NanoBananaIcon } from './NanoBananaIcon';
import { CompressionConfirmationDialog } from './CompressionConfirmationDialog';
import { CompressionConfirmationRequest } from '../services/webViewModelService';
import { SessionType } from '../../../src/constants/sessionConstants';
import { SessionInfo } from '../../../src/types/sessionTypes';
import { MessageContent } from '../types/index';
import { createTextMessageContent, messageContentToString } from '../utils/messageContentUtils';
import { ChatMessage, ToolCall, ToolCallStatus } from '../types';
import DragDropGlobalTest from './DragDropGlobalTest';

import './MultiSessionApp.css';

/**
 * MultiSessionApp - 支持多Session的主应用组件
 *
 * 功能：
 * - 管理多个Session
 * - Session切换和创建
 * - 独立的Session状态
 * - 统一的消息和工具调用处理
 */
export const MultiSessionApp: React.FC = () => {
  const { t } = useTranslation();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    console.log('🔍 [DEBUG-UI-FLOW] [MultiSessionApp] Mounted');
  }, []);

  // 🎯 MessageInput 的 ref，用于插入代码引用
  const messageInputRef = useRef<MessageInputHandle>(null);

  // 🎯 登录状态管理
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null); // null = 检查中, false = 未登录, true = 已登录
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | undefined>();

  // 🎯 启动流程状态管理
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [waitingForSessions, setWaitingForSessions] = useState(false); // 🎯 新增：等待 session 数据就绪
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [forceUpdate, setForceUpdate] = useState(false);

  // 🛡️ 加固：UI 就绪超时重试机制
  const [uiReadyRetryCount, setUiReadyRetryCount] = useState(0);
  const maxRetries = 3;

  // 🎯 模型选择状态管理
  // 🛡️ 改为 'auto' 让服务端决定成本最优的模型
  const [selectedModelId, setSelectedModelId] = useState('auto');

  // 🎯 规则管理对话框状态
  const [isRulesManagementOpen, setIsRulesManagementOpen] = useState(false);

  // 🎯 重命名对话框状态
  const [renameDialog, setRenameDialog] = useState<{ isOpen: boolean; sessionId: string; currentName: string }>({
    isOpen: false,
    sessionId: '',
    currentName: ''
  });

  // 🎯 Plan模式通知状态
  const [planModeNotification, setPlanModeNotification] = useState<{
    visible: boolean;
    blockedTools: string[];
  }>({ visible: false, blockedTools: [] });

  // 🎯 聊天历史Modal状态
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  // 🎯 NanoBanana图像生成对话框状态
  const [isNanoBananaOpen, setIsNanoBananaOpen] = useState(false);

  // 🎯 压缩确认弹窗状态（模型切换时上下文超限）
  const [compressionConfirmation, setCompressionConfirmation] = useState<CompressionConfirmationRequest | null>(null);
  // 🎯 压缩进行中状态
  const [isCompressing, setIsCompressing] = useState(false);
  // 🎯 MCP 服务器状态管理
  const [mcpServers, setMcpServers] = useState<Array<{
    name: string;
    status: 'disconnected' | 'connecting' | 'connected';
    toolCount: number;
    toolNames?: string[];
    error?: string;
    enabled?: boolean; // 是否启用（控制工具是否注册给 AI）
  }>>([]);
  const [mcpDiscoveryState, setMcpDiscoveryState] = useState<'not_started' | 'in_progress' | 'completed'>('not_started');
  const [mcpStatusLoaded, setMcpStatusLoaded] = useState(true); // 初始值为 true，请求时设为 false
  // 🎯 历史列表数据（分页加载）
  const [historySessionsList, setHistorySessionsList] = useState<Array<{
    id: string;
    title: string;
    timestamp: number;
    messageCount: number;
    messages: ChatMessage[];
  }>>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // 🎯 BUG FIX: 保存加载超时ID，以便清理
  const loadingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const {
    state,
    createSession,
    deleteSession,
    switchToSession,
    updateSessionInfo,
    loadSessionContent, // 🎯 新增：按需加载Session内容
    addMessage,
    updateMessage, // 🎯 新增：更新消息
    updateMessageContent,
    updateMessageReasoning, // 🎯 新增：更新AI思考过程
    addMessageToQueue, // 🎯 消息队列管理
    removeMessageFromQueue,
    updateMessageQueue,
    updateRollbackableIds, // 🎯 添加可回滚ID更新函数
    restoreSessionMessages, // 🎯 添加恢复消息的函数
    forceUpdateSessionMessages, // 🎯 添加强制更新消息的函数
    setLastAcceptedMessageId, // 🎯 文件变更跟踪
    setProcessingState,
    updateMessageToolCalls,
    updateToolLiveOutput,
    abortCurrentProcess,
    togglePlanMode, // 🎯 新增：Plan模式切换
    updateGlobalContext,
    updateSessionContext,
    setSessionLoading,
    toggleSessionManager,
    toggleProjectSettings,
    showConfirmationFor,
    hideConfirmationDialog,
    getCurrentSession,
    getSession
  } = useMultiSessionState();

  // 流式聊天支持：维护正在流式接收的消息
  const streamingMessages = useRef<Map<string, { messageId: string; content: string; sessionId: string }>>(new Map());

  // 🎯 认证错误检查助手函数
  const checkAuthenticationError = React.useCallback((error: string): boolean => {
    if (error && (
      error.includes('401') ||
      error.includes('Unauthorized') ||
      error.includes('USER_UUID_REQUIRED') ||
      error.includes('requireReAuth":true') ||
      error.includes('authentication session is outdated')
    )) {
      console.log('🔐 [MultiSessionApp] Authentication error detected, switching to login page:', error);
      setIsLoggedIn(false);
      setLoginError('Your login session has expired. Please log in again.');
      return true;
    }
    return false;
  }, []);

  // 🎯 使用ref存储最新的状态和函数引用，解决闭包问题
  const stateRef = useRef(state);
  const getSessionRef = useRef(getSession);

  // 🎯 每次渲染时更新ref的值
  React.useEffect(() => {
    stateRef.current = state;
    getSessionRef.current = getSession;
  });

  // 🎯 BUG FIX: 清理超时 - 当组件卸载时清除所有待处理的超时
  useEffect(() => {
    return () => {
      // 清理所有待处理的加载超时
      for (const timeoutId of loadingTimeoutsRef.current.values()) {
        clearTimeout(timeoutId);
      }
      loadingTimeoutsRef.current.clear();
      console.log('🧹 [CLEANUP] Cleared all loading timeouts');
    };
  }, []);

  // 🎯 监听 session 数据就绪，隐藏 LoadingScreen（加固版本）
  useEffect(() => {
    if (waitingForSessions) {
      console.log('🔍 [DEBUG-UI-FLOW] [MultiSessionApp] Waiting for sessions... (retry:', uiReadyRetryCount, ')');
      // 检查条件：
      // 1. state.sessions 有数据
      // 2. 或者 state.currentSessionId 已经设置（说明默认 session 已创建）
      // 3. 或者超时保护（如果一直没数据，也得让用户进去）

      const hasSessions = state.sessions.size > 0;
      const hasCurrentSession = !!state.currentSessionId;

      if (hasSessions || hasCurrentSession) {
        console.log('🎯 [UI-READY] Sessions data populated, hiding loading screen');
        setShowLoadingScreen(false);
        setWaitingForSessions(false);
        setUiReadyRetryCount(0); // 重置重试计数
      } else {
        // 🛡️ 加固：分阶段超时，带重试机制
        const timer = setTimeout(() => {
          // 再次检查，因为 state 可能在 setTimeout 期间更新了
          const currentHasSessions = stateRef.current.sessions.size > 0;
          const currentHasCurrentSession = !!stateRef.current.currentSessionId;

          if (currentHasSessions || currentHasCurrentSession) {
            console.log('🎯 [UI-READY] Sessions data arrived during timeout, proceeding normally');
            setShowLoadingScreen(false);
            setWaitingForSessions(false);
            setUiReadyRetryCount(0);
          } else if (uiReadyRetryCount < maxRetries) {
            // 🔄 重试：重新请求 session 列表
            console.warn(`⚠️ [UI-READY] No session data, retrying... (${uiReadyRetryCount + 1}/${maxRetries})`);
            setUiReadyRetryCount(prev => prev + 1);
            // 重新请求 session 列表
            getGlobalMessageService().requestSessionList();
          } else {
            // 🛡️ 最终兜底：超过重试次数，强制进入并创建新 session
            console.warn('⚠️ [UI-READY] Max retries exceeded, forcing entry and creating new session');
            setShowLoadingScreen(false);
            setWaitingForSessions(false);
            setUiReadyRetryCount(0);
            // 创建一个新的默认 session
            getGlobalMessageService().createSession({
              type: SessionType.CHAT,
              fromTemplate: true
            });
          }
        }, 1500); // 每次等待 1.5 秒
        return () => clearTimeout(timer);
      }
    }
  }, [waitingForSessions, state.sessions.size, state.currentSessionId, uiReadyRetryCount]);

  // 🛡️ 加固：自动恢复机制 - 当已初始化但 session 数据异常时自动尝试恢复
  useEffect(() => {
    // 只在已初始化、非 loading 状态、且没有 session 数据时触发
    if (isInitialized && !showLoadingScreen && !waitingForSessions && state.sessions.size === 0) {
      console.warn('🛡️ [AUTO-RECOVERY] Detected empty sessions after init, attempting recovery...');

      const recoveryTimer = setTimeout(() => {
        // 再次检查，避免不必要的操作
        if (stateRef.current.sessions.size === 0) {
          console.log('🔄 [AUTO-RECOVERY] Requesting session list...');
          getGlobalMessageService().requestSessionList();

          // 如果 2 秒后还是没有，创建新 session
          setTimeout(() => {
            if (stateRef.current.sessions.size === 0) {
              console.log('🆕 [AUTO-RECOVERY] Creating new session as fallback');
              getGlobalMessageService().createSession({
                type: SessionType.CHAT,
                fromTemplate: true
              });
            }
          }, 2000);
        }
      }, 500);

      return () => clearTimeout(recoveryTimer);
    }
  }, [isInitialized, showLoadingScreen, waitingForSessions, state.sessions.size]);

  // 🎯 加载历史列表（分页）
  const loadHistoryList = React.useCallback((offset: number, limit: number) => {
    setIsLoadingHistory(true);
    getGlobalMessageService().requestSessionHistory({ offset, limit });
  }, []);

  // 🎯 处理历史Modal的打开/关闭和数据加载
  useEffect(() => {
    if (isHistoryModalOpen) {
      // 🎯 每次打开都重新加载，确保数据最新（性能影响小）
      setHistorySessionsList([]);
      setHistoryTotal(0);
      setHistoryHasMore(true);
      setIsLoadingHistory(false);
      loadHistoryList(0, 100);

      // 处理 ESC 键关闭
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsHistoryModalOpen(false);
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isHistoryModalOpen, loadHistoryList]);

  /**
   * 🎯 处理session切换 - 合并所有切换逻辑
   */
  const handleSessionSwitch = React.useCallback(async (sessionId: string) => {
    // 如果点击的是当前 session，关闭历史列表
    if (sessionId === state.currentSessionId) {
      setIsHistoryModalOpen(false);
      return;
    }

    const session = state.sessions.get(sessionId);

    // 1. 🎯 当session被focus且内容未加载时，请求内容
    if (session && !session.isContentLoaded) {
      console.log('🔄 [FOCUS] Loading content for session:', sessionId);
      loadSessionContent(sessionId);
    }

    // 2. 切换到目标session（更新前端状态）
    switchToSession(sessionId);

    // 3. 通知后端切换session
    getGlobalMessageService().switchSession(sessionId);

    // 4. 异步获取并同步该session的模型配置
    try {
      const currentModel = await webviewModelService.getCurrentModel(sessionId);
      if (currentModel && currentModel !== selectedModelId) {
        console.log('🔄 Syncing model for session:', sessionId, 'model:', currentModel);
        setSelectedModelId(currentModel);
      }
    } catch (error) {
      console.warn('Failed to sync model for session:', sessionId, error);
      // 失败时保持当前selectedModelId不变
    }
  }, [state.sessions, loadSessionContent, switchToSession, selectedModelId]);


  // 服务初始化现在通过LoadingScreen的onLoadingComplete回调处理

  // =============================================================================
  // 消息服务设置（仅在主应用运行时）
  // =============================================================================

  useEffect(() => {

    console.log('🚀 初始化主应用消息服务...');
    const messageService = getGlobalMessageService();

    // =============================================================================
    // 🎯 压缩确认请求监听器（模型切换时上下文超限）
    // =============================================================================
    webviewModelService.onCompressionConfirmationRequest((request) => {
      console.log('📊 [MultiSessionApp] Received compression confirmation request:', request);
      setCompressionConfirmation(request);
    });

    // 🎯 压缩错误处理器
    webviewModelService.onCompressionError((error) => {
      console.error('📊 [MultiSessionApp] Compression error:', error);
      setIsCompressing(false);
      setCompressionConfirmation(null);
    });

    // =============================================================================
    // Session管理事件监听器
    // =============================================================================

    messageService.onSessionListUpdate(({ sessions, currentSessionId }) => {
        console.log('🔍 [DEBUG-UI-FLOW] [MultiSessionApp] onSessionListUpdate received:', sessions.length, 'sessions');


      // 🎯 注意：这里是活跃session列表（最多10个）
      // 历史列表应该由 onSessionHistoryResponse 更新，不要在这里覆盖！
      console.log('📋 [SESSION_LIST] 收到活跃session列表:', sessions.length, '条（最多10条）');

      // 🎯 使用ref获取最新状态，避免闭包陷阱
      const currentState = stateRef.current;

      // 🎯 如果没有session，创建默认session
      if (sessions.length === 0) {
        console.log('🆕 [STARTUP] No sessions found, creating default session');
        messageService.createSession({
          type: SessionType.CHAT,
          fromTemplate: true
        });


        return; // 创建后会触发新的onSessionListUpdate，无需继续处理
      }

      // 🎯 启动时只创建session元数据，保持按需加载策略
      sessions.forEach(sessionInfo => {
        if (!currentState.sessions.has(sessionInfo.id)) {
          console.log('🆕 [STARTUP] Creating metadata-only session:', sessionInfo.id, sessionInfo.name);
          createSession(sessionInfo, false); // 🎯 false = 不加载内容，保持按需加载
        } else {
          // 🎯 后端 updateSession 会更新内存，所以这里的数据应该是最新的
          updateSessionInfo(sessionInfo.id, sessionInfo);
        }
      });

      // 切换到当前Session（这会触发按需加载）
      if (currentSessionId && currentSessionId !== currentState.currentSessionId) {
        console.log('🔄 [STARTUP] Switching to current session:', currentSessionId);

        // 🎯 初始化时直接发送switch请求，让后端处理UI history加载
        // 此时sessions状态还在更新中，无法准确判断isContentLoaded
        console.log('🔄 [STARTUP] Requesting UI history for default session:', currentSessionId);
        messageService.switchSession(currentSessionId);

        // 🎯 异步获取并同步该session的模型配置（防止兜底为Auto）
        (async () => {
          try {
            const currentModel = await webviewModelService.getCurrentModel(currentSessionId);
            if (currentModel) {
              console.log('🔄 [STARTUP] Syncing model for current session:', currentSessionId, 'model:', currentModel);
              setSelectedModelId(currentModel);
            }
          } catch (error) {
            console.warn('[STARTUP] Failed to sync model for current session:', currentSessionId, error);
          }
        })();
      }

      // 🎯 会话列表加载完成（loading screen 由 onLoadingComplete 的一次性监听器处理）
      console.log('🎯 [SESSION-LOADED] Sessions loaded');
    });

    messageService.onSessionCreated(({ session }) => {
      console.log('🆕 [NEW-SESSION] Creating new session with content loaded:', session.id);
      createSession(session, true); // 🎯 新建session立即加载内容

      // 🎯 新建后刷新活跃列表
      setTimeout(() => {
        getGlobalMessageService().requestSessionList();
      }, 100);

      // 🎯 添加到历史列表（无论列表是否已加载）
      setHistorySessionsList((prev) => {
        return [{
          id: session.id,
          title: session.name || 'New Chat',
          timestamp: session.createdAt,
          messageCount: 0,
          messages: []
        }, ...prev];
      });

      // 🎯 立即切换到新创建的session，确保用户能第一时间看到
      console.log('🔄 [NEW-SESSION] Auto-switching to newly created session:', session.id);
      handleSessionSwitch(session.id);

      // 🎯 如果这是第一个session（刚启动时创建的），标记完成但不操作升级UI
      if (showLoadingScreen) {
        console.log('🎯 [NEW-SESSION] First session created, marking as complete');
        // 不操作LoadingScreen的显示/隐藏，让升级逻辑自己处理
        console.log('🎯 [NEW-SESSION] Letting upgrade logic handle LoadingScreen visibility');
      }
    });

    messageService.onSessionUpdated(({ sessionId, session }) => {
      console.log('🔄 [BACKEND] Session updated:', sessionId, 'session.name:', session.name);
      // 更新 state（这会更新顶部标签页）
      updateSessionInfo(sessionId, session);
      // 🎯 如果历史列表已加载，同步更新
      setHistorySessionsList((prev) => {
        console.log('📋 [HISTORY] Updating history list, prev.length:', prev.length, 'has session:', prev.some(s => s.id === sessionId));

        const sessionExists = prev.some(s => s.id === sessionId);

        if (sessionExists) {
          // 更新已存在的session
          return prev.map((s) => {
            if (s.id === sessionId) {
              const sessionState = state.sessions.get(sessionId);
              const newTitle = session.name || 'New Chat';
              console.log('✏️ [HISTORY] Updating title for', sessionId, ':', s.title, '→', newTitle);
              return {
                ...s,
                title: newTitle,
                timestamp: s.timestamp,
                messageCount: sessionState?.messages.length ?? 0,
                messages: sessionState?.messages ?? [],
              };
            }
            return s;
          });
        } else if (prev.length > 0) {
          // 🔥 关键修复：如果历史列表已加载但不包含这个session，添加到开头
          console.log('➕ [HISTORY] Adding new session to history list:', sessionId);
          const sessionState = state.sessions.get(sessionId);
          return [{
            id: sessionId,
            title: session.name || 'New Chat',
            timestamp: session.lastActivity || session.createdAt || Date.now(),
            messageCount: sessionState?.messages.length ?? 0,
            messages: sessionState?.messages ?? [],
          }, ...prev];
        }

        console.log('⚠️ [HISTORY] Not updating - list empty');
        return prev;
      });
    });

    messageService.onSessionDeleted(({ sessionId }) => {
      console.log('🗑️ [BACKEND] Session deleted:', sessionId);
      // 删除 state 中的 session
      deleteSession(sessionId);
      // 同时从历史列表中移除
      setHistorySessionsList((prev) => prev.filter((s) => s.id !== sessionId));
      // 🎯 删除后重新请求列表，确保数据同步
      setTimeout(() => {
        getGlobalMessageService().requestSessionList();
      }, 100);
    });

    messageService.onSessionSwitched(({ sessionId, session }) => {
      const existingSession = getSession(sessionId);
      if (!existingSession && session) {
        createSession(session, false);
      }
      switchToSession(sessionId);
      if (session && existingSession) {
        updateSessionInfo(sessionId, session);
      }
    });

    // 🎯 监听历史列表分页响应
    messageService.onSessionHistoryResponse(({ sessions, total, hasMore, offset }) => {
      setHistorySessionsList((prev) => {
        const newItems = sessions.map(s => {
          // 🔥 关键修复：如果内存中有这个session，优先使用内存中的标题
          const sessionState = state.sessions.get(s.id);
          let title = s.name;

          if (sessionState?.info?.name) {
            const memoryTitle = sessionState.info.name;
            const isDefaultTitle = !memoryTitle ||
                                   memoryTitle === 'New Session' ||
                                   memoryTitle === 'New Chat' ||
                                   memoryTitle === 'Untitled Chat';

            // 如果内存中的标题不是默认值，说明是手动修改过或自动生成的，优先使用
            if (!isDefaultTitle) {
              title = memoryTitle;
            }
          }

          return {
            id: s.id,
            title,
            timestamp: s.lastActivity || s.createdAt,
            messageCount: 0,
            messages: []
          };
        });

        // 如果 offset=0，说明是首次加载或刷新，直接替换
        if (offset === 0) {
          return newItems;
        }

        // 否则是加载更多，去重后追加
        const existingIds = new Set(prev.map(s => s.id));
        const uniqueNewItems = newItems.filter(item => !existingIds.has(item.id));
        return [...prev, ...uniqueNewItems];
      });

      setHistoryTotal(total);
      setHistoryHasMore(hasMore);
      setIsLoadingHistory(false);
    });

    // 🎯 监听UI历史恢复
    messageService.onRestoreUIHistory(({ sessionId, messages, rollbackableMessageIds }) => {
      restoreSessionMessages(sessionId, messages);
      updateRollbackableIds(sessionId, rollbackableMessageIds || []);
    });

    // 🎯 监听消息预填充（右键菜单快捷操作 - 自动发送）
    messageService.onPrefillMessage(({ message }) => {
      console.log('📝 [PREFILL] Received prefill message, auto-sending:', message.substring(0, 50) + '...');
      // 🎯 直接发送消息到当前session
      handleSendMessage([{ type: 'text', value: message }]);
    });

    // 🎯 监听插入代码到输入框（只插入，不自动发送）
    messageService.onInsertCodeToInput(({ fileName, filePath, code, startLine, endLine }) => {
      console.log('📝 [INSERT CODE] Received code to insert:', fileName, startLine, '-', endLine);

      // 🎯 调用 MessageInput 的方法插入代码引用
      if (messageInputRef.current) {
        messageInputRef.current.insertCodeReference({
          fileName,
          filePath,
          code,
          startLine,
          endLine
        });
      } else {
        console.warn('MessageInput ref not available, cannot insert code');
      }
    });

    // 🎯 监听可回滚消息ID列表更新
    messageService.onUpdateRollbackableIds(({ sessionId, rollbackableMessageIds }) => {
      updateRollbackableIds(sessionId, rollbackableMessageIds);
    });

    // 🎯 监听后端请求UI历史记录
    messageService.onRequestUIHistory(({ sessionId }) => {

      // 🎯 使用ref获取最新状态，解决闭包问题
      const currentState = stateRef.current;
      const currentGetSession = getSessionRef.current;

      // 🔍 调试信息：检查所有session
      const allSessionIds = Array.from(currentState.sessions.keys());

      // 🔍 检查sessionId格式和匹配
      allSessionIds.forEach(() => {
      });

      const targetSession = currentGetSession(sessionId);

      if (targetSession) {

        if (targetSession.messages.length > 0) {
          // 发送当前session的所有UI消息给后端
          messageService.saveSessionUIHistory(sessionId, targetSession.messages);
        } else {
          // 即使没有消息也要发送空数组，让后端知道已处理
          messageService.saveSessionUIHistory(sessionId, []);
        }
      } else {
        // 即使没有找到session也要发送空数组，让后端知道已处理
        messageService.saveSessionUIHistory(sessionId, []);
      }
    });

    // =============================================================================
    // 聊天和工具调用事件监听器
    // =============================================================================

    messageService.onChatStart(({ sessionId, messageId }) => {

      // 🎯 开始处理：设置Session为处理状态
      setProcessingState(sessionId, true, messageId, true);

      // 🎯 重置加载状态 - AI开始响应时，用户的"发送中"状态应该结束
      setSessionLoading(sessionId, false);

      // 🎯 BUG FIX: 清理超时，因为后端已经响应了
      const timeout = loadingTimeoutsRef.current.get(sessionId);
      if (timeout) {
        clearTimeout(timeout);
        loadingTimeoutsRef.current.delete(sessionId);
      }

      // 创建一个新的AI消息占位符
      const streamingMessage: ChatMessage = {
        id: messageId,
        type: 'assistant',
        content: [], // 初始为空，将通过chunk逐步填充
        timestamp: Date.now(),
        isStreaming: true, // 标记为正在流式接收
        isProcessingTools: false,  // 🎯 初始不处理工具
        toolsCompleted: true       // 🎯 初始无工具
      };

      addMessage(sessionId, streamingMessage);
      streamingMessages.current.set(messageId, { messageId, content: '', sessionId });
    });

    messageService.onChatChunk(({ sessionId, content, messageId, isComplete }) => {
      const streamingMsg = streamingMessages.current.get(messageId);
      if (streamingMsg && streamingMsg.sessionId === sessionId) {
        // 累积内容
        streamingMsg.content += content;

        // 更新消息内容
        updateMessageContent(sessionId, messageId, streamingMsg.content, !isComplete);
      }
    });

    // 🎯 处理AI思考过程（reasoning）
    messageService.onChatReasoning(({ sessionId, content, messageId }) => {
      const streamingMsg = streamingMessages.current.get(messageId);
      if (streamingMsg && streamingMsg.sessionId === sessionId) {
        // 使用新的 updateMessageReasoning 方法累积思考内容
        updateMessageReasoning(sessionId, messageId, content);
      }
    });

    messageService.onChatComplete(({ sessionId, messageId, tokenUsage }) => {

      const streamingMsg = streamingMessages.current.get(messageId);
      if (streamingMsg && streamingMsg.sessionId === sessionId) {
        // 标记消息为完成状态，并更新Token使用情况
        updateMessage(sessionId, messageId, {
          content: createTextMessageContent(streamingMsg.content),
          isStreaming: false,
          tokenUsage: tokenUsage // 🎯 更新Token使用情况
        });

        // 清理流式消息状态
        streamingMessages.current.delete(messageId);
      }

      // 🎯 结束处理：如果没有正在处理工具的消息，则结束处理状态
      // 使用ref获取最新状态，避免闭包问题
      const currentGetSession = getSessionRef.current;
      const currentSession = currentGetSession(sessionId);
      const hasProcessingTools = currentSession?.messages.some(msg =>
        msg.type === 'assistant' && msg.isProcessingTools
      );

      if (!hasProcessingTools) {
        setProcessingState(sessionId, false, null, false);
      }

      setSessionLoading(sessionId, false);

      // 🎯 BUG FIX: 清理超时
      const timeout = loadingTimeoutsRef.current.get(sessionId);
      if (timeout) {
        clearTimeout(timeout);
        loadingTimeoutsRef.current.delete(sessionId);
      }
    });

    // 🎯 监听 Token 使用情况更新（压缩后更新前端显示）
    messageService.onExtensionMessage('token_usage_update', (payload: any) => {
      console.log('📊 [MultiSessionApp] Received token_usage_update:', payload);
      if (payload.sessionId && payload.tokenUsage) {
        updateSessionInfo(payload.sessionId, {
          tokenUsage: payload.tokenUsage
        });
      }
    });

    // 🎯 监听模型切换完成（压缩成功后更新模型选择器）
    messageService.onExtensionMessage('model_switch_complete', (payload: any) => {
      console.log('📊 [MultiSessionApp] Received model_switch_complete:', payload);
      console.log('📊 [MultiSessionApp] payload.sessionId:', payload.sessionId, 'payload.modelName:', payload.modelName);
      if (payload.sessionId && payload.modelName) {
        // 🎯 直接更新模型选择器（压缩确认总是针对当前活跃 session）
        console.log('📊 [MultiSessionApp] Setting selectedModelId to:', payload.modelName);
        setSelectedModelId(payload.modelName);
        // 清除压缩状态
        setIsCompressing(false);
        setCompressionConfirmation(null);
      } else {
        console.warn('📊 [MultiSessionApp] Missing sessionId or modelName in payload!');
      }
    });

    // 🚨 REMOVED: onChatResponse 监听器已移除
    // 原因: 与 onChatStart 重复创建消息，我们只使用流式路径 (onChatStart + onChatChunk + onChatComplete)
    // messageService.onChatResponse(...) - DELETED

    messageService.onChatError(({ sessionId, error }) => {
      // 🎯 检测认证错误，切换到登录页面
      if (checkAuthenticationError(error)) {
        return; // 不显示错误消息，直接跳转到登录页
      }

      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        type: 'system',
        content: createTextMessageContent(`Error: ${error}`),
        timestamp: Date.now()
      };

      addMessage(sessionId, errorMessage);
      setSessionLoading(sessionId, false);

      // 🎯 BUG FIX: 清理超时
      const timeout = loadingTimeoutsRef.current.get(sessionId);
      if (timeout) {
        clearTimeout(timeout);
        loadingTimeoutsRef.current.delete(sessionId);
      }

      // 清理可能存在的流式消息状态
      for (const [messageId, streamingMsg] of streamingMessages.current.entries()) {
        if (streamingMsg.sessionId === sessionId) {
          streamingMessages.current.delete(messageId);
        }
      }
    });

    messageService.onToolCallsUpdate(({ sessionId, toolCalls, associatedMessageId }) => {

      // 🎯 优先使用明确关联的messageId，否则回退到当前处理中的消息
      // 使用ref获取最新状态，避免闭包问题
      const currentGetSession = getSessionRef.current;
      const currentSession = currentGetSession(sessionId);
      const targetMessageId = associatedMessageId || currentSession?.currentProcessingMessageId;

      if (targetMessageId) {
        // 🎯 Plan模式下过滤工具 - 只允许只读工具执行
        let filteredToolCalls = toolCalls;

        if (currentSession?.isPlanMode) {
          const readOnlyTools = new Set([
            // 文件系统读取
            'read_file',           // 读取文件
            'read_many_files',     // 批量读取文件
            'list_directory',      // 列出目录

            // 搜索和分析
            'search_file_content', // 搜索文件内容 (grep)
            'glob',               // 文件查找
            'read_lints',         // 读取linter信息

            // 网络获取
            'web_fetch',          // 获取网页内容
            'google_web_search',  // 网页搜索

            // 分析和规划工具
            'task',               // 代码分析工具
            'todo_write',         // 任务规划和管理 (内存操作，不修改文件)
            'save_memory'         // 保存规划信息到AI记忆 (内存操作)
          ]);

          // 分离只读工具和修改性工具
          const allowedToolCalls = toolCalls.filter(t => readOnlyTools.has(t.toolName));
          const blockedToolCalls = toolCalls.filter(t => !readOnlyTools.has(t.toolName));

          // 如果有被阻止的工具，标记为错误状态并显示通知
          if (blockedToolCalls.length > 0) {
            const blockedToolNames = blockedToolCalls.map(t => t.toolName);
            console.warn(`🚫 [PLAN MODE] Blocked tools: ${blockedToolNames.join(', ')}`);

            // 标记被阻止的工具为错误状态
            blockedToolCalls.forEach(tool => {
              tool.status = ToolCallStatus.Error;
              tool.result = {
                success: false,
                error: `🚫 Plan mode has disabled this tool. Use /plan off to exit Plan mode and enable all tools.`,
                executionTime: 0,
                toolName: tool.toolName
              };
            });

            // 🎯 显示通知而不是添加系统消息
            setPlanModeNotification({
              visible: true,
              blockedTools: blockedToolNames
            });
          }

          // 只处理允许的工具
          filteredToolCalls = [...allowedToolCalls, ...blockedToolCalls];
        }

        updateMessageToolCalls(sessionId, targetMessageId, filteredToolCalls);
      } else {
        console.warn('⚠️ No target message found for tool calls update');
      }
    });

    messageService.onToolConfirmationRequest(({ sessionId, toolCall }) => {

      const confirmationTool: ToolCall = {
        id: toolCall.toolId,
        toolName: toolCall.toolName,
        displayName: toolCall.displayName,
        status: ToolCallStatus.WaitingForConfirmation,
        parameters: toolCall.parameters,
        confirmationDetails: toolCall.confirmationDetails,
        startTime: Date.now(),
        result: undefined
      };

      showConfirmationFor(sessionId, confirmationTool);
    });

    // 🎯 添加工具实时输出监听
    messageService.onToolMessage((data) => {
      console.log('🔧 [onToolMessage] Received data:', data);

      if (!data) {
        console.warn('🔧 [onToolMessage] data is undefined');
        return;
      }

      // 数据结构是扁平的，直接从data中获取字段
      const { sessionId, toolId, content, toolMessageType } = data;

      if (toolMessageType === 'output' && toolId && content && sessionId) {
        updateToolLiveOutput(sessionId, toolId, content);
      }
    });

    messageService.onContextUpdate(({ sessionId, context }) => {

      if (sessionId) {
        updateSessionContext(sessionId, context);
      } else {
        updateGlobalContext(context);
      }
    });

    // =============================================================================
    // 导入导出事件监听器
    // =============================================================================

    messageService.onSessionExportComplete(() => {
      // TODO: 显示成功通知
    });

    messageService.onSessionImportComplete(() => {
      // TODO: 显示成功通知
    });

    // =============================================================================
    // 🎯 流程状态事件监听器
    // =============================================================================

    messageService.onFlowStateUpdate(({ sessionId, isProcessing, currentProcessingMessageId, canAbort }) => {
      // 更新Session的流程状态
      setProcessingState(sessionId, isProcessing, currentProcessingMessageId || null, canAbort);
    });

    messageService.onFlowAborted(({ sessionId }) => {
      // 重置Session状态
      setProcessingState(sessionId, false, null, false);
    });

    // =============================================================================
    // 🎯 自定义规则管理监听器
    // =============================================================================

    messageService.onOpenRulesManagement(() => {
      console.log('📋 Opening rules management dialog');
      setIsRulesManagementOpen(true);
    });

    // =============================================================================
    // 🎯 MCP 状态管理监听器（带防抖稳定化）
    // =============================================================================

    let mcpUpdateTimer: NodeJS.Timeout | null = null;
    let pendingMcpPayload: any = null;

    messageService.onMcpStatusUpdate((payload: any) => {
      console.log('🔌 [MCP] Received MCP status update:', JSON.stringify(payload, null, 2));
      console.log('🔌 [MCP] Servers in payload:', payload.servers?.map((s: any) => `${s.name}(tools:${s.toolCount}, enabled:${s.enabled})`).join(', '));

      // 🎯 保存最新的 payload
      pendingMcpPayload = payload;

      // 🎯 防抖：延迟 150ms 后更新 UI，让快速连续的状态变化稳定下来
      if (mcpUpdateTimer) {
        clearTimeout(mcpUpdateTimer);
      }

      mcpUpdateTimer = setTimeout(() => {
        if (pendingMcpPayload) {
          if (pendingMcpPayload.servers !== undefined) {
            console.log('🔌 [MCP] Applying servers update to state:', {
              serverCount: pendingMcpPayload.servers.length,
              servers: JSON.stringify(pendingMcpPayload.servers)
            });
            setMcpServers(pendingMcpPayload.servers); // 设置为数组（可能是空数组）
          }
          if (pendingMcpPayload.discoveryState) {
            console.log('🔌 [MCP] Setting discoveryState to:', pendingMcpPayload.discoveryState);
            setMcpDiscoveryState(pendingMcpPayload.discoveryState);
          }
          // 防抖后再延迟 500ms，确保收到最完整的数据
          pendingMcpPayload = null;
          setTimeout(() => {
            console.log('🔌 [MCP] Setting mcpStatusLoaded to true (防抖+延迟后)');
            setMcpStatusLoaded(true);
          }, 500);
        }
      }, 150);
    });

    // 🔌 监听 MCP enabled 状态更新
    messageService.onMcpEnabledStates((payload: { states: Record<string, boolean> }) => {
      console.log('🔌 [MCP] Received enabled states update:', payload);
      setMcpServers(prev => prev.map(server => ({
        ...server,
        enabled: payload.states[server.name] ?? server.enabled ?? true
      })));
    });

    return () => {
    };

  }, []);

  // 🎯 切换会话时，清空 MCP 状态（等待后端自动发送）
  useEffect(() => {
    if (isLoggedIn !== true || !state.currentSessionId) return;

    console.log('🔌 [MCP] Session switched to:', state.currentSessionId);
    console.log('🔌 [MCP] Clearing mcpServers and waiting for backend to send status');
    // 立即清空服务器列表和加载状态，表示等待新数据
    setMcpServers([]);
    setMcpStatusLoaded(false);
    // 后端会在 AIService 初始化完成后自动发送 mcp_status_update
  }, [isLoggedIn, state.currentSessionId]);

  // 🎯 打开设置面板时，请求 MCP 状态（用于历史对话）
  useEffect(() => {
    if (!state.ui.showProjectSettings || !state.currentSessionId) return;

    console.log('🔌 [MCP] Settings panel opened, requesting MCP status');
    setMcpStatusLoaded(false); // 标记为加载中

    const messageService = getGlobalMessageService();
    messageService.send({
      type: 'get_mcp_status',
      payload: { sessionId: state.currentSessionId }
    });
  }, [state.ui.showProjectSettings, state.currentSessionId]);

  useEffect(() => {
    // 🎯 只有在已登录状态下才初始化消息服务
    if (isLoggedIn !== true) return;

    try {
      console.log('🚀 开始初始化消息服务...');
      // 立即完成初始化
      setIsInitialized(true);
      // 🎯 不再在这里立即隐藏loading screen
      // 而是等待会话列表加载完成后再隐藏
      return () => {
      };
    } catch (error) {
      console.error('❌ Failed to initialize MultiSessionApp:', error);
      // 即使出错也要设置为已初始化，避免永远卡在loading状态
      setIsInitialized(true);
      setShowLoadingScreen(false);
    }
  }, [
    // 🎯 包含所有在事件监听器中使用的函数，确保依赖正确
    isLoggedIn, // 🎯 添加登录状态依赖，只有登录后才初始化
    createSession,
    deleteSession,
    switchToSession,
    handleSessionSwitch,
    updateSessionInfo,
    restoreSessionMessages,
    addMessage,
    updateMessageContent,
    setProcessingState,
    setSessionLoading,
    updateMessageToolCalls,
    showConfirmationFor,
    hideConfirmationDialog,
    updateGlobalContext,
    updateSessionContext,
    abortCurrentProcess,
    loadSessionContent,
  ]);

  // =============================================================================
  // 登录事件处理方法
  // =============================================================================

  /**
   * 处理开始登录
   */
  const handleLoginStart = async () => {
    try {
      setIsLoggingIn(true);
      setLoginError(undefined);

      console.log('🚀 开始登录流程...');

      // 向后端发送登录请求
      const messageService = getGlobalMessageService();
      messageService.startLogin();

      // 监听登录结果
      const handleLoginResponse = (data: { success: boolean; error?: string }) => {
        console.log('📄 收到登录结果:', data);
        setIsLoggingIn(false);

        if (data.success) {
          setIsLoggedIn(true);
          setLoginError(undefined);
          console.log('✅ 登录成功');
        } else {
          setLoginError(data.error || '登录失败');
          console.error('❌ 登录失败:', data.error);
        }
      };

      messageService.onLoginResponse(handleLoginResponse);

    } catch (error) {
      console.error('❌ 启动登录流程失败:', error);
      setIsLoggingIn(false);
      setLoginError('启动登录流程失败');
    }
  };

  /**
   * 🎯 处理取消登录
   */
  const handleCancelLogin = () => {
    console.log('🚫 用户取消登录');
    setIsLoggingIn(false);
    setLoginError(undefined);
    // 重置任何登录相关的状态
  };

  // =============================================================================
  // 事件处理方法
  // =============================================================================

  // 🔌 处理 MCP 启用状态切换
  const handleToggleMcpEnabled = React.useCallback((serverName: string, enabled: boolean) => {
    console.log(`🔌 [MCP] Toggle ${serverName} enabled: ${enabled}`);

    // 立即更新本地状态（乐观更新）
    setMcpServers(prev => prev.map(server =>
      server.name === serverName ? { ...server, enabled } : server
    ));

    // 发送消息给扩展
    const messageService = getGlobalMessageService();
    messageService.setMcpEnabled(serverName, enabled);

    // 如果是启用操作，延迟刷新 MCP 状态以获取最新的工具信息
    const sessionId = state.currentSessionId;
    if (enabled && sessionId) {
      setTimeout(() => {
        messageService.send({
          type: 'get_mcp_status',
          payload: { sessionId }
        });
      }, 300);
    }
  }, [state.currentSessionId]);

  // 🎯 处理发送消息
  const handleSendMessage = React.useCallback((content: MessageContent, targetSessionId?: string) => {
    // 优先使用目标 Session ID，否则使用当前 Session ID
    const sessionId = targetSessionId || state.currentSessionId;
    if (!sessionId) return;

    const currentSession = state.sessions.get(sessionId);
    if (!currentSession) return;

    // 🎯 如果当前正在处理，不允许发送新消息
    if (currentSession.isProcessing) {
      console.warn('⚠️ [MultiSessionApp] Sending message while processing flag is true. This might be a queue retry or race condition. Proceeding anyway.');
      // 🎯 移除 return，允许队列重试机制生效
      // return;
    }

    // 检查是否是第一条用户消息（在添加消息之前检查）
    const isFirstUserMessage = currentSession.messages.filter(m => m.type === 'user').length === 0;

    // 添加用户消息到当前Session
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'user',
      content,
      timestamp: Date.now()
    };

    addMessage(sessionId, userMessage);
    setSessionLoading(sessionId, true);

    // 🎯 不在前端手动生成标题，让后端在保存时自动提取第一条消息作为标题
    // 后端会发送 session_updated 通知前端更新

    // 🎯 BUG FIX: 添加超时保护，防止isLoading永远卡住
    // 清除该session的任何已存在的超时
    const existingTimeout = loadingTimeoutsRef.current.get(sessionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // 如果后端在5秒内没有响应，自动重置loading状态
    const loadingTimeoutId = setTimeout(() => {
      console.warn(`⏰ [TIMEOUT] Session ${sessionId} loading timeout after 5000ms, auto-resetting`);
      setSessionLoading(sessionId, false);
      loadingTimeoutsRef.current.delete(sessionId);
    }, 5000);

    // 🎯 BUG FIX: 保存超时ID以便后续清理
    loadingTimeoutsRef.current.set(sessionId, loadingTimeoutId);

    // 🎯 Plan模式：添加AI提示注入
    let messageContentToSend = content;
    if (currentSession.isPlanMode) {
      // 将消息内容转换为字符串以便添加提示
      const contentStr = messageContentToString(content);
      const planPrompt = `[PLAN MODE ACTIVE]
The user is currently in Plan mode, focusing on requirements discussion and solution design. Please:
1. You may use analytical tools: read_file, read_many_files, list_directory, search_file_content, glob, web_fetch, task, etc.
2. Do NOT use modification tools: write_file, delete_file, replace, run_shell_command, lint_fix, etc.
3. Focus on understanding requirements, discussing solutions, and designing architecture
4. Provide detailed planning and recommendations, but do not perform modification operations
5. If modification operations are needed, remind the user to first exit Plan mode

User question: ${contentStr}`;

      messageContentToSend = createTextMessageContent(planPrompt);
    }

    // 发送到Extension
    getGlobalMessageService().sendChatMessage(sessionId, messageContentToSend, userMessage.id);
  }, [state.currentSessionId, state.sessions, addMessage, setSessionLoading]);

  // 🎯 全局队列处理器：监控所有 Session 的队列并自动发送
  // 使用 ref 跟踪正在提交的 session，防止在单次渲染周期内重复提交
  const submittingQueueRefs = useRef<Set<string>>(new Set());

  useEffect(() => {
    state.sessions.forEach((session, sessionId) => {
      // 检查条件：有队列消息 + 非 loading + 非 processing
      if (session.messageQueue && session.messageQueue.length > 0 && !session.isLoading && !session.isProcessing) {

        // 检查是否已经在提交中（防止重复）
        if (submittingQueueRefs.current.has(sessionId)) {
          return;
        }

        console.log(`🎯 [GLOBAL-QUEUE] Auto-sending queued message for session ${sessionId}`);

        // 标记为正在提交
        submittingQueueRefs.current.add(sessionId);

        // 获取下一条消息
        const nextMsg = session.messageQueue[0];

        // 发送消息（这会触发 isLoading = true）
        // 注意：我们需要临时切换 currentSessionId 来发送，或者改造 handleSendMessage
        // 这里我们直接调用 handleSendMessage，它已经改造为支持 targetSessionId

        // 🎯 关键：为了确保 handleSendMessage 能正确工作，我们需要确保它不依赖 currentSessionId
        // 我们已经改造了 handleSendMessage，现在可以安全调用

        // 1. 发送消息
        handleSendMessage(nextMsg.content, sessionId); // 传入 sessionId

        // 2. 从队列中移除
        removeMessageFromQueue(sessionId, nextMsg.id);

        // 3. 设置一个短超时来清理提交标记，或者依赖 isLoading 的变化
        // 由于 handleSendMessage 会同步设置 isLoading，下一次 render 时条件就不满足了
        // 我们只需要确保在 isLoading 变回 false 之前，这个标记被清除
        setTimeout(() => {
          submittingQueueRefs.current.delete(sessionId);
        }, 1000);
      }
    });
  }, [state.sessions, handleSendMessage, removeMessageFromQueue]);


  /**
   * 处理创建Session
   * 🎯 立即响应优化：异步创建，不阻塞UI
   */
  const handleCreateSession = (type: SessionType) => {
    // 🎯 异步创建session，避免阻塞UI
    setTimeout(() => {
      getGlobalMessageService().createSession({
        type,
        fromTemplate: true
      });
    }, 0);
  };

  /**
   * 统一处理Session重命名
   */
  const handleRenameSession = (sessionId: string, newTitle: string) => {
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) return;

    console.log(`✏️ [RENAME] Renaming session ${sessionId}: "${trimmedTitle}"`);

    // 1. 更新 state（这会更新顶部的标签页）
    updateSessionInfo(sessionId, { name: trimmedTitle });

    // 2. 更新历史列表（前端直接修改）
    setHistorySessionsList((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, title: trimmedTitle } : s))
    );

    // 3. 发送更新消息到后端（后端会保存并发送 session_updated 和 session_list_update）
    getGlobalMessageService().updateSession({
      sessionId,
      updates: { name: trimmedTitle },
    });
  };

  /**
   * 处理Session操作（统一的操作入口）
   */
  const handleSessionAction = (action: 'rename' | 'delete' | 'duplicate' | 'export', sessionId: string) => {
    switch (action) {
      case 'rename':
        const session = state.sessions.get(sessionId);
        const currentTitle = session?.info?.name || getSessionTitle(sessionId) || '';
        setRenameDialog({
          isOpen: true,
          sessionId,
          currentName: currentTitle
        });
        break;
      case 'delete':
        // 1. 先从历史列表中移除
        setHistorySessionsList((prev) => prev.filter((s) => s.id !== sessionId));
        // 2. 从 state 中删除
        deleteSession(sessionId);
        // 3. 发送删除消息到后端
        getGlobalMessageService().deleteSession(sessionId);
        // 4. 刷新列表确保同步
        setTimeout(() => {
          getGlobalMessageService().requestSessionList();
        }, 200);
        break;
      case 'duplicate':
        getGlobalMessageService().duplicateSession(sessionId);
        break;
      case 'export':
        handleExportSession(sessionId);
        break;
    }
  };

  /**
   * 导出Session聊天记录为Markdown
   */
  const handleExportSession = (sessionId: string) => {
    // 获取 session 信息（state.sessions 是 Map）
    const session = state.sessions.get(sessionId);
    if (!session) {
      console.warn('Session not found for export:', sessionId);
      return;
    }

    const messages = session.messages || [];
    const sessionTitle = getSessionTitle(sessionId) || 'Chat Export';
    const exportDate = new Date().toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });

    // 生成 Markdown 内容
    let markdown = `# ${sessionTitle}\n\n`;
    markdown += `*Exported on ${exportDate} from DeepV Code*\n\n`;
    markdown += `---\n\n`;

    messages.forEach((msg: any) => {
      const role = msg.type === 'user' ? '**User**' : '**DeepV Code**';
      markdown += `${role}\n\n`;

      // 处理消息内容
      if (typeof msg.content === 'string') {
        markdown += `${msg.content}\n\n`;
      } else if (Array.isArray(msg.content)) {
        msg.content.forEach((part: any) => {
          if (part.type === 'text') {
            markdown += `${part.value || part.text || ''}\n\n`;
          } else if (part.type === 'file_reference') {
            markdown += `📁 *File: ${part.value?.fileName || 'unknown'}*\n\n`;
          } else if (part.type === 'code_reference') {
            markdown += `\`\`\`${part.value?.language || ''}\n${part.value?.code || ''}\n\`\`\`\n\n`;
          } else if (part.type === 'terminal_reference') {
            markdown += `💻 *Terminal: ${part.value?.terminalName || 'unknown'}*\n\n`;
          }
        });
      }
    });

    // 发送到扩展进行保存
    if (window.vscode) {
      window.vscode.postMessage({
        type: 'export_chat' as any,
        payload: {
          sessionId,
          title: sessionTitle,
          content: markdown,
          format: 'md'
        }
      });
    }
  };

  /**
   * 处理Session管理器操作
   */
  const handleSessionManagerAction = (action: any, sessionId?: string, data?: any) => {
    // 使用全局MessageService

    switch (action.type) {
      case 'create':
        getGlobalMessageService().createSession({
          type: data?.sessionType || SessionType.CHAT,
          fromTemplate: true
        });
        break;
      case 'rename':
        if (sessionId && data) {
          getGlobalMessageService().updateSession({
            sessionId,
            updates: { name: data }
          });
        }
        break;
      case 'delete':
        if (sessionId) {
          getGlobalMessageService().deleteSession(sessionId);
        }
        break;
      case 'duplicate':
        if (sessionId) {
          getGlobalMessageService().duplicateSession(sessionId);
        }
        break;
      case 'clear':
        if (sessionId) {
          getGlobalMessageService().clearSession(sessionId);
        }
        break;
      case 'export':
        getGlobalMessageService().exportSessions(data);
        break;
      case 'import':
        getGlobalMessageService().importSessions(data);
        break;
    }
  };

  /**
   * 处理工具确认响应
   */
  const handleToolConfirmationResponse = (toolId: string, confirmed: boolean, userInput?: string, outcome?: string) => {
    const currentSession = getCurrentSession();
    if (!currentSession) return;

    getGlobalMessageService().sendToolConfirmationResponse(
      currentSession.info.id,
      toolId,
      confirmed,
      userInput,
      outcome
    );

    // 🎯 工具状态更新现在通过updateMessageToolCalls处理
    // 这里只需要发送响应，状态更新会通过onToolCallsUpdate事件处理

    hideConfirmationDialog();
  };

  /**
   * 🎯 处理流程中断
   */
  const handleAbortProcess = () => {
    const currentSession = getCurrentSession();
    if (!currentSession || !getGlobalMessageService() || !currentSession.canAbort) return;

    // 发送中断请求到后端
    getGlobalMessageService().sendFlowAbort(currentSession.info.id);

    // 立即更新前端状态
    abortCurrentProcess(currentSession.info.id);
  };

  /**
   * 🎯 处理模型变更
   */
  const handleModelChange = (modelId: string) => {
    console.log('🤖 Model changed to:', modelId);
    setSelectedModelId(modelId);

    // TODO: 将模型选择发送到后端
    // getGlobalMessageService().setModel(modelId);
  };


  /**
   * 简洁的标题获取：显示后端给的标题，内容加载后优先使用用户消息
   */
  // 🔧 直接定义为普通函数而不是 useCallback
  // 这样每次都能获取最新的 state.sessions
  const getSessionTitle = (sessionId: string) => {
    const session = state.sessions.get(sessionId);
    if (!session) return '新建会话';

    // 🔥 关键修复：优先使用手动修改的标题
    // 如果 session.info.name 不是默认值，说明是手动修改的或自动生成的，直接使用
    const isDefaultName = !session.info.name ||
                          session.info.name === 'New Session' ||
                          session.info.name === 'New Chat' ||
                          session.info.name === 'Untitled Chat' ||
                          session.info.name === '新建会话';

    if (!isDefaultName) {
      // 有明确的标题（手动修改或自动生成），直接使用
      return session.info.name;
    }

    // 如果是默认名称，且内容已加载且有用户消息，使用第一条用户消息
    if (session.isContentLoaded) {
      const firstUserMessage = session.messages.find(msg => msg.type === 'user');
      const contentStr = messageContentToString(firstUserMessage?.content || []);
      if (contentStr.trim()) {
        const content = contentStr.trim();
        return content.length > 30 ? content.substring(0, 30) + '...' : content;
      }
    }

    // 否则使用后端给的标题（可能是默认值）
    return session.info.name || '新建会话';
  };

  /**
   * 检查Session是否未使用（没有聊天历史）
   * 使用后端的messageCount字段，更准确地判断历史消息
   * 🎯 修复闭包陷阱：使用ref获取最新状态
   */
  const isSessionUnused = React.useCallback((sessionId: string): boolean => {
    const session = stateRef.current.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // 使用后端的messageCount字段判断，这个字段反映真实的历史消息数量
    // messageCount为0说明这是真正的新session，没有任何历史对话
    const isUnused = session.info.messageCount === 0;

    return isUnused;
  }, []);

  /**
   * 获取最近的Session列表（限制为10个）
   * UI层面按创建时间排序，最新创建的在前
   */
  const getRecentSessions = React.useCallback((): SessionInfo[] => {
    const allSessions = state.sessionList;
    let sorted = allSessions
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10);

    // 确保当前 session 总是在顶部标签页显示
    if (state.currentSessionId) {
      const currentInList = sorted.find(s => s.id === state.currentSessionId);
      if (!currentInList) {
        const currentSession = state.sessions.get(state.currentSessionId);
        if (currentSession) {
          sorted = [currentSession.info, ...sorted.slice(0, 9)];
        }
      }
    }

    // 使用 state.sessions 中的最新数据（包括用户刚修改的标题）
    return sorted.map(sessionInfo => {
      const sessionState = state.sessions.get(sessionInfo.id);
      if (sessionState) {
        return sessionState.info;
      }
      return sessionInfo;
    });
  }, [state.sessionList, state.currentSessionId, state.sessions]);

  // =============================================================================
  // 渲染方法
  // =============================================================================

  // 🎯 显示重新设计的启动协调器
  if (showLoadingScreen) {
    return (
      <LoadingScreen
        onLoadingComplete={() => {
          console.log('🔍 [DEBUG-UI-FLOW] [MultiSessionApp] LoadingScreen finished. Checking data readiness...');
          setIsLoggedIn(true);
          setIsInitialized(true);

          // 🛡️ 关键修复：检查 session 数据是否已经就绪
          // 如果数据已经到达，直接隐藏 LoadingScreen，不需要等待
          const hasSessions = stateRef.current.sessions.size > 0;
          const hasCurrentSession = !!stateRef.current.currentSessionId;

          if (hasSessions || hasCurrentSession) {
            // 🎯 数据已就绪，直接切换到主界面
            console.log('🎯 [UI-READY] Session data already available, switching to main UI immediately');
            setShowLoadingScreen(false);
            setWaitingForSessions(false);
          } else {
            // 🎯 数据尚未到达，进入等待模式
            console.log('🔍 [DEBUG-UI-FLOW] [MultiSessionApp] Session data not ready, entering waiting mode...');
            setWaitingForSessions(true);
            // 🛡️ 关键：同时隐藏 LoadingScreen，让 waitingForSessions 的 fallback UI 接管
            // 这样用户不会看到透明的淡出后的 LoadingScreen
            setShowLoadingScreen(false);
          }
        }}
        onLoginRequired={(error) => {
          console.log('🎯 [LoadingScreen] Login required:', error);
          setShowLoadingScreen(false);
          setIsLoggedIn(false);
          setLoginError(error);
        }}
      />
    );
  }

  // 🎯 显示升级提示页面
  if (showUpdatePrompt && updateInfo) {
    return (
      <div className="multi-session-app multi-session-app--update-prompt">
        <UpdatePrompt
          updateInfo={updateInfo}
          forceUpdate={forceUpdate}
          onDownloadVsix={() => {
            if (updateInfo?.downloadUrl && window.vscode) {
              window.vscode.postMessage({
                type: 'open_external_url',
                payload: { url: updateInfo.downloadUrl }
              });
            }
          }}
          onGoToMarketplace={() => {
            console.log('[UpdatePrompt] Attempting to open marketplace...');
            if (window.vscode) {
              const message = {
                type: 'open_extension_marketplace' as const,
                payload: { extensionId: 'DeepX.deepv-code-vscode-ui-plugin' }
              };
              console.log('[UpdatePrompt] Sending message:', message);
              window.vscode.postMessage(message);
            } else {
              console.error('[UpdatePrompt] window.vscode is not available');
            }
          }}
          onSkip={forceUpdate ? undefined : () => {
            setShowUpdatePrompt(false);
            setUpdateInfo(null);
            setForceUpdate(false);
            // 继续到主应用或登录页面
            if (isLoggedIn) {
              // 已登录，进入主应用
            } else {
              // 未登录，显示登录页面
              setIsLoggedIn(false);
            }
          }}
          onClose={forceUpdate ? undefined : () => {
            setShowUpdatePrompt(false);
            setUpdateInfo(null);
            setForceUpdate(false);
            // 继续到主应用或登录页面
            if (isLoggedIn) {
              // 已登录，进入主应用
            } else {
              // 未登录，显示登录页面
              setIsLoggedIn(false);
            }
          }}
        />
      </div>
    );
  }

  // 🎯 正在检查登录状态（这个状态通常很短暂，现在被loading screen覆盖）
  if (isLoggedIn === null) {
    return (
      <LoginPage
        onLoginStart={handleLoginStart}
        isLoggingIn={false}
        isCheckingAuth={true}
        loginError={loginError}
        onCancelLogin={handleCancelLogin}
      />
    );
  }

  // 🎯 未登录，显示登录页面
  if (isLoggedIn === false) {
    return (
      <LoginPage
        onLoginStart={handleLoginStart}
        isLoggingIn={isLoggingIn}
        isCheckingAuth={false}
        loginError={loginError}
        onCancelLogin={handleCancelLogin}
      />
    );
  }

  // 🎯 已登录但系统未初始化（这个状态现在也被loading screen覆盖）
  if (!isInitialized) {
    return (
      <div className="multi-session-app multi-session-app--loading" style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        backgroundColor: 'var(--vscode-editor-background, #181818)',
        color: 'var(--vscode-foreground, #cccccc)'
      }}>
        <div className="multi-session-app__loading">
          <div className="multi-session-app__loading-spinner" style={{ fontSize: '32px', marginBottom: '16px' }}>🔄</div>
          <div className="multi-session-app__loading-text" style={{ fontSize: '14px' }}>
            初始化多Session系统...
          </div>
          <div style={{ fontSize: '12px', marginTop: '8px', opacity: 0.7 }}>
            检查控制台输出获取详细信息
          </div>
        </div>
      </div>
    );
  }

  // 🛡️ 加固兜底：已初始化但 session 数据未就绪（极端竞态条件下的保护）
  // 注意：对于全新用户，onSessionListUpdate 收到空列表后会自动创建默认 session
  // 这里只是一个额外的保护层，确保用户不会看到空白页面
  const currentSessionPreCheck = state.currentSessionId ? state.sessions.get(state.currentSessionId) : null;
  if (state.sessions.size === 0 || (!currentSessionPreCheck && state.currentSessionId)) {
    console.warn('🛡️ [FALLBACK] Session data not ready after initialization, showing recovery UI. waitingForSessions:', waitingForSessions);

    const handleRetryInit = () => {
      console.log('🔄 [FALLBACK] User triggered retry');
      // 重新请求 session 列表（后端会自动创建默认 session 如果列表为空）
      getGlobalMessageService().requestSessionList();
    };

    return (
      <div className="multi-session-app multi-session-app--loading" style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        backgroundColor: 'var(--vscode-editor-background, #181818)',
        color: 'var(--vscode-foreground, #cccccc)'
      }}>
        <div className="multi-session-app__loading">
          <div style={{ fontSize: '32px', marginBottom: '16px' }}>⏳</div>
          <div style={{ fontSize: '14px', marginBottom: '16px' }}>
            {t('loading.preparingSession', {}, 'Preparing your session...')}
          </div>
          <button
            onClick={handleRetryInit}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              backgroundColor: 'var(--vscode-button-background, #0e639c)',
              color: 'var(--vscode-button-foreground, #ffffff)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              marginTop: '8px'
            }}
          >
            {t('loading.retry', {}, 'Retry')}
          </button>
          <div style={{ fontSize: '11px', marginTop: '12px', opacity: 0.6 }}>
            {t('loading.autoRetryHint', {}, 'Will auto-retry in a moment...')}
          </div>
        </div>
      </div>
    );
  }

  // 🎯 直接使用state获取当前session，避免stateRef时序问题
  // 在render过程中，stateRef可能还没有更新到最新状态，导致getCurrentSession()返回旧数据
  const currentSession = state.currentSessionId ? state.sessions.get(state.currentSessionId) || null : null;

  console.log('🔍 [DEBUG-UI-FLOW] [MultiSessionApp] Rendering main UI. Current Session:', state.currentSessionId, 'Sessions count:', state.sessions.size);

  return (
    <div className="multi-session-app">
      {/* 应用头部 */}
      <header className="multi-session-app__header">
        <div className="multi-session-app__header-left">

          {/* Session切换器 */}
          <SessionSwitcher
            currentSession={currentSession?.info || null}
            sessions={getRecentSessions()}
            onSessionSwitch={(sessionId) => {
              // 关闭历史 Modal（如果打开了）
              setIsHistoryModalOpen(false);
              // 然后切换 session
              handleSessionSwitch(sessionId);
            }}
            onCreateSession={handleCreateSession}
            onSessionAction={handleSessionAction}
            getSessionTitle={getSessionTitle}
            isSessionUnused={isSessionUnused}
            disabled={state.isLoading}
          />
        </div>

        <div className="multi-session-app__header-right">
          {/* 🎯 NanoBanana 图像生成入口 */}
          <button
            className="multi-session-app__manage-btn multi-session-app__nanobanana-btn"
            onClick={() => setIsNanoBananaOpen(true)}
            title={t('nanoBanana.buttonTooltip', {}, 'Generate images with AI')}
            style={{ marginRight: '8px' }}
          >
            <NanoBananaIcon size={18} />
          </button>
          <button
            className="multi-session-app__manage-btn multi-session-app__history-btn"
            onClick={() => {
              if (!isLoadingHistory) {
                setIsHistoryModalOpen(!isHistoryModalOpen);
              }
            }}
            title="Chat History"
            style={{ marginRight: '12px' }}
            disabled={isLoadingHistory}
          >
            <History size={16} stroke="currentColor" />
          </button>
          <button
            className="multi-session-app__manage-btn"
            onClick={() => {
              console.log('Settings button clicked');
              toggleProjectSettings(true);
            }}
            title="Project Settings"
          >
            <Settings size={14} stroke="currentColor" />
          </button>

        </div>
      </header>

      {/* 主内容区域 */}
      <div className="multi-session-app__content">
        {/* 聊天界面 */}
        <div className="multi-session-app__chat-container">
          {currentSession ? (
            <ChatInterface
              messages={currentSession.messages}
              messageQueue={currentSession.messageQueue || []} // 🎯 传入消息队列
              onAddMessageToQueue={(content) => {
                if (state.currentSessionId) {
                  addMessageToQueue(state.currentSessionId, content);
                }
              }}
              onRemoveMessageFromQueue={(id) => {
                if (state.currentSessionId) {
                  removeMessageFromQueue(state.currentSessionId, id);
                }
              }}
              onUpdateMessageQueue={(newQueue) => {
                if (state.currentSessionId) {
                  updateMessageQueue(state.currentSessionId, newQueue);
                }
              }}
              isLoading={currentSession.isLoading}
              onSendMessage={handleSendMessage}
              onToolConfirm={handleToolConfirmationResponse}
              isProcessing={currentSession.isProcessing}        // 🎯 传入处理状态
              canAbort={currentSession.canAbort}               // 🎯 传入是否可中断
              onAbortProcess={handleAbortProcess}              // 🎯 传入中断处理函数
              lastAcceptedMessageId={currentSession.lastAcceptedMessageId} // 🎯 传入文件变更跟踪状态
              onSetLastAcceptedMessageId={(messageId) => {     // 🎯 传入更新方法
                if (state.currentSessionId) {
                  setLastAcceptedMessageId(state.currentSessionId, messageId);
                }
              }}
              selectedModelId={selectedModelId}               // 🎯 传入选中的模型
              onModelChange={handleModelChange}               // 🎯 传入模型变更回调
              sessionId={state.currentSessionId || undefined} // 🎯 传入当前会话ID
              messageInputRef={messageInputRef}               // 🎯 传入 MessageInput ref（用于插入代码引用）
              onUpdateMessages={(messages) => {               // 🎯 传入消息更新回调
                if (state.currentSessionId) {
                  forceUpdateSessionMessages(state.currentSessionId, messages);
                }
              }}
              tokenUsage={currentSession.info.tokenUsage}     // 🎯 传入Token使用情况
              rollbackableMessageIds={currentSession.rollbackableMessageIds} // 🎯 传入可回滚消息ID列表
              isPlanMode={currentSession.isPlanMode}          // 🎯 传入Plan模式状态
              onTogglePlanMode={(enabled) => {                // 🎯 传入Plan模式切换回调
                if (state.currentSessionId) {
                  const sessionId = state.currentSessionId;  // 🎯 在外部捕获sessionId，避免null问题
                  togglePlanMode(sessionId, enabled);

                  // 🎯 当关闭Plan模式时，自动发送退出消息到后端
                  if (!enabled && currentSession.isPlanMode) {
                    // 延迟以确保状态已更新
                    setTimeout(() => {
                      const updatedSession = getCurrentSession();
                      if (updatedSession && updatedSession.messages.length > 0) {
                        // 获取最后一条消息（应该是刚添加的退出消息）
                        const lastMessage = updatedSession.messages[updatedSession.messages.length - 1];
                        if (lastMessage.type === 'user' && lastMessage.id.startsWith('plan-mode-exit-')) {
                          console.log(`🎯 [PLAN-MODE-EXIT] Auto-sending exit message to backend:`, lastMessage.id);
                          // 发送到后端
                          getGlobalMessageService().sendChatMessage(
                            sessionId,
                            lastMessage.content,
                            lastMessage.id
                          );
                        }
                      }
                    }, 50);
                  }
                }
              }}
            />
          ) : (
            <div className="multi-session-app__no-session">
              <div className="multi-session-app__no-session-icon"></div>
              <div className="multi-session-app__no-session-text">
                No Active Sessions
              </div>
              <button
                className="multi-session-app__create-first-btn"
                onClick={() => handleCreateSession(SessionType.CHAT)}
              >
                Create First Session
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Session管理对话框 */}
      {state.ui.showSessionManager && (
        <SessionManagerDialog
          isOpen={state.ui.showSessionManager}
          onClose={() => toggleSessionManager(false)}
          sessions={state.sessionList}
          currentSessionId={state.currentSessionId}
          onSessionAction={handleSessionManagerAction}
        />
      )}

      {/* 项目设置对话框 */}
      <ProjectSettingsDialog
        isOpen={state.ui.showProjectSettings}
        onClose={() => toggleProjectSettings(false)}
        mcpServers={mcpServers}
        mcpDiscoveryState={mcpDiscoveryState}
        mcpStatusLoaded={mcpStatusLoaded}
        onToggleMcpEnabled={handleToggleMcpEnabled}
      />

      {/* 自定义规则管理对话框 */}
      {isRulesManagementOpen && (
        <RulesManagementDialog
          isOpen={isRulesManagementOpen}
          onClose={() => setIsRulesManagementOpen(false)}
        />
      )}

      {/* 工具确认对话框 - 暂时禁用 */}
      {/* {state.ui.showConfirmationDialog && state.ui.currentConfirmationTool && (
        <ConfirmationDialog
          toolCall={state.ui.currentConfirmationTool}
          onConfirm={(confirmed, userInput) =>
            handleToolConfirmationResponse(state.ui.currentConfirmationTool!.id, confirmed, userInput)
          }
          onCancel={() => hideConfirmationDialog()}
        />
      )} */}

      {/* 🎯 Plan模式通知 */}
      <PlanModeNotification
        visible={planModeNotification.visible}
        blockedTools={planModeNotification.blockedTools}
        onDismiss={() => setPlanModeNotification({ visible: false, blockedTools: [] })}
      />

      {/* 🎯 聊天历史Modal */}
      <ChatHistoryModal
        key={`history-${state.sessions.size}-${historySessionsList.length}`}
        isOpen={isHistoryModalOpen}
        sessions={historySessionsList.map((sessionInfo) => {
          const sessionState = state.sessions.get(sessionInfo.id);
          const messages = sessionState?.messages ?? [];
          // 优先使用后端返回的最新 title
          const title = sessionInfo.title || sessionState?.info?.name || 'New Chat';
          return {
            id: sessionInfo.id,
            title,
            timestamp: sessionInfo.timestamp,
            messageCount: messages.length,
            messages,
          };
        })}
        currentSessionId={state.currentSessionId || undefined}
        onClose={() => setIsHistoryModalOpen(false)}
        onSelectSession={(sessionId) => {
          // 🎯 关键优化：先关闭 Modal，提升体验
          setIsHistoryModalOpen(false);

          // 🎯 如果点击的是当前对话，无需切换（已经关闭了 Modal）
          if (sessionId === state.currentSessionId) {
            return;
          }

          // 🎯 切换到选中的 session（handleSessionSwitch 会自动加载内容）
          handleSessionSwitch(sessionId);
        }}
        onDeleteSession={(sessionId) => {
          // 使用同一个删除函数，确保统一处理
          handleSessionAction('delete', sessionId);
        }}
        onRenameSession={(sessionId, newTitle) => {
          handleRenameSession(sessionId, newTitle);
        }}
        onExportSession={(sessionId) => {
          handleExportSession(sessionId);
        }}
        // 🎯 分页相关
        hasMore={historyHasMore}
        isLoading={isLoadingHistory}
        total={historyTotal}
        onLoadMore={() => {
          if (historyHasMore && !isLoadingHistory) {
            loadHistoryList(historySessionsList.length, 10);
          }
        }}
      />

      {/* 🎯 NanoBanana 图像生成对话框 */}
      <NanoBananaDialog
        isOpen={isNanoBananaOpen}
        onClose={() => setIsNanoBananaOpen(false)}
      />

      {/* 🎯 压缩确认弹窗（模型切换时上下文超限） */}
      <CompressionConfirmationDialog
        isOpen={!!compressionConfirmation && !isCompressing}
        targetModel={compressionConfirmation?.targetModel || ''}
        currentTokens={compressionConfirmation?.currentTokens || 0}
        targetTokenLimit={compressionConfirmation?.targetTokenLimit || 0}
        onConfirm={() => {
          if (compressionConfirmation) {
            setIsCompressing(true);
            webviewModelService.sendCompressionConfirmationResponse({
              requestId: compressionConfirmation.requestId,
              sessionId: compressionConfirmation.sessionId,
              targetModel: compressionConfirmation.targetModel,
              confirmed: true
            });
          }
        }}
        onCancel={() => {
          if (compressionConfirmation) {
            webviewModelService.sendCompressionConfirmationResponse({
              requestId: compressionConfirmation.requestId,
              sessionId: compressionConfirmation.sessionId,
              targetModel: compressionConfirmation.targetModel,
              confirmed: false
            });
            setCompressionConfirmation(null);
          }
        }}
      />

      {/* 🎯 压缩进行中提示（底部提示条，不遮挡操作） */}
      {isCompressing && (
        <div className="compression-progress-bar">
          <div className="compression-progress-spinner"></div>
          <span>{t('compression.inProgress', {}, 'Compressing context...')}</span>
        </div>
      )}

      {/* 🎯 重命名对话框 */}
      {renameDialog.isOpen && (
        <div className="rename-dialog-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="rename-dialog" style={{
            backgroundColor: 'var(--vscode-editor-background)',
            border: '1px solid var(--vscode-widget-border)',
            padding: '20px',
            borderRadius: '4px',
            width: '300px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '14px', fontWeight: 600 }}>Rename Session</h3>
            <input
              type="text"
              defaultValue={renameDialog.currentName}
              autoFocus
              style={{
                width: '100%',
                padding: '8px',
                marginBottom: '16px',
                backgroundColor: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border)',
                borderRadius: '2px',
                outline: 'none'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const newName = e.currentTarget.value.trim();
                  if (newName) {
                    handleRenameSession(renameDialog.sessionId, newName);
                    setRenameDialog({ ...renameDialog, isOpen: false });
                  }
                } else if (e.key === 'Escape') {
                  setRenameDialog({ ...renameDialog, isOpen: false });
                }
              }}
              ref={(input) => {
                if (input) {
                  setTimeout(() => input.select(), 0);
                }
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setRenameDialog({ ...renameDialog, isOpen: false })}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--vscode-button-secondaryBackground)',
                  color: 'var(--vscode-button-secondaryForeground)',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={(e) => {
                  const input = e.currentTarget.parentElement?.previousElementSibling as HTMLInputElement;
                  const newName = input.value.trim();
                  if (newName) {
                    handleRenameSession(renameDialog.sessionId, newName);
                    setRenameDialog({ ...renameDialog, isOpen: false });
                  }
                }}
                style={{
                  padding: '6px 12px',
                  backgroundColor: 'var(--vscode-button-background)',
                  color: 'var(--vscode-button-foreground)',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🎯 全局拖拽测试组件 - 恢复启用但非干扰模式 */}
      <DragDropGlobalTest enabled={false} />
    </div>
  );
};

