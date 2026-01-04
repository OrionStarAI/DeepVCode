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

interface LSPImplementationParams {
  filePath: string;
  line: number;
  character: number;
}

export class LSPImplementationTool extends BaseTool<LSPImplementationParams, ToolResult> {
  static Name = 'lsp_implementation';

  constructor(private readonly config: Config) {
    super(
      LSPImplementationTool.Name,
      'LSP Goto Implementation',
      'Find implementations of an interface or abstract method using Language Server Protocol.',
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

  override validateToolParams(params: LSPImplementationParams): string | null {
    if (!params.filePath || !path.isAbsolute(params.filePath)) {
      return 'filePath must be an absolute path.';
    }
    if (params.line < 1 || params.character < 1) {
      return 'line and character must be 1-based (>= 1).';
    }
    return null;
  }

  async execute(params: LSPImplementationParams): Promise<ToolResult> {
    const manager = getLSPManager(this.config.getTargetDir());
    const results = await manager.getImplementation(params.filePath, params.line - 1, params.character - 1);

    if (results.length === 0) {
      return {
        llmContent: 'No implementations found.',
        returnDisplay: 'No implementations found.'
      };
    }

    const locations: any[] = results.flat().filter(Boolean);
    const formatted = locations.map(loc => {
      const uri = loc.uri || loc.targetUri;
      const range = loc.range || loc.targetSelectionRange;
      const filePath = fileURLToPath(uri);
      return `- File: ${filePath}\n  Range: Line ${range.start.line + 1}, Char ${range.start.character + 1} to Line ${range.end.line + 1}, Char ${range.end.character + 1}`;
    }).join('\n');

    return {
      llmContent: formatted,
      returnDisplay: formatted
    };
  }
}
