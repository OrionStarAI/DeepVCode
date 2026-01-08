/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, Icon, ToolResult } from '../tools.js';
import { Config } from '../../config/config.js';
import { LSPManager } from '../../lsp/index.js';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Type } from '@google/genai';

let lspManagerInstance: LSPManager | null = null;

function getLSPManager(projectRoot: string): LSPManager {
  if (!lspManagerInstance) {
    lspManagerInstance = new LSPManager(projectRoot);
  }
  return lspManagerInstance;
}

interface LSPDefinitionParams {
  filePath: string;
  line: number;
  character: number;
}

export class LSPGotoDefinitionTool extends BaseTool<LSPDefinitionParams, ToolResult> {
  static Name = 'lsp_goto_definition';

  constructor(private readonly config: Config) {
    super(
      LSPGotoDefinitionTool.Name,
      'LSP Goto Definition',
      'Find the definition of the symbol at a specific position in a file using Language Server Protocol.',
      Icon.FileSearch,
      {
        type: Type.OBJECT,
        properties: {
          filePath: {
            type: Type.STRING,
            description: 'The absolute path to the file to inspect.'
          },
          line: {
            type: Type.NUMBER,
            description: 'The 0-based line number.'
          },
          character: {
            type: Type.NUMBER,
            description: 'The 0-based character offset on the line.'
          }
        },
        required: ['filePath', 'line', 'character']
      }
    );
  }

  override validateToolParams(params: LSPDefinitionParams): string | null {
    if (!params.filePath || !path.isAbsolute(params.filePath)) {
      return 'filePath must be an absolute path.';
    }
    return null;
  }


  async execute(params: LSPDefinitionParams): Promise<ToolResult> {
    const manager = getLSPManager(this.config.getTargetDir());
    const results = await manager.getDefinition(params.filePath, params.line, params.character);

    if (results.length === 0) {
      return {
        llmContent: 'No definition found.',
        returnDisplay: 'No definition found.'
      };
    }

    // LSP result can be Location | Location[] | LocationLink[]
    const locations: any[] = results.flat();
    const formatted = locations.map(loc => {
      const uri = loc.uri || loc.targetUri;
      const range = loc.range || loc.targetSelectionRange;
      const filePath = fileURLToPath(uri);
      return `- File: ${filePath}\n  Range: Line ${range.start.line}, Char ${range.start.character} to Line ${range.end.line}, Char ${range.end.character}`;
    }).join('\n');

    return {
      llmContent: formatted,
      returnDisplay: formatted
    };
  }
}
