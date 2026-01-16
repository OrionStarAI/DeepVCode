/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Config,
  ToolCallRequestInfo,
  ExecutingToolCall,
  ScheduledToolCall,
  ValidatingToolCall,
  WaitingToolCall,
  CompletedToolCall,
  CancelledToolCall,
  CoreToolScheduler,
  OutputUpdateHandler,
  AllToolCallsCompleteHandler,
  ToolCallsUpdateHandler,
  PreToolExecutionHandler,
  Tool,
  ToolCall,
  Status as CoreStatus,
  EditorType,
  parseToolOutputMessage,
  isSubAgentUpdateMessage,
  isTextOutputMessage,
  getBackgroundTaskManager,
} from 'deepv-code-core';
import { useCallback, useState, useMemo } from 'react';
import {
  HistoryItemToolGroup,
  IndividualToolCallDisplay,
  ToolCallStatus,
  HistoryItemWithoutId,
  BatchSubToolInfo,
} from '../types.js';
import { t, tp } from '../utils/i18n.js';

export type ScheduleFn = (
  request: ToolCallRequestInfo | ToolCallRequestInfo[],
  signal: AbortSignal,
) => void;
export type MarkToolsAsSubmittedFn = (callIds: string[]) => void;
export type HandleConfirmationResponseFn = (
  callId: string,
  outcome: import('deepv-code-core').ToolConfirmationOutcome,
  payload?: import('deepv-code-core').ToolConfirmationPayload,
) => Promise<void>;

export type TrackedScheduledToolCall = ScheduledToolCall & {
  responseSubmittedToGemini?: boolean;
  subToolCalls?: TrackedToolCall[];
};
export type TrackedValidatingToolCall = ValidatingToolCall & {
  responseSubmittedToGemini?: boolean;
  subToolCalls?: TrackedToolCall[];
};
export type TrackedWaitingToolCall = WaitingToolCall & {
  responseSubmittedToGemini?: boolean;
  subToolCalls?: TrackedToolCall[];
};
export type TrackedExecutingToolCall = ExecutingToolCall & {
  responseSubmittedToGemini?: boolean;
  subToolCalls?: TrackedToolCall[];
};
export type TrackedCompletedToolCall = CompletedToolCall & {
  responseSubmittedToGemini?: boolean;
  subToolCalls?: TrackedToolCall[];
};
export type TrackedCancelledToolCall = CancelledToolCall & {
  responseSubmittedToGemini?: boolean;
  subToolCalls?: TrackedToolCall[];
};

export type TrackedToolCall =
  | TrackedScheduledToolCall
  | TrackedValidatingToolCall
  | TrackedWaitingToolCall
  | TrackedExecutingToolCall
  | TrackedCompletedToolCall
  | TrackedCancelledToolCall;

