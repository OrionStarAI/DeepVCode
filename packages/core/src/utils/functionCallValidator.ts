/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { FunctionCall } from '@google/genai';
import { getModelCapabilities } from '../config/modelCapabilities.js';

/**
 * Validation result for function calls
 */
export interface FunctionCallValidationResult {
  isValid: boolean;
  isComplete: boolean;
  errors: string[];
  fixedCall?: FunctionCall;
}

/**
 * Validates and potentially fixes a function call for small model compatibility
 * @param functionCall - The function call to validate
 * @param modelName - The name of the model that generated the call
 * @returns Validation result with potential fixes
 */
export function validateAndFixFunctionCall(
  functionCall: FunctionCall,
  modelName: string
): FunctionCallValidationResult {
  const capabilities = getModelCapabilities(modelName);
  const errors: string[] = [];
  let isValid = true;
  let isComplete = true;
  let fixedCall: FunctionCall | undefined;

  // Check basic completeness
  if (!functionCall.name) {
    errors.push('Missing function name');
    isValid = false;
    isComplete = false;
  }

  if (!functionCall.id) {
    errors.push('Missing function call ID');
    isComplete = false;
    // For small models, auto-generate ID if missing
    if (capabilities.needsFormatTolerance) {
      if (!fixedCall) fixedCall = { ...functionCall };
      fixedCall.id = `${functionCall.name || 'unknown'}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    } else {
      isValid = false;
    }
  }

  // Validate and fix arguments
  if (functionCall.args === undefined || functionCall.args === null) {
    if (capabilities.needsFormatTolerance) {
      // For tolerant models, provide empty args object
      if (!fixedCall) fixedCall = { ...functionCall };
      fixedCall.args = {};
    } else {
      errors.push('Missing or null function arguments');
      isValid = false;
    }
  } else if (typeof functionCall.args !== 'object') {
    errors.push('Function arguments must be an object');
    isValid = false;

    // Try to fix common argument format issues
    if (capabilities.needsFormatTolerance) {
      if (!fixedCall) fixedCall = { ...functionCall };
      try {
        // Try to parse if it's a string
        if (typeof functionCall.args === 'string') {
          fixedCall.args = JSON.parse(functionCall.args);
        } else {
          // Wrap non-object args in an object
          fixedCall.args = { value: functionCall.args };
        }
        isValid = true;
        errors.pop(); // Remove the error since we fixed it
      } catch (e) {
        // If parsing fails, use empty object
        fixedCall.args = {};
        isValid = true;
        errors.pop();
      }
    }
  }

  // Validate argument values for tolerant models
  if (capabilities.needsFormatTolerance && functionCall.args && typeof functionCall.args === 'object') {
    const args = functionCall.args as Record<string, unknown>;
    let hasFixedArgs = false;

    // 特殊处理 todo_write 工具的参数格式问题
    if (functionCall.name === 'todo_write' && args.todos) {
      console.log('[FunctionCallValidator] Checking todo_write call...');
      console.log('[FunctionCallValidator] args.todos:', JSON.stringify(args.todos));

      if (Array.isArray(args.todos) && args.todos.length > 0) {
        console.log('[FunctionCallValidator] todos is array, first item type:', typeof args.todos[0]);

        // 检查第一个元素是否为字符串（错误格式）
        if (typeof args.todos[0] === 'string') {
          console.log('[FunctionCallValidator] Detected string array, converting to object array...');

          // 尝试将字符串数组转换为对象数组
          if (!fixedCall) fixedCall = { ...functionCall };
          if (!hasFixedArgs) {
            fixedCall.args = { ...args };
            hasFixedArgs = true;
          }

          // 尝试解析每个字符串为JSON对象
          const fixedTodos = args.todos.map((item: any, index: number) => {
            if (typeof item === 'string') {
              try {
                // 尝试解析为JSON
                const parsed = JSON.parse(item);
                console.log('[FunctionCallValidator] Parsed string to object:', parsed);
                return parsed;
              } catch {
                // 如果无法解析，创建一个基本的todo对象
                const defaultTodo = {
                  id: `task_${index + 1}`,
                  content: item,
                  status: 'pending' as const,
                  priority: 'medium' as const
                };
                console.log('[FunctionCallValidator] Created default todo:', defaultTodo);
                return defaultTodo;
              }
            }
            return item;
          });

          (fixedCall.args as Record<string, unknown>).todos = fixedTodos;
          console.log('[FunctionCallValidator] Fixed todos:', JSON.stringify(fixedTodos));
        }
      }
    }

    for (const [key, value] of Object.entries(args)) {
      // Fix common parameter issues
      if (value === null || value === undefined) {
        if (!fixedCall) fixedCall = { ...functionCall };
        if (!hasFixedArgs) {
          fixedCall.args = { ...args };
          hasFixedArgs = true;
        }

        // Provide sensible defaults based on parameter name
        if (key.toLowerCase().includes('path') || key.toLowerCase().includes('file')) {
          (fixedCall.args as Record<string, unknown>)[key] = '';
        } else if (key.toLowerCase().includes('count') || key.toLowerCase().includes('limit')) {
          (fixedCall.args as Record<string, unknown>)[key] = 10;
        } else if (key.toLowerCase().includes('pattern') || key.toLowerCase().includes('query')) {
          (fixedCall.args as Record<string, unknown>)[key] = '';
        } else {
          (fixedCall.args as Record<string, unknown>)[key] = '';
        }
      }

      // Convert boolean strings to actual booleans
      if (typeof value === 'string' && (value.toLowerCase() === 'true' || value.toLowerCase() === 'false')) {
        if (!fixedCall) fixedCall = { ...functionCall };
        if (!hasFixedArgs) {
          fixedCall.args = { ...args };
          hasFixedArgs = true;
        }
        (fixedCall.args as Record<string, unknown>)[key] = value.toLowerCase() === 'true';
      }

      // Convert number strings to actual numbers for numeric parameters
      if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)) {
        const numericKeys = ['count', 'limit', 'offset', 'max', 'min', 'size', 'timeout'];
        if (numericKeys.some(nKey => key.toLowerCase().includes(nKey))) {
          if (!fixedCall) fixedCall = { ...functionCall };
          if (!hasFixedArgs) {
            fixedCall.args = { ...args };
            hasFixedArgs = true;
          }
          (fixedCall.args as Record<string, unknown>)[key] = parseFloat(value);
        }
      }
    }
  }

  return {
    isValid,
    isComplete,
    errors,
    fixedCall,
  };
}

/**
 * Checks if a list of function calls are all complete and valid
 * @param functionCalls - Array of function calls to validate
 * @param modelName - The name of the model that generated the calls
 * @returns True if all calls are valid and complete
 */
export function areAllFunctionCallsValid(
  functionCalls: FunctionCall[],
  modelName: string
): boolean {
  if (!functionCalls || functionCalls.length === 0) {
    return true; // Empty array is considered valid
  }

  return functionCalls.every(fc => {
    const result = validateAndFixFunctionCall(fc, modelName);
    return result.isValid && result.isComplete;
  });
}

/**
 * Attempts to fix all function calls in an array
 * @param functionCalls - Array of function calls to fix
 * @param modelName - The name of the model that generated the calls
 * @returns Array of fixed function calls
 */
export function fixAllFunctionCalls(
  functionCalls: FunctionCall[],
  modelName: string
): FunctionCall[] {
  if (!functionCalls || functionCalls.length === 0) {
    return [];
  }

  return functionCalls.map(fc => {
    const result = validateAndFixFunctionCall(fc, modelName);
    return result.fixedCall || fc;
  });
}

/**
 * Checks if function calls appear to be incomplete due to streaming issues
 * @param functionCalls - Array of function calls to check
 * @param modelName - The name of the model
 * @returns True if calls appear incomplete due to streaming
 */
export function appearIncompleteFromStreaming(
  functionCalls: FunctionCall[],
  modelName: string
): boolean {
  const capabilities = getModelCapabilities(modelName);

  if (!capabilities.proneToIncompleteStream) {
    return false;
  }

  // Check for common streaming incompleteness patterns
  return functionCalls.some(fc => {
    // Missing essential fields that should always be present
    if (!fc.name && !fc.id) {
      return true;
    }

    // Arguments that look like they were cut off
    if (fc.args && typeof fc.args === 'object') {
      const argsStr = JSON.stringify(fc.args);
      // Check for incomplete JSON patterns
      if (argsStr.includes('"":') || argsStr.includes('""') || argsStr.endsWith('":')) {
        return true;
      }
    }

    return false;
  });
}