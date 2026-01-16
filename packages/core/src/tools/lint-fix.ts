/**
 * @license
 * Copyright 2025 DeepV Code
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, Icon, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { Config } from '../config/config.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';
import { logger } from '../utils/enhancedLogger.js';

export interface LintFixParams {
  files?: string[];              // 要修复的文件路径
  autoFix?: boolean;            // 是否自动应用修复
  preview?: boolean;            // 是否预览修复
  fixTypes?: string[];          // 要修复的错误类型 (可选)
  maxFixes?: number;            // 最大修复数量限制
}

export interface FixPreview {
  file: string;
  fixes: Array<{
    range: { start: { line: number; character: number }, end: { line: number; character: number } };
    newText: string;
    description: string;
    fixKind: string;
  }>;
}

export interface FixResult {
  file: string;
  appliedFixes: number;
  failedFixes: number;
  errors: string[];
}

/**
 * VSCode 回调函数类型 - 用于执行 lint 修复
 */
export type LintFixCallback = (params: LintFixParams) => Promise<{
  previews?: FixPreview[];
  results?: FixResult[];
  totalFixes: number;
  success: boolean;
}>;

/**
 * LintFix 工具 - 自动修复 lint 错误
 */
export class LintFixTool extends BaseTool<LintFixParams, ToolResult> {
  static readonly Name = 'lint_fix';

  // 静态回调函数，由 VSCode 扩展设置
  private static callback: LintFixCallback | null = null;

  constructor(private readonly config: Config) {
    super(
      LintFixTool.Name,
      'LintFix',
      'Automatically fix linter errors in code files. Can preview fixes before applying them and supports selective fixing by error types.',
      Icon.Wrench,
      {
        type: Type.OBJECT,
        properties: {
          files: {
            description: 'Optional. Array of file paths to fix. If not provided, fixes all files with errors.',
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          autoFix: {
            description: 'Optional. Whether to automatically apply fixes without confirmation. Default is false.',
            type: Type.BOOLEAN
          },
          preview: {
            description: 'Optional. Whether to show preview of fixes before applying. Default is true.',
            type: Type.BOOLEAN
          },
          fixTypes: {
            description: 'Optional. Array of error types to fix (e.g., ["eslint:no-unused-vars", "typescript:missing-semicolon"]). If not provided, attempts to fix all fixable errors.',
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          maxFixes: {
            description: 'Optional. Maximum number of fixes to apply per file. Default is 50.',
            type: Type.NUMBER
          }
        },
        required: []
      },
      true, // 支持 markdown 输出
      true  // 强制 markdown 渲染
    );
  }

  /**
   * 设置 VSCode 回调函数
   */
  static setCallback(callback: LintFixCallback): void {
    LintFixTool.callback = callback;
  }

  /**
   * 获取当前回调函数
   */
  static getCallback(): LintFixCallback | null {
    return LintFixTool.callback;
  }

  /**
   * 验证工具参数
   */
  validateToolParams(params: LintFixParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params, LintFixTool.Name);
    if (errors) return errors;

    // 验证文件路径
    if (params.files) {
      for (const file of params.files) {
        if (typeof file !== 'string' || file.trim().length === 0) {
          return 'All file paths must be non-empty strings';
        }
      }
    }

    // 验证修复数量限制
    if (params.maxFixes !== undefined && params.maxFixes < 1) {
      return 'maxFixes must be a positive number';
    }

    return null;
  }

  /**
   * 执行工具操作
   */
  async execute(params: LintFixParams, signal: AbortSignal): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters. ${validationError}`,
        returnDisplay: `Parameter validation failed: ${validationError}`
      };
    }

    // 检查回调函数
    if (!LintFixTool.callback) {
      const errorMsg = 'LintFix callback not initialized. This tool requires VSCode extension integration.';
      return {
        llmContent: `Error: ${errorMsg}`,
        returnDisplay: errorMsg
      };
    }

    try {
      // 设置默认值
      const fixParams: LintFixParams = {
        autoFix: false,
        preview: true,
        maxFixes: 50,
        ...params
      };

      logger.info(`[LintFixTool] Executing fix with params:`, fixParams);

      // 调用 VSCode 回调执行修复
      const result = await LintFixTool.callback(fixParams);

      if (!result.success) {
        return {
          llmContent: 'Failed to execute lint fixes. Please check the logs for details.',
          returnDisplay: 'Lint fix operation failed'
        };
      }

      // 生成输出
      const output = this.formatFixResult(result, fixParams);
      const summary = this.generateSummary(result, fixParams);

      return {
        summary,
        llmContent: output,
        returnDisplay: output
      };

    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error(`[LintFixTool] Error executing fixes: ${errorMessage}`);

      return {
        llmContent: `Error executing lint fixes: ${errorMessage}`,
        returnDisplay: `Operation failed: ${errorMessage}`
      };
    }
  }

  /**
   * 格式化修复结果
   */
  private formatFixResult(
    result: { previews?: FixPreview[]; results?: FixResult[]; totalFixes: number; success: boolean },
    params: LintFixParams
  ): string {
    let output = '';

    // 预览模式
    if (params.preview && result.previews && result.previews.length > 0) {
      output += '## 🔍 Lint Fix Preview\n\n';
      output += `Found ${result.totalFixes} fixable issues across ${result.previews.length} files.\n\n`;

      for (const preview of result.previews) {
        output += `### 📄 ${preview.file}\n`;
        output += `*${preview.fixes.length} fixes available*\n\n`;

        for (let i = 0; i < Math.min(preview.fixes.length, 5); i++) {
          const fix = preview.fixes[i];
          output += `${i + 1}. **Line ${fix.range.start.line + 1}**: ${fix.description}\n`;
          output += `   \`${fix.fixKind}\`\n`;
          if (fix.newText.length < 100) {
            output += `   → \`${fix.newText.replace(/\n/g, '\\n')}\`\n`;
          }
          output += '\n';
        }

        if (preview.fixes.length > 5) {
          output += `   ... and ${preview.fixes.length - 5} more fixes\n\n`;
        }
      }

