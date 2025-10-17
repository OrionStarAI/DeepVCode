/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolMcpConfirmationDetails,
  Icon,
} from './tools.js';
import {
  CallableTool,
  Part,
  FunctionCall,
  FunctionDeclaration,
  Type,
  Schema,
} from '@google/genai';

type ToolParams = Record<string, unknown>;

export class DiscoveredMCPTool extends BaseTool<ToolParams, ToolResult> {
  private static readonly allowlist: Set<string> = new Set();

  constructor(
    private readonly mcpTool: CallableTool,
    readonly serverName: string,
    readonly serverToolName: string,
    description: string,
    readonly parameterSchemaJson: unknown,
    readonly timeout?: number,
    readonly trust?: boolean,
    nameOverride?: string,
  ) {
    super(
      nameOverride ?? generateValidName(serverName, serverToolName),
      `${serverToolName} (${serverName} MCP Server)`,
      description,
      Icon.Hammer,
      { type: Type.OBJECT }, // this is a dummy Schema for MCP, will be not be used to construct the FunctionDeclaration
      true, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  asFullyQualifiedTool(): DiscoveredMCPTool {
    return new DiscoveredMCPTool(
      this.mcpTool,
      this.serverName,
      this.serverToolName,
      this.description,
      this.parameterSchemaJson,
      this.timeout,
      this.trust,
      `${this.serverName}__${this.serverToolName}`,
    );
  }

  /**
   * Overrides the base schema to use parametersJsonSchema when building
   * FunctionDeclaration
   */
  override get schema(): FunctionDeclaration {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameterSchemaJson as Schema,
    };
  }

  async shouldConfirmExecute(
    _params: ToolParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    const serverAllowListKey = this.serverName;
    const toolAllowListKey = `${this.serverName}.${this.serverToolName}`;

    if (this.trust) {
      return false; // server is trusted, no confirmation needed
    }

    if (
      DiscoveredMCPTool.allowlist.has(serverAllowListKey) ||
      DiscoveredMCPTool.allowlist.has(toolAllowListKey)
    ) {
      return false; // server and/or tool already allowlisted
    }

    const confirmationDetails: ToolMcpConfirmationDetails = {
      type: 'mcp',
      title: 'Confirm MCP Tool Execution',
      serverName: this.serverName,
      toolName: this.serverToolName, // Display original tool name in confirmation
      toolDisplayName: this.name, // Display global registry name exposed to model and user
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlwaysServer) {
          DiscoveredMCPTool.allowlist.add(serverAllowListKey);
        } else if (outcome === ToolConfirmationOutcome.ProceedAlwaysTool) {
          DiscoveredMCPTool.allowlist.add(toolAllowListKey);
        }
      },
    };
    return confirmationDetails;
  }

  async execute(
    params: ToolParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    // 🎯 检查是否已被取消
    if (signal.aborted) {
      throw new Error('MCP tool execution was cancelled by user');
    }

    const functionCalls: FunctionCall[] = [
      {
        name: this.serverToolName,
        args: params,
      },
    ];

    // 🎯 在调用MCP工具前再次检查取消状态
    if (signal.aborted) {
      throw new Error('MCP tool execution was cancelled by user');
    }

    // 🎯 使用带超时和取消支持的Promise包装MCP调用
    const responseParts: Part[] = await this.executeWithCancellation(
      functionCalls,
      signal,
      updateOutput,
    );

    // fix name override for functionResponse
    for (const part of responseParts) {
      if (part.functionResponse) {
        part.functionResponse.name = this.name;
      }
    }

    return {
      llmContent: responseParts,
      returnDisplay: getStringifiedResultForDisplay(responseParts),
    };
  }

  /**
   * 🎯 执行MCP工具调用，支持取消和超时
   */
  private async executeWithCancellation(
    functionCalls: FunctionCall[],
    signal: AbortSignal,
    updateOutput?: (output: string) => void,
  ): Promise<Part[]> {
    // 创建一个Promise来处理MCP调用
    const mcpCallPromise = this.mcpTool.callTool(functionCalls);

    // 创建一个取消Promise
    const cancelPromise = new Promise<never>((_, reject) => {
      if (signal.aborted) {
        reject(new Error('MCP tool execution was cancelled by user'));
        return;
      }

      const abortHandler = () => {
        console.debug(`[MCP Tool] ${this.name} execution cancelled by user`);
        reject(new Error('MCP tool execution was cancelled by user'));
      };

      signal.addEventListener('abort', abortHandler, { once: true });
    });

    // 创建超时Promise（如果配置了超时）
    let timeoutPromise: Promise<never> | null = null;
    let timeoutId: NodeJS.Timeout | undefined;

    if (this.timeout && this.timeout > 0) {
      timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          console.debug(`[MCP Tool] ${this.name} execution timed out after ${this.timeout}ms`);
          reject(new Error(`MCP tool execution timed out after ${this.timeout}ms`));
        }, this.timeout);
      });
    }

    try {
      // 🎯 使用Promise.race来处理取消、超时和正常执行
      const promises: Promise<Part[]>[] = [mcpCallPromise, cancelPromise];
      if (timeoutPromise) {
        promises.push(timeoutPromise);
      }

      const result = await Promise.race(promises);

      // 清理超时定时器
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      return result;
    } catch (error) {
      // 清理超时定时器
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // 重新抛出错误
      throw error;
    }
  }
}

