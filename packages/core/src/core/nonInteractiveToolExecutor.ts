/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  logToolCall,
  ToolCallRequestInfo,
  ToolCallResponseInfo,
  ToolRegistry,
  ToolResult,
} from '../index.js';
import { Config } from '../config/config.js';
import { convertToFunctionResponse } from './coreToolScheduler.js';

/**
 * Executes a single tool call non-interactively.
 * It does not handle confirmations, multiple calls, or live updates.
 *
 * Note: Dangerous commands (detected by tool.shouldConfirmExecute) will
 * NOT be executed in YOLO mode - they are blocked regardless of approval mode.
 */
export async function executeToolCall(
  config: Config,
  toolCallRequest: ToolCallRequestInfo,
  toolRegistry: ToolRegistry,
  abortSignal?: AbortSignal,
): Promise<ToolCallResponseInfo> {
  const tool = toolRegistry.getTool(toolCallRequest.name);

  const startTime = Date.now();
  if (!tool) {
    const error = new Error(
      `Tool "${toolCallRequest.name}" not found in registry.`,
    );
    const durationMs = Date.now() - startTime;
    logToolCall(config, {
      'event.name': 'tool_call',
      'event.timestamp': new Date().toISOString(),
      function_name: toolCallRequest.name,
      function_args: toolCallRequest.args,
      duration_ms: durationMs,
      success: false,
      error: error.message,
      prompt_id: toolCallRequest.prompt_id,
      response_length: error.message.length,
    });
    // Ensure the response structure matches what the API expects for an error
    return {
      callId: toolCallRequest.callId,
      responseParts: [
        {
          functionResponse: {
            id: toolCallRequest.callId,
            name: toolCallRequest.name,
            response: { error: error.message },
          },
        },
      ],
      resultDisplay: error.message,
      error,
    };
  }

  try {
    // 🚨 CRITICAL: Even in YOLO mode, check for dangerous commands
    // Dangerous commands MUST be confirmed, regardless of approval mode
    const effectiveAbortSignal = abortSignal ?? new AbortController().signal;
    const confirmationDetails = await tool.shouldConfirmExecute(
      toolCallRequest.args,
      effectiveAbortSignal,
    );

    console.error(`\n[DangerousCommandCheck] Tool: ${toolCallRequest.name}`);
    console.error(`[DangerousCommandCheck] Confirmation result:`, confirmationDetails ? 'HAS_CONFIRMATION' : 'null');

    // If this is a dangerous command (confirmation required), block execution in YOLO mode
    // Check if confirmation is required (not false)
    if (confirmationDetails) {
      console.error(`[DangerousCommandCheck] Confirmation type: ${confirmationDetails.type}`);
      console.error(`[DangerousCommandCheck] Root command: ${(confirmationDetails as any).rootCommand}`);
      console.error(`[DangerousCommandCheck] Has warning: ${!!(confirmationDetails as any).warning}`);

      // For 'exec' type with warning = dangerous command
      if (confirmationDetails.type === 'exec' && (confirmationDetails as any).warning) {
        const rootCmd = (confirmationDetails as any).rootCommand;
        const warningMsg = (confirmationDetails as any).warning;
        const error = new Error(
          `🚫 DANGEROUS COMMAND BLOCKED\n\nRule: ${rootCmd}\n${warningMsg}\n\nDangerous commands cannot be auto-executed in YOLO mode. Please run this command in interactive mode for confirmation.`,
        );
        console.error(`\n${'='.repeat(80)}`);
        console.error(`🚫 DANGEROUS COMMAND EXECUTION PREVENTED`);
        console.error(`${'='.repeat(80)}`);
        console.error(`Rule: ${rootCmd}`);
        console.error(`Warning: ${warningMsg}`);
        console.error(`${'='.repeat(80)}\n`);

        const durationMs = Date.now() - startTime;
        logToolCall(config, {
          'event.name': 'tool_call',
          'event.timestamp': new Date().toISOString(),
          function_name: toolCallRequest.name,
          function_args: toolCallRequest.args,
          duration_ms: durationMs,
          success: false,
          error: error.message,
          prompt_id: toolCallRequest.prompt_id,
          response_length: error.message.length,
        });
        return {
          callId: toolCallRequest.callId,
          responseParts: [
            {
              functionResponse: {
                id: toolCallRequest.callId,
                name: toolCallRequest.name,
                response: { error: error.message },
              },
            },
          ],
          resultDisplay: error.message,
          error,
        };
      }
    }

    // Directly execute without confirmation or live output handling
    const toolResult: ToolResult = await tool.execute(
      toolCallRequest.args,
      effectiveAbortSignal,
      // No live output callback for non-interactive mode
    );

    const tool_output = toolResult.llmContent;

    const tool_display = toolResult.returnDisplay;

    const durationMs = Date.now() - startTime;
    // 计算响应内容长度
    const responseLength = typeof tool_output === 'string' ? tool_output.length : JSON.stringify(tool_output).length;
    logToolCall(config, {
      'event.name': 'tool_call',
      'event.timestamp': new Date().toISOString(),
      function_name: toolCallRequest.name,
      function_args: toolCallRequest.args,
      duration_ms: durationMs,
      success: true,
      prompt_id: toolCallRequest.prompt_id,
      response_length: responseLength,
    });

    const response = convertToFunctionResponse(
      toolCallRequest.name,
      toolCallRequest.callId,
      tool_output,
    );

    return {
      callId: toolCallRequest.callId,
      responseParts: response,
      resultDisplay: tool_display,
      error: undefined,
    };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    const durationMs = Date.now() - startTime;
    logToolCall(config, {
      'event.name': 'tool_call',
      'event.timestamp': new Date().toISOString(),
      function_name: toolCallRequest.name,
      function_args: toolCallRequest.args,
      duration_ms: durationMs,
      success: false,
      error: error.message,
      prompt_id: toolCallRequest.prompt_id,
      response_length: error.message.length,
    });
    return {
      callId: toolCallRequest.callId,
      responseParts: [
        {
          functionResponse: {
            id: toolCallRequest.callId,
            name: toolCallRequest.name,
            response: { error: error.message },
          },
        },
      ],
      resultDisplay: error.message,
      error,
    };
  }
}
