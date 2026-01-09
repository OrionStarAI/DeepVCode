/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, Icon, ToolResult } from './tools.js';
import { Config } from '../config/config.js';
import { getLSPManager } from './lsp/lsp-provider.js';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';

interface LspToolParams {
    operation: 'goToDefinition' | 'findReferences' | 'hover' | 'documentSymbol' | 'workspaceSymbol' | 'goToImplementation';
    filePath?: string;
    line?: number;
    character?: number;
    query?: string;
}

export class LspTool extends BaseTool<LspToolParams, ToolResult> {
    static readonly Name = 'lsp';

    constructor(private readonly config: Config) {
        super(
            LspTool.Name,
            'LSP Tool',
            'Perform Language Server Protocol operations like Go to Definition, Find References, Hover, etc. Useful for code navigation and understanding.',
            Icon.LightBulb,
            {
                properties: {
                    operation: {
                        type: Type.STRING,
                        enum: [
                            'goToDefinition',
                            'findReferences',
                            'hover',
                            'documentSymbol',
                            'workspaceSymbol',
                            'goToImplementation',
                        ],
                        description: 'The LSP operation to perform.',
                    },
                    filePath: {
                        type: Type.STRING,
                        description: 'The absolute path to the file. Required for file-specific operations.',
                    },
                    line: {
                        type: Type.NUMBER,
                        description: 'The 1-based line number. Required for position-specific operations.',
                    },
                    character: {
                        type: Type.NUMBER,
                        description: 'The 1-based character offset. Required for position-specific operations.',
                    },
                    query: {
                        type: Type.STRING,
                        description: 'Search query. Required for workspaceSymbol.',
                    },
                },
                required: ['operation'],
                type: Type.OBJECT,
            }
        );
    }

    validateToolParams(params: LspToolParams): string | null {
        const errors = SchemaValidator.validate(this.schema.parameters, params);
        if (errors) return errors;

        if (params.operation !== 'workspaceSymbol') {
            if (!params.filePath || !path.isAbsolute(params.filePath)) {
                return 'filePath must be an absolute path for this operation.';
            }
        }

        if (['goToDefinition', 'findReferences', 'hover', 'goToImplementation'].includes(params.operation)) {
            if (!params.line || !params.character || params.line < 1 || params.character < 1) {
                return 'line and character must be 1-based (>= 1) for this operation.';
            }
        }

        if (params.operation === 'workspaceSymbol' && !params.query) {
            return 'query is required for workspaceSymbol.';
        }

        return null;
    }

    async execute(params: LspToolParams): Promise<ToolResult> {
        const manager = getLSPManager(this.config.getTargetDir());
        let result: any = null;

        // Normalize file path for Windows compatibility
        // Some LSPs or URI converters (like vscode-uri) are sensitive to casing and separators
        const targetFile = params.filePath ? path.resolve(params.filePath) : undefined;
        // On Windows, drive letters might need consistent casing. path.resolve usually helps.

        try {
            switch (params.operation) {
                case 'goToDefinition':
                    result = await manager.getDefinition(targetFile!, params.line! - 1, params.character! - 1);
                    break;
                case 'findReferences':
                    result = await manager.getReferences(targetFile!, params.line! - 1, params.character! - 1);
                    break;
                case 'hover':
                    result = await manager.getHover(targetFile!, params.line! - 1, params.character! - 1);
                    break;
                case 'documentSymbol':
                    result = await manager.getDocumentSymbols(targetFile!);
                    break;
                case 'workspaceSymbol':
                    result = await manager.getWorkspaceSymbols(params.query || '');
                    break;
                case 'goToImplementation':
                    result = await manager.getImplementation(targetFile!, params.line! - 1, params.character! - 1);
                    break;
                default:
                    throw new Error(`Unknown operation: ${params.operation}`);
            }

            // LSPManager returns an array of results (one per client).
            // We need to normalize this into a single result structure for display.
            let normalizedResult = result;

            if (Array.isArray(result)) {
                if (params.operation === 'hover') {
                    // For hover, usually only one client responds or we just want the first valid one
                    // result is Hover[]
                    const firstHover = result.find((r: any) => r && r.contents);
                    normalizedResult = firstHover || null;
                } else if (params.operation === 'goToDefinition') {
                    // result is (Location | Location[])[]
                    // We want Location[] or Location (if single)
                    const flattened = result.flat().filter(Boolean);
                    // If all definitions point to the same place, maybe dedup?
                    // For now just return all.
                    normalizedResult = flattened;
                    if (normalizedResult.length === 0) normalizedResult = null;
                    else if (normalizedResult.length === 1) normalizedResult = normalizedResult[0];
                } else {
                    // For lists (references, symbols), flatten the results from all clients
                    // result is List[] -> List (which is Array)
                    normalizedResult = result.flat().filter(Boolean);
                    // Ensure it's empty array if no results, not null, to match array logic
                    if (normalizedResult.length === 0 && Array.isArray(result)) normalizedResult = [];
                }
            }

            const formattedOutput = this.formatLspResult(normalizedResult, params.operation, this.config.getTargetDir());

            return {
                llmContent: `Operation ${params.operation} result:\n${formattedOutput}`,
                returnDisplay: formattedOutput
            };

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return {
                llmContent: `Error executing LSP operation ${params.operation}: ${errorMsg}`,
                returnDisplay: `Error: ${errorMsg}`
            };
        }
    }