      output += `💡 **Next Steps:**\n`;
      output += `- Review the proposed fixes above\n`;
      output += `- Run with \`autoFix: true\` to apply all fixes\n`;
      output += `- Use \`fixTypes\` parameter to apply only specific types of fixes\n\n`;

    }
    // 实际应用模式
    else if (result.results && result.results.length > 0) {
      output += '## ✅ Lint Fix Results\n\n';

      const totalApplied = result.results.reduce((sum, r) => sum + r.appliedFixes, 0);
      const totalFailed = result.results.reduce((sum, r) => sum + r.failedFixes, 0);

      output += `**Summary:** Applied ${totalApplied} fixes, ${totalFailed} failed\n\n`;

      for (const fileResult of result.results) {
        const status = fileResult.appliedFixes > 0 ? '✅' : (fileResult.failedFixes > 0 ? '❌' : '⚪');
        output += `${status} **${fileResult.file}**\n`;
        output += `   - Applied: ${fileResult.appliedFixes} fixes\n`;

        if (fileResult.failedFixes > 0) {
          output += `   - Failed: ${fileResult.failedFixes} fixes\n`;
        }

        if (fileResult.errors.length > 0) {
          output += `   - Errors: ${fileResult.errors.slice(0, 2).join(', ')}\n`;
          if (fileResult.errors.length > 2) {
            output += `     ... and ${fileResult.errors.length - 2} more\n`;
          }
        }
        output += '\n';
      }

      if (totalApplied > 0) {
        output += `🎉 **Great!** Successfully fixed ${totalApplied} lint issues.\n`;
        output += `💡 Consider running linting again to verify all fixes were applied correctly.\n\n`;
      }
    }

    if (result.totalFixes === 0) {
      const scope = params.files ? `in specified files` : 'in the workspace';
      output = `✨ **No fixable lint issues found** ${scope}.\n\nAll code appears to be in good shape! 🎉`;
    }

    return output.trim();
  }

  /**
   * 生成简要摘要
   */
  private generateSummary(
    result: { previews?: FixPreview[]; results?: FixResult[]; totalFixes: number; success: boolean },
    params: LintFixParams
  ): string {
    if (result.totalFixes === 0) {
      return 'No fixable lint issues found';
    }

    if (params.preview) {
      const fileCount = result.previews?.length || 0;
      return `Found ${result.totalFixes} fixable issues across ${fileCount} files (preview mode)`;
    } else {
      const totalApplied = result.results?.reduce((sum, r) => sum + r.appliedFixes, 0) || 0;
      const totalFailed = result.results?.reduce((sum, r) => sum + r.failedFixes, 0) || 0;
      return `Applied ${totalApplied} fixes, ${totalFailed} failed`;
    }
  }

  /**
   * 获取操作描述
   */
  getDescription(params: LintFixParams): string {
    const mode = params.autoFix ? 'Apply' : 'Preview';
    const scope = params.files ? `${params.files.length} specified files` : 'all files';
    const types = params.fixTypes ? ` (${params.fixTypes.join(', ')})` : '';

    return `${mode} lint fixes for ${scope}${types}`;
  }
}