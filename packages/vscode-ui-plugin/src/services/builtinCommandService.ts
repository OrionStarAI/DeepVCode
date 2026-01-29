/**
 * @license
 * Copyright 2025 DeepV Code
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Built-in Command Service for VSCode UI Plugin
 *
 * Handles execution of built-in slash commands that require special processing,
 * such as /tools (show available tools) and /compress (compress chat history).
 *
 * These commands interact directly with AIService and don't just inject prompts.
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { AIService } from './aiService';

/**
 * Result of executing a built-in command
 */
export interface BuiltinCommandResult {
  success: boolean;
  /** Message content to display (can include ANSI codes for CLI-like formatting) */
  message?: string;
  /** Error message if failed */
  error?: string;
  /** Token usage info for compression command */
  tokenInfo?: {
    originalTokenCount: number;
    newTokenCount: number;
  };
}

/**
 * Tool descriptions in English
 */
const TOOL_DESCRIPTIONS_EN: Record<string, string> = {
  'Edit': 'Edit file content by replacing specified text segments. Supports precise matching and multiple replacements',
  'FindFiles': 'Search for files by name pattern, supporting wildcards and recursive search',
  'WebSearch': 'Find relevant information and resources on the web using search engines',
  'ReadFile': 'Read and display file content with support for pagination of large files',
  'ReadFolder': 'Read directory structure and contents, displaying files in a folder',
  'ReadManyFiles': 'Batch read multiple files efficiently for group file operations',
  'Save Memory': 'Save important information to AI long-term memory for cross-session use',
  'SearchText': 'Search for specified text content in files, supporting regular expressions',
  'Shell': 'Execute system commands and shell scripts to interact with the operating system',
  'Task': 'Manage and execute tasks with support for task scheduling and status tracking',
  'TodoRead': 'Read todo list and view current task status',
  'TodoWrite': 'Create and manage todo items, record tasks and progress',
  'WebFetch': 'Fetch web page content and download network resources and data',
  'WriteFile': 'Create or overwrite file content by writing data to specified file',
  'DeleteFile': 'Delete files from the filesystem',
  'Batch': 'Execute multiple tool calls in parallel for efficiency',
  'MultiEdit': 'Perform multiple edits sequentially on files',
  'Patch': 'Apply patches to modify multiple files',
  'LSP': 'Perform Language Server Protocol operations like Go to Definition, Find References',
  'ReadLints': 'Read linter errors from the workspace',
  'LintFix': 'Automatically fix linter errors in code files',
  'CodeSearch': 'Search code to find relevant context for APIs and libraries',
  'Glob': 'Find files matching specific glob patterns',
};

/**
 * Tool descriptions in Chinese
 */
const TOOL_DESCRIPTIONS_CN: Record<string, string> = {
  'Edit': '编辑文件内容，替换指定的文本片段。支持精确匹配和多次替换',
  'FindFiles': '按文件名模式搜索文件，支持通配符匹配和递归搜索',
  'WebSearch': '使用Web搜索引擎在网络上查找相关信息和资料',
  'ReadFile': '读取并显示文件内容，支持分页浏览大文件',
  'ReadFolder': '读取目录结构和内容，显示文件夹中的文件列表',
  'ReadManyFiles': '批量读取多个文件的内容，高效处理文件组操作',
  'Save Memory': '保存重要信息到AI的长期记忆中，用于跨会话记忆',
  'SearchText': '在文件中搜索指定的文本内容，支持正则表达式',
  'Shell': '执行系统命令和Shell脚本，与操作系统交互',
  'Task': '管理和执行任务，支持任务调度和状态跟踪',
  'TodoRead': '读取待办事项列表，查看当前的任务状态',
  'TodoWrite': '创建和管理待办事项，记录任务和进度',
  'WebFetch': '获取网页内容，下载网络资源和数据',
  'WriteFile': '创建或覆盖文件内容，将数据写入到指定文件',
  'DeleteFile': '从文件系统中删除文件',
  'Batch': '并行执行多个工具调用，提高效率',
  'MultiEdit': '对文件执行多个顺序编辑',
  'Patch': '应用补丁来修改多个文件',
  'LSP': '执行语言服务器协议操作，如跳转到定义、查找引用',
  'ReadLints': '读取工作区的linter错误',
  'LintFix': '自动修复代码文件中的linter错误',
  'CodeSearch': '搜索代码以查找API和库的相关上下文',
  'Glob': '查找匹配特定glob模式的文件',
};

