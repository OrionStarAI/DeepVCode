/**
 * Multi-Session Main App Component
 * 多Session主应用组件
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React, { useEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
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
  
  // 🎯 MessageInput 的 ref，用于插入代码引用
  const messageInputRef = useRef<MessageInputHandle>(null);

  // 🎯 登录状态管理
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null); // null = 检查中, false = 未登录, true = 已登录
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | undefined>();

  // 🎯 启动流程状态管理
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [forceUpdate, setForceUpdate] = useState(false);

  // 🎯 模型选择状态管理
  // 🛡️ 改为 'auto' 让服务端决定成本最优的模型
  const [selectedModelId, setSelectedModelId] = useState('auto');

  // 🎯 规则管理对话框状态
  const [isRulesManagementOpen, setIsRulesManagementOpen] = useState(false);

  const {
    state,
    createSession,
    deleteSession,
    switchToSession,
    updateSessionInfo,
    loadSessionContent, // 🎯 新增：按需加载Session内容
    addMessage,
    updateMessageContent,
    updateRollbackableIds, // 🎯 添加可回滚ID更新函数
    restoreSessionMessages, // 🎯 添加恢复消息的函数
    forceUpdateSessionMessages, // 🎯 添加强制更新消息的函数
    setLastAcceptedMessageId, // 🎯 文件变更跟踪
    setProcessingState,
    updateMessageToolCalls,
    updateToolLiveOutput,
    abortCurrentProcess,
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

  /**
   * 🎯 处理session切换 - 合并所有切换逻辑
   */
  const handleSessionSwitch = React.useCallback(async (sessionId: string) => {
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
    // Session管理事件监听器
    // =============================================================================

    messageService.onSessionListUpdate(({ sessions, currentSessionId }) => {
        console.log('🚀 [STARTUP] Received session list:', sessions.length, 'sessions');
        console.log('🔍 [DEBUG] onSessionListUpdate called, sessions:', sessions);
        console.log('🔍 [DEBUG] currentSessionId:', currentSessionId);

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
      }

      // 🎯 会话列表加载完成，准备隐藏loading screen
      console.log('🔍 [DEBUG] About to hide loading screen...');

      // 🎯 会话列表加载完成

      // 🎯 会话列表加载完成，但不操作升级UI，让升级逻辑自己处理LoadingScreen的隐藏
      console.log('🎯 [SESSION-LOADED] Sessions loaded, but letting upgrade logic handle LoadingScreen visibility');
    });

    messageService.onSessionCreated(({ session }) => {
      console.log('🆕 [NEW-SESSION] Creating new session with content loaded:', session.id);
      createSession(session, true); // 🎯 新建session立即加载内容

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
      updateSessionInfo(sessionId, session);
    });

    messageService.onSessionDeleted(({ sessionId }) => {
      deleteSession(sessionId);
    });

    messageService.onSessionSwitched(({ sessionId, session }) => {
      // 🎯 只更新前端状态，不要再次调用handleSessionSwitch避免循环
      console.log('📨 [BACKEND] Session switched to:', sessionId);
      switchToSession(sessionId);

      // 如果后端提供了session信息，也更新一下
      if (session) {
        updateSessionInfo(sessionId, session);
      }
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

    messageService.onChatComplete(({ sessionId, messageId }) => {

      const streamingMsg = streamingMessages.current.get(messageId);
      if (streamingMsg && streamingMsg.sessionId === sessionId) {
        // 标记消息为完成状态
        updateMessageContent(sessionId, messageId, streamingMsg.content, false);

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
      const targetMessageId = associatedMessageId || currentGetSession(sessionId)?.currentProcessingMessageId;

      if (targetMessageId) {
        updateMessageToolCalls(sessionId, targetMessageId, toolCalls);
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

    return () => {
    };

  }, []);

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

  /**
   * 处理发送消息
   */
  const handleSendMessage = (content: MessageContent) => {
    const currentSession = getCurrentSession();
    if (!currentSession) return;

    const sessionId = currentSession.info.id;

    // 🎯 如果当前正在处理，不允许发送新消息
    if (currentSession.isProcessing) {
      console.warn('Cannot send message while processing');
      return;
    }

    // 添加用户消息到当前Session
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'user',
      content,
      timestamp: Date.now()
    };

    addMessage(sessionId, userMessage);
    setSessionLoading(sessionId, true);

    // 发送到Extension
    getGlobalMessageService().sendChatMessage(sessionId, content, userMessage.id);
  };


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
   * 处理Session操作
   */
  const handleSessionAction = (action: 'rename' | 'delete' | 'duplicate', sessionId: string) => {
    // 使用全局MessageService

    switch (action) {
      case 'rename':
        // TODO: 显示重命名对话框
        break;
      case 'delete':
        getGlobalMessageService().deleteSession(sessionId);
        break;
      case 'duplicate':
        getGlobalMessageService().duplicateSession(sessionId);
        break;
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
  const getSessionTitle = React.useCallback((sessionId: string) => {
    const session = state.sessions.get(sessionId);
    if (!session) return '新建会话';

    // 如果内容已加载且有用户消息，使用第一条用户消息
    if (session.isContentLoaded) {
      const firstUserMessage = session.messages.find(msg => msg.type === 'user');
      const contentStr = messageContentToString(firstUserMessage?.content || []);
      if (contentStr.trim()) {
        const content = contentStr.trim();
        return content.length > 30 ? content.substring(0, 30) + '...' : content;
      }
    }

    // 否则使用后端给的标题（不管是什么）
    return session.info.name || '新建会话';
  }, [state.sessions]);

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
    // 在UI层面按创建时间排序，然后取前10个
    const sorted = allSessions
      .slice() // 创建副本避免修改原数组
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10);
    return sorted;
  }, [state.sessionList]);

  // =============================================================================
  // 渲染方法
  // =============================================================================

  // 🎯 显示重新设计的启动协调器
  if (showLoadingScreen) {
    return (
      <LoadingScreen
        onLoadingComplete={() => {
          console.log('🎯 [LoadingScreen] Loading complete - proceeding to main app');
          setShowLoadingScreen(false);
          // 确保已登录状态
          setIsLoggedIn(true);
          setIsInitialized(true);

          // 🎯 LoadingScreen完成意味着服务已初始化，立即请求会话列表
          console.log('✅ [MultiSessionApp] LoadingScreen完成，服务已就绪，请求会话列表');
          const messageService = getGlobalMessageService();
          messageService.requestSessionList();
        }}
        onLoginRequired={(error) => {
          console.log('🎯 [LoadingScreen] Login required:', error);
          setShowLoadingScreen(false);
          setIsLoggedIn(false);
          setLoginError(error);
        }}
        onUpdateRequired={(updateInfo, forceUpdate) => {
          console.log('🎯 [LoadingScreen] Update required:', { updateInfo, forceUpdate });
          setShowLoadingScreen(false);
          setShowUpdatePrompt(true);
          setUpdateInfo(updateInfo);
          setForceUpdate(forceUpdate);
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

  // 🎯 直接使用state获取当前session，避免stateRef时序问题
  // 在render过程中，stateRef可能还没有更新到最新状态，导致getCurrentSession()返回旧数据
  const currentSession = state.currentSessionId ? state.sessions.get(state.currentSessionId) || null : null;

  return (
    <div className="multi-session-app">
      {/* 应用头部 */}
      <header className="multi-session-app__header">
        <div className="multi-session-app__header-left">

          {/* Session切换器 */}
          <SessionSwitcher
            currentSession={currentSession?.info || null}
            sessions={getRecentSessions()}
            onSessionSwitch={handleSessionSwitch}
            onCreateSession={handleCreateSession}
            onSessionAction={handleSessionAction}
            getSessionTitle={getSessionTitle}
            isSessionUnused={isSessionUnused}
            disabled={state.isLoading}
          />
        </div>

        <div className="multi-session-app__header-right">
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

      {/* 🎯 全局拖拽测试组件 - 恢复启用但非干扰模式 */}
      <DragDropGlobalTest enabled={false} />
    </div>
  );
};

