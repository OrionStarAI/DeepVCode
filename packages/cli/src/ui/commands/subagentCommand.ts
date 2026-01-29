/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SlashCommand,
  SlashCommandActionReturn,
  CommandContext,
  CommandKind,
  MessageActionReturn,
} from './types.js';
import {
  SubAgentManager,
  SubAgentInfo,
  AsyncSubAgentTask,
} from 'deepv-code-core';

const COLOR_GREEN = '\u001b[32m';
const COLOR_YELLOW = '\u001b[33m';
const COLOR_RED = '\u001b[31m';
const COLOR_CYAN = '\u001b[36m';
const COLOR_BLUE = '\u001b[34m';
const COLOR_MAGENTA = '\u001b[35m';
const COLOR_GREY = '\u001b[90m';
const RESET_COLOR = '\u001b[0m';
const BOLD = '\u001b[1m';

/**
 * 格式化 SubAgent 状态显示
 */
function formatSubAgentStatus(info: SubAgentInfo): string {
  const icon = info.config.icon || '🤖';
  const statusIcon = info.config.enabled !== false ? '✅' : '⚫';
  const typeLabel = info.isBuiltIn
    ? `${COLOR_BLUE}[Built-in]${RESET_COLOR}`
    : `${COLOR_GREEN}[Custom]${RESET_COLOR}`;

  let output = `${statusIcon} ${icon} ${BOLD}${info.config.name}${RESET_COLOR} ${typeLabel}\n`;
  output += `   ${COLOR_GREY}ID: ${info.config.id}${RESET_COLOR}\n`;
  output += `   ${info.config.description}\n`;

  if (info.config.defaultMaxTurns) {
    output += `   ${COLOR_GREY}Default max turns: ${info.config.defaultMaxTurns}${RESET_COLOR}\n`;
  }

  if (info.config.allowedTools && info.config.allowedTools.length > 0) {
    output += `   ${COLOR_GREY}Allowed tools: ${info.config.allowedTools.join(', ')}${RESET_COLOR}\n`;
  }

  if (info.config.excludedTools && info.config.excludedTools.length > 0) {
    output += `   ${COLOR_GREY}Excluded tools: ${info.config.excludedTools.join(', ')}${RESET_COLOR}\n`;
  }

  return output;
}

/**
 * 格式化异步任务状态
 */
function formatTaskStatus(task: AsyncSubAgentTask): string {
  const statusIcons: Record<string, string> = {
    'pending': '⏳',
    'running': '🔄',
    'completed': '✅',
    'failed': '❌',
    'cancelled': '🚫',
  };

  const statusIcon = statusIcons[task.status] || '❓';
  const duration = task.endTime
    ? `${((task.endTime - task.startTime) / 1000).toFixed(1)}s`
    : `${((Date.now() - task.startTime) / 1000).toFixed(1)}s (running)`;

  let output = `${statusIcon} ${BOLD}${task.subAgentName}${RESET_COLOR}\n`;
  output += `   ${COLOR_GREY}Task ID: ${task.taskId}${RESET_COLOR}\n`;
  output += `   ${COLOR_GREY}Description: ${task.description}${RESET_COLOR}\n`;
  output += `   ${COLOR_GREY}Status: ${task.status}${RESET_COLOR}\n`;
  output += `   ${COLOR_GREY}Progress: ${task.currentTurn}/${task.maxTurns} turns${RESET_COLOR}\n`;
  output += `   ${COLOR_GREY}Duration: ${duration}${RESET_COLOR}\n`;

  if (task.result) {
    output += `   ${COLOR_GREY}Summary: ${task.result.summary}${RESET_COLOR}\n`;
    if (task.result.error) {
      output += `   ${COLOR_RED}Error: ${task.result.error}${RESET_COLOR}\n`;
    }
  }

  return output;
}

/**
 * 显示所有 SubAgent 列表
 */
