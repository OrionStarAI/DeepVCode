/**
 * 增强的上下文构建器
 * 处理新的 MessageContent 格式和 VSCode 上下文信息
 */

import { PartListUnion } from '@google/genai';
import { ContextInfo } from '../types/messages.js';
import { MessageContent } from '../types/messages.js';
import {
  convertMessageContentToParts,
  ConversionResult
} from '../utils/messageContentConverter.js';
import { RuleService } from './ruleService.js';
import { RuleMatchContext } from '../types/rules.js';

export interface EnhancedContextResult {
  parts: PartListUnion;
  conversionSummary: ConversionResult['summary'];
  warnings: string[];
  contextInfo?: string | null;
  customRules?: string | null;
}

export class ContextBuilder {
  private static ruleService?: RuleService;

  /**
   * 设置规则服务实例
   */
  static setRuleService(ruleService: RuleService): void {
    this.ruleService = ruleService;
  }

  /**
   * 构建包含 VSCode 上下文的完整 PartListUnion
   */
  static async buildContextualContent(
    userMessage: MessageContent,
    context?: ContextInfo
  ): Promise<EnhancedContextResult> {
    // 🎯 转换消息内容为 Part 数组
    const conversionResult = await convertMessageContentToParts(
      userMessage,
      context?.workspaceRoot
    );

    // 🎯 构建 VSCode 上下文信息
    const contextInfo = this.buildVSCodeContextInfo(context);

    // 🎯 获取自定义规则
    const customRules = await this.buildCustomRulesContext(context);

    // 🎯 组合最终的 Part 数组
    // 优先级：VSCode 上下文 > 自定义规则 > 用户消息
    const finalParts: PartListUnion = [];

    // 1️⃣ 如果有 VSCode 上下文，首先添加（最高优先级）
    if (contextInfo) {
      finalParts.push({
        text: `[VSCode Context]
${contextInfo}

[Context Usage Instructions]
You may use the above VSCode context information to answer user questions. If the user's question is unrelated to the provided context, you may ignore the context information and answer the question directly.

`
      });
    }

    // 2️⃣ 如果有自定义规则，其次添加
    if (customRules) {
      finalParts.push({
        text: `[Custom Rules and Guidelines]
${customRules}

[Rules Usage Instructions]
Please follow the above custom rules and guidelines when processing user requests. These rules define project-specific conventions, coding standards, and best practices.

[User Request]`
      });
    } else if (contextInfo) {
      // 如果有上下文但没有规则，添加用户请求标记
      finalParts.push({
        text: `[User Request]`
      });
    }

    // 添加用户消息的 Part
    if (Array.isArray(conversionResult.parts)) {
      finalParts.push(...conversionResult.parts);
    } else {
      finalParts.push(conversionResult.parts);
    }

    // 如果有警告，添加到末尾
    if (conversionResult.warnings.length > 0) {
      finalParts.push({
        text: `\n[Processing Warnings]\n${conversionResult.warnings.join('\n')}`
      });
    }

    return {
      parts: finalParts,
      conversionSummary: conversionResult.summary,
      warnings: conversionResult.warnings,
      contextInfo,
      customRules
    };
  }

  /**
   * 构建自定义规则上下文
   */
  private static async buildCustomRulesContext(
    context?: ContextInfo
  ): Promise<string | null> {
    if (!this.ruleService) {
      return null;
    }

    // 构建规则匹配上下文
    const matchContext: RuleMatchContext = {
      activeFilePath: context?.activeFile,
      workspaceRoot: context?.workspaceRoot,
      language: context?.projectLanguage
    };

    // 如果有活动文件，提取文件扩展名
    if (context?.activeFile) {
      const ext = context.activeFile.split('.').pop();
      if (ext) {
        matchContext.fileExtension = `.${ext}`;
      }
    }

    // 获取适用的规则
    const result = await this.ruleService.getApplicableRules(matchContext);

    return result.combinedText || null;
  }

  /**
   * 构建 VSCode 上下文信息字符串
   */
  private static buildVSCodeContextInfo(context?: ContextInfo): string | null {
    if (!context || !this.hasValidContext(context)) {
      return null;
    }

    const contextParts = this.extractContextParts(context);
    return contextParts.length > 0 ? contextParts.join('\n') : null;
  }

  /**
   * 提取 VSCode 上下文信息 - 只处理当前活跃文件的相关信息
   */
  private static extractContextParts(context: ContextInfo): string[] {
    const contextParts: string[] = [];

    // 🎯 只保留与当前活跃文件相关的核心信息
    if (context.activeFile) {
      contextParts.push(`Current file: ${context.activeFile}`);
    }

    if (context.selectedText) {
      contextParts.push(`Selected code:\n\`\`\`\n${context.selectedText}\n\`\`\``);
    }

    if (context.cursorPosition) {
      contextParts.push(`Cursor position: Line ${context.cursorPosition.line + 1}, Column ${context.cursorPosition.character + 1}`);
    }

    return contextParts;
  }

  /**
   * 检查上下文是否包含有效信息
   */
  static hasValidContext(context?: ContextInfo): boolean {
    if (!context) {
      return false;
    }

    return !!(
      context.activeFile ||
      context.selectedText ||
      context.cursorPosition ||
      context.workspaceRoot ||
      context.projectLanguage ||
      (context.openFiles && context.openFiles.length > 0) ||
      context.gitBranch
    );
  }

  /**
   * 验证和清理消息内容
   */
  static validateMessage(message: MessageContent): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!Array.isArray(message)) {
      errors.push('MessageContent must be an array');
      return { isValid: false, errors };
    }

    if (message.length === 0) {
      errors.push('MessageContent cannot be empty');
      return { isValid: false, errors };
    }

    for (let i = 0; i < message.length; i++) {
      const part = message[i];

      if (!part.type || !part.value) {
        errors.push(`Part ${i}: missing type or value`);
        continue;
      }

      switch (part.type) {
        case 'text':
          if (typeof part.value !== 'string') {
            errors.push(`Part ${i}: text value must be string`);
          }
          break;

        case 'file_reference':
          if (!part.value.fileName || !part.value.filePath) {
            errors.push(`Part ${i}: file must have fileName and filePath`);
          }
          break;

        case 'folder_reference':
          if (!part.value.folderName || !part.value.folderPath) {
            errors.push(`Part ${i}: folder must have folderName and folderPath`);
          }
          break;

        case 'image_reference':
          if (!part.value.data || !part.value.mimeType) {
            errors.push(`Part ${i}: image must have data and mimeType`);
          }
          break;

        case 'terminal_reference':
          if (!part.value.terminalName) {
            errors.push(`Part ${i}: terminal must have terminalName`);
          }
          break;

        case 'text_file_content':
          if (!part.value.fileName || !part.value.content) {
            errors.push(`Part ${i}: text_file_content must have fileName and content`);
          }
          break;

        default:
          errors.push(`Part ${i}: unknown type ${(part as any).type}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}