/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PartListUnion,
  GenerateContentResponse,
  FunctionCall,
  FunctionDeclaration,
  FinishReason,
} from '@google/genai';
import {
  ToolCallConfirmationDetails,
  ToolResult,
  ToolResultDisplay,
} from '../tools/tools.js';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';
import { reportError } from '../utils/errorReporting.js';
import {
  getErrorMessage,
  UnauthorizedError,
  toFriendlyError,
} from '../utils/errors.js';
import { GeminiChat } from './geminiChat.js';
import { SceneType } from './sceneManager.js';
import { validateAndFixFunctionCall } from '../utils/functionCallValidator.js';

// Define a structure for tools passed to the server
export interface ServerTool {
  name: string;
  schema: FunctionDeclaration;
  // The execute method signature might differ slightly or be wrapped
  execute(
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ToolResult>;
  shouldConfirmExecute(
    params: Record<string, unknown>,
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false>;
}

export enum GeminiEventType {
  Content = 'content',
  ToolCallRequest = 'tool_call_request',
  ToolCallResponse = 'tool_call_response',
  ToolCallConfirmation = 'tool_call_confirmation',
  UserCancelled = 'user_cancelled',
  Error = 'error',
  ChatCompressed = 'chat_compressed',
  Thought = 'thought',
  MaxSessionTurns = 'max_session_turns',
  Finished = 'finished',
  LoopDetected = 'loop_detected',
  TokenUsage = 'token_usage',
}

export interface StructuredError {
  message: string;
  status?: number;
}

export interface GeminiErrorEventValue {
  error: StructuredError;
}

export interface ToolCallRequestInfo {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  isClientInitiated: boolean;
  prompt_id: string;
  // 🎯 新增字段：标记这是runtime confirmation的虚拟工具调用
  isRuntimeConfirmation?: boolean;
}

export interface ToolCallResponseInfo {
  callId: string;
  responseParts: PartListUnion;
  resultDisplay: ToolResultDisplay | undefined;
  error: Error | undefined;
}

export interface ServerToolCallConfirmationDetails {
  request: ToolCallRequestInfo;
  details: ToolCallConfirmationDetails;
}

export type ThoughtSummary = {
  subject: string;
  description: string;
};

export type ServerGeminiContentEvent = {
  type: GeminiEventType.Content;
  value: string;
};

export type ServerGeminiThoughtEvent = {
  type: GeminiEventType.Thought;
  value: ThoughtSummary;
};

export type ServerGeminiToolCallRequestEvent = {
  type: GeminiEventType.ToolCallRequest;
  value: ToolCallRequestInfo;
};

export type ServerGeminiToolCallResponseEvent = {
  type: GeminiEventType.ToolCallResponse;
  value: ToolCallResponseInfo;
};

export type ServerGeminiToolCallConfirmationEvent = {
  type: GeminiEventType.ToolCallConfirmation;
  value: ServerToolCallConfirmationDetails;
};

export type ServerGeminiUserCancelledEvent = {
  type: GeminiEventType.UserCancelled;
};

export type ServerGeminiErrorEvent = {
  type: GeminiEventType.Error;
  value: GeminiErrorEventValue;
};

export interface ChatCompressionInfo {
  originalTokenCount: number;
  newTokenCount: number;
}

export interface TokenUsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedContentTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  creditsUsage?: number;
}

export type ServerGeminiChatCompressedEvent = {
  type: GeminiEventType.ChatCompressed;
  value: ChatCompressionInfo | null;
};

export type ServerGeminiMaxSessionTurnsEvent = {
  type: GeminiEventType.MaxSessionTurns;
};

export type ServerGeminiFinishedEvent = {
  type: GeminiEventType.Finished;
  value: FinishReason;
  errorDetails?: string; // 可选的错误详情，用于提供更具体的错误信息
};

export type ServerGeminiLoopDetectedEvent = {
  type: GeminiEventType.LoopDetected;
  value?: string; // Optional loop type: 'consecutive_identical_tool_calls', 'chanting_identical_sentences', 'llm_detected_loop'
};

export type ServerGeminiTokenUsageEvent = {
  type: GeminiEventType.TokenUsage;
  value: TokenUsageInfo;
};

// The original union type, now composed of the individual types
export type ServerGeminiStreamEvent =
  | ServerGeminiContentEvent
  | ServerGeminiToolCallRequestEvent
  | ServerGeminiToolCallResponseEvent
  | ServerGeminiToolCallConfirmationEvent
  | ServerGeminiUserCancelledEvent
  | ServerGeminiErrorEvent
  | ServerGeminiChatCompressedEvent
  | ServerGeminiThoughtEvent
  | ServerGeminiMaxSessionTurnsEvent
  | ServerGeminiFinishedEvent
  | ServerGeminiLoopDetectedEvent
  | ServerGeminiTokenUsageEvent;

// A turn manages the agentic loop turn within the server context.
export class Turn {
  readonly pendingToolCalls: ToolCallRequestInfo[];
  private debugResponses: GenerateContentResponse[];