/**
 * Service for handling built-in slash commands
 */
export class BuiltinCommandService {
  constructor(private readonly logger: Logger) {}

  /**
   * Execute a built-in command
   * @param commandName The command name (e.g., 'tools', 'compress')
   * @param aiService The AI service instance for the current session
   * @param args Optional arguments for the command
   * @returns Result of the command execution
   */
  async executeCommand(
    commandName: string,
    aiService: AIService,
    args?: string
  ): Promise<BuiltinCommandResult> {
    this.logger.info(`[BuiltinCommand] Executing: /${commandName}`, { args });

    switch (commandName) {
      case 'tools':
        return this.executeToolsCommand(aiService, args);
      case 'compress':
      case 'summarize':
        return this.executeCompressCommand(aiService);
      case 'trim-spaces':
        return this.executeTrimSpacesCommand(aiService, args);
      default:
        return {
          success: false,
          error: `Unknown built-in command: /${commandName}`,
        };
    }
  }

  /**
   * Execute /tools command - show available AI tools
   * Supports subcommands:
   *   - /tools         : Show built-in tools with descriptions
   *   - /tools nodesc  : Show built-in tools without descriptions
   *   - /tools mcp     : Show MCP tools
   *   - /tools all     : Show all tools (built-in + MCP)
   */
  private async executeToolsCommand(
    aiService: AIService,
    args?: string
  ): Promise<BuiltinCommandResult> {
    try {
      const config = aiService.getConfig();
      if (!config) {
        return {
          success: false,
          error: 'Configuration not available. Please wait for initialization.',
        };
      }

      const toolRegistry = await config.getToolRegistry();
      if (!toolRegistry) {
        return {
          success: false,
          error: 'Tool registry not available.',
        };
      }

      const tools = toolRegistry.getAllTools();
      const builtInTools = tools.filter((tool) => !('serverName' in tool));
      const mcpTools = tools.filter((tool) => 'serverName' in tool);

      // Parse arguments
      const argTrimmed = args?.trim().toLowerCase();
      const showMcpOnly = argTrimmed === 'mcp';
      const showAll = argTrimmed === 'all';
      const showNoDesc = argTrimmed === 'nodesc' || argTrimmed === 'nodescriptions';

      // Detect language
      const isChineseLocale = vscode.env.language.startsWith('zh');
      const descriptions = isChineseLocale ? TOOL_DESCRIPTIONS_CN : TOOL_DESCRIPTIONS_EN;

      let message = '';

      // 🎯 Show MCP tools only
      if (showMcpOnly) {
        const headerText = isChineseLocale ? '📡 MCP 工具:' : '📡 MCP Tools:';
        const noToolsText = isChineseLocale ? '  暂无 MCP 工具' : '  No MCP tools available';

        message = `${headerText}\n\n`;

        if (mcpTools.length > 0) {
          // Group MCP tools by server name
          const toolsByServer = new Map<string, typeof mcpTools>();
          for (const tool of mcpTools) {
            const serverName = (tool as any).serverName || 'Unknown';
            if (!toolsByServer.has(serverName)) {
              toolsByServer.set(serverName, []);
            }
            toolsByServer.get(serverName)!.push(tool);
          }

          for (const [serverName, serverTools] of toolsByServer) {
            message += `**${serverName}** (${serverTools.length})\n`;
            for (const tool of serverTools) {
              const displayName = tool.displayName || tool.name;
              message += `  • ${displayName}\n`;
            }
            message += '\n';
          }
        } else {
          message += `${noToolsText}\n`;
        }

        return { success: true, message };
      }

      // 🎯 Show built-in tools (default)
      const showDescriptions = !showNoDesc;
      const noBuiltInToolsText = isChineseLocale ? '  暂无内置工具' : '  No built-in tools available';

      if (builtInTools.length > 0) {
        for (const tool of builtInTools) {
          const displayName = tool.displayName || tool.name;

          if (showDescriptions) {
            message += `  • **${displayName}**\n`;

            // Get description
            let briefDesc = descriptions[displayName];
            if (!briefDesc && tool.description) {
              // Extract first sentence or first 150 characters
              const firstSentence = tool.description.split(/[.!?](?:\s|$)/)[0];
              briefDesc = firstSentence.length > 150
                ? tool.description.substring(0, 150) + '...'
                : firstSentence;
              briefDesc = briefDesc.replace(/\s+/g, ' ').trim();
            }

            if (briefDesc) {
              message += `    ${briefDesc}\n\n`;
            } else {
              message += '\n';
            }
          } else {
            message += `  • **${displayName}**\n`;
          }
        }
      } else {
        message += `${noBuiltInToolsText}\n`;
      }

      // 🎯 Show MCP tools if requested with /tools all, or show count as hint
      if (showAll && mcpTools.length > 0) {
        const mcpHeader = isChineseLocale ? '\n📡 MCP 工具:' : '\n📡 MCP Tools:';
        message += `\n${mcpHeader}\n\n`;

        // Group MCP tools by server name
        const toolsByServer = new Map<string, typeof mcpTools>();
        for (const tool of mcpTools) {
          const serverName = (tool as any).serverName || 'Unknown';
          if (!toolsByServer.has(serverName)) {
            toolsByServer.set(serverName, []);
          }
          toolsByServer.get(serverName)!.push(tool);
        }

        for (const [serverName, serverTools] of toolsByServer) {
          message += `**${serverName}** (${serverTools.length})\n`;
          for (const tool of serverTools) {
            const displayName = tool.displayName || tool.name;
            message += `  • ${displayName}\n`;
          }
          message += '\n';
        }
      } else if (mcpTools.length > 0) {
        // Just show count with hint to use /tools mcp
        const mcpText = isChineseLocale
          ? `\n📡 还有 ${mcpTools.length} 个 MCP 工具可用 (使用 \`/tools mcp\` 查看详情)`
          : `\n📡 ${mcpTools.length} MCP tool(s) also available (use \`/tools mcp\` for details)`;
        message += mcpText;
      }

      return {
        success: true,
        message,
      };
    } catch (error) {
      this.logger.error('[BuiltinCommand] /tools failed', error instanceof Error ? error : undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get tools list',
      };
    }
  }

