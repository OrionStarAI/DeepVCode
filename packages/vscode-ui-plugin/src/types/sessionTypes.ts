/**
 * Session Management Type Definitions
 * 会话管理类型定义
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import { SessionStatus, SessionType, SessionAction } from '../constants/sessionConstants';
import { ToolCall, ContextInfo } from './messages';
import { TurnVersionMetadata } from './versionControl';

// =============================================================================
// 核心Session接口
// =============================================================================

/** Session基础信息 */
export interface SessionInfo {
  /** 会话唯一标识符 */
  id: string;

  /** 会话显示名称 */
  name: string;

  /** 会话类型 */
  type: SessionType;

  /** 会话状态 */
  status: SessionStatus;

  /** 会话图标 */
  icon?: string;

  /** 创建时间戳 */
  createdAt: number;

  /** 最后活跃时间戳 */
  lastActivity: number;

  /** 消息总数 */
  messageCount: number;

  /** 是否为默认会话 */
  isDefault?: boolean;

  /** 会话描述 */
  description?: string;

  /** Token使用情况 */
  tokenUsage?: {
    /** 输入Token数 */
    inputTokens: number;
    /** 输出Token数 */
    outputTokens: number;
    /** 总Token数 */
    totalTokens: number;
    /** 模型Token限制 */
    tokenLimit: number;
    /** 缓存Token数 */
    cachedContentTokens?: number;
    /** 缓存创建输入Token数 */
    cacheCreationInputTokens?: number;
    /** 缓存读取输入Token数 */
    cacheReadInputTokens?: number;
    /** 信用消耗 */
    creditsUsage?: number;
    /** 缓存命中率 */
    cacheHitRate?: number;
  };
}

/** Session完整状态 */
export interface SessionState {
  /** 基础信息 */
  info: SessionInfo;

  /** 聊天消息列表 */
  messages: SessionMessage[];

  /** 活跃的工具调用 */
  activeToolCalls: ToolCall[];

  /** 加载状态 */
  isLoading: boolean;

  /** 上下文信息 */
  context: SessionContext;

  /** AI模型配置 */
  modelConfig?: SessionModelConfig;

  /** 系统提示词 */
  systemPrompt?: string;

  /** 会话设置 */
  settings?: SessionSettings;
}

/** Session扩展上下文 - 扩展ContextInfo以支持AI历史记录 */
export interface SessionContext extends ContextInfo {
  /** AI Client历史记录 */
  aiClientHistory?: unknown[];

  /** 其他session特定的上下文数据 */
  [key: string]: unknown;
}

/** Session消息接口 */
export interface SessionMessage {
  /** 消息ID */
  id: string;

  /** 所属会话ID */
  sessionId: string;

  /** 消息类型 */
  type: 'user' | 'assistant' | 'system' | 'tool';

  /** 消息内容 */
  content: string;

  /** 时间戳 */
  timestamp: number;

  /** 工具调用信息 */
  toolCalls?: ToolCall[];

  /** 消息元数据 */
  metadata?: MessageMetadata;

  /** 🎯 版本控制元数据（增量挂载，不影响原有字段） */
  versionMetadata?: TurnVersionMetadata;
}

/** 消息元数据 */
export interface MessageMetadata {
  /** 工具名称 */
  toolName?: string;

  /** 工具ID */
  toolId?: string;

  /** 工具状态 */
  toolStatus?: 'executing' | 'success' | 'error' | 'cancelled';

  /** 工具参数 */
  toolParameters?: Record<string, any>;

  /** 消息类型（状态或输出） */
  toolMessageType?: 'status' | 'output';

  /** 是否已编辑 */
  edited?: boolean;

  /** 编辑时间 */
  editedAt?: number;

  /** Token使用情况 */
  tokenUsage?: {
    /** 输入Token数 */
    inputTokens: number;
    /** 输出Token数 */
    outputTokens: number;
    /** 总Token数 */
    totalTokens: number;
    /** 模型Token限制 */
    tokenLimit: number;
    /** 缓存Token数 */
    cachedContentTokens?: number;
    /** 缓存创建输入Token数 */
    cacheCreationInputTokens?: number;
    /** 缓存读取输入Token数 */
    cacheReadInputTokens?: number;
    /** 信用消耗 */
    creditsUsage?: number;
    /** 缓存命中率 */
    cacheHitRate?: number;
  };

  /** 🎯 记录生成该消息的模型名称 */
  modelName?: string;

  /** 🎯 是否正在处理工具 */
  isProcessingTools?: boolean;

  /** 🎯 工具是否全部完成 */
  toolsCompleted?: boolean;

  /** 🎯 是否正在流式传输 */
  isStreaming?: boolean;
}

// =============================================================================
// Session配置和设置
// =============================================================================

/** AI模型配置 */
export interface SessionModelConfig {
  /** 模型名称 */
  modelName: string;

  /** 温度参数 */
  temperature?: number;

  /** 最大tokens */
  maxTokens?: number;

  /** top_p参数 */
  topP?: number;

  /** 停止词 */
  stopSequences?: string[];
}

