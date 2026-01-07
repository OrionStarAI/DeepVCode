/**
 * useMessageHistory Hook
 *
 * 管理消息输入历史导航功能，类似终端的命令历史
 * 支持通过 ↑/↓ 键或 Ctrl+P/N 浏览之前发送的消息
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { MessageContent, ChatMessage } from '../types/index';

interface UseMessageHistoryOptions {
  messages: ChatMessage[];  // 从父组件传入的完整消息列表
  onHistoryNavigate: (content: MessageContent) => void;  // 回调：填充内容到编辑器
  getCurrentInput: () => MessageContent;  // 获取当前编辑器内容
}

export interface UseMessageHistoryReturn {
  navigateUp: () => void;
  navigateDown: () => void;
  resetHistory: () => void;
  isInHistory: boolean;
  currentHistoryIndex: number;
  historyLength: number;
}

export function useMessageHistory({
  messages,
  onHistoryNavigate,
  getCurrentInput
}: UseMessageHistoryOptions): UseMessageHistoryReturn {
  // -1 表示当前输入（不在历史中），0+ 表示历史索引
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // 保存用户当前正在输入的内容（第一次按 ↑ 时保存）
  const currentInputBufferRef = useRef<MessageContent | null>(null);

  // 从消息列表中提取用户发送的消息内容（反转顺序：最新在前）
  const userMessageHistory = messages
    .filter(msg => msg.type === 'user')  // 只保留用户消息
    .map(msg => msg.content)
    .reverse();  // 最新的消息在数组开头

  // 向上导航（回到更早的历史）
  const navigateUp = useCallback(() => {
    if (userMessageHistory.length === 0) {
      console.log('[MessageHistory] No history available');
      return;
    }

    // 第一次按 ↑ 时，保存当前输入
    if (historyIndex === -1) {
      const currentInput = getCurrentInput();
      currentInputBufferRef.current = currentInput;
      console.log('[MessageHistory] Saved current input:', currentInput);
    }

    // 计算新索引（不超过历史长度）
    const newIndex = Math.min(historyIndex + 1, userMessageHistory.length - 1);

    if (newIndex !== historyIndex) {
      setHistoryIndex(newIndex);
      const historyContent = userMessageHistory[newIndex];
      console.log(`[MessageHistory] Navigate up to index ${newIndex}:`, historyContent);
      onHistoryNavigate(historyContent);
    }
  }, [historyIndex, userMessageHistory, onHistoryNavigate, getCurrentInput]);

  // 向下导航（回到更新的历史或当前输入）
  const navigateDown = useCallback(() => {
    if (historyIndex === -1) {
      console.log('[MessageHistory] Already at current input');
      return;  // 已经在最新位置
    }

    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);

    if (newIndex === -1) {
      // 回到当前输入
      const restoredInput = currentInputBufferRef.current || [];
      console.log('[MessageHistory] Restore current input:', restoredInput);
      onHistoryNavigate(restoredInput);
      currentInputBufferRef.current = null;  // 清空缓存
    } else {
      // 导航到更新的历史消息
      const historyContent = userMessageHistory[newIndex];
      console.log(`[MessageHistory] Navigate down to index ${newIndex}:`, historyContent);
      onHistoryNavigate(historyContent);
    }
  }, [historyIndex, userMessageHistory, onHistoryNavigate]);

  // 重置历史索引（用户发送新消息后调用）
  const resetHistory = useCallback(() => {
    console.log('[MessageHistory] Reset history state');
    setHistoryIndex(-1);
    currentInputBufferRef.current = null;
  }, []);

  // 当消息列表变化时，确保索引不会越界
  useEffect(() => {
    if (historyIndex >= userMessageHistory.length) {
      setHistoryIndex(userMessageHistory.length - 1);
    }
  }, [userMessageHistory.length, historyIndex]);

  return {
    navigateUp,
    navigateDown,
    resetHistory,
    isInHistory: historyIndex > -1,
    currentHistoryIndex: historyIndex,
    historyLength: userMessageHistory.length,
  };
}
