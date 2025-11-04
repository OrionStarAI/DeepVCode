/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Config,
  ToolCallRequestInfo,
  executeToolCall,
  ToolRegistry,
  shutdownTelemetry,
  isTelemetrySdkInitialized,
  MESSAGE_ROLES,
  MCPDiscoveryState,
  getMCPDiscoveryState,
} from 'deepv-code-core';
import {
  Content,
  Part,
  FunctionCall,
  GenerateContentResponse,
  FinishReason,
} from '@google/genai';
import {
  validateAndFixFunctionCall,
  areAllFunctionCallsValid,
  fixAllFunctionCalls,
  appearIncompleteFromStreaming,
  getModelCapabilities
} from 'deepv-code-core';

import { parseAndFormatApiError } from './ui/utils/errorParsing.js';
import { SceneType } from 'deepv-code-core';

function getResponseText(response: GenerateContentResponse): string | null {
  if (response.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];
    if (
      candidate.content &&
      candidate.content.parts &&
      candidate.content.parts.length > 0
    ) {
      // We are running in headless mode so we don't need to return thoughts to STDOUT.
      const thoughtPart = candidate.content.parts[0];
      if (thoughtPart?.thought) {
        return null;
      }
      return candidate.content.parts
        .filter((part) => part.text)
        .map((part) => part.text)
        .join('');
    }
  }
  return null;
}

/**
 * Wait for MCP discovery to complete
 * Ensures extension tools are available before using them
 */
