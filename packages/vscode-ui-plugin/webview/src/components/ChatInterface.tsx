/**
 * Chat Interface Component
 */

import React, { useState, useRef, useEffect } from 'react';
import { Loader2, ArrowDown, AlertTriangle } from 'lucide-react';
import { ChatMessage, ToolCall, MessageContent } from '../types';
import { ModifiedFile } from '../types/fileChanges';
import { extractModifiedFiles } from '../utils/fileChangeExtractor';
import { MessageBubble } from './MessageBubble';
import { ToolCallList } from './ToolCallList';
import { MessageInput } from './MessageInput';
import FilesChangedBar from './FilesChangedBar';
import { useTranslation } from '../hooks/useTranslation';
import './ChatInterface.css';
import { getGlobalMessageService } from '../services/globalMessageService';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSendMessage: (content: MessageContent) => void;
  onToolConfirm?: (toolCallId: string, confirmed: boolean, userInput?: string) => void;
  // 🎯 新增：流程控制
  isProcessing?: boolean;        // 是否正在处理
  canAbort?: boolean;           // 是否可以中断
  onAbortProcess?: () => void;  // 中断处理回调
  // 🎯 新增：文件变更跟踪
  lastAcceptedMessageId?: string | null;
  onSetLastAcceptedMessageId?: (messageId: string) => void;
  // 🎯 新增：模型选择
  selectedModelId?: string;
  onModelChange?: (modelId: string) => void;
  // 🎯 新增：会话管理
  sessionId?: string;           // 当前会话ID
  // 🎯 新增：消息列表更新
  onUpdateMessages?: (messages: ChatMessage[]) => void;  // 更新消息列表回调
  // 🎯 新增：可回滚消息ID列表
  rollbackableMessageIds?: string[];  // 可以回滚编辑的消息ID列表
  // 🎯 新增：Token使用情况
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    tokenLimit: number;
    cachedContentTokens?: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
    creditsUsage?: number;
  };
  // 🎯 新增：MessageInput ref（用于插入代码引用）
  messageInputRef?: React.RefObject<any>;
  // 🎯 新增：Plan模式
  isPlanMode?: boolean;         // 是否在Plan模式
  onTogglePlanMode?: (enabled: boolean) => void;  // Plan模式切换回调
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  isLoading,
  onSendMessage,
  onToolConfirm,
  isProcessing = false,
  canAbort = false,
  onAbortProcess,
  lastAcceptedMessageId: propLastAcceptedMessageId,
  onSetLastAcceptedMessageId,
  selectedModelId,
  onModelChange,
  sessionId,
  onUpdateMessages,
  tokenUsage,
  rollbackableMessageIds = [],
  messageInputRef,
  isPlanMode = false,
  onTogglePlanMode
}) => {
  const { t } = useTranslation();
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const [modifiedFiles, setModifiedFiles] = useState<Map<string, ModifiedFile>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // 🎯 新增：编辑状态管理
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingOriginalMessage, setEditingOriginalMessage] = useState<ChatMessage | null>(null);

  // 🎯 新增：编辑确认对话框状态
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingEditData, setPendingEditData] = useState<{messageId: string, newContent: MessageContent} | null>(null);


  // 🎯 智能滚动：根据用户位置自动滚动到底部
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || messages.length === 0) return;

    // 使用requestAnimationFrame确保DOM完全渲染后再执行滚动判断
    const performScrollCheck = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100; // 增加容错范围

      // 在以下情况自动滚动到底部：
      // 1. 第一条消息
      // 2. 用户在底部附近（容忍100px的偏差）
      // 3. 用户从未手动滚动过
      if (messages.length === 1 || isNearBottom || !userHasScrolled) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

        // 如果是因为新消息而滚动，重置手动滚动标记
        if (isNearBottom) {
          setUserHasScrolled(false);
        }
      }
    };

    // 延迟执行，确保新消息的DOM已经渲染
    requestAnimationFrame(performScrollCheck);
  }, [messages, userHasScrolled]);

  // 🎯 监听滚动事件，检测用户位置和手动滚动
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100; // 与自动滚动逻辑保持一致

      // 显示/隐藏滚动到底部按钮
      setShowScrollToBottom(!isNearBottom && messages.length > 0);

      // 只有当用户明显离开底部区域时，才标记为手动滚动
      // 这样可以避免因为内容渲染导致的轻微滚动位置变化被误判
      if (!isNearBottom) {
        setUserHasScrolled(true);
      } else {
        // 如果用户又回到了底部附近，重置手动滚动标记
        setUserHasScrolled(false);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [messages.length]);

  // 🎯 计算修改的文件
  useEffect(() => {
    const filesMap = extractModifiedFiles(messages, undefined, propLastAcceptedMessageId || undefined);
    setModifiedFiles(filesMap);
  }, [messages, propLastAcceptedMessageId]);

  // 🎯 编辑模式下的键盘快捷键支持
  useEffect(() => {
    if (!editingMessageId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        console.log('🎯 用户按下Escape键，取消编辑');
        handleCancelEdit();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editingMessageId]);

  // 🎯 点击外部区域取消编辑
  useEffect(() => {
    if (!editingMessageId) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;

      // 检查点击是否在编辑器区域内
      const editingElement = document.querySelector(`[data-message-id="${editingMessageId}"]`);

      if (editingElement && !editingElement.contains(target) ) {
        console.log('🎯 用户点击外部区域，取消编辑');
        handleCancelEdit();
      }
    };

    // 延迟添加事件监听器，避免立即触发
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [editingMessageId]);

  // 🎯 滚动到底部函数
  const scrollToBottom = () => {
    // 立即隐藏按钮，避免滚动过程中闪现
    setShowScrollToBottom(false);
    setUserHasScrolled(false);

    // 开始滚动
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

    // 延迟1.5秒后重新检查是否需要显示按钮
    setTimeout(() => {
      if (messagesContainerRef.current) {
        const container = messagesContainerRef.current;
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;
        const isNearBottom = scrollTop + clientHeight >= scrollHeight - 50;

        // 如果用户在延迟期间又滚动了，且不在底部，则重新显示按钮
        if (!isNearBottom && messages.length > 0) {
          setShowScrollToBottom(true);
        }
      }
    }, 1500);
  };

  // 🎯 强制滚动到底部（用于发送消息后）
  const forceScrollToBottom = () => {
    // 重置用户滚动状态，确保自动滚动生效
    setUserHasScrolled(false);
    // 立即滚动到底部
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 0);
  };

  // 🎯 处理发送消息并自动滚动到底部
  const handleSendMessage = (content: MessageContent) => {
    // 调用原始的发送消息函数
    onSendMessage(content);
    // 自动滚动到底部
    forceScrollToBottom();
  };

  // 🎯 处理重新生成消息
  const handleRegenerate = (messageId: string) => {
    // 找到要重新生成的消息
    const message = messages.find(msg => msg.id === messageId);
    if (!message || message.type !== 'assistant') {
      console.error('无法重新生成：消息类型错误');
      return;
    }

    // 找到该消息的索引
    const messageIndex = messages.findIndex(msg => msg.id === messageId);
    if (messageIndex < 0) {
      console.error('无法重新生成：未找到消息');
      return;
    }

    // 查找最近的用户消息及其索引
    let userMessage: ChatMessage | undefined;
    let userMessageIndex = -1;
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (messages[i].type === 'user') {
        userMessage = messages[i];
        userMessageIndex = i;
        break;
      }
    }

    if (!userMessage || userMessageIndex === -1) {
      console.error('无法重新生成：未找到对应的用户消息');
      return;
    }

    // 🎯 保留原用户消息，只删除助手回答及之后的所有消息
    // 这样用户消息保持不变（ID和内容都不变）
    const newMessages = messages.slice(0, userMessageIndex + 1); // 保留到用户消息（包含）

    // 更新消息列表
    if (onUpdateMessages) {
      onUpdateMessages(newMessages);
    }

    // 🎯 使用消息服务直接发送聊天请求，不通过onSendMessage（避免重复创建用户消息）
    const messageService = getGlobalMessageService();
    if (sessionId && messageService) {
      // 延迟发送，确保消息列表已更新
      setTimeout(() => {
        messageService.sendChatMessage(sessionId, userMessage.content, userMessage.id);
        forceScrollToBottom();
      }, 50);
    } else {
      console.error('无法重新生成：缺少sessionId或messageService');
    }
  };

  // 🎯 新增：编辑功能处理函数
  const handleStartEdit = (messageId: string) => {
    const message = messages.find(msg => msg.id === messageId);

    if (!message || message.type !== 'user') {
      return;
    }

    // 🎯 检查是否可以回滚（有对应的prompt_id）
    if (!rollbackableMessageIds.includes(messageId)) {
      console.warn('🎯 消息无法编辑，没有对应的AI历史记录:', { messageId });
      // 这里可以显示用户友好的提示消息
      return;
    }

    console.log('🎯 开始编辑消息:', { messageId, message, canRollback: true });
    setEditingMessageId(messageId);
    setEditingOriginalMessage(message);

    // 🎯 滚动到编辑的消息位置
    setTimeout(() => {
      const editingElement = document.querySelector(`[data-message-id="${messageId}"]`);
      if (editingElement) {
        editingElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const handleSaveEdit = (messageId: string, newContent: MessageContent) => {
    console.log('🎯 保存编辑消息:', {
      messageId,
      newContent,
      originalMessage: editingOriginalMessage
    });

    const messageIndex = messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) {
      console.error('🎯 未找到要编辑的消息:', messageId);
      return;
    }

    const subsequentMessagesCount = messages.length - messageIndex - 1;

    console.log('🎯 消息编辑详情:');
    console.log('  - 消息ID:', messageId);
    console.log('  - 消息位置:', messageIndex, '/', messages.length);
    console.log('  - 原始内容:', editingOriginalMessage?.content);
    console.log('  - 新内容:', newContent);
    console.log('  - 后续消息数量:', subsequentMessagesCount);

    // 🎯 如果有后续消息，显示确认对话框
    if (subsequentMessagesCount > 0) {
      setPendingEditData({ messageId, newContent });
      setShowConfirmDialog(true);
    } else {
      // 🎯 没有后续消息，直接执行编辑
      executeEdit(messageId, newContent);
    }
  };

  // 🎯 执行编辑操作
  const executeEdit = async (messageId: string, newContent: MessageContent) => {
    const messageIndex = messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return;

    try {
      console.log('🎯 开始执行编辑操作');

      // 🎯 1. 截断消息历史到编辑位置
      const truncatedMessages = messages.slice(0, messageIndex);

      // 🎯 2. 更新编辑的消息内容
      const updatedMessage = {
        ...messages[messageIndex],
        content: newContent,
        timestamp: Date.now() // 更新时间戳
      };

      // 🎯 3. 创建新的消息数组（包含更新后的编辑消息）
      const newMessages = [...truncatedMessages, updatedMessage];

      console.log('🎯 消息历史已截断:', {
        原始消息数量: messages.length,
        截断后数量: newMessages.length,
        删除的消息数: messages.length - newMessages.length,
        编辑的消息ID: messageId
      });

      if (onAbortProcess) {
        onAbortProcess();
      }

      // 🎯 4. 立即更新UI中的消息列表
      if (onUpdateMessages) {
        console.log('🎯 立即更新UI消息列表');
        onUpdateMessages(newMessages);
      }

      // 🎯 5. 通过多Session消息服务发送编辑请求
      // 🎯 重要：传递完整的消息历史给后端，这样FileRollbackService可以分析所有文件修改
      console.log('🎯 发送编辑消息请求到AI服务（包含完整消息历史）');

      // 使用多Session消息服务发送编辑请求，传递原始的完整消息历史
      getGlobalMessageService().sendEditMessageAndRegenerate(
        sessionId || '',
        messageId,
        newContent,
        messages // 🎯 传递原始的完整消息历史用于文件回滚分析
      );

      // 🎯 6. 清空编辑状态
      setEditingMessageId(null);
      setEditingOriginalMessage(null);

      // 🎯 7. 触发滚动到底部
      forceScrollToBottom();

    } catch (error) {
      console.error('🎯 编辑操作失败:', error);
      // TODO: 显示错误提示
    }
  };

  // 🎯 确认编辑回滚
  const handleConfirmEdit = () => {
    if (pendingEditData) {
      executeEdit(pendingEditData.messageId, pendingEditData.newContent);
      setPendingEditData(null);
    }
    setShowConfirmDialog(false);
  };

  // 🎯 取消编辑回滚
  const handleCancelEditConfirm = () => {
    setPendingEditData(null);
    setShowConfirmDialog(false);
  };

  /**
   * 🎯 处理回退到指定消息
   *
   * 功能说明：
   * - 回退操作会删除目标消息之后的所有消息
   * - 同时会将文件系统回滚到该消息时的状态
   * - 直接执行，无需二次确认
   *
   * 执行流程：
   * 1. 验证目标消息有效性
   * 2. 中断当前正在进行的AI处理
   * 3. 截断UI中的消息历史
   * 4. 发送回退请求到后端进行文件回滚
   * 5. 后端会回滚文件到目标消息时的状态
   *
   * @param messageId - 要回退到的目标消息ID
   */
  const handleRollback = async (messageId: string) => {
    // 🔍 1. 验证目标消息是否存在
    const messageIndex = messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) {
      console.error('🎯 回退失败：找不到目标消息', { messageId });
      return;
    }

    // 🔍 2. 检查是否是最后一条消息（最后一条消息不应该显示回退按钮，但做双重保险）
    const isLastMessage = messageIndex === messages.length - 1;
    if (isLastMessage) {
      console.warn('🎯 无法回退：这是最后一条消息');
      return;
    }

    // 🔍 3. 计算将被删除的消息数量
    const messagesWillBeDeleted = messages.length - messageIndex - 1;

    console.log('🎯 开始执行回退操作:', {
      目标消息ID: messageId,
      目标消息索引: messageIndex,
      当前消息总数: messages.length,
      将删除的消息数: messagesWillBeDeleted
    });

    try {
      // ✅ 步骤1: 中断当前进程（如果有AI正在生成回复）
      if (onAbortProcess) {
        console.log('🎯 中断当前AI处理流程');
        onAbortProcess();
      }

      // ✅ 步骤2: 截断消息历史到目标消息（包含目标消息本身）
      const newMessages = messages.slice(0, messageIndex + 1);

      console.log('🎯 消息历史已截断:', {
        原始消息数量: messages.length,
        截断后数量: newMessages.length,
        删除的消息数: messages.length - newMessages.length
      });

      // ✅ 步骤3: 立即更新UI中的消息列表（提供即时反馈）
      if (onUpdateMessages) {
        console.log('🎯 立即更新UI消息列表');
        onUpdateMessages(newMessages);
      }

      // ✅ 步骤4: 发送回退请求到后端
      // 后端会：
      // - 分析目标消息之后所有的文件修改
      // - 将这些文件回滚到目标消息时的状态
      // - 回滚AI的对话历史
      console.log('🎯 发送回退请求到后端（包含完整消息历史用于文件分析）');

      getGlobalMessageService().sendRollbackToMessage(
        sessionId || '',
        messageId,
        messages  // ⭐ 传递原始完整消息历史，后端需要分析所有文件修改
      );

      // ✅ 步骤5: 触发滚动到底部，让用户看到最新状态
      forceScrollToBottom();

      console.log('✅ 回退操作已触发，等待后端文件回滚完成');

    } catch (error) {
      console.error('❌ 回退操作失败:', error);

      // 错误已经记录到控制台，后端会通过 sendChatError 向前端发送错误消息
      // 前端会在聊天界面显示错误提示
    }
  };

  const handleCancelEdit = () => {
    console.log('🎯 取消编辑消息:', {
      editingMessageId,
      originalMessage: editingOriginalMessage
    });

    // 清空编辑状态
    setEditingMessageId(null);
    setEditingOriginalMessage(null);
  };

  // 🎯 处理文件点击 - 在编辑器中打开diff
  const handleFileClick = (file: ModifiedFile) => {
    if (typeof window !== 'undefined' && window.vscode) {
      if (file.isDeletedFile) {
        // 对于删除的文件，显示原始内容
        window.vscode.postMessage({
          type: 'openDeletedFileContent',
          payload: {
            fileName: file.fileName,
            filePath: file.filePath,
            deletedContent: file.deletedContent || file.firstOriginalContent
          }
        });
      } else {
        // 对于修改或新建的文件，显示diff
        window.vscode.postMessage({
          type: 'openDiffInEditor',
          payload: {
            fileDiff: file.latestFileDiff,
            fileName: file.fileName,
            originalContent: file.firstOriginalContent,
            newContent: file.latestNewContent
          }
        });
      }
    }
  };

  // 🎯 处理接受文件变更
  const handleAcceptChanges = () => {
    // 找到最后一条消息的ID
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && onSetLastAcceptedMessageId) {
      const newAcceptedId = lastMessage.id;
      onSetLastAcceptedMessageId(newAcceptedId);

      // 发送消息给后端保存状态
      if (typeof window !== 'undefined' && window.vscode) {
        window.vscode.postMessage({
          type: 'acceptFileChanges',
          payload: {
            lastAcceptedMessageId: newAcceptedId
          }
        });
      }
    }
  };

  return (
    <div className="chat-interface">


      {/* Messages Area */}
      <div className="messages-container" ref={messagesContainerRef}>
        {messages.length === 0 ? (
          <div className="welcome-message">
            <div className="welcome-content">
              <h2>
                👋 {t('welcome.titleMain')}
                <br />
                <span className="welcome-subtitle">{t('welcome.titleSub')}</span>
              </h2>
              <p>{t('welcome.description')}</p>

            </div>
          </div>
        ) : (
          <>
            {(() => {
              // 🎯 提前计算最后一条助手消息的索引（优化性能，避免每次渲染都计算）
              let lastAssistantMessageIndex = -1;
              for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].type === 'assistant') {
                  lastAssistantMessageIndex = i;
                  break;
                }
              }

              return messages.map((message, index) => {
                // 🎯 判断是否是最后一条助手消息
                const isLastAssistantMessage = index === lastAssistantMessageIndex;

                return (
                <div key={message.id} data-message-id={message.id}>
                  {/* 🎯 如果是正在编辑的用户消息，显示编辑器 */}
                  {message.type === 'user' && editingMessageId === message.id ? (
                    <div className="message-bubble user-message editing">
                      <MessageInput
                        mode="edit"
                        editingMessageId={message.id}
                        initialContent={message.content}
                        onSendMessage={onSendMessage} // 🎯 编辑模式下不会调用这个，但是接口需要
                        onSaveEdit={handleSaveEdit}
                        onCancelEdit={handleCancelEdit}
                        isLoading={false}
                        isProcessing={false}
                        selectedModelId={selectedModelId}
                        onModelChange={onModelChange}
                        sessionId={sessionId}
                        tokenUsage={tokenUsage}
                        showModelSelector={true}
                        showTokenUsage={false}
                        compact={true}
                        className="message-editor"
                        placeholder="编辑你的消息..."
                        isPlanMode={isPlanMode}
                        onTogglePlanMode={onTogglePlanMode}
                      />
                    </div>
                  ) : (
                    <MessageBubble
                      message={message}
                      onToolConfirm={onToolConfirm}
                      onStartEdit={message.type === 'user' && rollbackableMessageIds.includes(message.id) ? handleStartEdit : undefined}
                      onRegenerate={isLastAssistantMessage ? handleRegenerate : undefined}
                      onRollback={
                        // 🎯 回退按钮显示条件：
                        // 1. 必须是用户消息
                        // 2. 必须在可回滚消息列表中
                        // 3. 不能是最后一条消息（最后一条消息后面没有可回退的内容）
                        message.type === 'user' &&
                        rollbackableMessageIds.includes(message.id) &&
                        index < messages.length - 1
                          ? handleRollback
                          : undefined
                      }
                      canRevert={message.type === 'user' && rollbackableMessageIds.includes(message.id) && index < messages.length - 1}
                      sessionId={sessionId}
                      messages={messages}
                      onUpdateMessages={onUpdateMessages}
                    />
                  )}
                </div>
                );
              });
            })()}

            {isLoading && (
              <div className="loading-message">
                <div className="loading-indicator">
                  <div className="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <span className="loading-text">{t('chat.thinking')}</span>
                </div>
              </div>
            )}

            {/* 🎯 执行中状态显示 */}
            {isProcessing && (
              <div className="processing-message">
                <div className="processing-indicator">
                  <Loader2 className="processing-spinner" size={16} />
                  <div className="processing-text-wrapper">
                    <span className="processing-text">Generating response...</span>
                  </div>
                </div>
              </div>
            )}

          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Files Changed Bar */}
      <FilesChangedBar
        modifiedFiles={modifiedFiles}
        onFileClick={handleFileClick}
        onAcceptChanges={handleAcceptChanges}
      />

      {/* 🎯 编辑确认对话框 */}
      {showConfirmDialog && (
        <div className="confirm-dialog-overlay" onClick={handleCancelEditConfirm}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-dialog-header">
              <AlertTriangle size={16} color="var(--vscode-editorWarning-foreground)" />
              <h3>确认编辑操作</h3>
            </div>
            <div className="confirm-dialog-content">
              <p>编辑此消息将会删除后续的 {pendingEditData && messages.findIndex(m => m.id === pendingEditData.messageId) !== -1 ?
                messages.length - messages.findIndex(m => m.id === pendingEditData.messageId) - 1 : 0} 条对话，并重新生成AI回复。</p>
              <p>此操作不可撤销，确定要继续吗？</p>
            </div>
            <div className="confirm-dialog-actions">
              <button
                className="confirm-dialog-button secondary"
                onClick={handleCancelEditConfirm}
              >
                取消
              </button>
              <button
                className="confirm-dialog-button primary"
                onClick={handleConfirmEdit}
              >
                确认编辑
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🎯 滚动到底部按钮 - 悬浮在输入框上方 */}
      {showScrollToBottom && (
        <div style={{
          position: 'relative',
          height: '0',
          zIndex: 100
        }}>
          <button
            onClick={scrollToBottom}
            style={{
              position: 'absolute',
              bottom: '12px', // 输入框上方一点点
              right: '20px',
              backgroundColor: 'rgba(14, 99, 156, 0.85)', // 稍微提高透明度
              color: 'var(--vscode-button-foreground)',
              border: '1px solid rgba(14, 99, 156, 0.6)',
              borderRadius: '50%',
              width: '32px', // 更小巧
              height: '32px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              backdropFilter: 'blur(6px)',
              transition: 'all 0.2s ease',
              animation: 'fadeIn 0.3s ease-in'
            }}
            title={t('chat.scrollToBottom')}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(17, 119, 187, 0.95)';
              e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(14, 99, 156, 0.85)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <ArrowDown size={14} />
          </button>
        </div>
      )}

      {/* Input Area */}
      <MessageInput
        ref={messageInputRef}
        isLoading={isLoading}
        isProcessing={isProcessing}
        canAbort={canAbort}
        onSendMessage={handleSendMessage}
        onAbortProcess={onAbortProcess}
        selectedModelId={selectedModelId}
        onModelChange={onModelChange}
        sessionId={sessionId}
        tokenUsage={tokenUsage}
        isPlanMode={isPlanMode}
        onTogglePlanMode={onTogglePlanMode}
      />
    </div>
  );
};
