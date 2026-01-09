/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, Icon, ToolResult, ToolLocation } from './tools.js';
import { Config } from '../config/config.js';
import { PatchParser } from '../utils/patch-parser.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

interface PatchToolParams {
    patchText: string;
}

export class PatchTool extends BaseTool<PatchToolParams, ToolResult> {
    static readonly Name = 'patch';

    constructor(private readonly config: Config) {
        super(
            PatchTool.Name,
            'Patch',
            'Apply a patch to modify multiple files. Supports adding, updating, and deleting files with context-aware changes.',
            Icon.Wrench,
            {
                properties: {
                    patchText: {
                        type: Type.STRING,
                        description: 'The full patch text that describes all changes to be made. Must use the standard patch format.',
                    },
                },
                required: ['patchText'],
                type: Type.OBJECT,
            }
        );
    }

    validateToolParams(params: PatchToolParams): string | null {
        const errors = SchemaValidator.validate(this.schema.parameters, params);
        if (errors) return errors;
        if (!params.patchText) return 'patchText is required';
        return null;
    }

    async execute(params: PatchToolParams): Promise<ToolResult> {
        try {
            const { hunks } = PatchParser.parsePatch(params.patchText);
            const cwd = this.config.getTargetDir();

            const added: string[] = [];
            const modified: string[] = [];
            const deleted: string[] = [];

            for (const hunk of hunks) {
                // Resolve path relative to project root
                const movePath = (hunk.type === 'update' && hunk.move_path)
                    ? path.resolve(cwd, hunk.move_path)
                    : undefined;

                const filePath = path.resolve(cwd, hunk.path);

                // Security check
                if (!filePath.startsWith(cwd)) {
                    throw new Error(`Access denied: ${filePath} is outside project root.`);
                }
                if (movePath && !movePath.startsWith(cwd)) {
                    throw new Error(`Access denied: ${movePath} is outside project root.`);
                }

                switch (hunk.type) {
                    case 'add': {
                        const addDir = path.dirname(filePath);
                        if (addDir !== cwd) {
                            await fs.mkdir(addDir, { recursive: true });
                        }
                        await fs.writeFile(filePath, hunk.contents, 'utf-8');
                        added.push(path.relative(cwd, filePath));
                        break;
                    }
                    case 'delete': {
                        await fs.unlink(filePath);
                        deleted.push(path.relative(cwd, filePath));
                        break;
                    }
                    case 'update': {
                        const fileUpdate = PatchParser.deriveNewContentsFromChunks(filePath, hunk.chunks);
                        if (movePath) {
                            const moveDir = path.dirname(movePath);
                            await fs.mkdir(moveDir, { recursive: true });
                            await fs.writeFile(movePath, fileUpdate.content, 'utf-8');
                            await fs.unlink(filePath);
                            modified.push(`${path.relative(cwd, filePath)} -> ${path.relative(cwd, movePath)}`);
                        } else {
                            await fs.writeFile(filePath, fileUpdate.content, 'utf-8');
                            modified.push(path.relative(cwd, filePath));
                        }
                        break;
                    }
                }
            }

            const summary = [
                added.length > 0 ? `Added: ${added.join(', ')}` : '',
                modified.length > 0 ? `Modified: ${modified.join(', ')}` : '',
                deleted.length > 0 ? `Deleted: ${deleted.join(', ')}` : ''
            ].filter(Boolean).join('\n');

            const result: ToolResult = {
                llmContent: `Patch applied successfully.\n${summary}`,
                returnDisplay: {
                    fileDiff: params.patchText,
                    fileName: modified.length === 1 ? modified[0] : (added.length === 1 ? added[0] : (deleted.length === 1 ? deleted[0] : 'Multiple Files')),
                    originalContent: null,
                    newContent: ''
                }
            };

            return result;


        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return {
                llmContent: `Error applying patch: ${errorMsg}`,
                returnDisplay: `Error: ${errorMsg}`
            };
        }
    }
}
