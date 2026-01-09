/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionDeclaration, PartListUnion, Schema } from '@google/genai';

/**
 * Interface representing the base Tool functionality
 */
export interface Tool<
  TParams = unknown,
  TResult extends ToolResult = ToolResult,
> {
  /**
   * The internal name of the tool (used for API calls)
   */
  name: string;

  /**
   * The user-friendly display name of the tool
   */
  displayName: string;

  /**
   * Description of what the tool does
   */
  description: string;

  /**
   * The icon to display when interacting via ACP
   */
  icon: Icon;

  /**
   * Function declaration schema from @google/genai
   */
  schema: FunctionDeclaration;

  /**
   * Whether the tool's output should be rendered as markdown
   */
  isOutputMarkdown: boolean;

  /**
   * Whether to force markdown rendering even when height constraints would normally disable it
   */
  forceMarkdown: boolean;

  /**
   * Whether the tool supports live (streaming) output
   */
  canUpdateOutput: boolean;

  /**
   * Whether this tool can be used by sub-agents
   */
  allowSubAgentUse: boolean;

  /**
   * Validates the parameters for the tool
   * Should be called from both `shouldConfirmExecute` and `execute`
   * `shouldConfirmExecute` should return false immediately if invalid
   * @param params Parameters to validate
   * @returns An error message string if invalid, null otherwise
   */
  validateToolParams(params: TParams): string | null;

  /**
   * Gets a pre-execution description of the tool operation
   * @param params Parameters for the tool execution
   * @returns A markdown string describing what the tool will do
   * Optional for backward compatibility
   */
  getDescription(params: TParams): string;

  /**
   * Determines what file system paths the tool will affect
   * @param params Parameters for the tool execution
   * @returns A list of such paths
   */
  toolLocations(params: TParams): ToolLocation[];

  /**
   * Determines if the tool should prompt for confirmation before execution
   * @param params Parameters for the tool execution
   * @returns Whether execute should be confirmed.
   */
  shouldConfirmExecute(
    params: TParams,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false>;

  /**
   * Executes the tool with the given parameters
   * @param params Parameters for the tool execution
   * @param signal Abort signal for cancellation
   * @param updateOutput Callback for updating output during execution
   * @param services Runtime services available during execution
   * @returns Result of the tool execution
   */
  execute(
    params: TParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
    services?: ToolExecutionServices,
  ): Promise<TResult>;
}

/**
 * Base implementation for tools with common functionality
 */
export abstract class BaseTool<
  TParams = unknown,
  TResult extends ToolResult = ToolResult,
> implements Tool<TParams, TResult> {
  /**
   * Creates a new instance of BaseTool
   * @param name Internal name of the tool (used for API calls)
   * @param displayName User-friendly display name of the tool
   * @param description Description of what the tool does
   * @param isOutputMarkdown Whether the tool's output should be rendered as markdown
   * @param forceMarkdown Whether to force markdown rendering even when height constraints would normally disable it
   * @param canUpdateOutput Whether the tool supports live (streaming) output
   * @param parameterSchema Open API 3.0 Schema defining the parameters
   * @param allowSubAgentUse Whether this tool can be used by sub-agents
   */
  constructor(
    readonly name: string,
    readonly displayName: string,
    readonly description: string,
    readonly icon: Icon,
    readonly parameterSchema: Schema,
    readonly isOutputMarkdown: boolean = true,
    readonly forceMarkdown: boolean = false,
    readonly canUpdateOutput: boolean = false,
    readonly allowSubAgentUse: boolean = true,
  ) { }

  /**
   * Function declaration schema computed from name, description, and parameterSchema
   */
  get schema(): FunctionDeclaration {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameterSchema,
    };
  }

  /**
   * Validates the parameters for the tool
   * This is a placeholder implementation and should be overridden
   * Should be called from both `shouldConfirmExecute` and `execute`
   * `shouldConfirmExecute` should return false immediately if invalid
   * @param params Parameters to validate
   * @returns An error message string if invalid, null otherwise
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  validateToolParams(params: TParams): string | null {
    // Implementation would typically use a JSON Schema validator
    // This is a placeholder that should be implemented by derived classes
    return null;
  }

  /**
   * Gets a pre-execution description of the tool operation
   * Default implementation that should be overridden by derived classes
   * @param params Parameters for the tool execution
   * @returns A markdown string describing what the tool will do
   */
  getDescription(params: TParams): string {
    return JSON.stringify(params);
  }

  /**
   * Determines if the tool should prompt for confirmation before execution
   * @param params Parameters for the tool execution
   * @returns Whether or not execute should be confirmed by the user.
   */
  shouldConfirmExecute(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    params: TParams,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    return Promise.resolve(false);
  }

  /**
   * Determines what file system paths the tool will affect
   * @param params Parameters for the tool execution
   * @returns A list of such paths
   */
  toolLocations(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    params: TParams,
  ): ToolLocation[] {
    return [];
  }

  /**
   * Abstract method to execute the tool with the given parameters
   * Must be implemented by derived classes
   * @param params Parameters for the tool execution
   * @param signal AbortSignal for tool cancellation
   * @returns Result of the tool execution
   */
  abstract execute(
    params: TParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
    services?: ToolExecutionServices,
  ): Promise<TResult>;
}

