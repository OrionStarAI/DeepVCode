/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * Extended Content type with UI association
 * This file extends the original @google/genai Content type to include
 * UI-specific fields for tracking message relationships.
 */
import {
  Content as OriginalContent,
  Part,
  GenerateContentResponse,
  FunctionCall,
  PartListUnion,
  PartUnion,
  Tool,
  GenerateContentResponseUsageMetadata
} from '@google/genai';

/**
 * Extended Content interface that adds UI association fields
 * to the original Google GenAI Content type.
 */
export interface Content extends OriginalContent {
  /**
   * Unique identifier linking this content to a ChatMessage.id
   * This field will be stripped before sending to the API server
   */
  prompt_id?: string;

}

/**
 * Helper function to create Content with UI association
 */
export function createContentWithUI(
  originalContent: OriginalContent,
  uiData?: {
    prompt_id?: string;
  }
): Content {
  return {
    ...originalContent,
    ...uiData
  };
}

/**
 * Helper function to strip UI fields and return original Content
 * for API compatibility
 */
export function stripUIFields(content: Content): OriginalContent {
  const { prompt_id, ...cleanContent } = content;
  return cleanContent as OriginalContent;
}

/**
 * Helper function to strip UI fields from Content array
 * Also handles ContentListUnion type which could be string | Content[]
 */
export function stripUIFieldsFromArray(contents: Content[] | any): OriginalContent[] {
  if (Array.isArray(contents)) {
    return contents.map(stripUIFields);
  }
  // If it's not an array (e.g., string or other ContentListUnion type), return as-is
  return contents;
}

/**
 * Extended UsageMetadata with cache support for custom models
 * OpenAI and Claude support prompt caching which has separate token counts
 */
export interface ExtendedUsageMetadata extends GenerateContentResponseUsageMetadata {
  // Cache-related tokens (OpenAI and Claude)
  cacheCreationInputTokenCount?: number;
  cacheReadInputTokenCount?: number;
}

// Re-export specific types from @google/genai for convenience
export {
  Part,
  GenerateContentResponse,
  FunctionCall,
  PartListUnion,
  PartUnion,
  GenerateContentResponseUsageMetadata
} from '@google/genai';

// Export the original Content as OriginalContent for reference
export { Content as OriginalContent } from '@google/genai';