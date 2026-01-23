/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import * as fs from 'fs';
import * as path from 'path';
import { Config, ApprovalMode } from '../config/config.js';
import {
  BaseTool,
  ToolResult,
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ToolDeleteConfirmationDetails,
  Icon,
  ToolLocation,
} from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { isWithinRoot, detectFileType } from '../utils/fileUtils.js';
import {
  recordFileOperationMetric,
  FileOperation,
} from '../telemetry/metrics.js';

/**
 * Parameters for the DeleteFile tool
 */
export interface DeleteFileToolParams {
  /**
   * The absolute path to the file to delete
   */
  file_path: string;

  /**
   * Optional reason for deletion (for logging and rollback purposes)
   */
  reason?: string;
}



/**
 * Implementation of the DeleteFile tool logic
 */
export class DeleteFileTool extends BaseTool<DeleteFileToolParams, ToolResult> {
  static readonly Name: string = 'delete_file';

  constructor(private readonly config: Config) {
    super(
      DeleteFileTool.Name,
      'DeleteFile',
      `Safely deletes text files from the filesystem after capturing their content for potential rollback.
      The tool will read and preserve the file content before deletion, allowing for recovery if needed.

      RESTRICTIONS: This tool can only delete text files (code, configuration, documentation, etc.).
      For non-text files (images, videos, binaries, archives, etc.), use the shell tool with commands like "rm".

      IMPORTANT: This operation is destructive and should be used with caution. Always ensure you have
      a backup strategy or version control in place.`,
      Icon.Trash,
      {
        properties: {
          file_path: {
            description:
              "The absolute path to the file to delete (e.g., '/home/user/project/file.txt'). Relative paths are not supported.",
            type: Type.STRING,
          },
          reason: {
            description: 'Optional reason for deletion (for logging and rollback documentation).',
            type: Type.STRING,
          },
        },
        required: ['file_path'],
        type: Type.OBJECT,
      },
    );
  }

  /**
   * Validates the parameters for the DeleteFile tool
   */
  validateToolParams(params: DeleteFileToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params, DeleteFileTool.Name);
    if (errors) {
      return errors;
    }

    const filePath = params.file_path;
    if (!path.isAbsolute(filePath)) {
      return `File path must be absolute: ${filePath}`;
    }

    if (!isWithinRoot(filePath, this.config.getTargetDir())) {
      return `File path must be within the root directory (${this.config.getTargetDir()}): ${filePath}`;
    }

    try {
      if (!fs.existsSync(filePath)) {
        return `File does not exist: ${filePath}`;
      }

      const stats = fs.lstatSync(filePath);
      if (stats.isDirectory()) {
        return `Path is a directory, not a file. Use a directory deletion tool instead: ${filePath}`;
      }

      if (stats.isSymbolicLink()) {
        return `Path is a symbolic link. Consider the implications before deleting: ${filePath}`;
      }
    } catch (statError: unknown) {
      return `Error accessing file properties: ${filePath}. Reason: ${statError instanceof Error ? statError.message : String(statError)}`;
    }