export interface ToolResult {
  /**
   * A short, one-line summary of the tool's action and result.
   * e.g., "Read 5 files", "Wrote 256 bytes to foo.txt"
   */
  summary?: string;
  /**
   * Content meant to be included in LLM history.
   * This should represent the factual outcome of the tool execution.
   */
  llmContent: PartListUnion;

  /**
   * Markdown string for user display.
   * This provides a user-friendly summary or visualization of the result.
   * NOTE: This might also be considered UI-specific and could potentially be
   * removed or modified in a further refactor if the server becomes purely API-driven.
   * For now, we keep it as the core logic in ReadFileTool currently produces it.
   */
  returnDisplay: ToolResultDisplay;

  /**
   * Optional: ID of a background task if this tool starts a background process.
   * Used for CLI to track and manage background tasks.
   */
  backgroundTaskId?: string;

  /**
   * Optional: Indicates that this tool is now running in the background.
   * When true, the UI should show "BackgroundRunning" status instead of "Success".
   * This is set when user presses Ctrl+B to move a shell command to background.
   */
  isBackgroundTask?: boolean;

  /**
   * Structured data for rich UI rendering.
   * If provided, the UI can render specific components (like Todo lists, Diffs)
   * instead of just plain markdown text.
   */
  visualDisplay?: VisualDisplay;
}

/**
 * Union type for all visual display formats supported by the UI
 */
export type VisualDisplay =
  | TodoDisplay
  | SubAgentDisplay
  | FileDiff
  | McpThinkingDisplay
  | { type: 'subagent_update'; data: SubAgentDisplay }
  | { type: 'file_diff'; fileName: string; fileDiff: string };

/**
 * Structured UI display for MCP thinking tool results (e.g., Sequential thinking).
 * This enables the CLI to render a custom component highlighting the thought content
 * while de-emphasizing technical parameters.
 */
export interface McpThinkingDisplay {
  type: 'mcp_thinking_display';
  thought: string;
  thoughtNumber?: number;
  totalThoughts?: number;
  nextThoughtNeeded?: boolean;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  branches?: unknown[];
  thoughtHistoryLength?: number;
}

export type ToolResultDisplay = string | FileDiff | TodoDisplay | SubAgentDisplay | McpThinkingDisplay;

// Export tool output message utilities
export {
  parseToolOutputMessage,
  isSubAgentUpdateMessage,
  isTextOutputMessage,
  createSubAgentUpdateMessage,
  createTextOutputMessage,
  type ToolOutputMessage,
  type SubAgentUpdateMessage,
  type TextOutputMessage,
} from './toolOutputMessage.js';

export interface FileDiff {
  fileDiff: string;
  fileName: string;
  filePath?: string;
  originalContent: string | null;
  newContent: string;
  // 🎯 新增: 自动lint检查结果
  lintStatus?: string;           // 简洁的lint状态信息 (如 "✅ No lint errors")
  lintDiagnostics?: Array<{      // 详细的lint诊断信息
    file: string;
    line: number;
    column: number;
    severity: 'error' | 'warning' | 'info' | 'hint';
    message: string;
    source: string;
    code?: string;
  }>;
}


/**
 * Structured UI display for Todo list results.
 * This enables the CLI to render a custom Ink component instead of generic markdown.
 */
export interface TodoDisplay {
  type: 'todo_display';
  title: string; // e.g., "Update Todos" or "Todos"
  items: Array<{
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    priority: 'high' | 'medium' | 'low';
  }>;
}