  constructor(
    private readonly chat: GeminiChat,
    private readonly prompt_id: string,
    private readonly modelName?: string,
  ) {
    this.pendingToolCalls = [];
    this.debugResponses = [];
  }
  // The run method yields simpler events suitable for server logic
  async *run(
    req: PartListUnion,
    signal: AbortSignal,
  ): AsyncGenerator<ServerGeminiStreamEvent> {
    try {
      const responseStream = await this.chat.sendMessageStream(
        {
          message: req,
          config: {
            abortSignal: signal,
          },
        },
        this.prompt_id,
        SceneType.CHAT_CONVERSATION,
      );

      for await (const resp of responseStream) {
        if (signal?.aborted) {
          yield { type: GeminiEventType.UserCancelled };
          // Do not add resp to debugResponses if aborted before processing
          return;
        }
        this.debugResponses.push(resp);

        const thoughtPart = resp.candidates?.[0]?.content?.parts?.[0];
        if (thoughtPart?.thought) {
          // Thought always has a bold "subject" part enclosed in double asterisks
          // (e.g., **Subject**). The rest of the string is considered the description.
          const rawText = thoughtPart.text ?? '';
          const subjectStringMatches = rawText.match(/\*\*(.*?)\*\*/s);
          const subject = subjectStringMatches
            ? subjectStringMatches[1].trim()
            : '';
          const description = rawText.replace(/\*\*(.*?)\*\*/s, '').trim();
          const thought: ThoughtSummary = {
            subject,
            description,
          };

          yield {
            type: GeminiEventType.Thought,
            value: thought,
          };
          continue;
        }

        const text = getResponseText(resp);
        if (text) {
          yield { type: GeminiEventType.Content, value: text };
        }

        // Handle function calls (requesting tool execution)
        const functionCalls = resp.functionCalls ?? [];
        for (const fnCall of functionCalls) {
          const event = this.handlePendingFunctionCall(fnCall);
          if (event) {
            yield event;
          }
        }

        // Check if response was truncated or stopped for various reasons
        const finishReason = resp.candidates?.[0]?.finishReason;

        if (finishReason) {
          let errorDetails: string | undefined;

          // For MALFORMED_FUNCTION_CALL, try to extract detailed error information
          if (finishReason === 'MALFORMED_FUNCTION_CALL') {
            // 尝试从多个来源获取函数调用信息
            const functionCalls = resp.functionCalls ?? [];

            // 如果 resp.functionCalls 不可用，尝试从 candidates[0].content.parts 中提取
            if (functionCalls.length === 0) {
              const parts = resp.candidates?.[0]?.content?.parts ?? [];
              for (const part of parts) {
                if (part.functionCall) {
                  functionCalls.push(part.functionCall);
                }
              }
            }

            if (functionCalls.length > 0) {
              const fc = functionCalls[0];
              errorDetails = `Malformed function call detected.\n\nFunction: ${fc.name || 'unknown'}\n\nArguments received:\n${JSON.stringify(fc.args, null, 2)}`;
            } else {
              errorDetails = 'Malformed function call detected, but no function call details available. The model may have generated invalid JSON.';
            }
          }

          yield {
            type: GeminiEventType.Finished,
            value: finishReason as FinishReason,
            errorDetails,
          };
        }

        // Emit token usage info at the end (usually comes with finishReason)
        if (resp.usageMetadata) {
          const tokenUsageInfo: TokenUsageInfo = {
            inputTokens: resp.usageMetadata.promptTokenCount || 0,
            outputTokens: resp.usageMetadata.candidatesTokenCount || 0,
            totalTokens: resp.usageMetadata.totalTokenCount || 0,
            cachedContentTokens: resp.usageMetadata.cachedContentTokenCount,
            cacheCreationInputTokens: (resp.usageMetadata as any).cacheCreationInputTokens,
            cacheReadInputTokens: (resp.usageMetadata as any).cacheReadInputTokens,
            creditsUsage: (resp.usageMetadata as any).creditsUsage,
          };

          yield {
            type: GeminiEventType.TokenUsage,
            value: tokenUsageInfo,
          };
        }
      }
    } catch (e) {
      const error = toFriendlyError(e);
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      if (signal.aborted) {
        yield { type: GeminiEventType.UserCancelled };
        // Regular cancellation error, fail gracefully.
        return;
      }

      const contextForReport = [...this.chat.getHistory(/*curated*/ true), req];
      await reportError(
        error,
        'Error when talking to Gemini API',
        contextForReport,
        'Turn.run-sendMessageStream',
      );
      const status =
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        typeof (error as { status: unknown }).status === 'number'
          ? (error as { status: number }).status
          : undefined;
      const structuredError: StructuredError = {
        message: getErrorMessage(error),
        status,
      };
      yield { type: GeminiEventType.Error, value: { error: structuredError } };
      return;
    }
  }

  private handlePendingFunctionCall(
    fnCall: FunctionCall,
  ): ServerGeminiStreamEvent | null {
    // 对于小模型，尝试修复函数调用格式
    let processedFnCall = fnCall;
    if (this.modelName) {
      const validationResult = validateAndFixFunctionCall(fnCall, this.modelName);
      if (validationResult.fixedCall) {
        processedFnCall = validationResult.fixedCall;
      }
    }

    const callId =
      processedFnCall.id ??
      `${processedFnCall.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const name = processedFnCall.name || 'undefined_tool_name';
    const args = (processedFnCall.args || {}) as Record<string, unknown>;

    const toolCallRequest: ToolCallRequestInfo = {
      callId,
      name,
      args,
      isClientInitiated: false,
      prompt_id: this.prompt_id,
    };

    this.pendingToolCalls.push(toolCallRequest);

    // Yield a request for the tool call, not the pending/confirming status
    return { type: GeminiEventType.ToolCallRequest, value: toolCallRequest };
  }

  getDebugResponses(): GenerateContentResponse[] {
    return this.debugResponses;
  }
}
