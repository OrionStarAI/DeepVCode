/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as toml from '@iarna/toml';
import { Extension } from './extension.js';

/**
 * Represents a prompt extension that can be triggered by users
 * Supports TOML format compatible with Gemini CLI
 */
export interface PromptExtension {
  /** Identifier derived from filename (e.g., 'code-review') */
  id: string;

  /** Display name of the prompt (from TOML or defaults to id) */
  name: string;

  /** Description of what the prompt does */
  description: string;

  /** The actual prompt text to inject into the conversation */
  prompt: string;

  /** Name of the extension that provides this prompt */
  extensionName: string;

  /** Path to the extension directory */
  extensionPath: string;
}

/**
 * Load prompt extensions from all installed extensions
 * Scans for TOML files in the 'commands' directory of each extension
 *
 * @param extensions Array of loaded extensions
 * @returns Array of prompt extensions ready to use
 */
export async function loadPromptExtensions(
  extensions: Extension[]
): Promise<PromptExtension[]> {
  const prompts: PromptExtension[] = [];

  for (const extension of extensions) {
    if (!extension.path) {
      continue;
    }

    const commandsDir = path.join(extension.path, 'commands');

    // Skip if commands directory doesn't exist
    if (!fs.existsSync(commandsDir)) {
      continue;
    }

    try {
      // Scan for TOML files in commands directory
      const files = fs.readdirSync(commandsDir);

      for (const file of files) {
        // Only process TOML files
        if (!file.endsWith('.toml')) {
          continue;
        }

        const filePath = path.join(commandsDir, file);

        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const parsed = toml.parse(content) as any;

          // Extract prompt ID from filename (e.g., 'code-review.toml' -> 'code-review')
          const promptId = path.basename(file, '.toml');

          // Create prompt extension object
          const promptExtension: PromptExtension = {
            id: promptId,
            name: parsed.name || promptId,
            description: parsed.description || '',
            prompt: parsed.prompt || '',
            extensionName: extension.config.name,
            extensionPath: extension.path,
          };

          // Validate that prompt has required fields
          if (!promptExtension.prompt) {
            console.warn(
              `Warning: Prompt extension '${promptId}' in '${extension.config.name}' has no prompt content`
            );
            continue;
          }

          prompts.push(promptExtension);

          if (parsed.description) {
            console.log(
              `[Prompt Extension] Loaded: /${promptId} - ${parsed.description}`
            );
          }
        } catch (error) {
          console.warn(
            `Failed to parse TOML file '${file}' in extension '${extension.config.name}':`,
            error
          );
        }
      }
    } catch (error) {
      console.warn(
        `Failed to read commands directory in extension '${extension.config.name}':`,
        error
      );
    }
  }

  if (prompts.length > 0) {
    console.log(`[Prompt Extensions] Loaded ${prompts.length} prompt extension(s)`);
  }

  return prompts;
}

/**
 * Find a prompt extension by ID
 *
 * @param prompts Array of prompt extensions
 * @param id The prompt ID to find (e.g., 'code-review')
 * @returns The prompt extension if found, undefined otherwise
 */
export function findPromptExtension(
  prompts: PromptExtension[],
  id: string
): PromptExtension | undefined {
  return prompts.find((p) => p.id === id);
}

/**
 * Get all available prompt extensions
 *
 * @param prompts Array of prompt extensions
 * @returns Array of prompt extensions sorted by name
 */
export function getPromptExtensions(prompts: PromptExtension[]): PromptExtension[] {
  return [...prompts].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Format a list of prompt extensions as help text
 *
 * @param prompts Array of prompt extensions
 * @returns Formatted help text
 */
export function formatPromptExtensionsHelp(prompts: PromptExtension[]): string {
  if (prompts.length === 0) {
    return 'No prompt extensions available.';
  }

  const lines = ['Available prompt extensions:'];

  for (const prompt of getPromptExtensions(prompts)) {
    lines.push(`  /${prompt.id} - ${prompt.description}`);
  }

  return lines.join('\n');
}