    return null;
  }

  /**
   * Determines the file location affected by the tool execution
   */
  toolLocations(params: DeleteFileToolParams): ToolLocation[] {
    return [{ path: params.file_path }];
  }

  getDescription(params: DeleteFileToolParams): string {
    if (!params.file_path) {
      return `Model did not provide valid parameters for delete file tool`;
    }
    const relativePath = makeRelative(
      params.file_path,
      this.config.getTargetDir(),
    );
    const reasonSuffix = params.reason ? ` (${params.reason})` : '';
    return `${shortenPath(relativePath)}${reasonSuffix}`;
  }

  /**
   * Handles the confirmation prompt for the DeleteFile tool
   */
  async shouldConfirmExecute(
    params: DeleteFileToolParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    const validationError = this.validateToolParams(params);
    if (validationError) {
      console.error(
        `[DeleteFileTool] Attempted confirmation with invalid parameters: ${validationError}`,
      );
      return false;
    }

    // Check file type - only allow deletion of text files
    try {
      const fileType = await detectFileType(params.file_path);
      if (fileType !== 'text') {
        console.error(
          `[DeleteFileTool] Attempted to delete non-text file: ${params.file_path} (type: ${fileType})`,
        );
        return false;
      }
    } catch (error) {
      console.error(`[DeleteFileTool] Error detecting file type: ${error}`);
      return false;
    }

    let fileContent = '';
    let fileSize = 0;

    try {
      fileContent = fs.readFileSync(params.file_path, 'utf8');
      const stats = fs.statSync(params.file_path);
      fileSize = stats.size;
    } catch (error) {
      console.error(`Error reading file for confirmation: ${error}`);
      return false;
    }

    const relativePath = makeRelative(
      params.file_path,
      this.config.getTargetDir(),
    );
    const fileName = path.basename(params.file_path);

    const confirmationDetails: ToolDeleteConfirmationDetails = {
      type: 'delete',
      title: `Confirm Delete: ${shortenPath(relativePath)}`,
      fileName,
      filePath: params.file_path,
      fileContent,
      fileSize,
      reason: params.reason,
      onConfirm: async (outcome: ToolConfirmationOutcome) => {
        if (outcome === ToolConfirmationOutcome.ProceedAlways) {
          this.config.setApprovalMode(ApprovalMode.AUTO_EDIT);
        }
      },
    };

    return confirmationDetails;
  }

  /**
   * Executes the file deletion with content preservation
   */
  async execute(
    params: DeleteFileToolParams,
    _abortSignal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `Error: ${validationError}`,
      };
    }

    // Check file type - only allow deletion of text files
    try {
      const fileType = await detectFileType(params.file_path);
      if (fileType !== 'text') {
        const fileExtension = path.extname(params.file_path);
        return {
          llmContent: `Error: The delete_file tool can only delete text files. The file "${params.file_path}" is detected as type "${fileType}"${fileExtension ? ` (${fileExtension})` : ''}. For non-text files, please use the shell tool with commands like "rm" to delete this file. For example: \`rm "${params.file_path}"\``,
          returnDisplay: `Error: Can only delete text files. Use shell tool for ${fileType} files.`,
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error detecting file type: ${errorMsg}`,
        returnDisplay: `Error detecting file type: ${errorMsg}`,
      };
    }

    let originalContent = '';
    let fileStats: fs.Stats | null = null;

    // First, read and preserve the file content
    try {
      originalContent = fs.readFileSync(params.file_path, 'utf8');
      fileStats = fs.statSync(params.file_path);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error reading file before deletion: ${errorMsg}`,
        returnDisplay: `Error reading file: ${errorMsg}`,
      };
    }

    // Now attempt to delete the file
    try {
      fs.unlinkSync(params.file_path);

      // Record metrics for telemetry
      const extension = path.extname(params.file_path);
      const lines = originalContent.split('\n').length;
      recordFileOperationMetric(
        this.config,
        FileOperation.DELETE,
        lines,
        'text/plain', // We don't have a specific MIME type for deleted files
        extension,
      );

      const fileName = path.basename(params.file_path);
      const llmContentParts = [
        `Successfully deleted file: ${params.file_path}`,
        `File contained ${lines} lines (${fileStats?.size || 0} bytes)`,
      ];

      if (params.reason) {
        llmContentParts.push(`Deletion reason: ${params.reason}`);
      }

      llmContentParts.push(
        `Original content has been preserved in the tool result for potential rollback.`
      );

      return {
        llmContent: llmContentParts.join('. ') + '.',
        returnDisplay: `File deleted: ${fileName}`,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error deleting file: ${errorMsg}`,
        returnDisplay: `Error deleting file: ${errorMsg}`,
      };
    }
  }
}