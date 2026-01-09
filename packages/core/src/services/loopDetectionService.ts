/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'crypto';
import { GeminiEventType, ServerGeminiStreamEvent } from '../core/turn.js';
import { logLoopDetected } from '../telemetry/loggers.js';
import { LoopDetectedEvent, LoopType } from '../telemetry/types.js';
import { Config, DEFAULT_GEMINI_FLASH_MODEL } from '../config/config.js';
import { MESSAGE_ROLES } from '../config/messageRoles.js';
import { SchemaUnion, Type } from '@google/genai';


const TOOL_CALL_LOOP_THRESHOLD = 10;
const CONTENT_LOOP_THRESHOLD = 20;
const CONTENT_CHUNK_SIZE = 500;
const MAX_HISTORY_LENGTH = 10000;

/**
 * Tools that preview models tend to abuse or get stuck in loops with.
 * When preview models call the same tool repeatedly (with different args),
 * they often exhaust context and API quotas without making progress.
 *
 * Add tools to this list when you observe preview models getting stuck in loops with them.
 */
const PREVIEW_MONITORED_TOOLS = new Set([
  'read_file',
  'read_many_files',
  'glob',
  'search_file_content',
  'ls',
  'replace',
  'write_file',
  'delete_file',
  'shell',
]);

/**
 * Threshold for detecting same-tool-name loops in preview models.
 * When a preview model calls any tool in PREVIEW_MONITORED_TOOLS this many times
 * consecutively (ignoring args), it's considered a loop.
 */
const PREVIEW_TOOL_LOOP_THRESHOLD = 30;

/**
 * The number of recent conversation turns to include in the history when asking the LLM to check for a loop.
 */
const LLM_LOOP_CHECK_HISTORY_COUNT = 20;

/**
 * The number of turns that must pass in a single prompt before the LLM-based loop check is activated.
 */
const LLM_CHECK_AFTER_TURNS = 30;

/**
 * The default interval, in number of turns, at which the LLM-based loop check is performed.
 * This value is adjusted dynamically based on the LLM's confidence.
 */
const DEFAULT_LLM_CHECK_INTERVAL = 3;

/**
 * The minimum interval for LLM-based loop checks.
 * This is used when the confidence of a loop is high, to check more frequently.
 */
const MIN_LLM_CHECK_INTERVAL = 5;

/**
 * The maximum interval for LLM-based loop checks.
 * This is used when the confidence of a loop is low, to check less frequently.
 */
const MAX_LLM_CHECK_INTERVAL = 15;

/**
 * 使用统一接口进行循环检测
 */
async function callGeminiLoopDetectionAPI(
  contents: any[],
  schema: any,
  abortSignal: AbortSignal,
  config: Config,
): Promise<any> {
  // 🔄 使用统一的DeepVServerAdapter接口
  const deepVAdapter = config.getGeminiClient()?.getContentGenerator() as any;
  if (!deepVAdapter) {
    throw new Error('DeepVServerAdapter not available');
  }

  console.log(`[LoopDetection] Calling unified interface for loop detection`);

  const response = await deepVAdapter.generateContent({
    contents: contents,
    config: {
      responseMimeType: 'application/json',
      abortSignal: abortSignal,
      httpOptions: {
        headers: {
          'X-Scene-Type': 'json_generation',
          'X-Request-ID': `loop-detection-${Date.now()}`,
        }
      }
    }
  }, 'json_generation');

  console.log(`[LoopDetection] Loop detection completed successfully`);

  return response;
}

/**
 * Service for detecting and preventing infinite loops in AI responses.
 * Monitors tool call repetitions and content sentence repetitions.
 */
export class LoopDetectionService {
  private readonly config: Config;
  private promptId = '';
  private isPreviewModel: boolean = false;

  // Tool call tracking
  private lastToolCallKey: string | null = null;
  private toolCallRepetitionCount: number = 0;

  // Preview model: track consecutive tool name calls (ignoring args)
  private lastToolName: string | null = null;
  private consecutiveToolNameCount: number = 0;

  // Content streaming tracking
  private streamContentHistory = '';
  private contentStats = new Map<string, number[]>();
  private lastContentIndex = 0;
  private loopDetected = false;
  private detectedLoopType: LoopType | null = null; // Track which type of loop was detected

