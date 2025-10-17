/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useCallback, useRef } from 'react';
import { SessionManager, type Config } from 'deepv-code-core';
import { type HistoryItem, StreamingState } from '../types.js';

interface UseSessionRestoreParams {
  config: Config;
  loadHistory: (history: HistoryItem[]) => void;
}

export const useSessionRestore = ({ config, loadHistory }: UseSessionRestoreParams) => {
  
  const restoreSession = useCallback(async () => {
    const projectRoot = config.getProjectRoot();
    if (!projectRoot) {
      return;
    }

    try {
      //console.log('[SessionRestore] Starting session restoration...');
      const sessionManager = new SessionManager(projectRoot);
      const sessionData = await sessionManager.loadSession(config.getSessionId());
      
      if (!sessionData) {
        console.log('[SessionRestore] No session data found');
        return;
      }

      // 1. 立即恢复UI历史记录
      if (sessionData.history && sessionData.history.length > 0) {
        console.log(`[SessionRestore] Restoring UI history with ${sessionData.history.length} items`);
        loadHistory(sessionData.history);
      }

      // 2. 启动AI客户端历史记录恢复监听器
      if (sessionData.clientHistory && sessionData.clientHistory.length > 0) {
        console.log(`[SessionRestore] Setting up AI client history restoration for ${sessionData.clientHistory.length} items`);
        startClientHistoryRestore(config, sessionData.clientHistory);
      }

    } catch (error) {
      console.warn('[SessionRestore] Failed to restore session:', error);
    }
  }, [config, loadHistory]);

  // 在组件挂载时执行恢复
  useEffect(() => {
    restoreSession();
  }, []); // 只执行一次

  return { restoreSession };
};

/**
 * 启动AI客户端历史记录恢复监听器
 */
function startClientHistoryRestore(config: Config, clientHistory: any[]) {
  console.log('[SessionRestore] Starting AI client history restore monitor...');
 
  const checkAndRestore = () => {
    const geminiClient = config.getGeminiClient();
    
    // 检查客户端是否已初始化
    if (geminiClient && geminiClient.isInitialized?.()) {
      try {
        console.log(`[SessionRestore] AI client ready! Restoring ${clientHistory.length} history items`);
        geminiClient.setHistory(clientHistory);
        console.log('[SessionRestore] ✅ Successfully restored AI client history');
        return; // 成功，退出监听
      } catch (error) {
        console.warn('[SessionRestore] ❌ Failed to restore AI client history:', error);
        return; // 失败也退出，避免无限重试
      }
    }
    // 如果还没准备好且没超过最大尝试次数，继续监听
    setTimeout(checkAndRestore, 200);
  };

  // 立即开始第一次检查
  checkAndRestore();
}

/**
 * 自动保存session历史记录的hook
 * 监听StreamingState变化，在turn完成时自动保存
 */
export const useSessionAutoSave = (config: Config, history: HistoryItem[], streamingState: StreamingState) => {
  const lastSavedHistoryLengthRef = useRef(0);
  const previousStreamingStateRef = useRef<StreamingState | undefined>(undefined);
  
  const saveSession = useCallback(async () => {
    // 检查是否有新的历史记录需要保存
    if (history.length === 0 || history.length === lastSavedHistoryLengthRef.current) {
      return;
    }

    const projectRoot = config.getProjectRoot();
    if (!projectRoot) {
      return;
    }

    try {
      const sessionManager = new SessionManager(projectRoot);
      const clientHistory = await config.getGeminiClient()?.getHistory();
      
      await sessionManager.saveSessionHistory(
        config.getSessionId(), 
        history, 
        clientHistory
      );
      
      lastSavedHistoryLengthRef.current = history.length;
      console.log(`[SessionAutoSave] ✅ Turn completed - Saved ${history.length} history items`);
    } catch (error) {
      console.warn('[SessionAutoSave] ❌ Failed to save session history:', error);
    }
  }, [config, history]);

  // 监听StreamingState变化，检测turn完成
  useEffect(() => {
    const previousState = previousStreamingStateRef.current;
    const currentState = streamingState;
    
    // 检测从Responding变为Idle，表示turn完成
    if (previousState === StreamingState.Responding && currentState === StreamingState.Idle) {
      // 使用小延迟确保所有状态已更新
      setTimeout(() => {
        saveSession();
      }, 500);
    }
    
    previousStreamingStateRef.current = currentState;
  }, [streamingState, saveSession]);

  // 组件卸载时保存（备用机制）
  // useEffect(() => {
  //   return () => {
  //     if (history.length > lastSavedHistoryLengthRef.current) {
  //       const projectRoot = config.getProjectRoot();
  //       if (projectRoot) {
  //         const sessionManager = new SessionManager(projectRoot);
  //         sessionManager.saveSessionHistory(
  //           config.getSessionId(), 
  //           history, 
  //           undefined
  //         ).catch(error => {
  //           console.warn('[SessionAutoSave] ❌ Failed to save on unmount:', error);
  //         });
  //       }
  //     }
  //   };
  // }, [config, history]);
};