  /**
   * Execute /compress command - manually compress chat history
   */
  private async executeCompressCommand(aiService: AIService): Promise<BuiltinCommandResult> {
    try {
      const geminiClient = aiService.getGeminiClient();
      if (!geminiClient) {
        const isChineseLocale = vscode.env.language.startsWith('zh');
        return {
          success: false,
          error: isChineseLocale
            ? 'AI 客户端未初始化。请等待初始化完成后重试。'
            : 'AI client not available. Please wait for initialization.',
        };
      }

      // Check if compression is already in progress
      if (geminiClient.isCompressionInProgress()) {
        const isChineseLocale = vscode.env.language.startsWith('zh');
        return {
          success: false,
          error: isChineseLocale
            ? '压缩正在进行中，请等待当前压缩完成'
            : 'Compression already in progress, please wait for it to complete',
        };
      }

      const isChineseLocale = vscode.env.language.startsWith('zh');

      // 🎯 检查对话历史是否足够
      const history = geminiClient.getHistory();
      if (!history || history.length < 4) {
        return {
          success: false,
          error: isChineseLocale
            ? `对话历史不足，无法压缩。当前历史: ${history?.length || 0} 条消息，至少需要 4 条消息。`
            : `Insufficient chat history to compress. Current history: ${history?.length || 0} messages, need at least 4.`,
        };
      }

      // Execute compression
      const promptId = `compress-${Date.now()}`;
      const abortController = new AbortController();

      const result = await geminiClient.tryCompressChat(
        promptId,
        abortController.signal,
        true // force compression
      );

      if (result) {
        const message = isChineseLocale
          ? `✅ 对话历史压缩完成\n\n` +
            `📊 **压缩前**: ${result.originalTokenCount.toLocaleString()} tokens\n` +
            `📉 **压缩后**: ${result.newTokenCount.toLocaleString()} tokens\n` +
            `💾 **节省**: ${(result.originalTokenCount - result.newTokenCount).toLocaleString()} tokens ` +
            `(${Math.round((1 - result.newTokenCount / result.originalTokenCount) * 100)}%)`
          : `✅ Chat history compressed successfully\n\n` +
            `📊 **Before**: ${result.originalTokenCount.toLocaleString()} tokens\n` +
            `📉 **After**: ${result.newTokenCount.toLocaleString()} tokens\n` +
            `💾 **Saved**: ${(result.originalTokenCount - result.newTokenCount).toLocaleString()} tokens ` +
            `(${Math.round((1 - result.newTokenCount / result.originalTokenCount) * 100)}%)`;

        return {
          success: true,
          message,
          tokenInfo: {
            originalTokenCount: result.originalTokenCount,
            newTokenCount: result.newTokenCount,
          },
        };
      } else {
        // 🎯 提供更详细的失败原因
        const historyLength = geminiClient.getHistory()?.length || 0;
        return {
          success: false,
          error: isChineseLocale
            ? `压缩失败：无法找到合适的压缩边界。\n\n` +
              `💡 可能原因：\n` +
              `• 对话历史不足（当前 ${historyLength} 条消息）\n` +
              `• 对话中存在未完成的工具调用\n` +
              `• 对话结构复杂，无法安全切分\n\n` +
              `建议：继续对话后再尝试压缩，或等待上下文自动管理。`
            : `Compression failed: Could not find suitable compression boundary.\n\n` +
              `💡 Possible reasons:\n` +
              `• Insufficient chat history (current: ${historyLength} messages)\n` +
              `• Pending tool calls in conversation\n` +
              `• Complex conversation structure prevents safe splitting\n\n` +
              `Suggestion: Continue chatting and try again, or let auto context management handle it.`,
        };
      }
    } catch (error) {
      this.logger.error('[BuiltinCommand] /compress failed', error instanceof Error ? error : undefined);
      const isChineseLocale = vscode.env.language.startsWith('zh');
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: isChineseLocale
          ? `压缩失败：${errorMsg}`
          : `Compression failed: ${errorMsg}`,
      };
    }
  }
  /**
   * Execute /trim-spaces command - manage auto trim trailing spaces
   */
  private async executeTrimSpacesCommand(aiService: AIService, args?: string): Promise<BuiltinCommandResult> {
    try {
      const config = aiService.getConfig();
      if (!config) {
        return {
          success: false,
          error: 'Configuration not available. Please wait for initialization.',
        };
      }

      const projectSettingsManager = config.getProjectSettingsManager();
      const currentSetting = projectSettingsManager.getAutoTrimTrailingSpaces();
      const trimmedArgs = args?.trim().toLowerCase() || '';
      const isChineseLocale = vscode.env.language.startsWith('zh');

      // No arguments - show status
      if (!trimmedArgs) {
        return this.getTrimSpacesStatus(currentSetting, isChineseLocale);
      }

      // Enable command
      if (['on', 'enable', 'true', '1', 'yes'].includes(trimmedArgs)) {
        return this.handleTrimSpacesEnable(currentSetting, projectSettingsManager, isChineseLocale);
      }

      // Disable command
      if (['off', 'disable', 'false', '0', 'no'].includes(trimmedArgs)) {
        return this.handleTrimSpacesDisable(currentSetting, projectSettingsManager, isChineseLocale);
      }

      // Reset to default
      if (['default', 'reset', 'auto'].includes(trimmedArgs)) {
        return this.handleTrimSpacesReset(currentSetting, projectSettingsManager, isChineseLocale);
      }

      // Invalid argument
      const errorMsg = isChineseLocale
        ? `❌ 无效的参数: ${args}\n\n有效用法:\n` +
          `  /trim-spaces          - 查看当前状态\n` +
          `  /trim-spaces on       - 启用自动删除行末空格\n` +
          `  /trim-spaces off      - 禁用自动删除行末空格\n` +
          `  /trim-spaces default  - 使用语言默认设置`
        : `❌ Invalid argument: ${args}\n\nValid usage:\n` +
          `  /trim-spaces          - View current status\n` +
          `  /trim-spaces on       - Enable auto trim trailing spaces\n` +
          `  /trim-spaces off      - Disable auto trim trailing spaces\n` +
          `  /trim-spaces default  - Use language default settings`;

      return {
        success: false,
        error: errorMsg,
      };
    } catch (error) {
      this.logger.error('[BuiltinCommand] /trim-spaces failed', error instanceof Error ? error : undefined);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute trim-spaces command',
      };
    }
  }

  /**
   * Get trim-spaces status message
   */
  private getTrimSpacesStatus(currentSetting: boolean | undefined, isChineseLocale: boolean): BuiltinCommandResult {
    let statusText: string;
    let statusIcon: string;
    let statusDescription: string;

    if (currentSetting === true) {
      statusText = isChineseLocale ? '已启用' : 'Enabled';
      statusIcon = '✅';
      statusDescription = isChineseLocale
        ? '编辑源代码时自动删除行末空格'
        : 'Auto remove trailing spaces when editing source code';
    } else if (currentSetting === false) {
      statusText = isChineseLocale ? '已禁用' : 'Disabled';
      statusIcon = '❌';
      statusDescription = isChineseLocale
        ? '保留所有文件的原始行末空格'
        : 'Preserve original trailing spaces in all files';
    } else {
      statusText = isChineseLocale ? '使用语言默认设置' : 'Using language defaults';
      statusIcon = '🔧';
      statusDescription = isChineseLocale
        ? '各语言使用自己的默认处理方式'
        : 'Each language uses its own default handling';
    }

    const message = isChineseLocale
      ? `${statusIcon} 自动删除行末空格 ${statusText}\n\n` +
        `当前行为: ${statusDescription}\n\n` +
        `配置说明:\n` +
        `• 启用：编辑C++、Python等源代码时自动删除行末空格\n` +
        `• 禁用：保留所有文件的原始行末空格\n` +
        `• 默认：使用各语言的默认处理方式\n\n` +
        `使用方法:\n` +
        `  /trim-spaces on       - 启用自动删除行末空格\n` +
        `  /trim-spaces off      - 禁用自动删除行末空格\n` +
        `  /trim-spaces default  - 使用语言默认设置\n\n` +
        `配置文件: .deepvcode/settings.json`
      : `${statusIcon} Auto Trim Trailing Spaces ${statusText}\n\n` +
        `Current Behavior: ${statusDescription}\n\n` +
        `Configuration Explanation:\n` +
        `• Enabled: Auto remove trailing spaces when editing C++, Python, etc.\n` +
        `• Disabled: Preserve original trailing spaces in all files\n` +
        `• Default: Use each language's default handling\n\n` +
        `Usage:\n` +
        `  /trim-spaces on       - Enable auto trim trailing spaces\n` +
        `  /trim-spaces off      - Disable auto trim trailing spaces\n` +
        `  /trim-spaces default  - Use language default settings\n\n` +
        `Config file: .deepvcode/settings.json`;

    return {
      success: true,
      message,
    };
  }

  /**
   * Handle enable trim-spaces
   */
  private handleTrimSpacesEnable(
    currentSetting: boolean | undefined,
    projectSettingsManager: any,
    isChineseLocale: boolean
  ): BuiltinCommandResult {
    if (currentSetting === true) {
      const message = isChineseLocale
        ? '✅ 自动删除行末空格已经是启用状态。'
        : '✅ Auto trim trailing spaces is already enabled.';
      return { success: true, message };
    }

    try {
      projectSettingsManager.setAutoTrimTrailingSpaces(true);

      const message = isChineseLocale
        ? `✅ 已启用自动删除行末空格！\n\n` +
          `📝 编辑C++、Python等源代码文件时，将自动删除行末空格。\n` +
          `📁 配置已保存到 .deepvcode/settings.json`
        : `✅ Auto trim trailing spaces enabled!\n\n` +
          `📝 Trailing spaces will be auto-removed when editing C++, Python, etc.\n` +
          `📁 Configuration saved to .deepvcode/settings.json`;

      return { success: true, message };
    } catch (error) {
      const errorMsg = isChineseLocale
        ? `❌ 启用自动删除行末空格失败: ${error instanceof Error ? error.message : String(error)}`
        : `❌ Failed to enable auto trim trailing spaces: ${error instanceof Error ? error.message : String(error)}`;
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Handle disable trim-spaces
   */
  private handleTrimSpacesDisable(
    currentSetting: boolean | undefined,
    projectSettingsManager: any,
    isChineseLocale: boolean
  ): BuiltinCommandResult {
    if (currentSetting === false) {
      const message = isChineseLocale
        ? '❌ 自动删除行末空格已经是禁用状态。'
        : '❌ Auto trim trailing spaces is already disabled.';
      return { success: true, message };
    }

    try {
      projectSettingsManager.setAutoTrimTrailingSpaces(false);

      const message = isChineseLocale
        ? `❌ 已禁用自动删除行末空格。\n\n` +
          `📝 编辑任何文件时都会保留原始的行末空格。\n` +
          `📁 配置已保存到 .deepvcode/settings.json`
        : `❌ Auto trim trailing spaces disabled.\n\n` +
          `📝 Original trailing spaces will be preserved in all files.\n` +
          `📁 Configuration saved to .deepvcode/settings.json`;

      return { success: true, message };
    } catch (error) {
      const errorMsg = isChineseLocale
        ? `❌ 禁用自动删除行末空格失败: ${error instanceof Error ? error.message : String(error)}`
        : `❌ Failed to disable auto trim trailing spaces: ${error instanceof Error ? error.message : String(error)}`;
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Handle reset trim-spaces to default
   */
  private handleTrimSpacesReset(
    currentSetting: boolean | undefined,
    projectSettingsManager: any,
    isChineseLocale: boolean
  ): BuiltinCommandResult {
    if (currentSetting === undefined) {
      const message = isChineseLocale
        ? '🔧 当前已经使用语言默认设置。'
        : '🔧 Already using language default settings.';
      return { success: true, message };
    }

    try {
      const currentSettings = projectSettingsManager.getSettings();
      const newSettings: Record<string, any> = {};
      for (const key in currentSettings) {
        if (key !== 'autoTrimTrailingSpaces') {
          newSettings[key] = currentSettings[key];
        }
      }
      projectSettingsManager.save(newSettings);

      const message = isChineseLocale
        ? `🔧 已恢复使用语言默认设置。\n\n` +
          `📝 各语言将使用自己的默认行末空格处理方式:\n` +
          `• C/C++: 删除行末空格\n` +
          `• Python: 删除行末空格\n` +
          `• JavaScript/TypeScript: 删除行末空格\n` +
          `📁 配置已更新到 .deepvcode/settings.json`
        : `🔧 Reset to language default settings.\n\n` +
          `📝 Each language will use its default trailing space handling:\n` +
          `• C/C++: Remove trailing spaces\n` +
          `• Python: Remove trailing spaces\n` +
          `• JavaScript/TypeScript: Remove trailing spaces\n` +
          `📁 Configuration updated in .deepvcode/settings.json`;

      return { success: true, message };
    } catch (error) {
      const errorMsg = isChineseLocale
        ? `❌ 恢复默认设置失败: ${error instanceof Error ? error.message : String(error)}`
        : `❌ Failed to reset to default settings: ${error instanceof Error ? error.message : String(error)}`;
      return { success: false, error: errorMsg };
    }
  }
}


