/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { BaseTool, Icon, ToolResult, ToolExecutionServices } from './tools.js';
import { Config } from '../config/config.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { t } from '../utils/simpleI18n.js';

interface BatchToolParams {
    tool_calls: Array<{
        tool: string;
        parameters: Record<string, unknown>;
    }>;
}

export class BatchTool extends BaseTool<BatchToolParams, ToolResult> {
    static readonly Name = 'batch';

    constructor(private readonly config: Config) {
        super(
            BatchTool.Name,
            'Batch',
            `Execute multiple independent tools sequentially.

Use this tool ONLY when you need to perform 5+ truly independent operations that have no sequential dependencies. For most cases, prefer individual tool calls in sequence.

AVOID using batch for:
- Operations with dependencies (one result feeds into another)
- File edits followed by testing/validation
- Less than 5 independent operations
- Different tool types that may need result inspection between calls

Example (when appropriate - 5+ independent file reads):
[
  {"tool": "read_file", "parameters": {"absolute_path": "/path/to/file1.ts"}},
  {"tool": "read_file", "parameters": {"absolute_path": "/path/to/file2.ts"}},
  {"tool": "read_file", "parameters": {"absolute_path": "/path/to/file3.ts"}},
  {"tool": "read_file", "parameters": {"absolute_path": "/path/to/file4.ts"}},
  {"tool": "read_file", "parameters": {"absolute_path": "/path/to/file5.ts"}}
]`,
            Icon.Tasks,
            {
                properties: {
                    tool_calls: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                tool: { type: Type.STRING, description: 'The name of the tool to execute.' },
                                parameters: { type: Type.OBJECT, description: 'Parameters for the tool.' },
                            },
                            required: ['tool', 'parameters'],
                        },
                        description: 'Array of tool calls to execute.',
                    },
                },
                required: ['tool_calls'],
                type: Type.OBJECT,
            }
        );
    }

    validateToolParams(params: BatchToolParams): string | null {
        const errors = SchemaValidator.validate(this.schema.parameters, params, BatchTool.Name);
        if (errors) return errors;
        if (!params.tool_calls || params.tool_calls.length === 0) return 'At least one tool call is required.';
        // Enforce max calls to prevent abuse/errors
        if (params.tool_calls.length > 20) return 'Maximum 20 tool calls allowed in batch.';
        return null;
    }

    /**
     * Helper to normalize tool calls, handling:
     * 1. Stringified JSON objects (LLM hallucination)
     * 2. Property aliases (tool vs name vs function)
     */
    private normalizeToolCalls(toolCalls: any[]): Array<{ tool: string; parameters: Record<string, unknown> }> {
        if (!Array.isArray(toolCalls)) return [];

        return toolCalls.map(call => {
            let callObj = call;
            // Handle stringified JSON (LLM sometimes returns ["{...}", "{...}"])
            if (typeof call === 'string') {
                try {
                    callObj = JSON.parse(call);
                } catch (e) {
                    console.warn('[BatchTool] Failed to parse stringified tool call:', call);
                    return { tool: 'unknown', parameters: {} };
                }
            }

            if (!callObj || typeof callObj !== 'object') {
                return { tool: 'unknown', parameters: {} };
            }

            // Handle property aliases
            const toolName = callObj.tool || callObj.name || callObj.function || callObj.tool_name || 'unknown';
            const parameters = callObj.parameters || callObj.args || callObj.arguments || {};

            return { tool: toolName, parameters };
        });
    }

    /**
     * Returns a concise description of the batch tool calls for UI display.
     * Format: "N tools: Tool1, Tool2, ..."
     */
    override getDescription(params: BatchToolParams): string {
        if (!params.tool_calls || params.tool_calls.length === 0) {
            return 'No tools';
        }

        const normalizedCalls = this.normalizeToolCalls(params.tool_calls);
        const count = normalizedCalls.length;
        const toolNames = normalizedCalls.map(c => c.tool).join(', ');

        // Truncate if too long (max 60 chars for tool list)
        const maxLen = 60;
        const truncated = toolNames.length > maxLen
            ? toolNames.substring(0, maxLen - 3) + '...'
            : toolNames;
        return `${count} tool${count > 1 ? 's' : ''}: ${truncated}`;
    }

    async execute(
        params: BatchToolParams,
        signal: AbortSignal,
        updateOutput?: (output: string) => void,
        services?: ToolExecutionServices
    ): Promise<ToolResult> {
        const registry = await this.config.getToolRegistry();
        const results: Array<{ tool: string; success: boolean; result?: string; error?: string }> = [];

        const normalizedCalls = this.normalizeToolCalls(params.tool_calls);

        // Execute sequentially to ensure order and consistency (e.g. edit then test)
        // Parallel execution would be faster but riskier for file operations.
        // Opencode implementation uses Promise.all for parallel, but marks disallowed tools.
        // We will stick to sequential for safety in this port unless parallel is requested.

        for (const call of normalizedCalls) {
            if (signal.aborted) break;

            const toolName = call.tool;

            if (!toolName || toolName === 'unknown') {
                console.warn('[BatchTool] Missing tool name in call:', call);
                results.push({ tool: 'unknown', success: false, error: 'Missing or invalid tool name in batch call.' });
                continue;
            }

            if (toolName === 'batch') {
                results.push({ tool: toolName, success: false, error: 'Cannot nest batch calls.' });
                continue;
            }

            const tool = registry.getTool(toolName);
            if (!tool) {
                results.push({ tool: toolName, success: false, error: `Tool ${toolName} not found.` });
                continue;
            }

            // 🎯 触发预执行钩子，这对于 checkpoint 创建至关重要
            if (services?.onPreToolExecution) {
                try {
                    await services.onPreToolExecution({
                        callId: `batch-sub-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                        tool,
                        args: call.parameters as any
                    });
                } catch (preExecError) {
                    console.warn(`[BatchTool] Pre-execution hook failed for ${call.tool}:`, preExecError);
                }
            }

            try {
                const result = await tool.execute(call.parameters as any, signal, updateOutput, services);
                const resultContent = typeof result.llmContent === 'string'
                    ? result.llmContent
                    : JSON.stringify(result.llmContent);

                results.push({ tool: call.tool, success: true, result: resultContent });
            } catch (e) {
                const errorMsg = e instanceof Error ? e.message : String(e);
                results.push({ tool: call.tool, success: false, error: errorMsg });
            }
        }

        const successCount = results.filter(r => r.success).length;
        const output = results.map(r => {
            if (r.success) {
                return `[${r.tool}]: Success\n${r.result}`;
            } else {
                return `[${r.tool}]: Failed\n${r.error}`;
            }
        }).join('\n\n---\n\n');

        return {
            llmContent: `Batch execution: ${successCount}/${results.length} succeeded.\n${output}`,
            returnDisplay: `Executed ${results.length} tools. ${successCount} succeeded.`
        };
    }
}
