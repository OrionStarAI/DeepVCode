/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import type { HookPlanner, HookEventContext } from './hookPlanner.js';
import type { HookRunner } from './hookRunner.js';
import type { HookAggregator, AggregatedHookResult, HookMessage } from './hookAggregator.js';
import { HookEventName } from './types.js';
import type {
  HookInput,
  BeforeToolInput,
  AfterToolInput,
  BeforeAgentInput,
  NotificationInput,
  AfterAgentInput,
  SessionStartInput,
  SessionEndInput,
  PreCompressInput,
  BeforeModelInput,
  AfterModelInput,
  BeforeToolSelectionInput,
  NotificationType,
  SessionStartSource,
  SessionEndReason,
  PreCompressTrigger,
  HookExecutionResult,
} from './types.js';
import { defaultHookTranslator } from './hookTranslator.js';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from '@google/genai';
import { debugLogger } from '../utils/debugLogger.js';

/**
 * Validates that a value is a non-null object
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Hook event bus that coordinates hook execution across the system
 */
export class HookEventHandler {
  private readonly config: Config;
  private readonly hookPlanner: HookPlanner;
  private readonly hookRunner: HookRunner;
  private readonly hookAggregator: HookAggregator;

  constructor(
    config: Config,
    hookPlanner: HookPlanner,
    hookRunner: HookRunner,
    hookAggregator: HookAggregator,
  ) {
    this.config = config;
    this.hookPlanner = hookPlanner;
    this.hookRunner = hookRunner;
    this.hookAggregator = hookAggregator;
  }

  /**
   * Fire a BeforeTool event
   */
  async fireBeforeToolEvent(
    toolName: string,
    toolInput: Record<string, unknown>,
  ): Promise<AggregatedHookResult> {
    const input: BeforeToolInput = {
      ...this.createBaseInput(HookEventName.BeforeTool),
      tool_name: toolName,
      tool_input: toolInput,
    };

    const context: HookEventContext = { toolName };
    return this.executeHooks(HookEventName.BeforeTool, input, context);
  }

  /**
   * Fire an AfterTool event
   */
  async fireAfterToolEvent(
    toolName: string,
    toolInput: Record<string, unknown>,
    toolResponse: Record<string, unknown>,
  ): Promise<AggregatedHookResult> {
    const input: AfterToolInput = {
      ...this.createBaseInput(HookEventName.AfterTool),
      tool_name: toolName,
      tool_input: toolInput,
      tool_response: toolResponse,
    };

    const context: HookEventContext = { toolName };
    return this.executeHooks(HookEventName.AfterTool, input, context);
  }

  /**
   * Fire a BeforeAgent event
   */
  async fireBeforeAgentEvent(prompt: string): Promise<AggregatedHookResult> {
    const input: BeforeAgentInput = {
      ...this.createBaseInput(HookEventName.BeforeAgent),
      prompt,
    };

    return this.executeHooks(HookEventName.BeforeAgent, input);
  }

  /**
   * Fire a Notification event
   */
  async fireNotificationEvent(
    type: NotificationType,
    message: string,
    details: Record<string, unknown>,
  ): Promise<AggregatedHookResult> {
    const input: NotificationInput = {
      ...this.createBaseInput(HookEventName.Notification),
      notification_type: type,
      message,
      details,
    };

    return this.executeHooks(HookEventName.Notification, input);
  }

  /**
   * Fire an AfterAgent event
   */
  async fireAfterAgentEvent(
    prompt: string,
    promptResponse: string,
    stopHookActive: boolean = false,
  ): Promise<AggregatedHookResult> {
    const input: AfterAgentInput = {
      ...this.createBaseInput(HookEventName.AfterAgent),
      prompt,
      prompt_response: promptResponse,
      stop_hook_active: stopHookActive,
    };

    return this.executeHooks(HookEventName.AfterAgent, input);
  }

  /**
   * Fire a SessionStart event
   */
  async fireSessionStartEvent(
    source: SessionStartSource,
  ): Promise<AggregatedHookResult> {
    const input: SessionStartInput = {
      ...this.createBaseInput(HookEventName.SessionStart),
      source,
    };

    const context: HookEventContext = { trigger: source };
    return this.executeHooks(HookEventName.SessionStart, input, context);
  }