export function useReactToolScheduler(
  onComplete: (tools: CompletedToolCall[]) => void,
  config: Config,
  setPendingHistoryItem: React.Dispatch<
    React.SetStateAction<HistoryItemWithoutId | null>
  >,
  getPreferredEditor: () => EditorType | undefined,
  onPreToolExecution?: PreToolExecutionHandler,
): [TrackedToolCall[], ScheduleFn, MarkToolsAsSubmittedFn, HandleConfirmationResponseFn] {
  const [toolCallsForDisplay, setToolCallsForDisplay] = useState<
    TrackedToolCall[]
  >([]);

  const outputUpdateHandler: OutputUpdateHandler = useCallback(
    (toolCallId, outputChunk) => {
      // 🎯 解析结构化消息 - 不再有ugly的字符串比较
      const message = parseToolOutputMessage(outputChunk);

      // 🎯 统一的数据更新逻辑 - 不再有分支重复
      const updateUIWithData = (resultDisplay: any, liveOutput?: any) => {
        // 更新待添加到历史记录的项
        setPendingHistoryItem((prevItem) => {
          if (prevItem?.type === 'tool_group') {
            return {
              ...prevItem,
              tools: prevItem.tools.map((toolDisplay) =>
                toolDisplay.callId === toolCallId &&
                toolDisplay.status === ToolCallStatus.Executing
                  ? { ...toolDisplay, resultDisplay }
                  : toolDisplay,
              ),
            };
          }
          return prevItem;
        });

        // 更新执行中的工具调用状态
        setToolCallsForDisplay((prevCalls) =>
          prevCalls.map((tc) => {
            if (tc.request.callId === toolCallId && tc.status === 'executing') {
              const executingTc = tc as TrackedExecutingToolCall;
              return {
                ...executingTc,
                liveOutput: liveOutput ?? resultDisplay,
                // 如果是结构化数据，添加类型标记
                ...(typeof resultDisplay === 'object' && resultDisplay.type
                  ? { liveOutputType: resultDisplay.type }
                  : {}),
              };
            }
            return tc;
          }),
        );
      };

      // 🎯 根据消息类型处理 - 清晰的分支逻辑
      if (isSubAgentUpdateMessage(message)) {
        // SubAgent结构化数据更新
        const subAgentData = message.data;
        updateUIWithData(
          subAgentData,
          JSON.stringify(subAgentData) // 序列化用于liveOutput存储
        );
      } else if (isTextOutputMessage(message)) {
        // 普通文本输出
        const textData = message.data;
        updateUIWithData(textData);
      } else {
        // 未知格式，当作文本处理
        updateUIWithData(outputChunk);
      }
    },
    [setPendingHistoryItem],
  );

  const allToolCallsCompleteHandler: AllToolCallsCompleteHandler = useCallback(
    (completedToolCalls) => {
      onComplete(completedToolCalls);
    },
    [onComplete],
  );

  const toolCallsUpdateHandler: ToolCallsUpdateHandler = useCallback(
    (updatedCoreToolCalls: ToolCall[]) => {
      console.log('[useReactToolScheduler] tool calls updated: prev=%d new=%d', toolCallsForDisplay.length, updatedCoreToolCalls.length);
      console.log('[useReactToolScheduler] Updated statuses:', updatedCoreToolCalls.map(tc => ({ id: tc.request.callId.slice(-8), status: tc.status })));

      setToolCallsForDisplay((prevTrackedCalls) =>
        updatedCoreToolCalls.map((coreTc) => {
          const existingTrackedCall = prevTrackedCalls.find(
            (ptc) => ptc.request.callId === coreTc.request.callId,
          );
          const newTrackedCall: TrackedToolCall = {
            ...coreTc,
            responseSubmittedToGemini:
              existingTrackedCall?.responseSubmittedToGemini ?? false,
          } as TrackedToolCall;
          return newTrackedCall;
        }),
      );

      // 简化：无需同步到中央状态管理器，直接由 useGeminiStream 检测 awaiting_approval 状态
    },
    [setToolCallsForDisplay, toolCallsForDisplay],
  );

  const scheduler = useMemo(
    () =>
      new CoreToolScheduler({
        toolRegistry: config.getToolRegistry(),
        outputUpdateHandler,
        onAllToolCallsComplete: allToolCallsCompleteHandler,
        onToolCallsUpdate: toolCallsUpdateHandler,
        onPreToolExecution,
        approvalMode: config.getApprovalMode(),
        getPreferredEditor,
        config,
        hookEventHandler: config.getHookSystem().getEventHandler(),
      }),
    [
      config,
      outputUpdateHandler,
      allToolCallsCompleteHandler,
      toolCallsUpdateHandler,
      onPreToolExecution,
      getPreferredEditor,
    ],
  );

  const schedule: ScheduleFn = useCallback(
    (
      request: ToolCallRequestInfo | ToolCallRequestInfo[],
      signal: AbortSignal,
    ) => {
      const requests = Array.isArray(request) ? request : [request];

      // 🔥 注意：后台模式 (Ctrl+B) 现在由 ShellTool 内部处理
      // ShellTool 会检测 BackgroundModeSignal 并自动转为后台执行
      // 这里不需要特殊处理，正常调度即可

      // Plan模式检查 - 只允许只读工具执行
      if (config.getPlanModeActive()) {
        // 定义只读工具列表（Plan模式下允许执行）
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
        const allowedRequests = requests.filter(r => readOnlyTools.has(r.name));
        const blockedRequests = requests.filter(r => !readOnlyTools.has(r.name));

        // 如果有被阻止的工具，显示提示信息
        if (blockedRequests.length > 0) {
          const blockedToolNames = blockedRequests.map(r => r.name).join(', ');
          setPendingHistoryItem({
            type: 'info',
            text: `${tp('plan.mode.blocked.tools', { tools: blockedToolNames })}
${t('plan.mode.focus.message')}
${t('plan.mode.available.tools')}
${t('plan.mode.exit.instruction')}`
          });
        }

        // 只执行允许的只读工具
        if (allowedRequests.length > 0) {
          scheduler.schedule(allowedRequests, signal);
        }

        return;
      }

      scheduler.schedule(request, signal);
    },
    [scheduler, config, setPendingHistoryItem],
  );

  const markToolsAsSubmitted: MarkToolsAsSubmittedFn = useCallback(
    (callIdsToMark: string[]) => {
      setToolCallsForDisplay((prevCalls) =>
        prevCalls.map((tc) =>
          callIdsToMark.includes(tc.request.callId)
            ? { ...tc, responseSubmittedToGemini: true }
            : tc,
        ),
      );
    },
    [],
  );

  const handleConfirmationResponse: HandleConfirmationResponseFn = useCallback(
    async (callId, outcome, payload) => {
      await scheduler.handleConfirmationResponse(callId, outcome, payload);
    },
    [scheduler],
  );

  return [toolCallsForDisplay, schedule, markToolsAsSubmitted, handleConfirmationResponse];
}

