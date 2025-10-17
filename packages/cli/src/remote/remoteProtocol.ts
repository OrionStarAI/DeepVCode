/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 远程控制消息协议定义
 * 基于Linus设计原则：统一消息格式，消除所有特殊情况
 */

export enum MessageType {
  // 指令类
  COMMAND = 'command',           // 用户输入指令
  INTERRUPT = 'interrupt',       // 中断当前操作 (Ctrl+C)
  
  // 响应类  
  OUTPUT = 'output',             // CLI输出内容
  ERROR = 'error',               // 错误信息
  STATUS = 'status',             // 状态更新
  
  // 工具调用类
  TOOL_CALL = 'tool_call',           // 工具调用（包含执行结果）
  TOOL_STATUS = 'tool_status',       // 工具执行状态更新
  
  // UI状态类
  REQUEST_UI_STATE = 'request_ui_state',    // 请求UI状态数据
  UI_STATE_RESPONSE = 'ui_state_response',  // UI状态响应
  
  // Session管理类
  SESSION_LIST = 'session_list',            // 可用session列表
  SELECT_SESSION = 'select_session',        // 选择session
  CREATE_SESSION = 'create_session',        // 创建新session
  CLEAR_SESSION = 'clear_session',          // 清理session数据
  
  // 认证类
  AUTH_REQUIRED = 'auth_required',          // 需要密码认证
  AUTH_SUBMIT = 'auth_submit',              // 提交密码
  AUTH_SUCCESS = 'auth_success',            // 认证成功
  AUTH_FAILED = 'auth_failed',              // 认证失败
  
  // 控制类
  PING = 'ping',                 // 心跳检测
  PONG = 'pong',                 // 心跳响应
  DISCONNECT = 'disconnect',     // 断开连接
}

/**
 * 统一消息格式 - 消除所有特殊情况
 */
export interface RemoteMessage {
  id: string;           // 消息唯一标识
  type: MessageType;    // 消息类型
  payload: any;         // 消息载荷
  timestamp: number;    // 时间戳
  sessionId?: string;   // 会话标识（云端模式下用于精确路由）
}

/**
 * 指令消息
 */
export interface CommandMessage extends RemoteMessage {
  type: MessageType.COMMAND;
  payload: {
    command: string;      // 用户输入的完整指令
    workdir?: string;     // 可选工作目录
  };
}

/**
 * 输出消息
 */
export interface OutputMessage extends RemoteMessage {
  type: MessageType.OUTPUT;
  payload: {
    content: string;      // CLI输出内容  
    isComplete: boolean;  // 是否输出完成
    stream: 'stdout' | 'stderr';
  };
}

/**
 * 错误消息
 */
export interface ErrorMessage extends RemoteMessage {
  type: MessageType.ERROR;
  payload: {
    error: string;        // 错误信息
    code?: number;        // 错误代码
  };
}

/**
 * 状态消息
 */
export interface StatusMessage extends RemoteMessage {
  type: MessageType.STATUS;
  payload: {
    status: 'idle' | 'running' | 'error';
    message?: string;
  };
}



/**
 * 工具调用消息 - 包含完整的调用信息和结果
 */
export interface ToolCallMessage extends RemoteMessage {
  type: MessageType.TOOL_CALL;
  payload: {
    toolName: string;            // 工具显示名称(displayName)
    toolDescription?: string;    // 工具描述信息
    callId: string;              // 调用ID
    args: Record<string, any>;   // 工具参数
    result?: string;             // 执行结果显示
    success: boolean;            // 是否成功
    error?: string;              // 错误信息（失败时）
    duration?: number;           // 执行耗时(ms)
  };
}

/**
 * 工具执行状态消息
 */
export interface ToolStatusMessage extends RemoteMessage {
  type: MessageType.TOOL_STATUS;
  payload: {
    toolName: string;            // 工具名称
    callId: string;              // 调用ID
    status: 'starting' | 'running' | 'completed' | 'error'; // 执行状态
    message?: string;            // 状态描述信息
    progress?: {                 // 进度信息（可选）
      current: number;
      total: number;
      description?: string;
    };
  };
}

/**
 * 中断消息
 */
export interface InterruptMessage extends RemoteMessage {
  type: MessageType.INTERRUPT;
  payload: Record<string, never>; // 空载荷
}

/**
 * 心跳消息
 */
export interface PingMessage extends RemoteMessage {
  type: MessageType.PING;
  payload: Record<string, never>; // 空载荷
}

