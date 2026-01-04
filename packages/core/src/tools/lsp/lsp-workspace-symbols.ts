/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, Icon, ToolResult } from '../tools.js';
import { Config } from '../../config/config.js';
import { LSPManager } from '../../lsp/index.js';
import { fileURLToPath } from 'node:url';
import { Type } from '@google/genai';

let lspManagerInstance: LSPManager | null = null;

function getLSPManager(projectRoot: string): LSPManager {
  if (!lspManagerInstance) {
    lspManagerInstance = new LSPManager(projectRoot);
  }
  return lspManagerInstance;
}

interface LSPWorkspaceSymbolsParams {
  query: string;
}

export class LSPWorkspaceSymbolsTool extends BaseTool<LSPWorkspaceSymbolsParams, ToolResult> {
  static Name = 'lsp_workspace_symbols';

  constructor(private readonly config: Config) {
    super(
      LSPWorkspaceSymbolsTool.Name,
      'LSP Workspace Symbols',
      'Search for symbols across the entire workspace using Language Server Protocol.',
      Icon.FileSearch,
      {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: 'The query string to search for.'
          }
        },
        required: ['query']
      }
    );
  }

  override validateToolParams(params: LSPWorkspaceSymbolsParams): string | null {
    if (!params.query) {
      return 'query must be a non-empty string.';
    }
    return null;
  }

  async execute(params: LSPWorkspaceSymbolsParams): Promise<ToolResult> {
    const manager = getLSPManager(this.config.getTargetDir());
    const results = await manager.getWorkspaceSymbols(params.query);

    const getSymbolKindName = (kind: number): string => {
      const kinds: Record<number, string> = {
        1: 'File', 2: 'Module', 3: 'Namespace', 4: 'Package', 5: 'Class',
        6: 'Method', 7: 'Property', 8: 'Field', 9: 'Constructor',
        10: 'Enum', 11: 'Interface', 12: 'Function', 13: 'Variable',
        14: 'Constant', 15: 'String', 16: 'Number', 17: 'Boolean',
        18: 'Array', 19: 'Object', 20: 'Key', 21: 'Null',
        22: 'EnumMember', 23: 'Struct', 24: 'Event', 25: 'Operator',
        26: 'TypeParameter'
      };
      return kinds[kind] || `Unknown(${kind})`;
    };

    const symbols: any[] = results.flat().filter(Boolean);

    if (symbols.length === 0) {
      return {
        llmContent: 'No symbols found in workspace. This could be because the LSP server is still indexing the project, or the query is too specific. If this is a new session, try waiting a few seconds and retry.',
        returnDisplay: 'No symbols found in workspace.'
      };
    }

    const formatted = symbols.map(s => {
      const filePath = fileURLToPath(s.location.uri);
      const line = s.location.range.start.line + 1;
      const kindName = getSymbolKindName(s.kind);
      return `- [${kindName}] ${s.name} in ${filePath}:${line}`;
    }).join('\n');

    return {
      llmContent: formatted,
      returnDisplay: formatted
    };
  }
}
