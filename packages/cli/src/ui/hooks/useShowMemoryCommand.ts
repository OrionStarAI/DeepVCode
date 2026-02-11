/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message, MessageType } from '../types.js';
import { Config } from 'deepv-code-core';
import { LoadedSettings } from '../../config/settings.js';
import { t } from '../utils/i18n.js';
import { logDebug } from '../../utils/cliLogger.js';

export function createShowMemoryAction(
  config: Config | null,
  settings: LoadedSettings,
  addMessage: (message: Message) => void,
) {
  return async () => {
    if (!config) {
      addMessage({
        type: MessageType.ERROR,
        content: 'Configuration not available. Cannot show memory.',
        timestamp: new Date(),
      });
      return;
    }

    const debugMode = config.getDebugMode();

    if (debugMode) {
      logDebug('Show Memory command invoked.');
    }

    const currentMemory = config.getUserMemory();
    const fileCount = config.getGeminiMdFileCount();
    const contextFileName = settings.merged.contextFileName;
    const contextFileNames = Array.isArray(contextFileName)
      ? contextFileName
      : [contextFileName];

    if (debugMode) {
      logDebug(
        `Showing memory. Content from config.getUserMemory() (first 200 chars): ${currentMemory.substring(0, 200)}...`,
      );
      logDebug(`Number of context files loaded: ${fileCount}`);
    }

    if (fileCount > 0) {
      const allNamesTheSame = new Set(contextFileNames).size < 2;
      const name = allNamesTheSame ? contextFileNames[0] : 'memory';
      addMessage({
        type: MessageType.INFO,
        content: `Loaded memory from ${fileCount} ${name} file${
          fileCount > 1 ? 's' : ''
        }.`,
        timestamp: new Date(),
      });
    }

    if (currentMemory && currentMemory.trim().length > 0) {
      addMessage({
        type: MessageType.INFO,
        content: `Current combined memory content:\n\`\`\`markdown\n${currentMemory}\n\`\`\``,
        timestamp: new Date(),
      });
    } else {
      addMessage({
        type: MessageType.INFO,
        content:
          fileCount > 0
            ? 'Hierarchical memory (DEEPV.md or other context files) is loaded but content is empty.'
            : 'No hierarchical memory (DEEPV.md or other context files) is currently loaded.',
        timestamp: new Date(),
      });
    }
  };
}