async function showSubAgentList(context: CommandContext): Promise<SlashCommandActionReturn> {
  const { config } = context.services;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Configuration not loaded',
    };
  }

  const manager = config.getSubAgentManager();
  if (!manager) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'SubAgent manager not initialized',
    };
  }

  const subAgents = manager.getEnabledSubAgents();

  if (subAgents.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content: `${COLOR_CYAN}${BOLD}No SubAgents Available${RESET_COLOR}

No SubAgents are currently registered. You can add custom SubAgents
by creating a configuration file at:

  ${COLOR_GREEN}.deepvcode/subagents.json${RESET_COLOR}

${COLOR_YELLOW}Example configuration:${RESET_COLOR}
${COLOR_GREY}{
  "subAgents": [
    {
      "id": "my-agent",
      "name": "My Custom Agent",
      "description": "A custom agent for specific tasks",
      "systemPrompt": "You are a specialized agent...",
      "defaultMaxTurns": 30,
      "enabled": true
    }
  ]
}${RESET_COLOR}`,
    };
  }

  // Group by type
  const builtIn = subAgents.filter(s => s.isBuiltIn);
  const custom = subAgents.filter(s => !s.isBuiltIn);

  let output = `${COLOR_CYAN}${BOLD}Available SubAgents${RESET_COLOR}\n\n`;

  if (builtIn.length > 0) {
    output += `${COLOR_BLUE}${BOLD}Built-in SubAgents:${RESET_COLOR}\n`;
    for (const info of builtIn) {
      output += formatSubAgentStatus(info) + '\n';
    }
  }

  if (custom.length > 0) {
    output += `${COLOR_GREEN}${BOLD}Custom SubAgents:${RESET_COLOR}\n`;
    for (const info of custom) {
      output += formatSubAgentStatus(info) + '\n';
    }
  }

  output += `\n${COLOR_YELLOW}Usage:${RESET_COLOR}
  ${COLOR_CYAN}/subagent list${RESET_COLOR}           - List all available SubAgents
  ${COLOR_CYAN}/subagent tasks${RESET_COLOR}          - Show running and recent async tasks
  ${COLOR_CYAN}/subagent cancel <id>${RESET_COLOR}   - Cancel an async task
  ${COLOR_CYAN}/subagent reload${RESET_COLOR}         - Reload custom SubAgent configurations

${COLOR_MAGENTA}Tip:${RESET_COLOR} Use the ${COLOR_CYAN}custom_task${RESET_COLOR} tool in your prompts to invoke a specific SubAgent:
  "Use custom_task with subagent_id='builtin:refactoring' to refactor this code"`;

  return {
    type: 'message',
    messageType: 'info',
    content: output,
  };
}

/**
 * 显示异步任务状态
 */
async function showTasks(context: CommandContext): Promise<SlashCommandActionReturn> {
  const { config } = context.services;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Configuration not loaded',
    };
  }

  const manager = config.getSubAgentManager();
  if (!manager) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'SubAgent manager not initialized',
    };
  }

  const tasks = manager.getAllTasks();

  if (tasks.length === 0) {
    return {
      type: 'message',
      messageType: 'info',
      content: `${COLOR_CYAN}${BOLD}No SubAgent Tasks${RESET_COLOR}

No async SubAgent tasks are currently tracked.

${COLOR_YELLOW}To start an async task:${RESET_COLOR}
Use the ${COLOR_CYAN}custom_task${RESET_COLOR} tool with ${COLOR_GREEN}async=true${RESET_COLOR}:
  "Use custom_task with async=true to analyze the codebase in the background"`,
    };
  }

  // Group by status
  const running = tasks.filter(t => t.status === 'pending' || t.status === 'running');
  const completed = tasks.filter(t => t.status === 'completed');
  const failed = tasks.filter(t => t.status === 'failed' || t.status === 'cancelled');

  let output = `${COLOR_CYAN}${BOLD}SubAgent Tasks${RESET_COLOR}\n\n`;

  if (running.length > 0) {
    output += `${COLOR_YELLOW}${BOLD}Running Tasks (${running.length}):${RESET_COLOR}\n`;
    for (const task of running) {
      output += formatTaskStatus(task) + '\n';
    }
  }

  if (completed.length > 0) {
    output += `${COLOR_GREEN}${BOLD}Completed Tasks (${completed.length}):${RESET_COLOR}\n`;
    for (const task of completed.slice(-5)) { // Show last 5
      output += formatTaskStatus(task) + '\n';
    }
    if (completed.length > 5) {
      output += `   ${COLOR_GREY}... and ${completed.length - 5} more${RESET_COLOR}\n\n`;
    }
  }

  if (failed.length > 0) {
    output += `${COLOR_RED}${BOLD}Failed/Cancelled Tasks (${failed.length}):${RESET_COLOR}\n`;
    for (const task of failed.slice(-3)) { // Show last 3
      output += formatTaskStatus(task) + '\n';
    }
  }

  output += `\n${COLOR_YELLOW}Commands:${RESET_COLOR}
  ${COLOR_CYAN}/subagent cancel <task-id>${RESET_COLOR}  - Cancel a running task`;

  return {
    type: 'message',
    messageType: 'info',
    content: output,
  };
}

/**
 * 取消异步任务
 */