  /**
   * Fire a SessionEnd event
   */
  async fireSessionEndEvent(
    reason: SessionEndReason,
  ): Promise<AggregatedHookResult> {
    const input: SessionEndInput = {
      ...this.createBaseInput(HookEventName.SessionEnd),
      reason,
    };

    const context: HookEventContext = { trigger: reason };
    return this.executeHooks(HookEventName.SessionEnd, input, context);
  }

  /**
   * Fire a PreCompress event
   */
  async firePreCompressEvent(
    trigger: PreCompressTrigger,
  ): Promise<AggregatedHookResult> {
    const input: PreCompressInput = {
      ...this.createBaseInput(HookEventName.PreCompress),
      trigger,
    };

    const context: HookEventContext = { trigger };
    return this.executeHooks(HookEventName.PreCompress, input, context);
  }

  /**
   * Fire a BeforeModel event
   */
  async fireBeforeModelEvent(
    llmRequest: GenerateContentParameters,
  ): Promise<AggregatedHookResult> {
    const input: BeforeModelInput = {
      ...this.createBaseInput(HookEventName.BeforeModel),
      llm_request: defaultHookTranslator.toHookLLMRequest(llmRequest),
    };

    return this.executeHooks(HookEventName.BeforeModel, input);
  }

  /**
   * Fire an AfterModel event
   */
  async fireAfterModelEvent(
    llmRequest: GenerateContentParameters,
    llmResponse: GenerateContentResponse,
  ): Promise<AggregatedHookResult> {
    const input: AfterModelInput = {
      ...this.createBaseInput(HookEventName.AfterModel),
      llm_request: defaultHookTranslator.toHookLLMRequest(llmRequest),
      llm_response: defaultHookTranslator.toHookLLMResponse(llmResponse),
    };

    return this.executeHooks(HookEventName.AfterModel, input);
  }

  /**
   * Fire a BeforeToolSelection event
   */
  async fireBeforeToolSelectionEvent(
    llmRequest: GenerateContentParameters,
  ): Promise<AggregatedHookResult> {
    const input: BeforeToolSelectionInput = {
      ...this.createBaseInput(HookEventName.BeforeToolSelection),
      llm_request: defaultHookTranslator.toHookLLMRequest(llmRequest),
    };

    return this.executeHooks(HookEventName.BeforeToolSelection, input);
  }

  /**
   * Execute hooks for a specific event
   */
  private async executeHooks(
    eventName: HookEventName,
    input: HookInput,
    context?: HookEventContext,
  ): Promise<AggregatedHookResult> {
    try {
      // Create execution plan
      const plan = this.hookPlanner.createExecutionPlan(eventName, context);

      if (!plan || plan.hookConfigs.length === 0) {
        return {
          success: true,
          allOutputs: [],
          errors: [],
          totalDuration: 0,
          hookMessages: [],
        };
      }

      // Execute hooks according to the plan's strategy
      const results = plan.sequential
        ? await this.hookRunner.executeHooksSequential(
            plan.hookConfigs,
            eventName,
            input,
          )
        : await this.hookRunner.executeHooksParallel(
            plan.hookConfigs,
            eventName,
            input,
          );

      // Aggregate results
      const aggregated = this.hookAggregator.aggregateResults(
        results,
        eventName,
      );

      // Process common hook output fields centrally
      this.processCommonHookOutputFields(aggregated);

      // Log hook execution
      this.logHookExecution(eventName, input, results, aggregated);

      // Output collected hook messages
      this.outputHookMessages(aggregated.hookMessages);

      return aggregated;
    } catch (error) {
      debugLogger.error(`Hook event bus error for ${eventName}: ${error}`);

      return {
        success: false,
        allOutputs: [],
        errors: [error instanceof Error ? error : new Error(String(error))],
        totalDuration: 0,
        hookMessages: [],
      };
    }
  }