/**
 * Maps a CoreToolScheduler status to the UI's ToolCallStatus enum.
 */
function mapCoreStatusToDisplayStatus(coreStatus: CoreStatus, toolName?: string): ToolCallStatus {
  switch (coreStatus) {
    case 'validating':
      return ToolCallStatus.Executing;
    case 'awaiting_approval':
      return ToolCallStatus.Confirming;
    case 'executing':
      // Task工具执行时显示为子agent运行状态
      if (toolName === 'task') {
        return ToolCallStatus.SubAgentRunning;
      }
      return ToolCallStatus.Executing;
    case 'success':
      return ToolCallStatus.Success;
    case 'cancelled':
      return ToolCallStatus.Canceled;
    case 'error':
      return ToolCallStatus.Error;
    case 'scheduled':
      return ToolCallStatus.Pending;
    default: {
      const exhaustiveCheck: never = coreStatus;
      console.warn(`Unknown core status encountered: ${exhaustiveCheck}`);
      return ToolCallStatus.Error;
    }
  }
}

/**
 * 扁平化收集所有工具调用（包括嵌套的）用于确认优先级计算
 */
function flattenToolCallsForConfirmation(toolCalls: TrackedToolCall[]): TrackedToolCall[] {
  const result: TrackedToolCall[] = [];

  function traverse(calls: TrackedToolCall[]) {
    calls.forEach(call => {
      result.push(call);
      if (call.subToolCalls) {
        traverse(call.subToolCalls);
      }
    });
  }

  traverse(toolCalls);
  return result;
}

/**
 * 🎯 为 batch 工具的子工具生成简短摘要
 */
function generateBatchSubToolSummary(tool: string, parameters: Record<string, unknown>): string {
  switch (tool) {
    case 'read_file':
      return extractPathSummary(parameters.absolute_path as string | undefined);
    case 'read_many_files':
      const paths = parameters.paths as string[] | undefined;
      if (paths && paths.length > 0) {
        return paths.length === 1 ? extractPathSummary(paths[0]) : `${paths.length} files`;
      }
      return '';
    case 'write_file':
      return extractPathSummary(parameters.file_path as string | undefined);
    case 'replace':
    case 'multiedit':
      return extractPathSummary(parameters.file_path as string | undefined);
    case 'delete_file':
      return extractPathSummary(parameters.file_path as string | undefined);
    case 'run_shell_command':
      const cmd = parameters.command as string | undefined;
      if (cmd) {
        // 取命令的前30个字符
        return cmd.length > 30 ? cmd.substring(0, 27) + '...' : cmd;
      }
      return '';
    case 'search_file_content':
      const pattern = parameters.pattern as string | undefined;
      return pattern ? `"${pattern.substring(0, 20)}${pattern.length > 20 ? '...' : ''}"` : '';
    case 'glob':
      return (parameters.pattern as string) || '';
    case 'list_directory':
      return extractPathSummary(parameters.path as string | undefined);
    case 'web_fetch':
      const prompt = parameters.prompt as string | undefined;
      // 提取 URL
      const urlMatch = prompt?.match(/https?:\/\/[^\s]+/);
      return urlMatch ? urlMatch[0].substring(0, 40) : '';
    case 'google_web_search':
      return (parameters.query as string)?.substring(0, 30) || '';
    default:
      return '';
  }
}

/**
 * 从路径中提取文件名或简短路径
 */
function extractPathSummary(path: string | undefined): string {
  if (!path) return '';
  // 提取文件名
  const parts = path.replace(/\\/g, '/').split('/');
  const fileName = parts[parts.length - 1];
  // 如果文件名太长，截断
  return fileName.length > 40 ? fileName.substring(0, 37) + '...' : fileName;
}