  // LLM loop track tracking
  private turnsInCurrentPrompt = 0;
  private llmCheckInterval = DEFAULT_LLM_CHECK_INTERVAL;
  private lastCheckTurn = 0;

  constructor(config: Config) {
    this.config = config;
  }

  private getToolCallKey(toolCall: { name: string; args: object }): string {
    const argsString = JSON.stringify(toolCall.args);
    const keyString = `${toolCall.name}:${argsString}`;
    return createHash('sha256').update(keyString).digest('hex');
  }

  /**
   * Processes a stream event and checks for loop conditions.
   * @param event - The stream event to process
   * @returns true if a loop is detected, false otherwise
   */
  addAndCheck(event: ServerGeminiStreamEvent): boolean {
    if (this.loopDetected) {
      return true;
    }

    switch (event.type) {
      case GeminiEventType.ToolCallRequest:
        // content chanting only happens in one single stream, reset if there
        // is a tool call in between
        this.resetContentTracking();
        this.loopDetected = this.checkToolCallLoop(event.value);
        break;
      case GeminiEventType.Content:
        this.loopDetected = this.checkContentLoop(event.value);
        break;
      default:
        break;
    }
    return this.loopDetected;
  }

  /**
   * Signals the start of a new turn in the conversation.
   *
   * This method increments the turn counter and, if specific conditions are met,
   * triggers an LLM-based check to detect potential conversation loops. The check
   * is performed periodically based on the `llmCheckInterval`.
   *
   * @param signal - An AbortSignal to allow for cancellation of the asynchronous LLM check.
   * @returns A promise that resolves to `true` if a loop is detected, and `false` otherwise.
   */
  async turnStarted(signal: AbortSignal) {
    this.turnsInCurrentPrompt++;

    if (
      this.turnsInCurrentPrompt >= LLM_CHECK_AFTER_TURNS &&
      this.turnsInCurrentPrompt - this.lastCheckTurn >= this.llmCheckInterval
    ) {
      this.lastCheckTurn = this.turnsInCurrentPrompt;
      return await this.checkForLoopWithLLM(signal);
    }

    return false;
  }

  private checkToolCallLoop(toolCall: { name: string; args: object }): boolean {
    // Check 1: Standard exact match detection (name + args hash)
    const key = this.getToolCallKey(toolCall);
    if (this.lastToolCallKey === key) {
      this.toolCallRepetitionCount++;
    } else {
      this.lastToolCallKey = key;
      this.toolCallRepetitionCount = 1;
    }

    if (this.toolCallRepetitionCount >= TOOL_CALL_LOOP_THRESHOLD) {
      this.detectedLoopType = LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS;
      logLoopDetected(
        this.config,
        new LoopDetectedEvent(
          LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS,
          this.promptId,
        ),
      );
      return true;
    }

    // Check 2: Preview model strict checking (tool name only, ignoring args)
    if (this.isPreviewModel) {
      return this.checkPreviewModelToolNameLoop(toolCall);
    }

    return false;
  }

  /**
   * Strict loop detection for preview models.
   * Preview models often call the same tool repeatedly with different args,
   * which can exhaust context and API quotas without making meaningful progress.
   *
   * Strategy:
   * - Track consecutive same tool name calls (ignoring args)
   * - Intensive I/O tools (read_file, etc.): threshold = 4
   * - Other tools: threshold = 5
   */
  private checkPreviewModelToolNameLoop(toolCall: { name: string; args: object }): boolean {
    const toolName = toolCall.name;

    // Only check tools that are known to cause loops in preview models
    if (!PREVIEW_MONITORED_TOOLS.has(toolName)) {
      this.lastToolName = null;
      this.consecutiveToolNameCount = 0;
      return false;
    }

    if (this.lastToolName === toolName) {
      this.consecutiveToolNameCount++;
    } else {
      this.lastToolName = toolName;
      this.consecutiveToolNameCount = 1;
    }

    if (this.consecutiveToolNameCount >= PREVIEW_TOOL_LOOP_THRESHOLD) {
      console.warn(
        `[LoopDetection] Preview model loop detected: tool '${toolName}' called consecutively ${this.consecutiveToolNameCount} times (threshold: ${PREVIEW_TOOL_LOOP_THRESHOLD})`
      );
      this.detectedLoopType = LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS;
      logLoopDetected(
        this.config,
        new LoopDetectedEvent(
          LoopType.CONSECUTIVE_IDENTICAL_TOOL_CALLS,
          this.promptId,
        ),
      );
      return true;
    }

    return false;
  }