    private formatLspResult(result: any, operation: string, cwd: string): string {
        if (!result) return 'No result found.';

        // Helper to format a single location
        const formatLocation = (uri: string, range: any) => {
            let filePath = uri;
            if (uri.startsWith('file://')) {
                filePath = fileURLToPath(uri);
            }
            const relativePath = path.relative(cwd, filePath);

            // Format: path/to/file:Line:StartCol-EndCol
            // LSP is 0-indexed, display as 1-indexed
            const startLine = range.start.line + 1;
            const startChar = range.start.character + 1;
            const endLine = range.end.line + 1;
            const endChar = range.end.character + 1;

            if (startLine === endLine) {
                return `${relativePath}:${startLine}:${startChar}-${endChar}`;
            }
            return `${relativePath}:${startLine}:${startChar} - ${endLine}:${endChar}`;
        };

        // Handle Array results (References, Symbols, or Definition array)
        if (Array.isArray(result)) {
            if (result.length === 0) return 'No results.';

            // Check content type based on first item
            const first = result[0];

            // Locations (References, Definitions)
            if (first.uri || first.targetUri) { // Location or LocationLink
                return result.map((item: any) => {
                    const uri = item.uri || item.targetUri;
                    const range = item.range || item.targetSelectionRange;
                    return `• ${formatLocation(uri, range)}`;
                }).join('\n');
            }

            // Symbols (DocumentSymbol, SymbolInformation)
            // SymbolInformation has { name, kind, location }
            // DocumentSymbol has { name, kind, range, children? }
            if (first.name && (first.kind !== undefined)) {
                return result.map((item: any) => {
                    const kindMap: { [key: number]: string } = {
                        1: 'File', 2: 'Module', 3: 'Namespace', 4: 'Package', 5: 'Class',
                        6: 'Method', 7: 'Property', 8: 'Field', 9: 'Constructor', 10: 'Enum',
                        11: 'Interface', 12: 'Function', 13: 'Variable', 14: 'Constant', 15: 'String'
                    };
                    const kind = kindMap[item.kind] || `Kind(${item.kind})`;
                    let locStr = '';
                    if (item.location) { // SymbolInformation
                        locStr = formatLocation(item.location.uri, item.location.range);
                    } else if (item.range) { // DocumentSymbol - usually implicitly current file if nested, but top level passed raw
                        // DocumentSymbol doesn't have URI usually if nested, but here we might just show range
                        // However, for document symbols we typically just list them.
                        const r = item.range;
                        locStr = `${r.start.line + 1}:${r.start.character + 1}`;
                    }
                    return `• [${kind}] ${item.name} (${locStr})`;
                }).join('\n');
            }

            // Fallback for array
            return `Found ${result.length} items. (Use getting 'view_file' to see details if needed)`;
        }

        // Handle Single Object results

        // Hover
        if (result.contents) {
            if (typeof result.contents === 'string') return result.contents;
            if (result.contents.value) return result.contents.value; // MarkupContent
            if (Array.isArray(result.contents)) {
                return result.contents.map((c: any) => typeof c === 'string' ? c : c.value).join('\n\n');
            }
            return 'Hover content available.';
        }

        // Single Location (Definition)
        if (result.uri || result.targetUri) {
            const uri = result.uri || result.targetUri;
            const range = result.range || result.targetSelectionRange;
            return formatLocation(uri, range);
        }

        return JSON.stringify(result, null, 2);
    }
}
