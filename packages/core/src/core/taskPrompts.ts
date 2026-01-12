/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * Task工具和SubAgent相关的提示文本模板 / Prompt text templates for Task tool and SubAgent
 */
export class TaskPrompts {
  /**
   * 生成Task工具的执行描述 / Generate execution description for Task tool
   */
//   static getExecutionDescription(taskDescription: string, maxTurns: number): string {
//     // 子Agent任务执行描述
//     return `**Sub-Agent Task Execution**

// **Task Description**: ${taskDescription}

// **Execution Configuration**:
// - Maximum conversation turns: ${maxTurns}
// - Available tools: All tools allowed for sub-agent use (filtered by allowSubAgentUse)

// **Execution Flow**:
// 1. Create independent sub-agent instance
// 2. Sub-agent analyzes task and creates execution plan  
// 3. Sub-agent conducts multi-turn AI conversation with step-by-step tool execution
// 4. Returns detailed execution report upon completion

// Note: Sub-agent tool calls will be processed according to current confirmation settings.`;
//   }

  /**
   * 生成成功结果的摘要文本 / Generate success result summary text
   */
  static getSuccessResultSummary(summary: string): string {
    return `✅ Sub-agent task completed: ${summary}`;
  }

  /**
   * 生成失败结果的摘要文本 / Generate error result summary text
   */
  static getErrorResultSummary(summary: string): string {
    return `❌ Sub-agent task failed: ${summary}`;
  }

  /**
   * 生成结果显示内容 / Generate result display content
   */
  static buildResultDisplay(
    taskDescription: string,
    summary: string,
    isSuccess: boolean,
    filesCreated?: string[],
    commandsRun?: string[],
    error?: string,
    executionLog?: string[]
  ): string {
    const statusIcon = isSuccess ? '✅' : '❌';
    const statusText = isSuccess ? 'Execution Successful' : 'Execution Failed';

    let display = `## ${statusIcon} Sub-Agent Task ${statusText}

**Task**: ${taskDescription}

**Execution Result**: ${summary}

`;

    // 添加文件操作统计
    if (filesCreated && filesCreated.length > 0) {
      display += `**Files Created** (${filesCreated.length} files):\n`;
      filesCreated.forEach(file => {
        display += `- ${file}\n`;
      });
      display += '\n';
    }

    // 添加命令执行统计
    if (commandsRun && commandsRun.length > 0) {
      display += `**Commands Executed** (${commandsRun.length} commands):\n`;
      commandsRun.forEach(cmd => {
        display += `- \`${cmd}\`\n`;
      });
      display += '\n';
    }

    // 添加错误信息
    if (error) {
      display += `**Error Information**: ${error}\n\n`;
    }

    // 添加执行日志 (只显示最后几条)
    if (executionLog && executionLog.length > 0) {
      display += `**Execution Log**:\n`;
      const logToShow = executionLog.slice(-5); // 只显示最后5条
      logToShow.forEach(log => {
        display += `${log}\n`;
      });
      
      if (executionLog.length > 5) {
        display += `... (total ${executionLog.length} log entries)\n`;
      }
    }

    return display;
  }



  /**
   * 构建SubAgent的固定系统指令（不包含任务描述）/ Build fixed system instruction for SubAgent (without task description)
   */
  static buildSubAgentFixedSystemPrompt(availableTools: string[]): string {
    return `You are a specialized code analysis and exploration sub-agent - a deep analysis expert.

Available Tools: ${availableTools.join(', ')}

**Important Rule: If you don't call any tools in your response, the system will automatically consider the analysis completed and end execution.**

# Your Primary Role
You are NOT a code writer or task executor. You are a **deep analysis expert** who provides comprehensive technical insights to help the main agent make informed decisions.

# Core Analysis Principles
- **Systematic Exploration**: Use tools to explore ALL relevant files, dependencies, and patterns
- **Deep Understanding**: Don't just list files - understand how components work together  
- **Pattern Recognition**: Identify coding conventions, architectural decisions, and design patterns
- **Problem Identification**: Spot potential issues, inconsistencies, or improvement opportunities
- **Actionable Insights**: Provide specific recommendations based on your analysis

# Analysis Process
1. **Comprehensive Discovery**: Use grep, glob, read-file tools to find all relevant code
2. **Architecture Analysis**: Understand how components are organized and interact
3. **Convention Analysis**: Identify the project's coding style, naming patterns, and practices
4. **Dependency Mapping**: Understand what depends on what, find key interfaces
5. **Issue Assessment**: Identify potential problems or areas for improvement

# Final Report Standards
When you're done with analysis (no more tools needed), provide a comprehensive report with:

**## Analysis Summary**
Brief overview of what you analyzed and key findings.

**## Key Components & Architecture**
- Main files and their roles
- How components interact
- Architecture patterns used

**## Code Conventions Observed**  
- Naming patterns
- File organization
- Coding style and practices
- Framework/library usage patterns

**## Dependencies & Relationships**
- Internal component dependencies
- External library usage
- Key interfaces and contracts

**## Findings & Recommendations**
- Issues or inconsistencies found
- Improvement opportunities  
- Specific implementation suggestions
- Files that would need modification

**## Implementation Guidance**
Specific guidance for the main agent on how to proceed with the task.

Remember: Your value is in providing deep, actionable analysis that saves the main agent time and ensures high-quality implementation.`;
  }

  /**
   * 构建SubAgent任务提示（只包含任务描述）/ Build task prompt for SubAgent (task description only)
   */
  static buildSubAgentTaskPrompt(taskDescription: string): string {
    return `Task: ${taskDescription}

Please analyze this task and complete it using the available tools.`;
  }

  /**
   * SubAgent初始确认回复 / SubAgent initial confirmation response
   */
  static readonly SUBAGENT_INITIAL_RESPONSE = 'Got it. Thanks for the context!';


  /**
   * 基于工具结果继续的提示消息 / Continue based on tool results prompt message
   */
  static readonly CONTINUE_AFTER_TOOLS_PROMPT = 'Please continue completing the task based on tool execution results. Remember: not calling tools = task completion.';

  /**
   * 工具参数验证错误消息 / Tool parameter validation error messages
   */
  static readonly VALIDATION_ERRORS = {
    // task_description 不能为空
    TASK_DESCRIPTION_EMPTY: 'task_description cannot be empty',
    // max_turns 必须在 1-50 之间
    MAX_TURNS_OUT_OF_RANGE: 'max_turns must be between 1 and 50',
  } as const;

  /**
   * 执行过程中的错误消息 / Execution error messages
   */
  static readonly EXECUTION_ERRORS = {
    // GeminiClient 未初始化，请确保配置正确
    GEMINI_CLIENT_NOT_INITIALIZED: 'GeminiClient not initialized, please ensure configuration is correct',
    // GeminiClient 未正确初始化，请确保认证已完成。错误: ${error}
    GEMINI_CLIENT_NOT_READY: (error: string) => 
      `GeminiClient not properly initialized, please ensure authentication is complete. Error: ${error}`,
  } as const;
}