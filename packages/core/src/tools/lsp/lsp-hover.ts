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

interface LSPHoverParams {
  filePath: string;
  line: number;
  character: number;
}

export class LSPHoverTool extends BaseTool<LSPHoverParams, ToolResult> {
  static Name = 'lsp_hover';

  constructor(private readonly config: Config) {
    super(
      LSPHoverTool.Name,
      'LSP Hover',
      'Get hover information (type info, documentation) for a specific position in a file using Language Server Protocol.',
      Icon.LightBulb,
      {
        type: Type.OBJECT,
        properties: {
          filePath: {
            type: Type.STRING,
            description: 'The absolute path to the file to inspect.'
          },
          line: {
            type: Type.NUMBER,
            description: 'The 1-based line number (as shown in editors).'
          },
          character: {
            type: Type.NUMBER,
            description: 'The 1-based character offset on the line (as shown in editors).'
          }
        },
        required: ['filePath', 'line', 'character']
      }
    );
  }

  override validateToolParams(params: LSPHoverParams): string | null {
    if (!params.filePath || !path.isAbsolute(params.filePath)) {
      return 'filePath must be an absolute path.';
    }
    if (params.line < 1 || params.character < 1) {
      return 'line and character must be 1-based (>= 1).';
    }
    return null;
  }

  async execute(params: LSPHoverParams): Promise<ToolResult> {
    const manager = getLSPManager(this.config.getTargetDir());
    // Convert 1-based to 0-based for LSP
    const results = await manager.getHover(params.filePath, params.line - 1, params.character - 1);

    if (results.length === 0 || !results[0]) {
      return {
        llmContent: 'No hover information found. This might be because the position is on a keyword, or the LSP server is still indexing. Try moving the character offset to the symbol name.',
        returnDisplay: 'No hover information found.'
      };
    }

    // 聚合结果
    const content = results.map((r: any) => {
      if (!r || !r.contents) return '';
      if (Array.isArray(r.contents)) {
        return r.contents.map((c: any) => typeof c === 'string' ? c : c.value).join('\n\n');
      }
      return typeof r.contents === 'string' ? r.contents : r.contents.value;
    }).filter(Boolean).join('\n---\n');

    return {
      llmContent: content || 'No hover information found.',
      returnDisplay: content || 'No hover information found.'
    };
  }
}