/**
 * 🎯 工具名称映射表（原始名称 -> 显示名称）
 */
const TOOL_DISPLAY_NAME_MAP: Record<string, string> = {
  'read_file': 'ReadFile',
  'read_many_files': 'ReadManyFiles',
  'write_file': 'WriteFile',
  'replace': 'Edit',
  'multiedit': 'MultiEdit',
  'delete_file': 'DeleteFile',
  'run_shell_command': 'Shell',
  'search_file_content': 'SearchText',
  'glob': 'FindFiles',
  'list_directory': 'ReadFolder',
  'web_fetch': 'WebFetch',
  'google_web_search': 'WebSearch',
  'save_memory': 'SaveMemory',
  'task': 'Task',
  'todo_write': 'TodoWrite',
  'lsp': 'LSP',
  'read_lints': 'ReadLints',
  'lint_fix': 'LintFix',
  'batch': 'Batch',
  'codesearch': 'CodeSearch',
};

/**
 * 获取工具的显示名称
 */
function getToolDisplayName(toolName: string): string {
  return TOOL_DISPLAY_NAME_MAP[toolName] || toolName;
}

/**
 * 🎯 抽取公共逻辑：将TrackedToolCall转换为显示所需的基础属性
 */
function extractBaseDisplayProperties(trackedCall: TrackedToolCall): {
  displayName: string;
  description: string;
  renderOutputAsMarkdown: boolean;
  forceMarkdown: boolean;
  baseDisplayProperties: Omit<IndividualToolCallDisplay, 'status' | 'resultDisplay' | 'confirmationDetails'>;
} {
  let displayName = trackedCall.request.name;
  let description = '';
  let renderOutputAsMarkdown = false;
  let forceMarkdown = false;
  let batchSubTools: BatchSubToolInfo[] | undefined;

  const currentToolInstance =
    'tool' in trackedCall && trackedCall.tool
      ? (trackedCall as { tool: Tool }).tool
      : undefined;

  if (currentToolInstance) {
    displayName = currentToolInstance.displayName;
    description = currentToolInstance.getDescription(trackedCall.request.args);
    renderOutputAsMarkdown = currentToolInstance.isOutputMarkdown;
    forceMarkdown = currentToolInstance.forceMarkdown;
  } else if ('request' in trackedCall && 'args' in trackedCall.request) {
    description = JSON.stringify(trackedCall.request.args);
  }

  // 🎯 特殊处理 batch 工具：提取子工具信息用于友好显示
  if (trackedCall.request.name === 'batch') {
    const args = trackedCall.request.args as { tool_calls?: Array<{ tool: string; parameters: Record<string, unknown> }> };
    if (args.tool_calls && Array.isArray(args.tool_calls)) {
      batchSubTools = args.tool_calls.map(call => ({
        tool: call.tool,
        displayName: getToolDisplayName(call.tool),
        summary: generateBatchSubToolSummary(call.tool, call.parameters),
      }));
    }
  }

  const baseDisplayProperties: Omit<IndividualToolCallDisplay, 'status' | 'resultDisplay' | 'confirmationDetails'> = {
    callId: trackedCall.request.callId,
    name: displayName,
    toolId: trackedCall.request.name, // 原始 tool 名称
    description,
    renderOutputAsMarkdown,
    forceMarkdown,
    batchSubTools,
  };

  return { displayName, description, renderOutputAsMarkdown, forceMarkdown, baseDisplayProperties };
}

/**
 * 🎯 抽取公共逻辑：处理executing状态的结果显示
 */
function getExecutingResultDisplay(trackedCall: TrackedExecutingToolCall): any {
  let resultDisplay = trackedCall.liveOutput ?? undefined;

  const liveOutputType = (trackedCall as any).liveOutputType;
  if (trackedCall.liveOutput && liveOutputType) {
    // 🔧 检查类型：如果已经是对象，直接使用；如果是字符串，才解析
    if (typeof trackedCall.liveOutput === 'string') {
      try {
        resultDisplay = JSON.parse(trackedCall.liveOutput);
      } catch (error) {
        console.warn('解析执行中的结构化数据失败:', error);
        resultDisplay = trackedCall.liveOutput;
      }
    } else {
      // 已经是对象，直接使用
      resultDisplay = trackedCall.liveOutput;
    }
  }

  return resultDisplay;
}

/**
 * 🎯 统一的工具调用映射函数
 */
