/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useInput } from 'ink';
import { t, tp, isChineseLocale } from '../utils/i18n.js';
import {
  Config,
  GeminiClient,
  GeminiEventType as ServerGeminiEventType,
  ServerGeminiStreamEvent as GeminiEvent,
  ServerGeminiContentEvent as ContentEvent,
  ServerGeminiErrorEvent as ErrorEvent,
  ServerGeminiChatCompressedEvent,
  ServerGeminiFinishedEvent,
  getErrorMessage,
  isNodeError,
  MessageSenderType,
  ToolCallRequestInfo,
  Tool,
  logUserPrompt,
  GitService,
  EditorType,
  ThoughtSummary,
  ReasoningSummary,
  UnauthorizedError,
  UserPromptEvent,
  DEFAULT_GEMINI_FLASH_MODEL,
  SessionManager,
  type SessionData,
  MESSAGE_ROLES,
} from 'deepv-code-core';
import { updateWindowTitleWithSummary } from '../../gemini.js';
import { type Part, type PartListUnion, FinishReason } from '@google/genai';
import {
  StreamingState,
  HistoryItem,
  HistoryItemWithoutId,
  HistoryItemToolGroup,
  MessageType,
  SlashCommandProcessorResult,
  ToolCallStatus,
} from '../types.js';
import { isAtCommand } from '../utils/commandUtils.js';
import { parseAndFormatApiError } from '../utils/errorParsing.js';
import { useShellCommandProcessor } from './shellCommandProcessor.js';
import { handleAtCommand } from './atCommandProcessor.js';
import { HelpSubagent } from '../../services/HelpSubagent.js';
import { findLastSafeSplitPoint } from '../utils/markdownUtilities.js';
import { detectPlanModeChange, isPlanModeExitMarker } from '../utils/planModeDetector.js';
import { refreshModelsInBackground } from '../commands/modelCommand.js';
import { LoadedSettings } from '../../config/settings.js';
import { useStateAndRef } from './useStateAndRef.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import { useLogger } from './useLogger.js';
import { promises as fs } from 'fs';
import path from 'path';
import { AudioNotification, NotificationSound } from '../../utils/audioNotification.js';
import {
  useReactToolScheduler,
  mapToDisplay as mapTrackedToolCallsToDisplay,
  TrackedToolCall,
  TrackedCompletedToolCall,
  TrackedCancelledToolCall,
} from './useReactToolScheduler.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import { SceneType } from 'deepv-code-core';
// TaskStateManager 已移除，直接基于现有状态判断

/**
 * 格式化工具调用信息为可读文本
 * @param toolCalls 工具调用数组
 * @returns 格式化后的文本
 */
function formatToolCallsForSummary(toolCalls: TrackedToolCall[]): string {
  const successCalls = toolCalls.filter(tc => tc.status === 'success');

  if (successCalls.length === 0) {
    return '执行了代码编辑操作';
  }

  // 按操作类型分组
  const replaces: string[] = [];
  const creates: string[] = [];
  const deletes: string[] = [];
  const others: string[] = [];

  for (const call of successCalls) {
    const toolName = call.request?.name || ('tool' in call ? call.tool?.name : '') || '未知工具';
    const args = call.request?.args || {};
    const filePath = args.file_path as string || '';
    const fileName = filePath.split(/[/\\]/).pop() || '';

    // 根据工具类型分类
    if (toolName === 'replace') {
      replaces.push(fileName);
    } else if (toolName === 'write_file') {
      creates.push(fileName);
    } else if (toolName === 'delete_file') {
      deletes.push(fileName);
    } else {
      others.push(toolName);
    }
  }

  // 获取文件类型描述
  const getFileType = (name: string): string => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const typeMap: Record<string, string> = {
      'ts': 'TS', 'tsx': 'TSX', 'js': 'JS', 'jsx': 'JSX',
      'py': 'Python', 'java': 'Java', 'cpp': 'C++', 'c': 'C',
      'go': 'Go', 'rs': 'Rust', 'md': 'MD', 'json': 'JSON',
      'yaml': 'YAML', 'yml': 'YAML', 'html': 'HTML',
      'css': 'CSS', 'scss': 'SCSS', 'sql': 'SQL',
    };
    return typeMap[ext] || ext.toUpperCase();
  };

  const parts: string[] = [];

  // 修改文件
  if (replaces.length > 0) {
    if (replaces.length === 1) {
      parts.push(`修改${getFileType(replaces[0])}文件${replaces[0]}`);
    } else {
      const fileList = replaces.map(n => `${n}`).join(',');
      parts.push(`修改${replaces.length}个文件(${fileList})`);
    }
  }

  // 创建文件
  if (creates.length > 0) {
    if (creates.length === 1) {
      parts.push(`创建${getFileType(creates[0])}文件${creates[0]}`);
    } else {
      const fileList = creates.map(n => `${n}`).join(',');
      parts.push(`创建${creates.length}个文件(${fileList})`);
    }
  }

  // 删除文件
  if (deletes.length > 0) {
    if (deletes.length === 1) {
      parts.push(`删除${deletes[0]}`);
    } else {
      parts.push(`删除${deletes.length}个文件(${deletes.join(',')})`);
    }
  }

  // 其他操作
  if (others.length > 0) {
    parts.push(`执行${others.join(',')}`);
  }

  return parts.join('，');
}

/**
 * 生成 Checkpoint 摘要
 * 使用 Flash 模型生成 10 字摘要
 * @param geminiClient GeminiClient 实例
 * @param summarySource AI 文本回复或工具调用信息
 * @returns 10字内的摘要，失败返回空字符串
 */
async function generateCheckpointSummary(
  geminiClient: GeminiClient,
  summarySource: string
): Promise<string> {
  const summaryPrompt = `用"动词+名词"格式提取核心任务，必须包含具体项目/功能名称，不超过10字：

示例：
- 创建小蜜蜂游戏
- 优化登录性能
- 修复注册Bug
- 重构支付模块

现在总结：
"${summarySource}"

只返回摘要。`;

  // 使用 Flash 模型（快速且成本低）
  const models = ['gemini-2.5-flash'];

  for (const model of models) {
    try {
      console.log(`[Checkpoint] Trying model: ${model}`);

      // 5秒超时保护
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Summary generation timeout')), 5000);
      });

      const summaryPromise = (async () => {
        const chat = await geminiClient.createTemporaryChat(
          SceneType.CONTENT_SUMMARY,
          model
        );

        const response = await chat.sendMessage(
          { message: summaryPrompt },
          `checkpoint-summary-${Date.now()}`,
          SceneType.CONTENT_SUMMARY
        );

        // 从 response 中提取文本
        // response.text 可能不存在，需要从 candidates 中获取
        let summaryText = '';
        if (response.text) {
          summaryText = response.text;
        } else if (response.candidates && response.candidates[0]?.content?.parts?.[0]?.text) {
          summaryText = response.candidates[0].content.parts[0].text;
        }

        let summary = summaryText.trim();

        // 限制 10 字
        if (summary.length > 10) {
          summary = summary.substring(0, 10);
        }

        return summary;
      })();

      // 等待摘要或超时
      const summary = await Promise.race([summaryPromise, timeoutPromise]);

      if (summary && summary.length > 0) {
        console.log(`[Checkpoint] Summary successfully generated: "${summary}"`);
        return summary;
      }

    } catch (error) {
      console.error(`[Checkpoint] Model ${model} failed for summary generation:`, error);
      // 继续尝试下一个模型
    }
  }

  // 所有模型都失败
  console.warn('[Checkpoint] All models failed, returning empty summary');
  return '';
}

