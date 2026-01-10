/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { BaseTool, Icon, ToolResult } from '../tools.js';
import { Config } from '../../config/config.js';
import { LSPManager } from '../../lsp/index.js';
import * as path from 'node:path';
import { Type } from '@google/genai';

let lspManagerInstance: LSPManager | null = null;

function getLSPManager(projectRoot: string): LSPManager {
  if (!lspManagerInstance) {
    lspManagerInstance = new LSPManager(projectRoot);
  }
  return lspManagerInstance;
}

interface LSPDocumentSymbolsParams {
  filePath: string;
}

export class LSPDocumentSymbolsTool extends BaseTool<LSPDocumentSymbolsParams, ToolResult> {
  static Name = 'lsp_document_symbols';

  constructor(private readonly config: Config) {
    super(
      LSPDocumentSymbolsTool.Name,
      'LSP Document Symbols',
      'Get all symbols (functions, classes, variables) in a document using Language Server Protocol.',
      Icon.List,
      {
        type: Type.OBJECT,
        properties: {
          filePath: {
            type: Type.STRING,
            description: 'The absolute path to the file to inspect.'
          }
        },
        required: ['filePath']
      }
    );
  }

  override validateToolParams(params: LSPDocumentSymbolsParams): string | null {
    if (!params.filePath || !path.isAbsolute(params.filePath)) {
      return 'filePath must be an absolute path.';
    }
    return null;
  }

  async execute(params: LSPDocumentSymbolsParams): Promise<ToolResult> {
    const manager = getLSPManager(this.config.getTargetDir());
    const results = await manager.getDocumentSymbols(params.filePath);

    if (results.length === 0) {
      return {
        llmContent: 'No symbols found.',
        returnDisplay: 'No symbols found.'
      };
    }

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

    const formatSymbol = (s: any, indent: string = ''): string => {
      // 🎯 优化点：优先使用 selectionRange，它指向符号的标识符（名称）位置，而不是 range（包含修饰符的整个范围）
      const pos = s.selectionRange ? s.selectionRange.start : s.range.start;
      const kindName = getSymbolKindName(s.kind);
      let res = `${indent}- [${kindName}] ${s.name} (Line ${pos.line + 1}, Char ${pos.character + 1})`;
      if (s.children && s.children.length > 0) {
        res += '\n' + s.children.map((c: any) => formatSymbol(c, indent + '  ')).join('\n');
      }
      return res;
    };

    const symbols: any[] = results.flat().filter(Boolean);
    const formatted = symbols.map(s => {
      if (s.range) { // DocumentSymbol
        return formatSymbol(s);
      } else { // SymbolInformation
        const kindName = getSymbolKindName(s.kind);
        return `- [${kindName}] ${s.name} (Line ${s.location.range.start.line + 1}, Char ${s.location.range.start.character + 1})`;
      }
    }).join('\n');

    return {
      llmContent: formatted,
      returnDisplay: formatted
    };
  }
}
