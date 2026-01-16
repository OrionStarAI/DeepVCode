/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { BaseTool, Icon, ToolLocation, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import {
  isWithinRoot,
  processSingleFileContent,
  getSpecificMimeType,
} from '../utils/fileUtils.js';
import { Config } from '../config/config.js';
import {
  recordFileOperationMetric,
  FileOperation,
} from '../telemetry/metrics.js';

/**
 * Parameters for the ReadFile tool
 */
export interface ReadFileToolParams {
  /**
   * The absolute path to the file to read
   */
  absolute_path: string;

  /**
   * The line number to start reading from (optional)
   */
  offset?: number;

  /**
   * The number of lines to read (optional)
   */
  limit?: number;

  /**
   * Allow reading files outside the workspace directory (optional)
   */
  allow_external_access?: boolean;
}

/**
 * Implementation of the ReadFile tool logic
 */
export class ReadFileTool extends BaseTool<ReadFileToolParams, ToolResult> {
  static readonly Name: string = 'read_file';

  constructor(private config: Config) {
    super(
      ReadFileTool.Name,
      'ReadFile',
      'Reads and returns the content of a specified file from the workspace directory. For files outside the workspace (external files), use read_many_files instead. Handles text, images (PNG, JPG, GIF, WEBP, SVG, BMP), PDF files, Excel files (.xlsx, .xls), and Word documents (.docx). For text and office files, it can read specific line ranges.',
      Icon.FileSearch,
      {
        properties: {
          absolute_path: {
            description:
              "The absolute path to the file to read (e.g., '/home/user/project/file.txt'). Relative paths are not supported. You must provide an absolute path.",
            type: Type.STRING,
          },
          offset: {
            description:
              "Optional: For text files, the 0-based line number to start reading from. Requires 'limit' to be set. Use for paginating through large files.",
            type: Type.NUMBER,
          },
          limit: {
            description:
              "Optional: For text files, maximum number of lines to read. Use with 'offset' to paginate through large files. If omitted, reads the entire file (if feasible, up to a default limit).",
            type: Type.NUMBER,
          },
          allow_external_access: {
            description:
              'Optional: Allow reading files outside the workspace directory. Use with caution as this can access any file on the system.',
            type: Type.BOOLEAN,
          },
        },
        required: ['absolute_path'],
        type: Type.OBJECT,
      },
    );
  }

  validateToolParams(params: ReadFileToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params, ReadFileTool.Name);
    if (errors) {
      return errors;
    }

    const filePath = params.absolute_path;
    if (!path.isAbsolute(filePath)) {
      return `File path must be absolute, but was relative: ${filePath}. You must provide an absolute path.`;
    }

    // Check workspace path restriction unless external access is explicitly allowed
    if (!params.allow_external_access && !isWithinRoot(filePath, this.config.getTargetDir())) {
      return `File path must be within the workspace directory (${this.config.getTargetDir()}) or set allow_external_access=true: ${filePath}`;
    }
    if (params.offset !== undefined && params.offset < 0) {
      return 'Offset must be a non-negative number';
    }
    if (params.limit !== undefined && params.limit <= 0) {
      return 'Limit must be a positive number';
    }

    // Only check gemini ignore for files within workspace
    if (isWithinRoot(filePath, this.config.getTargetDir())) {
      const fileService = this.config.getFileService();
      if (fileService.shouldGeminiIgnoreFile(params.absolute_path)) {
        return `File path '${filePath}' is ignored by .geminiignore pattern(s).`;
      }
    }

    return null;
  }

  getDescription(params: ReadFileToolParams): string {
    if (
      !params ||
      typeof params.absolute_path !== 'string' ||
      params.absolute_path.trim() === ''
    ) {
      return `Path unavailable`;
    }
    const relativePath = makeRelative(
      params.absolute_path,
      this.config.getTargetDir(),
    );
    return shortenPath(relativePath);
  }

  toolLocations(params: ReadFileToolParams): ToolLocation[] {
    return [{ path: params.absolute_path, line: params.offset }];
  }

  async execute(
    params: ReadFileToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    // Auto-forward external files to read_many_files tool
    const filePath = params.absolute_path;
    const isExternalFile = path.isAbsolute(filePath) && !isWithinRoot(filePath, this.config.getTargetDir());

    if (isExternalFile && !params.allow_external_access) {
      // Get the tool registry and delegate to read_many_files
      const toolRegistry = await this.config.getToolRegistry();
      const readManyFilesTool = toolRegistry.getTool('read_many_files');

      if (readManyFilesTool) {
        return await readManyFilesTool.execute({
          paths: [filePath],
          allowLocalExecution: true
        }, signal);
      }
    }

    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: validationError,
      };
    }

    const result = await processSingleFileContent(
      params.absolute_path,
      this.config.getTargetDir(),
      params.offset,
      params.limit,
    );

    if (result.error) {
      return {
        llmContent: result.error, // The detailed error for LLM
        returnDisplay: result.returnDisplay, // User-friendly error
      };
    }

    const lines =
      typeof result.llmContent === 'string'
        ? result.llmContent.split('\n').length
        : undefined;
    const mimetype = getSpecificMimeType(params.absolute_path);
    recordFileOperationMetric(
      this.config,
      FileOperation.READ,
      lines,
      mimetype,
      path.extname(params.absolute_path),
    );

    if (typeof result.llmContent === 'string' && result.llmContent.length == 0) {
      result.llmContent = 'ReadFile Success, but Content is empty!';
    }

    return {
      llmContent: result.llmContent,
      returnDisplay: result.returnDisplay,
    };
  }
}