export interface PongMessage extends RemoteMessage {
  type: MessageType.PONG;
  payload: Record<string, never>; // 空载荷
}

/**
 * 请求UI状态消息
 */
export interface RequestUIStateMessage extends RemoteMessage {
  type: MessageType.REQUEST_UI_STATE;
  payload: Record<string, never>; // 空载荷
}

/**
 * UI状态响应消息
 */
export interface UIStateResponseMessage extends RemoteMessage {
  type: MessageType.UI_STATE_RESPONSE;
  payload: {
    completedRecords: any[];     // 已完成的记录
    currentRecord: any | null;   // 当前正在进行的记录
    isProcessing: boolean;       // 是否正在处理
  };
}

/**
 * Session列表消息
 */
export interface SessionListMessage extends RemoteMessage {
  type: MessageType.SESSION_LIST;
  payload: {
    sessions: Array<{
      id: string;
      createdAt: number;
      lastActiveAt: number;
      firstUserInput?: string;
      lastUserInput?: string;
    }>;
  };
}

/**
 * 选择session消息
 */
export interface SelectSessionMessage extends RemoteMessage {
  type: MessageType.SELECT_SESSION;
  payload: {
    sessionId?: string; // 如果为空则创建新session
  };
}

/**
 * 创建session消息
 */
export interface CreateSessionMessage extends RemoteMessage {
  type: MessageType.CREATE_SESSION;
  payload: Record<string, never>; // 空载荷
}

/**
 * 清理session消息
 */
export interface ClearSessionMessage extends RemoteMessage {
  type: MessageType.CLEAR_SESSION;
  payload: Record<string, never>; // 空载荷
}

/**
 * 需要认证消息
 */
export interface AuthRequiredMessage extends RemoteMessage {
  type: MessageType.AUTH_REQUIRED;
  payload: Record<string, never>; // 空载荷
}

/**
 * 提交认证消息
 */
export interface AuthSubmitMessage extends RemoteMessage {
  type: MessageType.AUTH_SUBMIT;
  payload: {
    password: string;
  };
}

/**
 * 认证成功消息
 */
export interface AuthSuccessMessage extends RemoteMessage {
  type: MessageType.AUTH_SUCCESS;
  payload: Record<string, never>; // 空载荷
}

/**
 * 认证失败消息
 */
export interface AuthFailedMessage extends RemoteMessage {
  type: MessageType.AUTH_FAILED;
  payload: {
    message: string;
  };
}

/**
 * 消息工厂函数 - Linus风格：简洁的API
 */
export class MessageFactory {
  private static generateId(): string {
    return Math.random().toString(16).slice(2);
  }

  static createCommand(command: string, workdir?: string): CommandMessage {
    return {
      id: this.generateId(),
      type: MessageType.COMMAND,
      payload: { command, workdir },
      timestamp: Date.now(),
    };
  }

  static createOutput(
    content: string, 
    isComplete: boolean, 
    stream: 'stdout' | 'stderr' = 'stdout'
  ): OutputMessage {
    return {
      id: this.generateId(),
      type: MessageType.OUTPUT,
      payload: { content, isComplete, stream },
      timestamp: Date.now(),
    };
  }

  static createError(error: string, code?: number): ErrorMessage {
    return {
      id: this.generateId(),
      type: MessageType.ERROR,
      payload: { error, code },
      timestamp: Date.now(),
    };
  }

  static createStatus(
    status: 'idle' | 'running' | 'error', 
    message?: string
  ): StatusMessage {
    return {
      id: this.generateId(),
      type: MessageType.STATUS,
      payload: { status, message },
      timestamp: Date.now(),
    };
  }

  static createToolCall(
    toolName: string,
    callId: string,
    args: Record<string, any>,
    success: boolean,
    result?: string,
    error?: string,
    duration?: number,
    toolDescription?: string
  ): ToolCallMessage {
    return {
      id: this.generateId(),
      type: MessageType.TOOL_CALL,
      payload: {
        toolName,
        toolDescription,
        callId,
        args,
        success,
        result,
        error,
        duration,
      },
      timestamp: Date.now(),
    };
  }

  static createToolStatus(
    toolName: string,
    callId: string,
    status: 'starting' | 'running' | 'completed' | 'error',
    message?: string,
    progress?: { current: number; total: number; description?: string }
  ): ToolStatusMessage {
    return {
      id: this.generateId(),
      type: MessageType.TOOL_STATUS,
      payload: {
        toolName,
        callId,
        status,
        message,
        progress,
      },
      timestamp: Date.now(),
    };
  }