export function mergePartListUnions(list: PartListUnion[]): PartListUnion {
  const resultParts: PartListUnion = [];
  for (const item of list) {
    if (Array.isArray(item)) {
      resultParts.push(...item);
    } else {
      resultParts.push(item);
    }
  }
  return resultParts;
}

enum StreamProcessingStatus {
  Completed,
  UserCancelled,
  Error,
}

/**
 * Manages the Gemini stream, including user input, command processing,
 * API interaction, and tool call lifecycle.
 */
export const useGeminiStream = (
  geminiClient: GeminiClient,
  history: HistoryItem[],
  addItem: UseHistoryManagerReturn['addItem'],
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>,
  config: Config,
  onDebugMessage: (message: string) => void,
  handleSlashCommand: (
    cmd: PartListUnion,
  ) => Promise<SlashCommandProcessorResult | false>,
  shellModeActive: boolean,
  helpModeActive: boolean,
  getPreferredEditor: () => EditorType | undefined,
  onAuthError: () => void,
  performMemoryRefresh: () => Promise<void>,
  modelSwitchedFromQuotaError: boolean,
  setModelSwitchedFromQuotaError: React.Dispatch<React.SetStateAction<boolean>>,
  setEstimatedInputTokens?: React.Dispatch<React.SetStateAction<number | undefined>>,
  settings?: LoadedSettings,
) => {
  const [initError, setInitError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const turnCancelledRef = useRef(false);
  const processingRef = useRef(false); // 同步标志位，防止重入
  const [isResponding, setIsResponding] = useState<boolean>(false);
  const [thought, setThought] = useState<ThoughtSummary | null>(null);
  const [reasoning, setReasoning] = useState<ReasoningSummary | null>(null);

  // 清除预估token的helper函数
  const clearEstimatedTokens = useCallback(() => {
    if (setEstimatedInputTokens) {
      setEstimatedInputTokens(undefined);
    }
  }, [setEstimatedInputTokens]);
  const [pendingHistoryItemRef, setPendingHistoryItem] =
    useStateAndRef<HistoryItemWithoutId | null>(null);
  const processedMemoryToolsRef = useRef<Set<string>>(new Set());
  // 用于避免同一次对话创建多个checkpoint
  const conversationCheckpointCreated = useRef(false);
  // 用于显示checkpoint创建状态
  const [isCreatingCheckpoint, setIsCreatingCheckpoint] = useState(false);
  // 用于跟踪 checkpoint 创建失败，避免重复尝试
  const checkpointCreationFailed = useRef(false);
  // 🎯 用于保存当前用户输入，供 checkpoint 创建时使用
  const currentUserQueryRef = useRef<string>('');
  // 🎯 用于保存 AI 在调用工具前的文本回复，供 checkpoint 摘要使用
  const aiTextBeforeToolsRef = useRef<string>('');
  const { startNewPrompt, getPromptCount } = useSessionStats();
  const logger = useLogger();
  const [gitService, setGitService] = useState<GitService | undefined>();

  useEffect(() => {
    if (!config.getProjectRoot()) {
      setGitService(undefined);
      return;
    }
    // Use the GitService instance from config to ensure singleton behavior
    config.getGitService().then(setGitService).catch(() => {
      setGitService(undefined);
    });
  }, [config]);

  const sessionManager = useMemo(() => {
    if (!config.getProjectRoot()) {
      return;
    }
    return new SessionManager(config.getProjectRoot());
  }, [config]);

  // 简化：直接基于现有状态判断，无需中央状态管理

  /**
   * 在工具执行完成后创建 Checkpoint
   */
  const createCheckpointAfterTools = useCallback(async (completedToolCalls: TrackedToolCall[]) => {
    if (!sessionManager || !gitService) return;

    // 检查是否有文件修改工具
    const fileModifyingToolNames = ['replace', 'write_file', 'delete_file'];
    const hasFileModifyingTools = completedToolCalls.some(tc => {
      const toolName = tc.request?.name || ('tool' in tc ? tc.tool?.name : '') || '';
      return fileModifyingToolNames.includes(toolName);
    });

    if (!hasFileModifyingTools) {
      return; // 没有文件修改工具，不创建 Checkpoint
    }

    // 避免同一次对话创建多个 Checkpoint
    if (conversationCheckpointCreated.current || checkpointCreationFailed.current) {
      return;
    }

    try {
      // Check if Git service is available and not disabled
      if (gitService.isGitDisabled()) {
        console.log(`跳过 auto checkpoint: Git 服务不可用${gitService.getDisabledReason ? ` (${gitService.getDisabledReason()})` : ''}`);
        return;
      }

      // 标记本次对话已创建 Checkpoint
      conversationCheckpointCreated.current = true;
      setIsCreatingCheckpoint(true);
      onDebugMessage(t('checkpoint.creating'));

      const now = Date.now();

      // 创建 Git 快照
      const createCommitWithTimeout = async () => {
        return new Promise(async (resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Git commit 操作超时 (15秒)'));
          }, 15000);

          try {
            const result = await gitService.createFileSnapshot(
              `Checkpoint ${new Date(now).toLocaleString()} for session ${config.getSessionId()}`,
            );
            clearTimeout(timeout);
            resolve(result);
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        });
      };

      let commitHash = await createCommitWithTimeout();

      if (!commitHash) {
        commitHash = await gitService.getCurrentCommitHash();
      }

      if (!commitHash) return;

      // 获取用户最后一句话（保留用于显示）
      let lastUserMessage = '初始会话';
      if (currentUserQueryRef.current && currentUserQueryRef.current.trim().length > 0) {
        lastUserMessage = currentUserQueryRef.current.trim();
      } else if (history && history.length > 0) {
        const recentUserMessage = [...history].reverse().find(msg =>
          msg.type === 'user' && msg.text && msg.text.trim().length > 0
        );
        if (recentUserMessage && recentUserMessage.text) {
          lastUserMessage = recentUserMessage.text.trim();
        }
      }

      // 🎯 从 AI 文本回复生成摘要（优先），如果没有则从工具调用生成
      let summarySource = aiTextBeforeToolsRef.current.trim();

      // 如果 AI 没有文本回复，降级到工具调用信息
      if (!summarySource || summarySource.length < 5) {
        summarySource = formatToolCallsForSummary(completedToolCalls);
      } else {
        // 限制 AI 文本长度（前 200 字符）
        summarySource = summarySource.substring(0, 200);
      }

      let summary = '';
      try {
        console.log('[Checkpoint] Starting summary generation from:', summarySource.substring(0, 50));
        summary = await generateCheckpointSummary(geminiClient, summarySource);
        console.log('[Checkpoint] Summary generated:', summary);

        // 🎯 新增：更新窗口标题（包含工作目录名）
        if (summary && summary.length > 0 && settings) {
          const workspaceName = path.basename(config.getProjectRoot());
          updateWindowTitleWithSummary(summary, settings, workspaceName);
        }
      } catch (error) {
        console.error('[Checkpoint] Failed to generate summary, continuing without it:', error);
        summary = '';
      }

      const checkpointData = {
        id: `checkpoint-${now}`,
        timestamp: now,
        timeString: new Date(now).toLocaleString('zh-CN', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        }),
        lastUserMessage,
        summary,
        commitHash,
        sessionId: config.getSessionId(),
      };

      await sessionManager.saveSessionCheckpoint(config.getSessionId(), checkpointData);

      // 打印 Checkpoint 成功消息
      addItem(
        {
          type: MessageType.INFO,
          text: `\x1b[32m✅ ${tp('checkpoint.created.success', { checkpointId: checkpointData.id })}\x1b[0m`,
        },
        Date.now(),
      );

      onDebugMessage(
        `✅ Checkpoint 创建完成: ${checkpointData.timeString} - "${summary || summarySource.substring(0, 30)}"`,
      );
    } catch (error) {
      checkpointCreationFailed.current = true;
      onDebugMessage(`❌ ${tp('checkpoint.created.failed', { error: getErrorMessage(error) })}`);
      onDebugMessage(t('checkpoint.creation.skipped'));
    } finally {
      await new Promise(resolve => setTimeout(resolve, 1000));
      setIsCreatingCheckpoint(false);
    }
  }, [sessionManager, gitService, config, geminiClient, currentUserQueryRef, history, addItem, onDebugMessage]);

  const [toolCalls, originalScheduleToolCalls, markToolsAsSubmitted, handleConfirmationResponse] =
    useReactToolScheduler(
      async (completedToolCallsFromScheduler) => {
        // This onComplete is called when ALL scheduled tools for a given batch are done.
        if (completedToolCallsFromScheduler.length > 0) {
          // Add the final state of these tools to the history for display.
          addItem(
            mapTrackedToolCallsToDisplay(
              completedToolCallsFromScheduler as TrackedToolCall[],
            ),
            Date.now(),
          );

          // Handle tool response submission immediately when tools complete
          await handleCompletedTools(
            completedToolCallsFromScheduler as TrackedToolCall[],
          );

          // 🎯 在工具完成后创建 Checkpoint
          await createCheckpointAfterTools(completedToolCallsFromScheduler as TrackedToolCall[]);
        }
      },
      config,
      setPendingHistoryItem,
      getPreferredEditor,
    );

  // Use the original scheduleToolCalls directly
  const scheduleToolCalls = originalScheduleToolCalls;



  const pendingToolCallGroupDisplay = useMemo(
    () =>
      toolCalls.length ? mapTrackedToolCallsToDisplay(toolCalls) : undefined,
    [toolCalls],
  );

  const loopDetectedRef = useRef(false);
  const loopTypeRef = useRef<string | undefined>(undefined);

  const onExec = useCallback(async (done: Promise<void>) => {
    processingRef.current = true; // 🛡️ 设置同步标志位
    setIsResponding(true);
    try {
      await done;
    } finally {
      // 🛡️ 重置同步标志位
      processingRef.current = false;
      setIsResponding(false);
      clearEstimatedTokens(); // 清除预估token

      // Linus fix: Shell command执行完成后也要进行内存清理
      if (typeof global !== 'undefined' && global.gc) {
        try {
          // 立即清理
          global.gc();
          console.log('🗑️ Shell command completion - Immediate forced GC cleanup');

          // 1秒后备份清理，确保彻底
          setTimeout(() => {
            if (typeof global !== 'undefined' && global.gc) {
              global.gc();
              console.log('🗑️ Shell command completion - Backup GC cleanup (1s later)');
            }
          }, 1000);
        } catch (e) {
          // GC not available, ignore
        }
      }
    }
  }, []);
  const { handleShellCommand } = useShellCommandProcessor(
    addItem,
    setPendingHistoryItem,
    onExec,
    onDebugMessage,
    config,
    geminiClient,
  );

  // 🎯 简化的状态管理：直接基于现有状态判断
  const streamingState = useMemo(() => {
    // 首先检查是否有等待确认的工具调用
    const hasAwaitingApprovalCalls = toolCalls.some((tc) => {
      // 过滤掉runtime confirmation虚拟工具调用
      const isRuntimeConfirmation = tc.request.isRuntimeConfirmation === true;
      if (isRuntimeConfirmation) {
        return false;
      }
      return tc.status === 'awaiting_approval';
    });

    if (hasAwaitingApprovalCalls) {
      console.debug('[useGeminiStream] → WaitingForConfirmation (工具等待确认)');
      return StreamingState.WaitingForConfirmation;
    }

    // 检查是否正在响应或有活跃的工具调用
    if (isResponding) {
      console.debug('[useGeminiStream] → Responding (正在响应)');
      return StreamingState.Responding;
    }

    // 检查是否有其他活跃的工具调用
    const hasActiveToolCalls = toolCalls.some((tc) => {
      // 过滤掉runtime confirmation虚拟工具调用
      const isRuntimeConfirmation = tc.request.isRuntimeConfirmation === true;
      if (isRuntimeConfirmation) {
        return false;
      }

      const isActive = (
        tc.status === 'executing' ||
        tc.status === 'scheduled' ||
        tc.status === 'validating' ||
        // 已完成但还未提交给Gemini的工具调用
        ((tc.status === 'success' || tc.status === 'error' || tc.status === 'cancelled') &&
         !(tc as TrackedCompletedToolCall | TrackedCancelledToolCall).responseSubmittedToGemini)
      );

      return isActive;
    });

    if (hasActiveToolCalls) {
      console.debug('[useGeminiStream] → Responding (活跃工具调用)');
      return StreamingState.Responding;
    }

    return StreamingState.Idle;
  }, [isResponding, toolCalls]);

  useInput((input, key) => {
    // 检测IDEA环境下的替代取消键
    const isIDEATerminal = !!(
      process.env.TERMINAL_EMULATOR && (
        process.env.TERMINAL_EMULATOR.includes('JetBrains') ||
        process.env.TERMINAL_EMULATOR.includes('IntelliJ') ||
        process.env.TERMINAL_EMULATOR.includes('IDEA')
      ) ||
      process.env.IDEA_INITIAL_DIRECTORY ||
      process.env.JETBRAINS_IDE ||
      (process.env.TERM_PROGRAM && process.env.TERM_PROGRAM.includes('jetbrains'))
    );

    const isCancelKey = key.escape ||
                       (isIDEATerminal && key.ctrl && input === 'q') ||
                       (process.platform === 'darwin' && key.meta && input === 'q');

    if (streamingState === StreamingState.Responding && isCancelKey) {
      if (turnCancelledRef.current) {
        return;
      }
      turnCancelledRef.current = true;

      // 🎯 只需要调用abort()，信号会自动传播到所有子任务
      console.debug('[useGeminiStream] 用户取消操作 - 发送AbortSignal');
      abortControllerRef.current?.abort();

      if (pendingHistoryItemRef.current) {
        addItem(pendingHistoryItemRef.current, Date.now());
      }

      addItem(
        {
          type: MessageType.INFO,
          text: 'Request cancelled.',
        },
        Date.now(),
      );
      setPendingHistoryItem(null);
      // 🛡️ 重置同步标志位
      processingRef.current = false;
      setIsResponding(false);
      clearEstimatedTokens(); // 清除预估token

      // Linus fix: ESC取消时也要执行内存清理，防止内存泄漏
      if (typeof global !== 'undefined' && global.gc) {
        try {
          // 立即清理
          global.gc();
          console.log('🗑️ ESC cancellation - Immediate forced GC cleanup');

          // 1秒后备份清理，确保彻底
          setTimeout(() => {
            if (typeof global !== 'undefined' && global.gc) {
              global.gc();
              console.log('🗑️ ESC cancellation - Backup GC cleanup (1s later)');
            }
          }, 1000);
        } catch (e) {
          // GC not available, ignore
        }
      }
    }
  });

  const prepareQueryForGemini = useCallback(
    async (
      query: PartListUnion,
      userMessageTimestamp: number,
      abortSignal: AbortSignal,
      prompt_id: string,
      originalQuery?: PartListUnion, // 可选的原始查询，用于历史记录
    ): Promise<{
      queryToSend: PartListUnion | null;
      shouldProceed: boolean;
    }> => {
      if (turnCancelledRef.current) {
        return { queryToSend: null, shouldProceed: false };
      }
      if (typeof query === 'string' && query.trim().length === 0) {
        return { queryToSend: null, shouldProceed: false };
      }

      let localQueryToSendToGemini: PartListUnion | null = null;

      if (typeof query === 'string') {
        const trimmedQuery = query.trim();
        // 使用原始查询记录日志，避免记录Plan模式的修改内容
        const queryForLogging = typeof originalQuery === 'string' ? originalQuery.trim() : trimmedQuery;

        logUserPrompt(
          config,
          new UserPromptEvent(
            queryForLogging.length,
            prompt_id,
            config.getContentGeneratorConfig()?.authType,
            queryForLogging,
          ),
        );
        onDebugMessage(`User query: '${queryForLogging}'`);
        await logger?.logMessage(MessageSenderType.USER, queryForLogging);

        // Handle UI-only commands first - 使用原始查询处理slash命令
        const slashCommandResult = await handleSlashCommand(queryForLogging);

        if (slashCommandResult) {
          switch (slashCommandResult.type) {
            case 'schedule_tool': {
              const { toolName, toolArgs } = slashCommandResult;
              const toolCallRequest: ToolCallRequestInfo = {
                callId: `${toolName}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                name: toolName,
                args: toolArgs,
                isClientInitiated: true,
                prompt_id,
              };
              scheduleToolCalls([toolCallRequest], abortSignal);
              return { queryToSend: null, shouldProceed: false };
            }
            case 'submit_prompt': {
              localQueryToSendToGemini = slashCommandResult.content;

              return {
                queryToSend: localQueryToSendToGemini,
                shouldProceed: true,
              };
            }
            case 'handled': {
              return { queryToSend: null, shouldProceed: false };
            }
            case 'refine_result': {
              // 润色结果已经返回到 UI 层等待用户确认
              // 不立即发送给 AI，等待用户操作（回车发送/R再润色/Esc取消）
              return { queryToSend: null, shouldProceed: false };
            }
            default: {
              const unreachable: never = slashCommandResult;
              throw new Error(
                `Unhandled slash command result type: ${unreachable}`,
              );
            }
          }
        }

        if (shellModeActive && handleShellCommand(queryForLogging, abortSignal)) {
          return { queryToSend: null, shouldProceed: false };
        }

        // Handle help mode
        if (helpModeActive) {
          // Add user question to history
          addItem(
            { type: 'user', text: queryForLogging },
            userMessageTimestamp,
          );

          try {
            // Query the help system
            const answer = await HelpSubagent.answerQuestion(queryForLogging, config);

            // Add AI answer to history (使用 gemini 类型)
            addItem(
              { type: 'gemini', text: answer },
              Date.now(),
            );
          } catch (error) {
            // 使用与普通模式相同的错误格式化逻辑
            addItem(
              {
                type: MessageType.ERROR,
                text: parseAndFormatApiError(
                  error,
                  config.getContentGeneratorConfig()?.authType,
                  undefined,
                  config.getModel(),
                  DEFAULT_GEMINI_FLASH_MODEL,
                ),
              },
              Date.now(),
            );
          }

          return { queryToSend: null, shouldProceed: false };
        }

        // Handle @-commands (which might involve tool calls)
        if (isAtCommand(queryForLogging)) {
          const atCommandResult = await handleAtCommand({
            query: queryForLogging,
            config,
            addItem,
            onDebugMessage,
            messageId: userMessageTimestamp,
            signal: abortSignal,
          });
          if (!atCommandResult.shouldProceed) {
            return { queryToSend: null, shouldProceed: false };
          }
          localQueryToSendToGemini = atCommandResult.processedQuery;
        } else {
          // Normal query for Gemini - 始终添加用户消息到历史记录（用于AI上下文）
          addItem(
            { type: MessageType.USER, text: queryForLogging },
            userMessageTimestamp,
          );
          localQueryToSendToGemini = trimmedQuery; // 但仍使用修改后的查询发送给AI
        }
      } else {
        // It's a function response (PartListUnion that isn't a string)
        localQueryToSendToGemini = query;
      }

      if (localQueryToSendToGemini === null) {
        onDebugMessage(
          'Query processing resulted in null, not sending to Gemini.',
        );
        return { queryToSend: null, shouldProceed: false };
      }
      return { queryToSend: localQueryToSendToGemini, shouldProceed: true };
    },
    [
      config,
      addItem,
      onDebugMessage,
      handleShellCommand,
      handleSlashCommand,
      logger,
      shellModeActive,
      scheduleToolCalls,
    ],
  );

  // --- Stream Event Handlers ---

  const handleContentEvent = useCallback(
    (
      eventValue: ContentEvent['value'],
      currentGeminiMessageBuffer: string,
      userMessageTimestamp: number,
    ): string => {
      if (turnCancelledRef.current) {
        // Prevents additional output after a user initiated cancel.
        return '';
      }

      // 🎯 累积 AI 的文本回复，用于 Checkpoint 摘要
      aiTextBeforeToolsRef.current += eventValue;

      let newGeminiMessageBuffer = currentGeminiMessageBuffer + eventValue;
      if (
        pendingHistoryItemRef.current?.type !== 'gemini' &&
        pendingHistoryItemRef.current?.type !== 'gemini_content'
      ) {
        if (pendingHistoryItemRef.current) {
          addItem(pendingHistoryItemRef.current, userMessageTimestamp);
        }
        setPendingHistoryItem({ type: 'gemini', text: '' });
        newGeminiMessageBuffer = eventValue;
      }
      // Split large messages for better rendering performance. Ideally,
      // we should maximize the amount of output sent to <Static />.
      const splitPoint = findLastSafeSplitPoint(newGeminiMessageBuffer);
      if (splitPoint === newGeminiMessageBuffer.length) {
        // Update the existing message with accumulated content
        setPendingHistoryItem((item) => ({
          type: item?.type as 'gemini' | 'gemini_content',
          text: newGeminiMessageBuffer,
        }));
      } else {
        // This indicates that we need to split up this Gemini Message.
        // Splitting a message is primarily a performance consideration. There is a
        // <Static> component at the root of App.tsx which takes care of rendering
        // content statically or dynamically. Everything but the last message is
        // treated as static in order to prevent re-rendering an entire message history
        // multiple times per-second (as streaming occurs). Prior to this change you'd
        // see heavy flickering of the terminal. This ensures that larger messages get
        // broken up so that there are more "statically" rendered.
        const beforeText = newGeminiMessageBuffer.substring(0, splitPoint);
        const afterText = newGeminiMessageBuffer.substring(splitPoint);
        addItem(
          {
            type: pendingHistoryItemRef.current?.type as
              | 'gemini'
              | 'gemini_content',
            text: beforeText,
          },
          userMessageTimestamp,
        );
        setPendingHistoryItem({ type: 'gemini_content', text: afterText });
        newGeminiMessageBuffer = afterText;
      }
      return newGeminiMessageBuffer;
    },
    [addItem, pendingHistoryItemRef, setPendingHistoryItem],
  );

  const handleUserCancelledEvent = useCallback(
    (userMessageTimestamp: number) => {
      if (turnCancelledRef.current) {
        return;
      }
      if (pendingHistoryItemRef.current) {
        if (pendingHistoryItemRef.current.type === 'tool_group') {
          const updatedTools = pendingHistoryItemRef.current.tools.map(
            (tool) =>
              tool.status === ToolCallStatus.Pending ||
              tool.status === ToolCallStatus.Confirming ||
              tool.status === ToolCallStatus.Executing
                ? { ...tool, status: ToolCallStatus.Canceled }
                : tool,
          );
          const pendingItem: HistoryItemToolGroup = {
            ...pendingHistoryItemRef.current,
            tools: updatedTools,
          };
          addItem(pendingItem, userMessageTimestamp);
        } else {
          addItem(pendingHistoryItemRef.current, userMessageTimestamp);
        }
        setPendingHistoryItem(null);
      }
      addItem(
        { type: MessageType.INFO, text: 'User cancelled the request.' },
        userMessageTimestamp,
      );
      // 🛡️ 重置同步标志位
      processingRef.current = false;
      setIsResponding(false);
      clearEstimatedTokens(); // 清除预估token

      // Linus fix: 用户取消时也要执行内存清理，防止内存泄漏
      if (typeof global !== 'undefined' && global.gc) {
        try {
          // 立即清理
          global.gc();
          console.log('🗑️ User cancellation - Immediate forced GC cleanup');

          // 1秒后备份清理，确保彻底
          setTimeout(() => {
            if (typeof global !== 'undefined' && global.gc) {
              global.gc();
              console.log('🗑️ User cancellation - Backup GC cleanup (1s later)');
            }
          }, 1000);
        } catch (e) {
          // GC not available, ignore
        }
      }
    },
    [addItem, pendingHistoryItemRef, setPendingHistoryItem],
  );

  const handleErrorEvent = useCallback(
    (eventValue: ErrorEvent['value'], userMessageTimestamp: number) => {
      if (pendingHistoryItemRef.current) {
        addItem(pendingHistoryItemRef.current, userMessageTimestamp);
        setPendingHistoryItem(null);
      }

      // 451错误特殊处理 - 直接结束会话
      const errorString = String(eventValue.error);
      const is451Error = errorString.includes('451') ||
                          (eventValue.error && typeof eventValue.error === 'object' &&
                           'status' in eventValue.error && eventValue.error.status === 451);

      if (is451Error) {
        addItem(
          {
            type: MessageType.ERROR,
            text: parseAndFormatApiError(
              eventValue.error,
              config.getContentGeneratorConfig()?.authType,
              undefined,
              config.getModel(),
              DEFAULT_GEMINI_FLASH_MODEL,
            ),
          },
          userMessageTimestamp,
        );

        // 完全复制ESC取消的逻辑 - 立即终止会话
        turnCancelledRef.current = true;
        abortControllerRef.current?.abort();
        setPendingHistoryItem(null);
        processingRef.current = false;
        setIsResponding(false);
        clearEstimatedTokens();

        // 抛出特殊异常立即中断事件循环
        throw new Error('REGION_BLOCKED_SESSION_TERMINATED');
      }

      addItem(
        {
          type: MessageType.ERROR,
          text: parseAndFormatApiError(
            eventValue.error,
            config.getContentGeneratorConfig()?.authType,
            undefined,
            config.getModel(),
            DEFAULT_GEMINI_FLASH_MODEL,
          ),
        },
        userMessageTimestamp,
      );
    },
    [addItem, pendingHistoryItemRef, setPendingHistoryItem, config, processingRef, abortControllerRef, setIsResponding, turnCancelledRef, clearEstimatedTokens],
  );

  const handleFinishedEvent = useCallback(
    (event: ServerGeminiFinishedEvent, userMessageTimestamp: number) => {
      const finishReason = event.value;

      const finishReasonMessages: Record<FinishReason, string | undefined> = {
        [FinishReason.FINISH_REASON_UNSPECIFIED]: undefined,
        [FinishReason.STOP]: undefined,
        [FinishReason.MAX_TOKENS]: 'Response truncated due to token limits.',
        [FinishReason.SAFETY]: 'Response stopped due to safety reasons.',
        [FinishReason.RECITATION]: 'Response stopped due to recitation policy.',
        [FinishReason.LANGUAGE]:
          'Response stopped due to unsupported language.',
        [FinishReason.BLOCKLIST]: 'Response stopped due to forbidden terms.',
        [FinishReason.PROHIBITED_CONTENT]:
          'Response stopped due to prohibited content.',
        [FinishReason.SPII]:
          'Response stopped due to sensitive personally identifiable information.',
        [FinishReason.OTHER]: 'Response stopped for other reasons.',
        [FinishReason.MALFORMED_FUNCTION_CALL]:
          'Response stopped due to malformed function call.',
        [FinishReason.IMAGE_SAFETY]:
          'Response stopped due to image safety violations.',
        [FinishReason.UNEXPECTED_TOOL_CALL]:
          'Response stopped due to unexpected tool call.',
      };

      let message = finishReasonMessages[finishReason];

      // For MALFORMED_FUNCTION_CALL, append detailed error information
      if (finishReason === FinishReason.MALFORMED_FUNCTION_CALL && event.errorDetails) {
        message = `${message}\n\nDetails: ${event.errorDetails}\n\nPlease ensure all function call parameters are valid JSON objects with correct structure.`;
      }

      if (message) {
        addItem(
          {
            type: 'info',
            text: `⚠️  ${message}`,
          },
          userMessageTimestamp,
        );
      }
    },
    [addItem],
  );

  const handleChatCompressionEvent = useCallback(
    (eventValue: ServerGeminiChatCompressedEvent['value']) =>
      addItem(
        {
          type: 'info',
          text:
            tp('conversation.token.limit.warning', {
              model: config.getModel(),
              originalTokens: eventValue?.originalTokenCount ?? 'unknown',
              newTokens: eventValue?.newTokenCount ?? 'unknown'
            }),
        },
        Date.now(),
      ),
    [addItem, config],
  );

  const handleMaxSessionTurnsEvent = useCallback(
    () =>
      addItem(
        {
          type: 'info',
          text:
            `The session has reached the maximum number of turns: ${config.getMaxSessionTurns()}. ` +
            `Please update this limit in your setting.json file.`,
        },
        Date.now(),
      ),
    [addItem, config],
  );

  const handleLoopDetectedEvent = useCallback((loopType?: string) => {
    let title = '';
    let description = '';
    let action = '';

    // Get localized messages based on loop type
    const locale = isChineseLocale() ? 'zh' : 'en';

    switch (loopType) {
      case 'consecutive_identical_tool_calls':
        title = t('loop.consecutive.tool.calls.title');
        description = t('loop.consecutive.tool.calls.description');
        action = t('loop.consecutive.tool.calls.action');
        break;
      case 'chanting_identical_sentences':
        title = t('loop.chanting.identical.sentences.title');
        description = t('loop.chanting.identical.sentences.description');
        action = t('loop.chanting.identical.sentences.action');
        break;
      case 'llm_detected_loop':
        title = t('loop.llm.detected.title');
        description = t('loop.llm.detected.description');
        action = t('loop.llm.detected.action');
        break;
      default:
        // Fallback for unknown or missing loop type
        title = '🔄 Loop Detected';
        description = 'The AI model may be stuck in a repetitive pattern.';
        action = 'Please try:\n• Refining your request\n• Providing additional context\n• Starting a new session with /session new';
    }

    const messageText = `${title}\n${description}\n\n${action}`;

    addItem(
      {
        type: 'info',
        text: messageText,
      },
      Date.now(),
    );
  }, [addItem]);

  const processGeminiStreamEvents = useCallback(
    async (
      stream: AsyncIterable<GeminiEvent>,
      userMessageTimestamp: number,
      signal: AbortSignal,
    ): Promise<StreamProcessingStatus> => {
      let geminiMessageBuffer = '';
      let reasoningBuffer = ''; // 🆕 累积 reasoning 内容
      const toolCallRequests: ToolCallRequestInfo[] = [];
      for await (const event of stream) {
        // 检查abort信号，立即退出
        if (signal.aborted) {
          return StreamProcessingStatus.UserCancelled;
        }

        switch (event.type) {
          case ServerGeminiEventType.Thought:
            setThought(event.value);
            break;
          case ServerGeminiEventType.Reasoning:
            // 🆕 累积 reasoning 内容
            reasoningBuffer += event.value.text;
            setReasoning({ text: reasoningBuffer });
            break;
          case ServerGeminiEventType.Content:
            geminiMessageBuffer = handleContentEvent(
              event.value,
              geminiMessageBuffer,
              userMessageTimestamp,
            );
            break;
          case ServerGeminiEventType.ToolCallRequest:
            toolCallRequests.push(event.value);
            break;
          case ServerGeminiEventType.UserCancelled:
            handleUserCancelledEvent(userMessageTimestamp);
            break;
          case ServerGeminiEventType.Error:
            try {
              handleErrorEvent(event.value, userMessageTimestamp);
            } catch (error: any) {
              if (error.message === 'REGION_BLOCKED_SESSION_TERMINATED') {
                return StreamProcessingStatus.UserCancelled; // 立即退出循环
              }
              throw error; // 重新抛出其他错误
            }
            break;
          case ServerGeminiEventType.ChatCompressed:
            handleChatCompressionEvent(event.value);
            break;
          case ServerGeminiEventType.ToolCallConfirmation:
          case ServerGeminiEventType.ToolCallResponse:
            // do nothing
            break;
          case ServerGeminiEventType.MaxSessionTurns:
            handleMaxSessionTurnsEvent();
            break;
          case ServerGeminiEventType.Finished:
            handleFinishedEvent(
              event as ServerGeminiFinishedEvent,
              userMessageTimestamp,
            );
            break;
          case ServerGeminiEventType.LoopDetected:
            // handle later because we want to move pending history to history
            // before we add loop detected message to history
            loopDetectedRef.current = true;
            loopTypeRef.current = (event as any).value;
            break;
          case ServerGeminiEventType.TokenUsage:
            // Token usage events are handled at the client level for compression decisions
            // UI doesn't need to do anything specific with these events currently
            break;
          default: {
            // enforces exhaustive switch-case
            const unreachable: never = event;
            return unreachable;
          }
        }
      }
      // 清空 reasoning 状态（思考过程仅在流式传输中显示）
      setReasoning(null);
      if (toolCallRequests.length > 0) {
        scheduleToolCalls(toolCallRequests, signal);
      }
      return StreamProcessingStatus.Completed;
    },
    [
      handleContentEvent,
      handleUserCancelledEvent,
      handleErrorEvent,
      scheduleToolCalls,
      handleChatCompressionEvent,
      handleFinishedEvent,
      handleMaxSessionTurnsEvent,
    ],
  );

  const submitQuery = useCallback(
    async (
      query: PartListUnion,
      options?: { isContinuation: boolean },
      prompt_id?: string,
    ) => {
      // 🛡️ 同步检查和设置标志位，防止重入
      if (processingRef.current && !options?.isContinuation) {
        return; // 立即阻止重入
      }

      if (
        (streamingState === StreamingState.Responding ||
          streamingState === StreamingState.WaitingForConfirmation) &&
        !options?.isContinuation
      )
        return;

      // 保存原始查询用于历史记录
      const originalQuery = query;

      // Plan模式特殊处理 - 只修改发送给AI的内容，不影响历史记录
      let modifiedQuery = query;
      // 🎯 检测来自 VS Code 的 Plan 模式标记消息
      const queryStr = typeof query === 'string' ? query : JSON.stringify(query);
      const planModeDetection = detectPlanModeChange(queryStr);

      // 🎯 如果检测到 Plan 模式退出标记，自动同步后端状态
      if (planModeDetection.modeChanged && !planModeDetection.newMode) {
        console.log('[Plan Mode] Detected plan mode exit marker from VS Code, syncing state...');
        config.setPlanModeActive(false);
        // 不注入Plan模式提示，因为用户已经明确退出
      } else if (config.getPlanModeActive() && !options?.isContinuation) {
        const planPrompt = `[PLAN MODE ACTIVE]
The user is currently in Plan mode, focusing on requirements discussion and solution design. Please:
1. You may use analytical tools: read_file, read_many_files, list_directory, grep, glob, web_fetch, task, etc.
2. Do NOT use modification tools: write_file, edit, shell, lint_fix, etc.
3. Focus on understanding requirements, discussing solutions, and designing architecture
4. Provide detailed planning and recommendations, but do not perform modification operations
5. If modification operations are needed, remind the user to first use /plan off to exit Plan mode

User question: ${queryStr}`;

        modifiedQuery = planPrompt;
      }

      // 🛡️ 立即设置同步标志位
      processingRef.current = true;
      // 🎯 立即开始显示加载状态
      setIsResponding(true);

      const userMessageTimestamp = Date.now();
      setShowHelp(false);

      // 🔄 异步更新模型配置（仅在新对话时，不在继续对话时）
      if (!options?.isContinuation && settings && config) {
        refreshModelsInBackground(settings, config).catch(() => {
          // 静默处理刷新失败，不影响当前请求
        });
      }

      // Reset quota error flag when starting a new query (not a continuation)
      if (!options?.isContinuation) {
        setModelSwitchedFromQuotaError(false);
        config.setQuotaErrorOccurred(false);

        // 🔄 重置checkpoint创建标志 - 新对话开始
        conversationCheckpointCreated.current = false;
        // 🔄 重置checkpoint创建失败标志 - 新对话开始
        checkpointCreationFailed.current = false;
        // 🔄 清除上一次的用户输入记录
        currentUserQueryRef.current = '';
        // 🔄 清除上一次的 AI 文本回复记录
        aiTextBeforeToolsRef.current = '';
      }

      abortControllerRef.current = new AbortController();
      const abortSignal = abortControllerRef.current.signal;
      turnCancelledRef.current = false;

      if (!prompt_id) {
        prompt_id = config.getSessionId() + '########' + getPromptCount();
      }

      // 🎯 保存当前用户输入供 checkpoint 创建时使用
      if (typeof query === 'string' && !options?.isContinuation) {
        currentUserQueryRef.current = query.trim();
      }

      const { queryToSend, shouldProceed } = await prepareQueryForGemini(
        modifiedQuery,
        userMessageTimestamp,
        abortSignal,
        prompt_id!,
        originalQuery, // 传递原始查询用于历史记录
      );

      if (!shouldProceed || queryToSend === null) {
        // 🛡️ 重置同步标志位
        processingRef.current = false;
        // 🎯 立即开始显示加载状态
        setIsResponding(false);
        return;
      }

      if (!options?.isContinuation) {
        startNewPrompt();
      }


      setInitError(null);

      // 🎯 异步获取预估输入token数量 - 不阻塞UI显示
      if (setEstimatedInputTokens && !options?.isContinuation) {
        // 立即设置一个初始值，表示正在加载
        setEstimatedInputTokens(0);

        // 异步获取真实的预估值
        (async () => {
          try {
            // 构建请求内容
            const contents: any[] = [];
            if (typeof queryToSend === 'string') {
              contents.push({ parts: [{ text: queryToSend }], role: MESSAGE_ROLES.USER });
            } else if (Array.isArray(queryToSend)) {
              // 处理PartListUnion[]类型
              const textParts = queryToSend.filter(part =>
                typeof part === 'object' && part !== null && 'text' in part
              ) as any[];
              if (textParts.length > 0) {
                contents.push({
                  parts: textParts.map(part => ({ text: part.text })),
                  role: MESSAGE_ROLES.USER
                });
              }
            }

            if (contents.length > 0) {
              // 通过config获取ContentGenerator
              const contentGenerator = config.getGeminiClient().getContentGenerator();
              if (contentGenerator && 'countTokens' in contentGenerator) {
                const tokenResponse = await contentGenerator.countTokens({
                  contents,
                  model: config.getModel()
                });
                // 更新预估token显示
                setEstimatedInputTokens(tokenResponse.totalTokens || 0);
                console.log(`[Token Estimation] Estimated input tokens: ${tokenResponse.totalTokens || 0}`);
              }
            }
          } catch (error) {
            console.warn('[Token Estimation] Failed to estimate tokens:', error);
            // 保持显示0而不是undefined，这样用户知道在尝试获取
            setEstimatedInputTokens(0);
          }
        })();
      }

      // Linus fix: 请求开始前清理 - 确保干净起点
      if (typeof global !== 'undefined' && global.gc) {
        try {
          global.gc();
          console.log('🧹 Pre-request memory cleanup');
        } catch (e) {
          // GC not available, ignore
        }
      }

      // 简化：无需注册主查询任务到中央状态管理器

      try {
        const stream = geminiClient.sendMessageStream(
          queryToSend,
          abortSignal,
          prompt_id!,
        );
        const processingStatus = await processGeminiStreamEvents(
          stream,
          userMessageTimestamp,
          abortSignal,
        );

        if (processingStatus === StreamProcessingStatus.UserCancelled) {
          return;
        }

        if (pendingHistoryItemRef.current) {
          addItem(pendingHistoryItemRef.current, userMessageTimestamp);
          setPendingHistoryItem(null);
        }
        if (loopDetectedRef.current) {
          loopDetectedRef.current = false;
          handleLoopDetectedEvent(loopTypeRef.current);
          loopTypeRef.current = undefined;
        }
      } catch (error: unknown) {
        // 451错误特殊处理 - 直接模拟ESC键终止会话
        const errorString = String(error);
        if (errorString.includes('REGION_BLOCKED_451') || errorString.includes('451')) {
          // 完全模拟ESC键的处理逻辑
          if (!turnCancelledRef.current) {
            turnCancelledRef.current = true;
            abortControllerRef.current?.abort();
            if (pendingHistoryItemRef.current) {
              addItem(pendingHistoryItemRef.current, userMessageTimestamp);
            }
            addItem(
              {
                type: MessageType.ERROR,
                text: parseAndFormatApiError(
                  error,
                  config.getContentGeneratorConfig()?.authType,
                  undefined,
                  config.getModel(),
                  DEFAULT_GEMINI_FLASH_MODEL,
                ),
              },
              userMessageTimestamp,
            );
            setPendingHistoryItem(null);
            processingRef.current = false;
            setIsResponding(false);
            clearEstimatedTokens();
          }
          return; // 立即返回，不继续处理
        }

        if (error instanceof UnauthorizedError) {
          onAuthError();
        } else if (!isNodeError(error) || error.name !== 'AbortError') {
          // BUG修复: 用户取消请求时不显示错误堆栈
          // 修复策略: 检查错误消息是否包含用户取消相关内容，如果是则不显示错误
          // 影响范围: packages/cli/src/ui/hooks/useGeminiStream.ts:684-701
          // 修复日期: 2025-08-09
          const errorMessage = getErrorMessage(error) || 'Unknown error';
          const isUserCancellation = errorMessage.includes('cancelled by user') ||
                                   errorMessage.includes('Request cancelled') ||
                                   error instanceof Error && error.name === 'AbortError';

          if (!isUserCancellation) {
            addItem(
              {
                type: MessageType.ERROR,
                text: parseAndFormatApiError(
                  errorMessage,
                  config.getContentGeneratorConfig()?.authType,
                  undefined,
                  config.getModel(),
                  DEFAULT_GEMINI_FLASH_MODEL,
                ),
              },
              userMessageTimestamp,
            );
          }
        }
      } finally {
        // 🛡️ 重置同步标志位
        processingRef.current = false;
        setIsResponding(false);
        clearEstimatedTokens(); // 清除预估token

        // Linus fix: 简单有效的双重清理策略
        if (typeof global !== 'undefined' && global.gc) {
          try {
            // 立即清理
            global.gc();
            console.log('🗑️ Immediate forced GC after request completion');

            // 1秒后备份清理，确保彻底
            setTimeout(() => {
              if (typeof global !== 'undefined' && global.gc) {
                global.gc();
                console.log('🗑️ Backup GC cleanup (1s later)');
              }
            }, 1000);
          } catch (e) {
            // GC not available, ignore
          }
        }

        // 简化：无需完成主查询任务
      }
    },
    [
      streamingState,
      setShowHelp,
      setModelSwitchedFromQuotaError,
      prepareQueryForGemini,
      processGeminiStreamEvents,
      pendingHistoryItemRef,
      addItem,
      setPendingHistoryItem,
      setInitError,
      geminiClient,
      onAuthError,
      config,
      startNewPrompt,
      getPromptCount,
      handleLoopDetectedEvent,
      // TaskStateManager 已移除
    ],
  );

  const handleCompletedTools = useCallback(
    async (completedToolCallsFromScheduler: TrackedToolCall[]) => {
      if (isResponding) {
        return;
      }

      const completedAndReadyToSubmitTools =
        completedToolCallsFromScheduler.filter(
          (
            tc: TrackedToolCall,
          ): tc is TrackedCompletedToolCall | TrackedCancelledToolCall => {
            const isTerminalState =
              tc.status === 'success' ||
              tc.status === 'error' ||
              tc.status === 'cancelled';

            if (isTerminalState) {
              const completedOrCancelledCall = tc as
                | TrackedCompletedToolCall
                | TrackedCancelledToolCall;
              return (
                completedOrCancelledCall.response?.responseParts !== undefined
              );
            }
            return false;
          },
        );

      // Finalize any client-initiated tools as soon as they are done.
      const clientTools = completedAndReadyToSubmitTools.filter(
        (t) => t.request.isClientInitiated,
      );
      if (clientTools.length > 0) {
        markToolsAsSubmitted(clientTools.map((t) => t.request.callId));
      }

      // Identify new, successful save_memory calls that we haven't processed yet.
      const newSuccessfulMemorySaves = completedAndReadyToSubmitTools.filter(
        (t) =>
          t.request.name === 'save_memory' &&
          t.status === 'success' &&
          !processedMemoryToolsRef.current.has(t.request.callId),
      );

      if (newSuccessfulMemorySaves.length > 0) {
        // Perform the refresh only if there are new ones.
        void performMemoryRefresh();
        // Mark them as processed so we don't do this again on the next render.
        newSuccessfulMemorySaves.forEach((t) =>
          processedMemoryToolsRef.current.add(t.request.callId),
        );
      }

      const geminiTools = completedAndReadyToSubmitTools.filter(
        (t) => !t.request.isClientInitiated,
      );

      if (geminiTools.length === 0) {
        return;
      }

      // If all the tools were cancelled, don't submit a response to Gemini.
      const allToolsCancelled = geminiTools.every(
        (tc) => tc.status === 'cancelled',
      );

      if (allToolsCancelled) {
        if (geminiClient) {
          // We need to manually add the function responses to the history
          // so the model knows the tools were cancelled.
          const responsesToAdd = geminiTools.flatMap(
            (toolCall) => toolCall.response.responseParts,
          );
          const combinedParts: Part[] = [];
          for (const response of responsesToAdd) {
            if (Array.isArray(response)) {
              combinedParts.push(...response);
            } else if (typeof response === 'string') {
              combinedParts.push({ text: response });
            } else {
              combinedParts.push(response);
            }
          }
          geminiClient.addHistory({
            role: MESSAGE_ROLES.USER,
            parts: combinedParts,
          });
        }

        const callIdsToMarkAsSubmitted = geminiTools.map(
          (toolCall) => toolCall.request.callId,
        );
        markToolsAsSubmitted(callIdsToMarkAsSubmitted);
        return;
      }

      const responsesToSend: PartListUnion[] = geminiTools.map(
        (toolCall) => toolCall.response.responseParts,
      );
      const callIdsToMarkAsSubmitted = geminiTools.map(
        (toolCall) => toolCall.request.callId,
      );

      const prompt_ids = geminiTools.map(
        (toolCall) => toolCall.request.prompt_id,
      );

      markToolsAsSubmitted(callIdsToMarkAsSubmitted);

      // Don't continue if model was switched due to quota error
      if (modelSwitchedFromQuotaError) {
        return;
      }

      submitQuery(
        mergePartListUnions(responsesToSend),
        {
          isContinuation: true,
        },
        prompt_ids[0],
      );
    },
    [
      isResponding,
      submitQuery,
      markToolsAsSubmitted,
      geminiClient,
      performMemoryRefresh,
      modelSwitchedFromQuotaError,
    ],
  );

  const pendingHistoryItems = [
    pendingHistoryItemRef.current,
    pendingToolCallGroupDisplay,
  ].filter((i) => i !== undefined && i !== null);

  // 🎯 记住在当前响应周期中是否有过工具调用
  const [hadToolsInCurrentResponse, setHadToolsInCurrentResponse] = useState(false);

  // 🎯 记住上一次的流状态，用于检测状态变化
  const previousStreamingStateRef = useRef<StreamingState>(StreamingState.Idle);

  useEffect(() => {
    const previousState = previousStreamingStateRef.current;
    const currentState = streamingState;

    if (streamingState === StreamingState.Responding && toolCalls.length > 0) {
      // 响应过程中发现工具调用，记住这个状态
      setHadToolsInCurrentResponse(true);
    } else if (streamingState === StreamingState.Idle) {
      // 检测从 Responding 到 Idle 的状态变化，表示响应完成
      if (previousState === StreamingState.Responding) {
        // 播放响应完成提示音
        AudioNotification.play(NotificationSound.RESPONSE_COMPLETE).catch(err => {
          console.debug('[AudioNotification] Failed to play response complete sound:', err);
        });
      }

      // 响应结束，重置状态
      setHadToolsInCurrentResponse(false);
    }

    // 更新上一次状态
    previousStreamingStateRef.current = currentState;
  }, [streamingState, toolCalls.length, config]);

  // 🎯 计算是否有工具正在执行（用于Token指示器显示）
  const isExecutingTools = useMemo(() => {
    // 🎯 关键修复：在流式响应过程中，如果本轮响应中有过工具调用，继续显示工具状态
    const hasActiveTools = toolCalls.some(tc =>
      tc.status === 'executing' ||
      tc.status === 'scheduled' ||
      tc.status === 'validating' ||
      tc.status === 'awaiting_approval'
    );

    // 🎯 新逻辑：如果正在响应且本轮有过工具调用，认为是工具执行状态
    const isStreamingWithToolHistory = (
      streamingState === StreamingState.Responding &&
      hadToolsInCurrentResponse
    );

    const result = hasActiveTools || isStreamingWithToolHistory;



    return result;
  }, [toolCalls, streamingState, hadToolsInCurrentResponse]);

  return {
    streamingState,
    submitQuery,
    initError,
    pendingHistoryItems,
    thought,
    reasoning, // 🆕 导出 reasoning 状态
    isCreatingCheckpoint, // 🎯 导出checkpoint创建状态
    isExecutingTools, // 🎯 导出工具执行状态
  };
};
