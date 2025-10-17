/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolCallRequestInfo } from 'deepv-code-core';
import {
  validateAndFixFunctionCall,
  areAllFunctionCallsValid,
  fixAllFunctionCalls,
  getModelCapabilities,
  FunctionCallValidationResult
} from 'deepv-code-core';

/**
 * Enhanced tool call processing with robustness features for small models
 */

export interface ToolCallEnhancementResult {
  /** Whether the tool calls were processed successfully */
  success: boolean;
  /** Enhanced/fixed tool call requests */
  toolCallRequests: ToolCallRequestInfo[];
  /** Validation errors if any */
  errors: string[];
  /** Whether retry is recommended */
  shouldRetry: boolean;
  /** Diagnostic information */
  diagnostics: {
    originalCount: number;
    fixedCount: number;
    hadFormatIssues: boolean;
    modelCapabilities: string;
  };
}

/**
 * Enhances tool call requests with validation and fixing for improved robustness
 * @param toolCallRequests - Original tool call requests
 * @param modelName - Name of the model being used
 * @returns Enhanced tool call processing result
 */
export function enhanceToolCallRequests(
  toolCallRequests: ToolCallRequestInfo[],
  modelName: string
): ToolCallEnhancementResult {
  const capabilities = getModelCapabilities(modelName);
  const errors: string[] = [];
  let hadFormatIssues = false;

  if (!toolCallRequests || toolCallRequests.length === 0) {
    return {
      success: true,
      toolCallRequests: [],
      errors: [],
      shouldRetry: false,
      diagnostics: {
        originalCount: 0,
        fixedCount: 0,
        hadFormatIssues: false,
        modelCapabilities: capabilities.toolCallReliability,
      },
    };
  }

  let enhancedRequests = [...toolCallRequests];

  // For models that need format tolerance, validate and fix requests
  if (capabilities.needsFormatTolerance) {
    for (let i = 0; i < enhancedRequests.length; i++) {
      const request = enhancedRequests[i];

      // Validate the request structure
      const validationResult = validateToolCallRequest(request, modelName);

      if (!validationResult.isValid) {
        hadFormatIssues = true;
        errors.push(...validationResult.errors);

        // Try to fix the request
        const fixedRequest = fixToolCallRequest(request, modelName);
        if (fixedRequest) {
          enhancedRequests[i] = fixedRequest;
        } else {
          errors.push(`Unable to fix tool call request for ${request.name}`);
        }
      }
    }
  }

  // Apply concurrency limits for small models
  if (enhancedRequests.length > capabilities.maxConcurrentTools) {
    const originalCount = enhancedRequests.length;
    enhancedRequests = enhancedRequests.slice(0, capabilities.maxConcurrentTools);
    errors.push(
      `Reduced concurrent tool calls from ${originalCount} to ${capabilities.maxConcurrentTools} for model ${modelName}`
    );
  }

  // Final validation
  const allValid = enhancedRequests.every(req => validateToolCallRequest(req, modelName).isValid);

  return {
    success: allValid,
    toolCallRequests: enhancedRequests,
    errors,
    shouldRetry: !allValid && capabilities.enableMalformedRetry,
    diagnostics: {
      originalCount: toolCallRequests.length,
      fixedCount: enhancedRequests.length,
      hadFormatIssues,
      modelCapabilities: capabilities.toolCallReliability,
    },
  };
}

/**
 * Validates a single tool call request
 * @param request - The tool call request to validate
 * @param modelName - Name of the model
 * @returns Validation result
 */
function validateToolCallRequest(
  request: ToolCallRequestInfo,
  modelName: string
): FunctionCallValidationResult {
  const errors: string[] = [];
  let isValid = true;
  let isComplete = true;

  // Check required fields
  if (!request.name || typeof request.name !== 'string') {
    errors.push('Tool name is missing or invalid');
    isValid = false;
    isComplete = false;
  }

  if (!request.callId || typeof request.callId !== 'string') {
    errors.push('Call ID is missing or invalid');
    isComplete = false;

    // For tolerant models, this can be auto-fixed
    const capabilities = getModelCapabilities(modelName);
    if (!capabilities.needsFormatTolerance) {
      isValid = false;
    }
  }

  if (!request.args || typeof request.args !== 'object') {
    errors.push('Arguments are missing or invalid');
    isValid = false;
  }

  return {
    isValid,
    isComplete,
    errors,
  };
}

/**
 * Attempts to fix a tool call request
 * @param request - The tool call request to fix
 * @param modelName - Name of the model
 * @returns Fixed request or null if unfixable
 */
function fixToolCallRequest(
  request: ToolCallRequestInfo,
  modelName: string
): ToolCallRequestInfo | null {
  const capabilities = getModelCapabilities(modelName);

  if (!capabilities.needsFormatTolerance) {
    return null; // Don't fix for strict models
  }

  try {
    const fixed: ToolCallRequestInfo = { ...request };

    // Fix missing or invalid call ID
    if (!fixed.callId || typeof fixed.callId !== 'string') {
      fixed.callId = `${fixed.name || 'unknown'}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // Fix missing or invalid name
    if (!fixed.name || typeof fixed.name !== 'string') {
      // Can't fix missing name - this is critical
      return null;
    }

    // Fix missing or invalid args
    if (!fixed.args || typeof fixed.args !== 'object') {
      fixed.args = {};
    } else {
      // Clean up args object
      const cleanArgs: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(fixed.args)) {
        if (value !== null && value !== undefined) {
          cleanArgs[key] = value;
        }
      }
      fixed.args = cleanArgs;
    }

    // Ensure other required fields
    if (fixed.isClientInitiated === undefined) {
      fixed.isClientInitiated = false;
    }

    if (!fixed.prompt_id) {
      fixed.prompt_id = 'default';
    }

    return fixed;
  } catch (error) {
    console.error('Error fixing tool call request:', error);
    return null;
  }
}

/**
 * Provides user-friendly error messages for tool call issues
 * @param enhancementResult - The result from enhanceToolCallRequests
 * @returns User-friendly error message
 */
export function getToolCallErrorMessage(enhancementResult: ToolCallEnhancementResult): string {
  if (enhancementResult.success) {
    return '';
  }

  const { diagnostics, errors } = enhancementResult;

  let message = `⚠️  Tool call issues detected (Model: ${diagnostics.modelCapabilities} reliability):\n`;

  if (diagnostics.hadFormatIssues) {
    message += `🔧 Format issues found and ${diagnostics.fixedCount > 0 ? 'fixed' : 'attempted to fix'}\n`;
  }

  if (diagnostics.originalCount !== diagnostics.fixedCount) {
    message += `📊 Reduced from ${diagnostics.originalCount} to ${diagnostics.fixedCount} concurrent calls\n`;
  }

  if (errors.length > 0) {
    message += `❌ Remaining issues:\n${errors.slice(0, 3).map(e => `  • ${e}`).join('\n')}`;
    if (errors.length > 3) {
      message += `\n  • ... and ${errors.length - 3} more`;
    }
  }

  return message;
}