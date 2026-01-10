/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { BaseTool, Icon, ToolResult, TodoDisplay } from './tools.js';
import { Type } from '@google/genai';
import { Config } from '../config/config.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';
import { logger } from '../utils/enhancedLogger.js';

// Todo数据模型
export interface TodoItem {
  id: string;                    // 唯一标识符
  content: string;               // 待办事项内容
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
}

export type TodoStatus = TodoItem['status'];
export type TodoPriority = TodoItem['priority'];

// 内存中的todo列表
let memoryTodos: TodoItem[] = [];

/**
 * 获取内存中的todos列表
 */
export function getMemoryTodos(): TodoItem[] {
  return [...memoryTodos];
}

// TodoWrite工具参数接口
export interface TodoWriteParams {
  todos: Array<{
    id: string;
    content: string;
    status: TodoStatus;
    priority: TodoPriority;
  }>;
}

/**
 * TodoWrite工具 - 负责Todo的创建、更新、删除操作
 */
export class TodoWriteTool extends BaseTool<TodoWriteParams, ToolResult> {
  static readonly Name = 'todo_write';

  constructor(private readonly config: Config) {
    super(
      TodoWriteTool.Name,
      'TodoWrite',
      `Manage todo items by providing a complete list of todos. The tool will update the entire todo list with the provided items. Use this for creating, updating, or managing all your todo items.

CRITICAL: When you want to use this tool, DO NOT write text descriptions or explanations. Directly call the function with proper JSON parameters.
重要：当你想使用这个工具时，不要输出文本描述或解释。直接使用正确的 JSON 参数调用函数。

The "todos" parameter must be a JSON array of objects (NOT an array of strings). Each object must have: "id" (string), "content" (string), "status" ("pending"|"in_progress"|"completed"), "priority" ("high"|"medium"|"low").

Example: [{"id": "task_1", "content": "My task", "status": "pending", "priority": "high"}]`,
      Icon.Tasks,
      {
        type: Type.OBJECT,
        properties: {
          todos: {
            description: 'Complete list of todo items. Provide the full todo list that will replace the existing one. Each todo item must include id, content, status, and priority fields.',
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: {
                  description: 'Todo item unique identifier',
                  type: Type.STRING,
                },
                content: {
                  description: 'Todo item content',
                  type: Type.STRING,
                },
                status: {
                  description: 'Todo status: pending, in_progress, or completed',
                  type: Type.STRING,
                  enum: ['pending', 'in_progress', 'completed'],
                },
                priority: {
                  description: 'Todo priority: high, medium, or low',
                  type: Type.STRING,
                  enum: ['high', 'medium', 'low'],
                },
              },
              required: ['id', 'content', 'status', 'priority'],
            },
          },
        },
        required: ['todos'],
      },
      true, // 支持 markdown 输出
      true, // 强制 markdown 渲染，即使在高度限制下
    );
  }

  /**
   * 验证工具参数
   */
  validateToolParams(params: TodoWriteParams): string | null {
    // 调试日志：记录收到的参数
    logger.info(`[TodoWriteTool] Received params: ${JSON.stringify(params, null, 2)}`);
    logger.info(`[TodoWriteTool] params.todos type: ${Array.isArray(params.todos) ? 'array' : typeof params.todos}`);
    if (Array.isArray(params.todos) && params.todos.length > 0) {
      logger.info(`[TodoWriteTool] First todo item type: ${typeof params.todos[0]}`);
      logger.info(`[TodoWriteTool] First todo item: ${JSON.stringify(params.todos[0], null, 2)}`);
    }

    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      // 增强错误消息，提供具体的格式示例（中英文双语）
      const enhancedError = `${errors}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

❌ 参数格式错误 / Parameter Format Error

问题：todos 参数必须是对象数组，不是字符串数组
Issue: "todos" parameter must be an ARRAY of OBJECTS, not strings

每个 todo 对象必须包含：
Each todo object must have:
  • "id": string (唯一标识符, e.g., "task_1")
  • "content": string (待办内容描述)
  • "status": "pending" | "in_progress" | "completed"
  • "priority": "high" | "medium" | "low"

✅ 正确示例 / CORRECT Example:
{
  "todos": [
    {
      "id": "task_1",
      "content": "Fix login bug",
      "status": "pending",
      "priority": "high"
    }
  ]
}

❌ 错误示例 / WRONG Example:
{
  "todos": ["task_1", "task_2"]  // 错误！每项必须是对象
}

⚠️ 重要提示 / Important:
• 不要输出文本描述，直接调用函数
• DO NOT write text, directly call the function
• 使用双引号 ("), 不是单引号 (')
• Use double quotes ("), not single quotes (')

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

      return enhancedError;
    }

    // 验证必需字段
    for (const todo of params.todos) {
      if (!todo.id || todo.id.trim().length === 0) {
        return 'ID is required for all todo items';
      }
      if (!todo.content || todo.content.trim().length === 0) {
        return 'Content is required for all todo items';
      }
    }

    return null;
  }

  /**
   * 执行工具操作
   */
  async execute(params: TodoWriteParams, signal: AbortSignal): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `Parameter validation failed: ${validationError}`,
      };
    }

    try {
      // 将提供的todos数组直接作为完整的todo列表保存到记忆
      const todoItems: TodoItem[] = params.todos.map(todo => ({
        id: todo.id,
        content: todo.content,
        status: todo.status,
        priority: todo.priority,
      }));

      // 直接替换内存中的todo列表
      memoryTodos = todoItems;
      logger.info(`[TodoWriteTool] Updated todo list in memory, new count: ${todoItems.length}`);

      const stats = {
        total: todoItems.length,
        pending: todoItems.filter(t => t.status === 'pending').length,
        in_progress: todoItems.filter(t => t.status === 'in_progress').length,
        completed: todoItems.filter(t => t.status === 'completed').length,
      };

      let output = `Todo List Updated Successfully\n\n`;

      // UI友好排序：已完成 > 进行中 > 待办
      const sortedTodos = [...todoItems].sort((a, b) => {
        const statusOrder = { completed: 0, in_progress: 1, pending: 2 } as const;
        return statusOrder[a.status] - statusOrder[b.status];
      });

      const todoDisplay: TodoDisplay = {
        type: 'todo_display',
        title: 'Update Todos',
        items: sortedTodos.map(t => ({
          id: t.id,
          content: t.content,
          status: t.status,
          priority: t.priority,
        })),
      };

      return {
        llmContent: output,
        returnDisplay: todoDisplay,
      };

    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error(`[TodoWriteTool] Error updating todos: ${errorMessage}`);

      return {
        llmContent: `Error updating todo list: ${errorMessage}`,
        returnDisplay: `Operation failed: ${errorMessage}`,
      };
    }
  }

  /**
   * 获取状态图标
   */
  private getStatusIcon(status: TodoStatus): string {
    switch (status) {
        case 'completed': return '☒';    // 方框+X
        case 'in_progress': return '□';  // 空方块
        case 'pending': return '□';      // 空方块
        default: return '□';
    }
  }

  /**
   * 格式化单个todo项的显示
   */
  private formatTodoItem(todo: TodoItem, isLast: boolean = false): string {
    const statusIcon = this.getStatusIcon(todo.status);
    const connector = isLast ? '└─' : '├─';

    // 根据状态应用不同的格式
    switch (todo.status) {
      case 'completed':
        // 已完成：绿色文字 + 删除线
        return `  ${connector} ~~\x1b[32m${statusIcon} ${todo.content}\x1b[0m~~`;
      case 'in_progress':
        // 进行中：紫色文字
        return `  ${connector} \x1b[35m${statusIcon} ${todo.content}\x1b[0m`;
      case 'pending':
        // 待办：白色文字
        return `  ${connector} \x1b[37m${statusIcon} ${todo.content}\x1b[0m`;
      default:
        return `  ${connector} ${statusIcon} ${todo.content}`;
    }
  }



  /**
   * 获取操作描述
   */
  getDescription(params: TodoWriteParams): string {
    const count = params.todos.length;
    return `Update todo list with ${count} item${count > 1 ? 's' : ''}`;
  }
}
