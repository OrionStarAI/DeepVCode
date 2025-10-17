/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Model capability definitions for enhanced tool calling robustness.
 * Provides model-specific configurations to handle tool calling variations.
 */

export interface ModelCapabilities {
  /** Tool calling reliability level */
  toolCallReliability: 'high' | 'medium' | 'low';
  /** Whether the model requires strict validation or can use lenient mode */
  requiresStrictValidation: boolean;
  /** Maximum number of concurrent tool calls the model can handle reliably */
  maxConcurrentTools: number;
  /** Whether the model needs format tolerance (lenient parameter validation) */
  needsFormatTolerance: boolean;
  /** Whether the model is prone to incomplete function calls in streaming */
  proneToIncompleteStream: boolean;
  /** Whether to enable retry logic for malformed function calls */
  enableMalformedRetry: boolean;
  /** Timeout for waiting for complete function calls (ms) */
  functionCallTimeout: number;
  /** Whether to enable progressive degradation (reduce concurrent tools on failure) */
  enableProgressiveDegradation: boolean;
}

/**
 * Default capabilities for unknown models (conservative settings)
 */
export const DEFAULT_MODEL_CAPABILITIES: ModelCapabilities = {
  toolCallReliability: 'medium',
  requiresStrictValidation: true,
  maxConcurrentTools: 3,
  needsFormatTolerance: false,
  proneToIncompleteStream: false,
  enableMalformedRetry: false,
  functionCallTimeout: 30000,
  enableProgressiveDegradation: false,
};

/**
 * Model-specific capability configurations
 */
export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  // High-capability models (Claude, GPT-4, Gemini Pro)
  'claude-sonnet-4@20250514': {
    toolCallReliability: 'high',
    requiresStrictValidation: true,
    maxConcurrentTools: 5,
    needsFormatTolerance: false,
    proneToIncompleteStream: false,
    enableMalformedRetry: false,
    functionCallTimeout: 30000,
    enableProgressiveDegradation: false,
  },

  'claude-3-5-sonnet-20241022': {
    toolCallReliability: 'high',
    requiresStrictValidation: true,
    maxConcurrentTools: 5,
    needsFormatTolerance: false,
    proneToIncompleteStream: false,
    enableMalformedRetry: false,
    functionCallTimeout: 30000,
    enableProgressiveDegradation: false,
  },

  'gemini-1.5-pro': {
    toolCallReliability: 'high',
    requiresStrictValidation: true,
    maxConcurrentTools: 4,
    needsFormatTolerance: false,
    proneToIncompleteStream: false,
    enableMalformedRetry: false,
    functionCallTimeout: 30000,
    enableProgressiveDegradation: false,
  },

  // Medium-capability models
  'gemini-1.5-flash': {
    toolCallReliability: 'medium',
    requiresStrictValidation: false,
    maxConcurrentTools: 2,
    needsFormatTolerance: true,
    proneToIncompleteStream: true,
    enableMalformedRetry: true,
    functionCallTimeout: 45000,
    enableProgressiveDegradation: true,
  },

  'gemini-flash': {
    toolCallReliability: 'medium',
    requiresStrictValidation: false,
    maxConcurrentTools: 1,
    needsFormatTolerance: true,
    proneToIncompleteStream: true,
    enableMalformedRetry: true,
    functionCallTimeout: 60000,
    enableProgressiveDegradation: true,
  },

  // Small/fast models
  'gemini-1.5-flash-8b': {
    toolCallReliability: 'low',
    requiresStrictValidation: false,
    maxConcurrentTools: 1,
    needsFormatTolerance: true,
    proneToIncompleteStream: true,
    enableMalformedRetry: true,
    functionCallTimeout: 60000,
    enableProgressiveDegradation: true,
  },

  // Auto model (fallback to medium capabilities)
  'auto': {
    toolCallReliability: 'medium',
    requiresStrictValidation: false,
    maxConcurrentTools: 2,
    needsFormatTolerance: true,
    proneToIncompleteStream: true,
    enableMalformedRetry: true,
    functionCallTimeout: 45000,
    enableProgressiveDegradation: true,
  },
};

/**
 * Get model capabilities for a given model name
 * @param modelName - The model name to get capabilities for
 * @returns ModelCapabilities for the specified model
 */
export function getModelCapabilities(modelName: string): ModelCapabilities {
  // Try exact match first
  if (MODEL_CAPABILITIES[modelName]) {
    return MODEL_CAPABILITIES[modelName];
  }

  // Try partial matching for model variants
  const normalizedName = modelName.toLowerCase();

  // Check for flash models
  if (normalizedName.includes('flash')) {
    if (normalizedName.includes('8b')) {
      return MODEL_CAPABILITIES['gemini-1.5-flash-8b'];
    }
    return MODEL_CAPABILITIES['gemini-flash'];
  }

  // Check for pro models
  if (normalizedName.includes('pro')) {
    return MODEL_CAPABILITIES['gemini-1.5-pro'];
  }

  // Check for Claude models
  if (normalizedName.includes('claude')) {
    return MODEL_CAPABILITIES['claude-3-5-sonnet-20241022'];
  }

  // Default fallback
  return DEFAULT_MODEL_CAPABILITIES;
}

/**
 * Check if a model is considered a "small" model with potential tool calling issues
 * @param modelName - The model name to check
 * @returns true if the model is considered small/prone to issues
 */
export function isSmallModel(modelName: string): boolean {
  const capabilities = getModelCapabilities(modelName);
  return capabilities.toolCallReliability === 'low' ||
         capabilities.needsFormatTolerance === true;
}

/**
 * Check if a model should use tolerant validation mode
 * @param modelName - The model name to check
 * @returns true if tolerant mode should be enabled
 */
export function shouldUseTolerantMode(modelName: string): boolean {
  return getModelCapabilities(modelName).needsFormatTolerance;
}