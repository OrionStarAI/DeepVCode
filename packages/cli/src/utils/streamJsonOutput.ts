/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Stream JSON Output Module - Gemini CLI Compatible
 * Formats output as streaming line-delimited JSON objects.
 * Each event is output as a single line of JSON, immediately flushed to stdout.
 *
 * Compatible with Google Gemini CLI JSON output format.
 */

export type StreamJsonEventType =
  | 'init' // Session initialization
  | 'message' // AI/user message (with delta support)
  | 'tool_use' // Tool function call request
  | 'tool_result' // Tool execution result
  | 'function_call_fixed' // Function call was fixed due to format issues
  | 'error' // General error
  | 'result'; // Final result/statistics

export interface StreamJsonEvent {
  type: StreamJsonEventType;
  timestamp: string;
  [key: string]: unknown;
}

/**
 * Output a JSON event as a single line to stdout
 * Each line is automatically flushed for real-time streaming
 */
export function outputStreamJsonEvent(event: StreamJsonEvent): void {
  const json = JSON.stringify(event);
  process.stdout.write(json + '\n');
}

/**
 * Output initialization event
 * Should be called at the start of the session
 */
export function outputInit(sessionId: string, model: string): void {
  outputStreamJsonEvent({
    type: 'init',
    timestamp: new Date().toISOString(),
    session_id: sessionId,
    model,
  });
}

/**
 * Output message event (user or assistant)
 * Supports delta updates for streaming responses
 */
export function outputMessage(
  role: 'user' | 'assistant',
  content: string,
  delta: boolean = false,
): void {
  outputStreamJsonEvent({
    type: 'message',
    timestamp: new Date().toISOString(),
    role,
    content,
    ...(delta && { delta: true }),
  });
}

/**
 * Output tool use request
 * Compatible with Gemini CLI format
 */
export function outputToolUse(
  toolName: string,
  toolId: string,
  parameters: Record<string, unknown>,
): void {
  outputStreamJsonEvent({
    type: 'tool_use',
    timestamp: new Date().toISOString(),
    tool_name: toolName,
    tool_id: toolId,
    parameters,
  });
}

/**
 * Output tool result
 * Compatible with Gemini CLI format
 */
export function outputToolResult(
  toolId: string,
  status: 'success' | 'error',
  output: unknown,
): void {
  outputStreamJsonEvent({
    type: 'tool_result',
    timestamp: new Date().toISOString(),
    tool_id: toolId,
    status,
    output,
  });
}

/**
 * Output function call fix notification
 */
export function outputFunctionCallFixed(
  callCount: number,
  reason: string,
): void {
  outputStreamJsonEvent({
    type: 'function_call_fixed',
    timestamp: new Date().toISOString(),
    data: {
      callCount,
      reason,
    },
  });
}

/**
 * Output error event
 */
export function outputError(error: string, details?: Record<string, unknown>): void {
  outputStreamJsonEvent({
    type: 'error',
    timestamp: new Date().toISOString(),
    error,
    ...(details && { details }),
  });
}

/**
 * Output final result with statistics
 */
export function outputResult(
  status: 'success' | 'error',
  stats?: Record<string, unknown>,
): void {
  outputStreamJsonEvent({
    type: 'result',
    timestamp: new Date().toISOString(),
    status,
    ...(stats && { stats }),
  });
}