  /**
   * Detects content loops by analyzing streaming text for repetitive patterns.
   *
   * The algorithm works by:
   * 1. Appending new content to the streaming history
   * 2. Truncating history if it exceeds the maximum length
   * 3. Analyzing content chunks for repetitive patterns using hashing
   * 4. Detecting loops when identical chunks appear frequently within a short distance
   */
  private checkContentLoop(content: string): boolean {
    this.streamContentHistory += content;

    this.truncateAndUpdate();
    return this.analyzeContentChunksForLoop();
  }

  /**
   * Truncates the content history to prevent unbounded memory growth.
   * When truncating, adjusts all stored indices to maintain their relative positions.
   */
  private truncateAndUpdate(): void {
    if (this.streamContentHistory.length <= MAX_HISTORY_LENGTH) {
      return;
    }

    // Calculate how much content to remove from the beginning
    const truncationAmount =
      this.streamContentHistory.length - MAX_HISTORY_LENGTH;
    this.streamContentHistory =
      this.streamContentHistory.slice(truncationAmount);
    this.lastContentIndex = Math.max(
      0,
      this.lastContentIndex - truncationAmount,
    );

    // Update all stored chunk indices to account for the truncation
    for (const [hash, oldIndices] of this.contentStats.entries()) {
      const adjustedIndices = oldIndices
        .map((index) => index - truncationAmount)
        .filter((index) => index >= 0);

      if (adjustedIndices.length > 0) {
        this.contentStats.set(hash, adjustedIndices);
      } else {
        this.contentStats.delete(hash);
      }
    }
  }

  /**
   * Analyzes content in fixed-size chunks to detect repetitive patterns.
   *
   * Uses a sliding window approach:
   * 1. Extract chunks of fixed size (CONTENT_CHUNK_SIZE)
   * 2. Hash each chunk for efficient comparison
   * 3. Track positions where identical chunks appear
   * 4. Detect loops when chunks repeat frequently within a short distance
   */
  private analyzeContentChunksForLoop(): boolean {
    while (this.hasMoreChunksToProcess()) {
      // Extract current chunk of text
      const currentChunk = this.streamContentHistory.substring(
        this.lastContentIndex,
        this.lastContentIndex + CONTENT_CHUNK_SIZE,
      );
      const chunkHash = createHash('sha256').update(currentChunk).digest('hex');

      if (this.isLoopDetectedForChunk(currentChunk, chunkHash)) {
        this.detectedLoopType = LoopType.CHANTING_IDENTICAL_SENTENCES;
        logLoopDetected(
          this.config,
          new LoopDetectedEvent(
            LoopType.CHANTING_IDENTICAL_SENTENCES,
            this.promptId,
          ),
        );
        return true;
      }

      // Move to next position in the sliding window
      this.lastContentIndex++;
    }

    return false;
  }

  private hasMoreChunksToProcess(): boolean {
    return (
      this.lastContentIndex + CONTENT_CHUNK_SIZE <=
      this.streamContentHistory.length
    );
  }

