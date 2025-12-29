/**
 * useRefineCommand Hook
 * 处理 /refine 命令的执行和结果管理
 */

import { useState, useCallback, useEffect } from 'react';

export interface RefineResult {
  original: string;
  refined: string;
  isLoading: boolean;
  error?: string;
}

export interface UseRefineCommandReturn {
  refineResult: RefineResult | null;
  isLoading: boolean;
  executeRefine: (text: string) => Promise<void>;
  clearRefineResult: () => void;
  acceptRefinement: () => void;
  refineAgain: () => void;
}

export function useRefineCommand(): UseRefineCommandReturn {
  const [refineResult, setRefineResult] = useState<RefineResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * 监听全局 refine 事件
   * 在 index.tsx 中已经注册了消息监听器并广播事件
   * 这里只需要监听由全局监听器广播的事件
   */
  useEffect(() => {
    console.log('[useRefineCommand] Setting up event listeners for refine commands');

    const handleRefineResult = (event: any) => {
      const data = event.detail;
      console.log('[useRefineCommand] Received refine-result event:', data);
      setRefineResult({
        original: data.original,
        refined: data.refined,
        isLoading: false,
      });
      setIsLoading(false);
    };

    const handleRefineError = (event: any) => {
      const data = event.detail;
      console.log('[useRefineCommand] Received refine-error event:', data);
      setRefineResult({
        original: '',
        refined: '',
        isLoading: false,
        error: data.error,
      });
      setIsLoading(false);
    };

    // 监听全局事件
    window.addEventListener('refine-result', handleRefineResult);
    window.addEventListener('refine-error', handleRefineError);

    console.log('[useRefineCommand] Event listeners registered');

    // 清理函数
    return () => {
      console.log('[useRefineCommand] Removing event listeners');
      window.removeEventListener('refine-result', handleRefineResult);
      window.removeEventListener('refine-error', handleRefineError);
    };
  }, []);

  /**
   * 执行 /refine 命令
   */
  const executeRefine = useCallback(async (text: string) => {
    if (!text.trim()) {
      return;
    }

    console.log('[useRefineCommand] Executing refine command with text:', text);
    setIsLoading(true);

    // 通过 VSCode API 发送 /refine 命令
    if (window.vscode) {
      window.vscode.postMessage({
        type: 'execute_slash_command',
        payload: {
          command: 'refine',
          args: text,
        },
      });
      console.log('[useRefineCommand] Posted message to extension');
    } else {
      setIsLoading(false);
      console.error('[useRefineCommand] VSCode API not available');
    }
  }, []);

  /**
   * 清除 refine 结果
   */
  const clearRefineResult = useCallback(() => {
    console.log('[useRefineCommand] Clearing refine result');
    setRefineResult(null);
  }, []);

  /**
   * 接受优化结果，将其发送给 AI
   * 注：这个功能由 MessageInput 组件通过 useEffect 自动处理
   */
  const acceptRefinement = useCallback(() => {
    if (refineResult) {
      // 清除结果状态，让 MessageInput 的 useEffect 处理文本替换
      clearRefineResult();
    }
  }, [refineResult, clearRefineResult]);

  /**
   * 重新优化文本
   */
  const refineAgain = useCallback(() => {
    if (refineResult) {
      // 使用原始文本重新执行 refine
      executeRefine(refineResult.original);
    }
  }, [refineResult, executeRefine]);

  return {
    refineResult,
    isLoading,
    executeRefine,
    clearRefineResult,
    acceptRefinement,
    refineAgain,
  };
}