  static createInterrupt(): InterruptMessage {
    return {
      id: this.generateId(),
      type: MessageType.INTERRUPT,
      payload: {},
      timestamp: Date.now(),
    };
  }

  static createPing(): PingMessage {
    return {
      id: this.generateId(),
      type: MessageType.PING,
      payload: {},
      timestamp: Date.now(),
    };
  }

  static createPong(): PongMessage {
    return {
      id: this.generateId(),
      type: MessageType.PONG,
      payload: {},
      timestamp: Date.now(),
    };
  }

  static createRequestUIState(): RequestUIStateMessage {
    return {
      id: this.generateId(),
      type: MessageType.REQUEST_UI_STATE,
      payload: {},
      timestamp: Date.now(),
    };
  }

  static createUIStateResponse(
    completedRecords: any[],
    currentRecord: any | null,
    isProcessing: boolean
  ): UIStateResponseMessage {
    return {
      id: this.generateId(),
      type: MessageType.UI_STATE_RESPONSE,
      payload: {
        completedRecords,
        currentRecord,
        isProcessing,
      },
      timestamp: Date.now(),
    };
  }

  static createSessionList(sessions: Array<{
    id: string, 
    createdAt: number, 
    lastActiveAt: number,
    firstUserInput?: string,
    lastUserInput?: string
  }>): SessionListMessage {
    return {
      id: this.generateId(),
      type: MessageType.SESSION_LIST,
      payload: { sessions },
      timestamp: Date.now(),
    };
  }

  static createSelectSession(sessionId?: string): SelectSessionMessage {
    return {
      id: this.generateId(),
      type: MessageType.SELECT_SESSION,
      payload: { sessionId },
      timestamp: Date.now(),
    };
  }

  static createCreateSession(): CreateSessionMessage {
    return {
      id: this.generateId(),
      type: MessageType.CREATE_SESSION,
      payload: {},
      timestamp: Date.now(),
    };
  }

  static createClearSession(): ClearSessionMessage {
    return {
      id: this.generateId(),
      type: MessageType.CLEAR_SESSION,
      payload: {},
      timestamp: Date.now(),
    };
  }

  static createAuthRequired(): AuthRequiredMessage {
    return {
      id: this.generateId(),
      type: MessageType.AUTH_REQUIRED,
      payload: {},
      timestamp: Date.now(),
    };
  }

  static createAuthSubmit(password: string): AuthSubmitMessage {
    return {
      id: this.generateId(),
      type: MessageType.AUTH_SUBMIT,
      payload: { password },
      timestamp: Date.now(),
    };
  }

  static createAuthSuccess(): AuthSuccessMessage {
    return {
      id: this.generateId(),
      type: MessageType.AUTH_SUCCESS,
      payload: {},
      timestamp: Date.now(),
    };
  }

  static createAuthFailed(message: string): AuthFailedMessage {
    return {
      id: this.generateId(),
      type: MessageType.AUTH_FAILED,
      payload: { message },
      timestamp: Date.now(),
    };
  }

  static createMessage(type: MessageType, payload: any): RemoteMessage {
    return {
      id: this.generateId(),
      type,
      payload,
      timestamp: Date.now(),
    };
  }
}

/**
 * 消息验证器
 */
export class MessageValidator {
  static isValidMessage(obj: any): obj is RemoteMessage {
    return (
      obj &&
      typeof obj === 'object' &&
      typeof obj.id === 'string' &&
      typeof obj.type === 'string' &&
      Object.values(MessageType).includes(obj.type) &&
      obj.payload !== undefined &&
      typeof obj.timestamp === 'number'
    );
  }

  static isCommandMessage(msg: RemoteMessage): msg is CommandMessage {
    return (
      msg.type === MessageType.COMMAND &&
      typeof msg.payload.command === 'string'
    );
  }

  static isOutputMessage(msg: RemoteMessage): msg is OutputMessage {
    return (
      msg.type === MessageType.OUTPUT &&
      typeof msg.payload.content === 'string' &&
      typeof msg.payload.isComplete === 'boolean'
    );
  }

  static isToolCallMessage(msg: RemoteMessage): msg is ToolCallMessage {
    return (
      msg.type === MessageType.TOOL_CALL &&
      typeof msg.payload.toolName === 'string' &&
      typeof msg.payload.callId === 'string' &&
      typeof msg.payload.success === 'boolean' &&
      typeof msg.payload.args === 'object'
    );
  }


}