  /**
   * Create base hook input with common fields
   */
  private createBaseInput(eventName: HookEventName): HookInput {
    return {
      session_id: this.config.getSessionId(),
      transcript_path: '', // TODO: Implement transcript path when supported
      cwd: this.config.getWorkingDir(),
      hook_event_name: eventName,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Log hook execution for observability
   */
  private logHookExecution(
    eventName: HookEventName,
    _input: HookInput,
    results: HookExecutionResult[],
    aggregated: AggregatedHookResult,
  ): void {
    const successCount = results.filter((r) => r.success).length;
    const errorCount = results.length - successCount;

    if (errorCount > 0) {
      const message = `🪝 Hook execution for ${eventName}: ${successCount} succeeded, ${errorCount} failed (${aggregated.totalDuration}ms)`;
      debugLogger.warn(message);
      // Collect message instead of direct console output
      aggregated.hookMessages.push({
        type: 'execution',
        level: 'warning',
        text: message,
      });
    } else if (results.length > 0) {
      const message = `🪝 Hook execution for ${eventName}: ${successCount} hooks executed successfully (${aggregated.totalDuration}ms)`;
      debugLogger.debug(message);
      // Collect message instead of direct console output
      aggregated.hookMessages.push({
        type: 'execution',
        level: 'success',
        text: message,
      });
    }

    // Log individual hook scripts and their execution details
    for (const result of results) {
      const hookCommand = result.hookConfig?.command || 'unknown';
      const duration = result.duration;
      if (result.success) {
        debugLogger.debug(`  ✓ Hook script: ${hookCommand} (${duration}ms)`);
        aggregated.hookMessages.push({
          type: 'execution',
          level: 'success',
          text: `  ✓ ${hookCommand} (${duration}ms)`,
        });
      } else {
        const errorMsg = result.error?.message || 'Unknown error';
        debugLogger.warn(
          `  ✗ Hook script: ${hookCommand} (${duration}ms) - ${errorMsg}`,
        );
        aggregated.hookMessages.push({
          type: 'execution',
          level: 'error',
          text: `  ✗ ${hookCommand} (${duration}ms) - ${errorMsg}`,
        });
      }
    }

    // Log individual errors
    for (const error of aggregated.errors) {
      debugLogger.error(`Hook execution error: ${error.message}`);
      // Collect message instead of direct console output
      aggregated.hookMessages.push({
        type: 'error',
        level: 'error',
        text: `Hook execution error: ${error.message}`,
      });
    }
  }

  /**
   * Process common hook output fields centrally
   */
  private processCommonHookOutputFields(
    aggregated: AggregatedHookResult,
  ): void {
    if (!aggregated.finalOutput) {
      return;
    }

    // Handle systemMessage - show to user in transcript mode (not to agent)
    const systemMessage = aggregated.finalOutput.systemMessage;
    if (systemMessage && !aggregated.finalOutput.suppressOutput) {
      const message = `🪝 Hook message: ${systemMessage}`;
      debugLogger.warn(message);
      // Collect message instead of direct console output
      aggregated.hookMessages.push({
        type: 'system',
        level: 'info',
        text: message,
      });
    }

    // Handle suppressOutput - already handled by not logging above when true

    // Handle continue=false - this should stop the entire agent execution
    if (aggregated.finalOutput.shouldStopExecution()) {
      const stopReason = aggregated.finalOutput.getEffectiveReason();
      const message = `🪝 Hook requested to stop execution: ${stopReason}`;
      debugLogger.log(message);
      // Collect message instead of direct console output
      aggregated.hookMessages.push({
        type: 'stop',
        level: 'warning',
        text: message,
      });

      // Note: The actual stopping of execution must be handled by integration points
      // as they need to interpret this signal in the context of their specific workflow
      // This is just logging the request centrally
    }

    // Other common fields like decision/reason are handled by specific hook output classes
  }

  /**
   * Output collected hook messages to console
   * This centralizes message output to ensure consistent timing and formatting
   *
   * Note: This method is intentionally NOT called from executeHooks to allow
   * callers to decide whether to output messages based on context.
   * For example, AfterAgent hooks should not output in the middle of a message stream.
   */
  outputHookMessages(messages: HookMessage[]): void {
    for (const msg of messages) {
      let prefix = '';
      switch (msg.level) {
        case 'success':
          prefix = '✓';
          break;
        case 'warning':
          prefix = '⚠';
          break;
        case 'error':
          prefix = '✗';
          break;
        case 'info':
        default:
          prefix = 'ℹ';
          break;
      }
      console.info(`${prefix}  ${msg.text}`);
    }
  }
}