/** Session设置 */
export interface SessionSettings {
  /** 是否启用工具确认 */
  requireToolConfirmation: boolean;

  /** 自动保存间隔（秒） */
  autoSaveInterval: number;

  /** 最大消息历史长度 */
  maxMessageHistory: number;

  /** 是否启用语音输入 */
  voiceInputEnabled?: boolean;

  /** 主题设置 */
  theme?: 'light' | 'dark' | 'auto';

  /** 字体大小 */
  fontSize?: number;
}

// =============================================================================
// Session操作相关接口
// =============================================================================

/** Session创建请求 */
export interface CreateSessionRequest {
  /** 会话名称 */
  name?: string;

  /** 会话类型 */
  type: SessionType;

  /** 系统提示词 */
  systemPrompt?: string;

  /** 模型配置 */
  modelConfig?: SessionModelConfig;

  /** 会话设置 */
  settings?: Partial<SessionSettings>;

  /** 从模板创建 */
  fromTemplate?: boolean;

  /** 是否立即激活新session（默认true） */
  activateImmediately?: boolean;
}

/** Session更新请求 */
export interface UpdateSessionRequest {
  /** 会话ID */
  sessionId: string;

  /** 更新的字段 */
  updates: Partial<{
    name: string;
    type: SessionType;
    description: string;
    systemPrompt: string;
    modelConfig: SessionModelConfig;
    settings: SessionSettings;
  }>;
}

/** Session操作请求 */
export interface SessionActionRequest {
  /** 操作类型 */
  action: SessionAction;

  /** 目标会话ID */
  sessionId: string;

  /** 操作参数 */
  params?: Record<string, any>;
}

/** Session切换请求 */
export interface SwitchSessionRequest {
  /** 目标会话ID */
  sessionId: string;

  /** 是否保存当前会话 */
  saveCurrentSession?: boolean;
}

// =============================================================================
// Session管理器接口
// =============================================================================

/** Session管理器状态 */
export interface SessionManagerState {
  /** 所有会话映射 */
  sessions: Map<string, SessionState>;

  /** 当前活跃会话ID */
  currentSessionId: string | null;

  /** 会话信息列表 */
  sessionList: SessionInfo[];

  /** 是否正在初始化 */
  isInitializing: boolean;

  /** 最后错误信息 */
  lastError?: string;
}

/** Session事件 */
export interface SessionEvent {
  /** 事件类型 */
  type: 'created' | 'updated' | 'deleted' | 'switched' | 'error';

  /** 会话ID */
  sessionId: string;

  /** 事件数据 */
  data?: any;

  /** 时间戳 */
  timestamp: number;
}

// =============================================================================
// Session导入导出
// =============================================================================

/** Session导出数据 */
export interface SessionExportData {
  /** 导出版本 */
  version: string;

  /** 导出时间 */
  exportedAt: number;

  /** 会话数据 */
  sessions: SessionState[];

  /** 元数据 */
  metadata: {
    totalSessions: number;
    totalMessages: number;
    exportSource: string;
  };
}

/** Session导入选项 */
export interface SessionImportOptions {
  /** 是否覆盖同名会话 */
  overwriteExisting?: boolean;

  /** 是否保留原始ID */
  preserveIds?: boolean;

  /** 导入后是否切换到第一个会话 */
  switchToFirst?: boolean;

  /** 最大导入会话数 */
  maxSessions?: number;
}

// =============================================================================
// Session查询和过滤
// =============================================================================

/** Session查询参数 */
export interface SessionQueryParams {
  /** 会话类型过滤 */
  type?: SessionType;

  /** 状态过滤 */
  status?: SessionStatus;

  /** 名称搜索 */
  nameSearch?: string;

  /** 创建时间范围 */
  createdAfter?: number;
  createdBefore?: number;

  /** 活跃时间范围 */
  lastActivityAfter?: number;
  lastActivityBefore?: number;

  /** 排序字段 */
  sortBy?: 'name' | 'createdAt' | 'lastActivity' | 'messageCount';

  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';

  /** 分页参数 */
  limit?: number;
  offset?: number;
}

/** Session统计信息 */
export interface SessionStats {
  /** 总会话数 */
  totalSessions: number;

  /** 活跃会话数 */
  activeSessions: number;

  /** 总消息数 */
  totalMessages: number;

  /** 按类型分组的统计 */
  byType: Record<SessionType, number>;

  /** 按状态分组的统计 */
  byStatus: Record<SessionStatus, number>;

  /** 平均消息数 */
  averageMessagesPerSession: number;

  /** 最活跃的会话ID */
  mostActiveSessionId?: string;
}

// =============================================================================
// 类型守卫和工具函数类型
// =============================================================================

/** Session类型守卫 */
export type SessionTypeGuard<T> = (value: any) => value is T;

/** Session变更监听器 */
export type SessionChangeListener = (event: SessionEvent) => void;

/** Session验证结果 */
export interface SessionValidationResult {
  /** 是否有效 */
  isValid: boolean;

  /** 错误信息 */
  errors: string[];

  /** 警告信息 */
  warnings: string[];
}