/**
 * Processes an array of `Part` objects, primarily from a tool's execution result,
 * to generate a user-friendly string representation, typically for display in a CLI.
 *
 * The `result` array can contain various types of `Part` objects:
 * 1. `FunctionResponse` parts:
 *    - If the `response.content` of a `FunctionResponse` is an array consisting solely
 *      of `TextPart` objects, their text content is concatenated into a single string.
 *      This is to present simple textual outputs directly.
 *    - If `response.content` is an array but contains other types of `Part` objects (or a mix),
 *      the `content` array itself is preserved. This handles structured data like JSON objects or arrays
 *      returned by a tool.
 *    - If `response.content` is not an array or is missing, the entire `functionResponse`
 *      object is preserved.
 * 2. Other `Part` types (e.g., `TextPart` directly in the `result` array):
 *    - These are preserved as is.
 *
 * All processed parts are then collected into an array, which is JSON.stringify-ed
 * with indentation and wrapped in a markdown JSON code block.
 */
function getStringifiedResultForDisplay(result: Part[]) {
  if (!result || result.length === 0) {
    return '```json\n[]\n```';
  }

  const processFunctionResponse = (part: Part) => {
    if (part.functionResponse) {
      const responseContent = part.functionResponse.response?.content;
      if (responseContent && Array.isArray(responseContent)) {
        // Check if all parts in responseContent are simple TextParts
        const allTextParts = responseContent.every(
          (p: Part) => p.text !== undefined,
        );
        if (allTextParts) {
          return responseContent.map((p: Part) => p.text).join('');
        }
        // If not all simple text parts, return the array of these content parts for JSON stringification
        return responseContent;
      }

      // If no content, or not an array, or not a functionResponse, stringify the whole functionResponse part for inspection
      return part.functionResponse;
    }
    return part; // Fallback for unexpected structure or non-FunctionResponsePart
  };

  const processedResults =
    result.length === 1
      ? processFunctionResponse(result[0])
      : result.map(processFunctionResponse);
  if (typeof processedResults === 'string') {
    return processedResults;
  }

  return '```json\n' + JSON.stringify(processedResults, null, 2) + '\n```';
}

/** Visible for testing */
export function generateValidName(serverName: string , name: string) {
  // Replace invalid characters (based on 400 error message from Gemini API) with underscores
  let validServerName = serverName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  let validToolname = name.replace(/[^a-zA-Z0-9_.-]/g, '_');

  // If longer than 63 characters, replace middle with '___'
  // (Gemini API says max length 64, but actual limit seems to be 63)
  if (validToolname.length > 63) {
    validToolname =
      validToolname.slice(0, 28) + '___' + validToolname.slice(-32);
  }
  return validServerName + '_' + validToolname;
}
