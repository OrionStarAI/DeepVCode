/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { BaseTool, Icon, ToolResult, ToolCallConfirmationDetails, ToolEditConfirmationDetails, ToolConfirmationOutcome, ToolExecutionServices } from './tools.js';
import { Config, ApprovalMode } from '../config/config.js';
import { EditTool, EditToolParams } from './edit.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as Diff from 'diff';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { DEFAULT_DIFF_OPTIONS } from './diffOptions.js';

interface MultiEditToolParams {
    file_path: string;
    edits: Array<{
        file_path?: string;
        old_string: string;
        new_string: string;
        replace_all?: boolean;
    }>;
}

export class MultiEditTool extends BaseTool<MultiEditToolParams, ToolResult> {
    static readonly Name = 'multiedit';

    constructor(private readonly config: Config) {
        super(
            MultiEditTool.Name,
            'Multi Edit',
            'Perform multiple edits sequentially on the same file or across multiple files. The "edits" parameter MUST be an array of objects, NOT strings.',
            Icon.Pencil,
            {
                properties: {
                    file_path: {
                        type: Type.STRING,
                        description: 'The absolute path to the primary file to modify (used for single-file multiedits).',
                    },
                    edits: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                file_path: { type: Type.STRING, description: 'The absolute path to the file to modify.' },
                                old_string: { type: Type.STRING, description: 'The exact literal text to replace.' },
                                new_string: { type: Type.STRING, description: 'The text to replace it with.' },
                                replace_all: { type: Type.BOOLEAN, description: 'Replace all occurrences (default false).' }
                            },
                            required: ['old_string', 'new_string']
                        },
                        description: 'Array of edit objects to perform sequentially. DO NOT stringify the objects inside this array.',
                    },
                },
                required: ['file_path', 'edits'],
                type: Type.OBJECT,
            }
        );
    }

    /**
     * 🎯 规范化参数：处理 AI 可能将 edits 数组作为 JSON 字符串传递的情况，
     * 并统一处理驼峰 (camelCase) 和下划线 (snake_case) 命名冲突。
     */
    private normalizeParams(params: MultiEditToolParams): MultiEditToolParams {
        let normalizedEdits = (params as any).edits;

        // 如果 edits 是字符串，尝试解析为数组
        if (typeof (params as any).edits === 'string') {
            try {
                normalizedEdits = JSON.parse((params as any).edits);
                console.log('[MultiEditTool] Parsed edits from JSON string');
            } catch (e) {
                console.error('[MultiEditTool] Failed to parse edits string:', e);
            }
        }

        // 统一处理属性名冲突（兼容历史遗留的 camelCase 以及 AI 可能发送的嵌套字符串）
        if (Array.isArray(normalizedEdits)) {
            normalizedEdits = normalizedEdits.map((edit: any) => {
                let finalEdit = edit;

                // 如果数组项是字符串，尝试二次解析（处理 AI 的转义错误）
                if (typeof edit === 'string') {
                    try {
                        finalEdit = JSON.parse(edit);
                    } catch (e) {
                        console.error('[MultiEditTool] Failed to parse individual edit string:', e);
                        return edit;
                    }
                }

                return {
                    file_path: finalEdit.file_path || finalEdit.filePath,
                    old_string: finalEdit.old_string !== undefined ? finalEdit.old_string : finalEdit.oldString,
                    new_string: finalEdit.new_string !== undefined ? finalEdit.new_string : finalEdit.newString,
                    replace_all: finalEdit.replace_all !== undefined ? finalEdit.replace_all : (finalEdit.replaceAll !== undefined ? finalEdit.replaceAll : false)
                };
            });
        }

        return {
            file_path: params.file_path || (params as any).filePath,
            edits: normalizedEdits
        };
    }

    validateToolParams(params: MultiEditToolParams): string | null {
        const normalizedParams = this.normalizeParams(params);
        const errors = SchemaValidator.validate(this.schema.parameters, normalizedParams, MultiEditTool.Name);
        if (errors) return errors;
        if (!normalizedParams.edits || normalizedParams.edits.length === 0) return 'At least one edit is required.';
        return null;
    }

    /**
     * 🎯 用户确认逻辑：计算所有编辑的合并 diff 并请求用户确认
     */
    async shouldConfirmExecute(
        params: MultiEditToolParams,
        _abortSignal: AbortSignal
    ): Promise<ToolCallConfirmationDetails | false> {
        // 🎯 规范化参数，处理字符串格式的 edits
        const normalizedParams = this.normalizeParams(params);

        if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
            return false;
        }

        const validationError = this.validateToolParams(normalizedParams);
        if (validationError) {
            console.error(`[MultiEditTool] Invalid parameters: ${validationError}`);
            return false;
        }

        // 收集所有文件的 diff 预览
        const allDiffs: string[] = [];
        const uniqueFiles = new Set<string>();

        for (const edit of normalizedParams.edits) {
            const targetFile = edit.file_path || normalizedParams.file_path;
            if (!targetFile) continue;

            uniqueFiles.add(targetFile);

            try {
                let currentContent = '';
                try {
                    currentContent = fs.readFileSync(targetFile, 'utf8').replace(/\r\n/g, '\n');
                } catch {
                    // 新文件
                }

                const newContent = edit.old_string === ''
                    ? edit.new_string
                    : currentContent.replaceAll(edit.old_string, edit.new_string);

                const fileName = path.basename(targetFile);
                const fileDiff = Diff.createPatch(
                    fileName,
                    currentContent,
                    newContent.replace(/\r\n/g, '\n'),
                    'Current',
                    'Proposed',
                    DEFAULT_DIFF_OPTIONS
                );
                allDiffs.push(fileDiff);
            } catch (e) {
                console.error(`[MultiEditTool] Error calculating diff for ${targetFile}: ${e}`);
            }
        }

        if (allDiffs.length === 0) {
            return false;
        }

        const combinedDiff = allDiffs.join('\n');
        const displayFileName = uniqueFiles.size === 1
            ? path.basename(Array.from(uniqueFiles)[0]!)
            : `${uniqueFiles.size} files`;

        const confirmationDetails: ToolEditConfirmationDetails = {
            type: 'edit',
            title: `Confirm Multi-Edit: ${displayFileName}`,
            fileName: displayFileName,
            fileDiff: combinedDiff,
            originalContent: null,
            newContent: '',
            onConfirm: async (outcome: ToolConfirmationOutcome) => {
                if (outcome === ToolConfirmationOutcome.ProceedAlways) {
                    this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
                }
            },
        };

        return confirmationDetails;
    }


    async execute(params: MultiEditToolParams, signal: AbortSignal, updateOutput?: (output: string) => void, services?: ToolExecutionServices): Promise<ToolResult> {
        // 🎯 规范化参数，处理字符串格式的 edits
        const normalizedParams = this.normalizeParams(params);

        const editTool = new EditTool(this.config);
        const results: ToolResult[] = [];
        const executionLog: string[] = [];

        for (const edit of normalizedParams.edits) {
            // Use edit.file_path if provided, otherwise fallback to params.file_path
            const targetFile = edit.file_path || normalizedParams.file_path;

            if (!targetFile) {
                executionLog.push(`Skipped edit: No file path provided.`);
                continue;
            }

            // 🎯 触发预执行钩子，这对于 checkpoint 创建至关重要
            if (services?.onPreToolExecution) {
                try {
                    await services.onPreToolExecution({
                        callId: `multiedit-sub-${Date.now()}-${Math.random().toString(16).slice(2)}`,
                        tool: editTool,
                        args: {
                            file_path: targetFile,
                            old_string: edit.old_string,
                            new_string: edit.new_string,
                        }
                    });
                } catch (preExecError) {
                    console.warn(`[MultiEditTool] Pre-execution hook failed for ${targetFile}:`, preExecError);
                }
            }

            try {
                const result = await editTool.execute({
                    file_path: targetFile,
                    old_string: edit.old_string,
                    new_string: edit.new_string,
                    expected_replacements: edit.replace_all ? undefined : 1
                }, signal, updateOutput, services);

                results.push(result);
                if (result.returnDisplay && typeof result.returnDisplay === 'string') {
                    executionLog.push(result.returnDisplay);
                } else if (result.returnDisplay && typeof result.returnDisplay === 'object' && 'fileDiff' in result.returnDisplay) {
                    // Capture the specific modification log if available, or just the filename
                    executionLog.push(`Edited ${targetFile}`);
                } else {
                    executionLog.push(`Edited ${targetFile}`);
                }

            } catch (e) {
                executionLog.push(`Failed to edit ${targetFile}: ${e}`);
            }
        }

        const combinedLLMContent = results.map(r => typeof r.llmContent === 'string' ? r.llmContent : JSON.stringify(r.llmContent)).join('\n');

        // Collect all diffs for visual display
        const allDiffs = results
            .map(r => (r.returnDisplay && typeof r.returnDisplay === 'object' && 'fileDiff' in r.returnDisplay) ? (r.returnDisplay as any).fileDiff : '')
            .filter(d => !!d)
            .join('\n');

        const uniqueFiles = Array.from(new Set(normalizedParams.edits.map(e => e.file_path || normalizedParams.file_path).filter(f => !!f)));
        const displayFileName = uniqueFiles.length === 1 ? path.basename(uniqueFiles[0]!) : 'Multiple Files';

        return {
            llmContent: `Executed ${results.length} edits.\n${combinedLLMContent}`,
            returnDisplay: allDiffs ? {
                fileDiff: allDiffs,
                fileName: displayFileName,
                originalContent: null, // Not easily available for aggregate
                newContent: '' // Not easily available for aggregate
            } : executionLog.join('\n')
        };
    }
}