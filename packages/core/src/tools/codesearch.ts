/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, Icon, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { Config } from '../config/config.js';

export interface CodeSearchToolParams {
  query: string;
  tokensNum?: number;
}

const API_CONFIG = {
  BASE_URL: "https://mcp.exa.ai",
  ENDPOINTS: {
    CONTEXT: "/mcp",
  },
} as const;

interface McpCodeRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params: {
    name: string;
    arguments: {
      query: string;
      tokensNum: number;
    };
  };
}

interface McpCodeResponse {
  jsonrpc: string;
  result: {
    content: Array<{
      type: string;
      text: string;
    }>;
  };
}

export class CodeSearchTool extends BaseTool<CodeSearchToolParams, ToolResult> {
  static readonly Name = 'codesearch';

  constructor(private readonly config: Config) {
    super(
      CodeSearchTool.Name,
      'Code Search',
      'Search code to find relevant context for APIs, Libraries, and SDKs. Useful for finding examples and documentation for external libraries.',
      Icon.Globe,
      {
        properties: {
          query: {
            type: Type.STRING,
            description: "Search query to find relevant context for APIs, Libraries, and SDKs. For example, 'React useState hook examples', 'Python pandas dataframe filtering', 'Express.js middleware'.",
          },
          tokensNum: {
            type: Type.NUMBER,
            description: "Number of tokens to return (1000-50000). Default is 5000 tokens.",
          },
        },
        required: ['query'],
        type: Type.OBJECT,
      }
    );
  }

  validateToolParams(params: CodeSearchToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }
    return null;
  }

  async execute(
    params: CodeSearchToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const tokensNum = params.tokensNum || 5000;

    const codeRequest: McpCodeRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "get_code_context_exa",
        arguments: {
          query: params.query,
          tokensNum: tokensNum,
        },
      },
    };

    try {
      const headers: Record<string, string> = {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      };

      const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.CONTEXT}`, {
        method: "POST",
        headers,
        body: JSON.stringify(codeRequest),
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Code search error (${response.status}): ${errorText}`);
      }

      const responseText = await response.text();

      // Parse SSE response
      // The exa.ai MCP server returns SSE events, we need to parse them to get the JSON result
      const lines = responseText.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const data: McpCodeResponse = JSON.parse(line.substring(6));
            if (data.result && data.result.content && data.result.content.length > 0) {
              const content = data.result.content[0].text;
              return {
                llmContent: content,
                returnDisplay: "Found code context from Exa.ai",
              };
            }
          } catch (e) {
            // Check if it is [DONE]
            if (line.includes("[DONE]")) continue;
            console.warn("Failed to parse SSE data line:", line, e);
          }
        }
      }

      return {
        llmContent: "No code snippets or documentation found. Please try a different query.",
        returnDisplay: "No results found",
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error executing code search: ${errorMsg}`,
        returnDisplay: `Error: ${errorMsg}`,
      };
    }
  }
}
