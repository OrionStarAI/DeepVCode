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
            'Execute multiple tools in parallel (or sequentially if dependencies exist, but this implementation runs them sequentially for safety).',
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

    async execute(
        params: BatchToolParams,
        signal: AbortSignal,
        updateOutput?: (output: string) => void,
        services?: ToolExecutionServices
    ): Promise<ToolResult> {
        const registry = await this.config.getToolRegistry();
        const results: Array<{ tool: string; success: boolean; result?: string; error?: string }> = [];

        // Execute sequentially to ensure order and consistency (e.g. edit then test)
        // Parallel execution would be faster but riskier for file operations.
        // Opencode implementation uses Promise.all for parallel, but marks disallowed tools.
        // We will stick to sequential for safety in this port unless parallel is requested.

        for (const call of params.tool_calls) {
            if (signal.aborted) break;

            if (call.tool === 'batch') {
                results.push({ tool: call.tool, success: false, error: 'Cannot nest batch calls.' });
                continue;
            }

            const tool = registry.getTool(call.tool);
            if (!tool) {
                results.push({ tool: call.tool, success: false, error: `Tool ${call.tool} not found.` });
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