  /**
   * Checks if a chunk contains meaningful content.
   * Filters out pure whitespace, symbols, and formatting-only chunks.
   * Handles both ASCII and Unicode symbols (including Chinese box-drawing characters).
   */
  private hasSignificantContent(chunk: string): boolean {
    const trimmed = chunk.trim();

    if (trimmed.length < 15) {
      return false;
    }

    // Filter pure whitespace/newlines
    if (/^[\s\t\n\r]*$/.test(chunk)) {
      return false;
    }

    // Filter ASCII symbols and common formatting characters
    if (/^[\s\-=*_+|#.`\/\\~]+$/.test(chunk)) {
      return false;
    }

    // Filter Unicode box-drawing and border characters (Chinese/Japanese style)
    // Includes: ─ ═ ━ │ ║ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼ etc.
    if (/^[\s\u2500-\u257F┌┐└┘├┤┬┴┼]+$/.test(chunk)) {
      return false;
    }

    return true;
  }

  /**
   * Identifies common patterns that are likely to repeat naturally:
   * - List items
   * - Variable/function definitions
   * - Common phrases
   * - Code comments
   * - JSON fields
   * - Table structures (pipes, dashes, etc.)
   */
  private isCommonPattern(chunk: string): boolean {
    const commonPatterns = [
      /^[\s]*[-•*]\s+/,
      /^[\s]*(const|let|var|function|def|class|if|else|for|while)\s+/i,
      /^(Let me|I'll|I can|Here's|To |Please|Thanks|Note|import|from)\s+/i,
      /^[\s]*\/\//,
      /^[\s]*#/,
      /^[\s]*"(id|name|email|status|type|value|key|data|message|error|result|code)"\s*:/i,
      /^\s*\|\s+/,
      /\|\s*---\s*\|/,
      /\|\s*\d+[\d,.]*/,
      /\|\s*[一-龥]+\s*\|/,
    ];

    return commonPatterns.some((p) => p.test(chunk));
  }

  /**
   * Detects if a chunk is part of a table structure.
   * Table rows have multiple pipe characters and often contain numbers or aligned text.
   */
  private isTableContent(chunk: string): boolean {
    const pipeCount = (chunk.match(/\|/g) || []).length;
    const hasTableStructure =
      pipeCount >= 2 || /\|\s*---+\s*\|/.test(chunk) || /\|\s*\d+[\d,.]*\s*\|/.test(chunk);

    return hasTableStructure;
  }

  /**
   * Determines if a content chunk indicates a loop pattern.
   *
   * Loop detection logic:
   * 1. Check if we've seen this hash before (new chunks are stored for future comparison)
   * 2. Verify actual content matches to prevent hash collisions
   * 3. Track all positions where this chunk appears
   * 4. A loop is detected when the same chunk appears CONTENT_LOOP_THRESHOLD times
   *    within a small average distance (≤ 1.5 * chunk size)
   */
  private isLoopDetectedForChunk(chunk: string, hash: string): boolean {
    // Filter out chunks with no meaningful content
    if (!this.hasSignificantContent(chunk)) {
      return false;
    }

    const existingIndices = this.contentStats.get(hash);

    if (!existingIndices) {
      this.contentStats.set(hash, [this.lastContentIndex]);
      return false;
    }

    if (!this.isActualContentMatch(chunk, existingIndices[0])) {
      return false;
    }

    existingIndices.push(this.lastContentIndex);

    if (existingIndices.length < CONTENT_LOOP_THRESHOLD) {
      return false;
    }

    // Analyze the most recent occurrences to see if they're clustered closely together
    const recentIndices = existingIndices.slice(-CONTENT_LOOP_THRESHOLD);
    const totalDistance =
      recentIndices[recentIndices.length - 1] - recentIndices[0];
    const averageDistance = totalDistance / (CONTENT_LOOP_THRESHOLD - 1);

    // Use adaptive distance threshold based on chunk type
    let maxAllowedDistance = CONTENT_CHUNK_SIZE * 1.5;

    if (this.isTableContent(chunk)) {
      // Table content has even more natural repetition due to row structure
      // Require much larger distance to avoid false positives
      maxAllowedDistance = CONTENT_CHUNK_SIZE * 6;
    } else if (this.isCommonPattern(chunk)) {
      // Common patterns require larger distance to avoid false positives
      maxAllowedDistance = CONTENT_CHUNK_SIZE * 3;
    }

    return averageDistance <= maxAllowedDistance;
  }

  /**
   * Verifies that two chunks with the same hash actually contain identical content.
   * This prevents false positives from hash collisions.
   */
  private isActualContentMatch(
    currentChunk: string,
    originalIndex: number,
  ): boolean {
    const originalChunk = this.streamContentHistory.substring(
      originalIndex,
      originalIndex + CONTENT_CHUNK_SIZE,
    );
    return originalChunk === currentChunk;
  }

  private async checkForLoopWithLLM(signal: AbortSignal) {
    const recentHistory = this.config
      .getGeminiClient()
      .getHistory()
      .slice(-LLM_LOOP_CHECK_HISTORY_COUNT);

    const prompt = `You are a sophisticated AI diagnostic agent specializing in identifying when a conversational AI is stuck in an unproductive state. Your task is to analyze the provided conversation history and determine if the assistant has ceased to make meaningful progress.

An unproductive state is characterized by one or more of the following patterns over the last 5 or more assistant turns:

Repetitive Actions: The assistant repeats the same tool calls or conversational responses a decent number of times. This includes simple loops (e.g., tool_A, tool_A, tool_A) and alternating patterns (e.g., tool_A, tool_B, tool_A, tool_B, ...).

Cognitive Loop: The assistant seems unable to determine the next logical step. It might express confusion, repeatedly ask the same questions, or generate responses that don't logically follow from the previous turns, indicating it's stuck and not advancing the task.

Crucially, differentiate between a true unproductive state and legitimate, incremental progress.
For example, a series of 'tool_A' or 'tool_B' tool calls that make small, distinct changes to the same file (like adding docstrings to functions one by one) is considered forward progress and is NOT a loop. A loop would be repeatedly replacing the same text with the same content, or cycling between a small set of files with no net change.

Please analyze the conversation history to determine the possibility that the conversation is stuck in a repetitive, non-productive state.`;
    const contents = [
      ...recentHistory,
      { role: MESSAGE_ROLES.USER, parts: [{ text: prompt }] },
    ];
    const schema: SchemaUnion = {
      type: Type.OBJECT,
      properties: {
        reasoning: {
          type: Type.STRING,
          description:
            'Your reasoning on if the conversation is looping without forward progress.',
        },
        confidence: {
          type: Type.NUMBER,
          description:
            'A number between 0.0 and 1.0 representing your confidence that the conversation is in an unproductive state.',
        },
      },
      required: ['reasoning', 'confidence'],
    };
    let result;
    try {
      result = await callGeminiLoopDetectionAPI(contents, schema, signal, this.config);
    } catch (e) {
      // Do nothing, treat it as a non-loop.
      this.config.getDebugMode() ? console.error(e) : console.debug(e);
      return false;
    }

    if (typeof result.confidence === 'number') {
      if (result.confidence > 0.9) {
        if (typeof result.reasoning === 'string' && result.reasoning) {
          console.warn(result.reasoning);
        }
        this.detectedLoopType = LoopType.LLM_DETECTED_LOOP;
        logLoopDetected(
          this.config,
          new LoopDetectedEvent(LoopType.LLM_DETECTED_LOOP, this.promptId),
        );
        return true;
      } else {
        this.llmCheckInterval = Math.round(
          MIN_LLM_CHECK_INTERVAL +
            (MAX_LLM_CHECK_INTERVAL - MIN_LLM_CHECK_INTERVAL) *
              (1 - result.confidence),
        );
      }
    }
    return false;
  }

  /**
   * Resets all loop detection state.
   */
  reset(promptId: string): void {
    this.promptId = promptId;

    // Detect if current model is a preview model for stricter checking
    const currentModel = this.config.getModel();
    this.isPreviewModel = /preview/i.test(currentModel);
    if (this.isPreviewModel) {
      console.log(`[LoopDetection] Detected preview model: ${currentModel}, enabling strict tool-name checking`);
    }

    this.resetToolCallCount();
    this.resetContentTracking();
    this.resetLlmCheckTracking();
    this.loopDetected = false;
    this.detectedLoopType = null;
  }

  private resetToolCallCount(): void {
    this.lastToolCallKey = null;
    this.toolCallRepetitionCount = 0;
    this.lastToolName = null;
    this.consecutiveToolNameCount = 0;
  }

  private resetContentTracking(resetHistory = true): void {
    if (resetHistory) {
      this.streamContentHistory = '';
    }
    this.contentStats.clear();
    this.lastContentIndex = 0;
  }

  private resetLlmCheckTracking(): void {
    this.turnsInCurrentPrompt = 0;
    this.llmCheckInterval = DEFAULT_LLM_CHECK_INTERVAL;
    this.lastCheckTurn = 0;
  }

  /**
   * Returns the type of loop detected, if any.
   */
  getDetectedLoopType(): LoopType | null {
    return this.detectedLoopType;
  }
}