function mapSingleToolCallToDisplay(
  trackedCall: TrackedToolCall,
  highestPriorityConfirmingTool: TrackedToolCall | null
): IndividualToolCallDisplay {
  const { baseDisplayProperties } = extractBaseDisplayProperties(trackedCall);
  const status = mapCoreStatusToDisplayStatus(trackedCall.status, trackedCall.request.name);

  switch (trackedCall.status) {
    case 'success':
    case 'error':
    case 'cancelled': {
      // 🎯 Check if this is a background task (Ctrl+B was pressed)
      let finalStatus = status;
      if (trackedCall.status === 'success') {
        // Check if the response indicates a background task
        const response = trackedCall.response;
        // The llmContent might contain background task info, or check resultDisplay
        const resultDisplay = response.resultDisplay;
        if (typeof resultDisplay === 'string' && resultDisplay.includes('Running in background')) {
          finalStatus = ToolCallStatus.BackgroundRunning;
        }
      }

      return {
        ...baseDisplayProperties,
        status: finalStatus,
        resultDisplay: trackedCall.response.resultDisplay,
        confirmationDetails: undefined,
      };
    }

    case 'awaiting_approval':
      const isHighestPriority = highestPriorityConfirmingTool?.request.callId === trackedCall.request.callId;
      return {
        ...baseDisplayProperties,
        status,
        resultDisplay: undefined,
        confirmationDetails: isHighestPriority ? trackedCall.confirmationDetails : undefined,
      };

    case 'executing':
      return {
        ...baseDisplayProperties,
        status,
        resultDisplay: getExecutingResultDisplay(trackedCall as TrackedExecutingToolCall),
        confirmationDetails: undefined,
      };

    case 'validating':
    case 'scheduled':
      return {
        ...baseDisplayProperties,
        status,
        resultDisplay: undefined,
        confirmationDetails: undefined,
      };

    default: {
      const exhaustiveCheck: never = trackedCall;
      return {
        callId: (exhaustiveCheck as TrackedToolCall).request.callId,
        name: 'Unknown Tool',
        toolId: (exhaustiveCheck as TrackedToolCall).request.name,
        description: 'Encountered an unknown tool call state.',
        status: ToolCallStatus.Error,
        resultDisplay: 'Unknown tool call state',
        confirmationDetails: undefined,
        renderOutputAsMarkdown: false,
        forceMarkdown: false,
      };
    }
  }
}

/**
 * Transforms `TrackedToolCall` objects into `HistoryItemToolGroup` objects for UI display.
 */
export function mapToDisplay(
  toolOrTools: TrackedToolCall[] | TrackedToolCall,
): HistoryItemToolGroup {
  const toolCalls = Array.isArray(toolOrTools) ? toolOrTools : [toolOrTools];

  // 🎯 计算确认优先级：扁平化收集所有工具调用（包括嵌套的）
  const allToolCalls = flattenToolCallsForConfirmation(toolCalls);
  const confirmingTools = allToolCalls.filter(tc => tc.status === 'awaiting_approval');
  let highestPriorityConfirmingTool: TrackedToolCall | null = null;

  if (confirmingTools.length > 0) {
    highestPriorityConfirmingTool = confirmingTools.sort((a, b) => {
      const priorityA = a.agentContext?.agentType === 'sub' ? 1 : 2;
      const priorityB = b.agentContext?.agentType === 'sub' ? 1 : 2;
      return priorityA - priorityB;
    })[0];
  }

  // 🎯 递归处理子工具调用
  const mapSubToolCallsToDisplay = (subToolCalls: TrackedToolCall[]): IndividualToolCallDisplay[] => {
    return subToolCalls.map(subCall => {
      const display = mapSingleToolCallToDisplay(subCall, highestPriorityConfirmingTool);

      // 递归处理嵌套的子工具调用
      if (subCall.subToolCalls && subCall.subToolCalls.length > 0) {
        return {
          ...display,
          subToolCalls: mapSubToolCallsToDisplay(subCall.subToolCalls),
        };
      }

      return display;
    });
  };

  // 🎯 处理顶级工具调用
  const toolDisplays = toolCalls.map(toolCall => {
    const display = mapSingleToolCallToDisplay(toolCall, highestPriorityConfirmingTool);

    // 处理子工具调用
    if (toolCall.subToolCalls && toolCall.subToolCalls.length > 0) {
      return {
        ...display,
        subToolCalls: mapSubToolCallsToDisplay(toolCall.subToolCalls),
      };
    }

    return display;
  });

  return {
    type: 'tool_group',
    tools: toolDisplays,
  };
}