export interface SubAgentDisplay {
  type: 'subagent_display';
  agentId: string;
  taskDescription: string;
  description?: string; // 任务的简短描述，用于UI展示
  status: 'starting' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentTurn: number;
  maxTurns: number;
  toolCalls: Array<{
    callId: string;
    toolName: string;
    description: string;
    status: 'Pending' | 'Executing' | 'Success' | 'Error' | 'Canceled' | 'Confirming' | 'SubAgentRunning';
    result?: string;
    error?: string;
    startTime?: number;
    durationMs?: number;
  }>;
  summary?: string;
  error?: string;
  stats: {
    filesCreated: string[];
    commandsRun: string[];
    totalToolCalls: number;
    successfulToolCalls: number;
    tokenUsage?: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
  };
  showDetailedProcess: boolean;
  startTime: number;
  endTime?: number;
}

export interface ToolEditConfirmationDetails {
  type: 'edit';
  title: string;
  onConfirm: (
    outcome: ToolConfirmationOutcome,
    payload?: ToolConfirmationPayload,
  ) => Promise<void>;
  fileName: string;
  fileDiff: string;
  originalContent: string | null;
  newContent: string;
  isModifying?: boolean;
}

export interface ToolConfirmationPayload {
  // used to override `modifiedProposedContent` for modifiable tools in the
  // inline modify flow
  newContent: string;
}

export interface ToolExecuteConfirmationDetails {
  type: 'exec';
  title: string;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
  command: string;
  rootCommand: string;
}

export interface ToolMcpConfirmationDetails {
  type: 'mcp';
  title: string;
  serverName: string;
  toolName: string;
  toolDisplayName: string;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
}

export interface ToolInfoConfirmationDetails {
  type: 'info';
  title: string;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
  prompt: string;
  urls?: string[];
}

export interface ToolDeleteConfirmationDetails {
  type: 'delete';
  title: string;
  onConfirm: (outcome: ToolConfirmationOutcome) => Promise<void>;
  fileName: string;
  filePath: string;
  fileContent: string;
  fileSize: number;
  reason?: string;
}

export type ToolCallConfirmationDetails =
  | ToolEditConfirmationDetails
  | ToolExecuteConfirmationDetails
  | ToolMcpConfirmationDetails
  | ToolInfoConfirmationDetails
  | ToolDeleteConfirmationDetails;

export enum ToolConfirmationOutcome {
  ProceedOnce = 'proceed_once',
  ProceedAlways = 'proceed_always',
  ProceedAlwaysServer = 'proceed_always_server',
  ProceedAlwaysTool = 'proceed_always_tool',
  ProceedAlwaysProject = 'proceed_always_project', // 本项目始终允许
  ModifyWithEditor = 'modify_with_editor',
  Cancel = 'cancel',
}

/**
 * 工具执行前的回调处理器类型定义
 */
export type PreToolExecutionHandler = (toolCall: {
  callId: string;
  tool: Tool;
  args: Record<string, unknown>;
}) => Promise<void> | void;

/**
 * 工具执行时的运行时服务接口
 * 提供工具在执行过程中可以使用的各种服务
 */
export interface ToolExecutionServices {

  /**
   * 获取当前执行上下文信息
   */
  getExecutionContext?: () => {
    agentId: string;
    agentType: 'main' | 'sub';
    taskDescription?: string;
  };

  /**
   * SubAgent状态更新回调
   * 允许SubAgent向父Agent同步工具调用状态
   */
  statusUpdateCallback?: (
    toolCalls: any[], // 使用any避免循环依赖
    context: {
      agentId: string;
      agentType: 'main' | 'sub';
      taskDescription?: string;
    },
  ) => void;

  /**
   * 工具执行前的回调
   * 用于SubAgent通知主Agent进行git快照等预处理操作
   */
  onPreToolExecution?: PreToolExecutionHandler;
}

export enum Icon {
  FileSearch = 'fileSearch',
  Folder = 'folder',
  Globe = 'globe',
  Hammer = 'hammer',
  LightBulb = 'lightBulb',
  Pencil = 'pencil',
  Regex = 'regex',
  Terminal = 'terminal',
  Clipboard = 'clipboard',    // 📋 用于TodoRead
  Tasks = 'tasks',           // ✅ 用于TodoWrite
  Wrench = 'wrench',         // 🔧 用于LintFix
  Trash = 'trash',           // 🗑️ 用于DeleteFile
  List = 'list',             // 📜 用于ListSkills
  Info = 'info',             // ℹ️ 用于GetSkillDetails
}

export interface ToolLocation {
  // Absolute path to the file
  path: string;
  // Which line (if known)
  line?: number;
}