async function cancelTask(context: CommandContext, taskId: string): Promise<SlashCommandActionReturn> {
  const { config } = context.services;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Configuration not loaded',
    };
  }

  const manager = config.getSubAgentManager();
  if (!manager) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'SubAgent manager not initialized',
    };
  }

  const task = manager.getTask(taskId);
  if (!task) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Task not found: ${taskId}`,
    };
  }

  if (task.status !== 'pending' && task.status !== 'running') {
    return {
      type: 'message',
      messageType: 'info',
      content: `Task ${taskId} is already ${task.status}`,
    };
  }

  const success = manager.cancelTask(taskId);
  if (success) {
    return {
      type: 'message',
      messageType: 'info',
      content: `${COLOR_GREEN}✅ Task ${taskId} cancelled successfully${RESET_COLOR}`,
    };
  } else {
    return {
      type: 'message',
      messageType: 'error',
      content: `Failed to cancel task ${taskId}`,
    };
  }
}

/**
 * 重新加载 SubAgent 配置
 */
async function reloadConfig(context: CommandContext): Promise<SlashCommandActionReturn> {
  const { config } = context.services;
  if (!config) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Configuration not loaded',
    };
  }

  const manager = config.getSubAgentManager();
  if (!manager) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'SubAgent manager not initialized',
    };
  }

  await manager.reload();

  const subAgents = manager.getEnabledSubAgents();
  const customCount = subAgents.filter(s => !s.isBuiltIn).length;
  const builtInCount = subAgents.filter(s => s.isBuiltIn).length;

  return {
    type: 'message',
    messageType: 'info',
    content: `${COLOR_GREEN}✅ SubAgent configuration reloaded${RESET_COLOR}

Loaded ${builtInCount} built-in and ${customCount} custom SubAgents.`,
  };
}

/**
 * 显示帮助信息
 */
function showHelp(): SlashCommandActionReturn {
  return {
    type: 'message',
    messageType: 'info',
    content: `${COLOR_CYAN}${BOLD}SubAgent Management${RESET_COLOR}

SubAgents are specialized AI agents with custom system prompts and tool
configurations. They can run synchronously or asynchronously (in the background).

${COLOR_YELLOW}Commands:${RESET_COLOR}
  ${COLOR_CYAN}/subagent${RESET_COLOR}                 - List all available SubAgents
  ${COLOR_CYAN}/subagent list${RESET_COLOR}            - List all available SubAgents
  ${COLOR_CYAN}/subagent tasks${RESET_COLOR}           - Show async task status
  ${COLOR_CYAN}/subagent cancel <id>${RESET_COLOR}    - Cancel an async task
  ${COLOR_CYAN}/subagent reload${RESET_COLOR}          - Reload custom configurations
  ${COLOR_CYAN}/subagent help${RESET_COLOR}            - Show this help message

${COLOR_YELLOW}Built-in SubAgents:${RESET_COLOR}
  • ${COLOR_GREEN}builtin:code_analysis${RESET_COLOR}  - Deep code exploration and analysis
  • ${COLOR_GREEN}builtin:refactoring${RESET_COLOR}    - Code refactoring and quality improvement
  • ${COLOR_GREEN}builtin:testing${RESET_COLOR}        - Test creation and coverage analysis
  • ${COLOR_GREEN}builtin:documentation${RESET_COLOR}  - Documentation generation

${COLOR_YELLOW}Custom SubAgents:${RESET_COLOR}
Create a file at ${COLOR_GREEN}.deepvcode/subagents.json${RESET_COLOR}:

${COLOR_GREY}{
  "subAgents": [
    {
      "id": "security-audit",
      "name": "Security Auditor",
      "description": "Analyzes code for security vulnerabilities",
      "systemPrompt": "You are a security expert...",
      "allowedTools": ["read_file", "grep", "glob"],
      "defaultMaxTurns": 25,
      "enabled": true
    }
  ]
}${RESET_COLOR}

${COLOR_YELLOW}Using SubAgents:${RESET_COLOR}
Use the ${COLOR_CYAN}custom_task${RESET_COLOR} tool in your prompts:

  "Use custom_task to analyze the authentication system"
  "Use custom_task with subagent_id='builtin:refactoring' to improve this code"
  "Use custom_task with async=true to analyze in the background"

${COLOR_MAGENTA}Tip:${RESET_COLOR} Async SubAgents run in the background, allowing you to continue
working while they process complex tasks.`,
  };
}

/**
 * /subagent 命令 - 管理自定义和内置的 SubAgent
 */
export const subagentCommand: SlashCommand = {
  name: 'subagent',
  altNames: ['subagents', 'agent'],
  kind: CommandKind.BUILT_IN,
  description: 'Manage custom and built-in SubAgents',
  action: async (context: CommandContext): Promise<SlashCommandActionReturn> => {
    const args = context.invocation?.args?.trim() ?? '';
    const parts = args.split(/\s+/);
    const subCommand = parts[0]?.toLowerCase() || 'list';

    switch (subCommand) {
      case 'list':
      case '':
        return showSubAgentList(context);

      case 'tasks':
      case 'task':
      case 'status':
        return showTasks(context);

      case 'cancel':
        const taskId = parts[1];
        if (!taskId) {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Please provide a task ID to cancel.\nUsage: /subagent cancel <task-id>',
          };
        }
        return cancelTask(context, taskId);

      case 'reload':
      case 'refresh':
        return reloadConfig(context);

      case 'help':
      case '-h':
      case '--help':
        return showHelp();

      default:
        return {
          type: 'message',
          messageType: 'error',
          content: `Unknown subcommand: ${subCommand}\n\nRun /subagent help for available commands.`,
        };
    }
  },
};