async function waitForMcpDiscovery(): Promise<void> {
  const startTime = Date.now();
  const timeout = 15000; // 15 seconds timeout
  const checkInterval = 100; // Check every 100ms

  while (Date.now() - startTime < timeout) {
    const state = getMCPDiscoveryState();
    if (state === MCPDiscoveryState.COMPLETED) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  // Timeout reached, but we continue anyway (MCP tools may not be available)
  // This is not a critical failure, so we don't throw an error
}

export async function runNonInteractive(
  config: Config,
  input: string,
  prompt_id: string,
): Promise<void> {
  await config.initialize();

  // Wait for MCP tools to be discovered before proceeding
  // This ensures extension tools are available when sending prompts
  await waitForMcpDiscovery();

  // Handle EPIPE errors when the output is piped to a command that closes early.
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') {
      // Exit gracefully if the pipe is closed.
      process.exit(0);
    }
  });

  const geminiClient = config.getGeminiClient();
  const toolRegistry: ToolRegistry = await config.getToolRegistry();

  const chat = await geminiClient.getChat();
  const abortController = new AbortController();
  let currentMessages: Content[] = [{ role: MESSAGE_ROLES.USER, parts: [{ text: input }] }];
  let turnCount = 0;
  const modelName = config.getModel();
  const modelCapabilities = getModelCapabilities(modelName);
  try {
    while (true) {
      turnCount++;
      if (
        config.getMaxSessionTurns() > 0 &&
        turnCount > config.getMaxSessionTurns()
      ) {
        console.error(
          '\n Reached max session turns for this session. Increase the number of turns by specifying maxSessionTurns in settings.json.',
        );
        return;
      }
      const functionCalls: FunctionCall[] = [];
      let lastFinishReason: FinishReason | undefined;
      let streamingIncomplete = false;

      const responseStream = await chat.sendMessageStream(
        {
          message: currentMessages[0]?.parts || [], // Ensure parts are always provided
          config: {
            abortSignal: abortController.signal,
            tools: [
              { functionDeclarations: toolRegistry.getFunctionDeclarations() },
            ],
          },
        },
        prompt_id,
        SceneType.CHAT_CONVERSATION
      );

      for await (const resp of responseStream) {
        if (abortController.signal.aborted) {
          console.error('Operation cancelled.');
          return;
        }

        // Track finish reason for error handling
        if (resp.candidates?.[0]?.finishReason) {
          lastFinishReason = resp.candidates[0].finishReason;
        }

        const textPart = getResponseText(resp);
        if (textPart) {
          process.stdout.write(textPart);
        }
        if (resp.functionCalls) {
          functionCalls.push(...resp.functionCalls);
        }
      }

      // Check for streaming completeness issues in small models
      if (modelCapabilities.proneToIncompleteStream && functionCalls.length > 0) {
        streamingIncomplete = appearIncompleteFromStreaming(functionCalls, modelName);

        if (streamingIncomplete) {
          console.error('\n⚠️  Detected incomplete function calls from streaming. Attempting to fix...');
        }
      }

      if (functionCalls.length > 0) {
        // Validate and fix function calls for small models
        let processedFunctionCalls = functionCalls;

        if (modelCapabilities.needsFormatTolerance || streamingIncomplete) {
          const allValid = areAllFunctionCallsValid(functionCalls, modelName);

          if (!allValid || streamingIncomplete) {
            console.error('\n🔧 Fixing function call format issues...');
            processedFunctionCalls = fixAllFunctionCalls(functionCalls, modelName);

            // Validate again after fixing
            const stillInvalid = !areAllFunctionCallsValid(processedFunctionCalls, modelName);
            if (stillInvalid && !modelCapabilities.enableMalformedRetry) {
              console.error('\n❌ Function calls remain invalid after fixing. Aborting.');
              process.exit(1);
            }
          }
        }

        // Handle malformed function call finish reason
        if (lastFinishReason === FinishReason.MALFORMED_FUNCTION_CALL && modelCapabilities.enableMalformedRetry) {
          console.error('\n🔄 Model reported malformed function call. Retrying with fixed format...');
          processedFunctionCalls = fixAllFunctionCalls(functionCalls, modelName);
        }

        const toolResponseParts: Part[] = [];
        let failedToolCount = 0;
        const maxConcurrent = modelCapabilities.maxConcurrentTools;

        // Process tools with concurrency limit for small models
        const chunkedCalls = [];
        for (let i = 0; i < processedFunctionCalls.length; i += maxConcurrent) {
          chunkedCalls.push(processedFunctionCalls.slice(i, i + maxConcurrent));
        }

        for (const chunk of chunkedCalls) {
          const chunkPromises = chunk.map(async (fc) => {
            const callId = fc.id ?? `${fc.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const requestInfo: ToolCallRequestInfo = {
              callId,
              name: fc.name as string,
              args: (fc.args ?? {}) as Record<string, unknown>,
              isClientInitiated: false,
              prompt_id,
            };

            try {
              const toolResponse = await executeToolCall(
                config,
                requestInfo,
                toolRegistry,
                abortController.signal,
              );

              if (toolResponse.error) {
                const isToolNotFound = toolResponse.error.message.includes(
                  'not found in registry',
                );
                console.error(
                  `Error executing tool ${fc.name}: ${toolResponse.resultDisplay || toolResponse.error.message}`,
                );
                if (!isToolNotFound) {
                  failedToolCount++;
                  if (failedToolCount > 2 && !modelCapabilities.enableProgressiveDegradation) {
                    process.exit(1);
                  }
                }
                return null;
              }

              return toolResponse;
            } catch (error) {
              console.error(`Exception executing tool ${fc.name}:`, error);
              failedToolCount++;
              return null;
            }
          });

          const chunkResults = await Promise.all(chunkPromises);

          for (const toolResponse of chunkResults) {
            if (toolResponse?.responseParts) {
              const parts = Array.isArray(toolResponse.responseParts)
                ? toolResponse.responseParts
                : [toolResponse.responseParts];
              for (const part of parts) {
                if (typeof part === 'string') {
                  toolResponseParts.push({ text: part });
                } else if (part) {
                  toolResponseParts.push(part);
                }
              }
            }
          }
        }

        if (toolResponseParts.length === 0 && failedToolCount > 0) {
          console.error('\n❌ All tool calls failed. Exiting.');
          process.exit(1);
        }

        currentMessages = [{ role: MESSAGE_ROLES.USER, parts: toolResponseParts }];
      } else {
        process.stdout.write('\n'); // Ensure a final newline
        return;
      }
    }
  } catch (error) {
    console.error(
      parseAndFormatApiError(
        error,
        config.getContentGeneratorConfig()?.authType,
      ),
    );
    process.exit(1);
  } finally {
    if (isTelemetrySdkInitialized()) {
      await shutdownTelemetry();
    }
  }
}
