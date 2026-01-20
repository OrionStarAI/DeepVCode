/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { INIT_COMMAND_PROMPT } from '../commands/prompts/initPrompt.js';
import { t } from '../utils/i18n.js';
import { type HistoryItem, MessageType } from '../types.js';

interface UseInitChoiceReturn {
  isInitChoiceDialogOpen: boolean;
  initChoiceMetadata: {
    filePath: string;
    fileSize: number;
    lineCount: number;
  } | null;
  openInitChoiceDialog: (metadata: {
    filePath: string;
    fileSize: number;
    lineCount: number;
  }) => void;
  handleInitChoice: (choice: 'append' | 'overwrite' | 'cancel') => {
    action: 'submit_prompt' | 'message' | 'none';
    content?: string;
    messageType?: 'info' | 'error';
  };
  exitInitChoiceDialog: () => void;
}

export const useInitChoice = (
  addItem: (item: Omit<HistoryItem, 'id'>, timestamp: number) => void,
): UseInitChoiceReturn => {
  const [isInitChoiceDialogOpen, setIsInitChoiceDialogOpen] = useState(false);
  const [initChoiceMetadata, setInitChoiceMetadata] = useState<{
    filePath: string;
    fileSize: number;
    lineCount: number;
  } | null>(null);

  const openInitChoiceDialog = useCallback((metadata: {
    filePath: string;
    fileSize: number;
    lineCount: number;
  }) => {
    setInitChoiceMetadata(metadata);
    setIsInitChoiceDialogOpen(true);
  }, []);

  const handleInitChoice = useCallback(
    (choice: 'append' | 'overwrite' | 'cancel'): {
      action: 'message' | 'submit_prompt' | 'none';
      messageType?: 'info' | 'error';
      content?: string;
    } => {
      if (choice === 'cancel') {
        setIsInitChoiceDialogOpen(false);
        return {
          action: 'message',
          messageType: 'info',
          content: t('command.init.cancelled'),
        };
      }

      if (choice === 'overwrite' && initChoiceMetadata) {
        try {
          fs.writeFileSync(initChoiceMetadata.filePath, '', 'utf8');
          addItem(
            {
              type: MessageType.INFO,
              text: t('command.init.overwriteStarting'),
            },
            Date.now(),
          );
        } catch (error) {
          setIsInitChoiceDialogOpen(false);
          return {
            action: 'message',
            messageType: 'error',
            content: `Failed to overwrite DEEPV.md: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      } else if (choice === 'append') {
        addItem(
          {
            type: MessageType.INFO,
            text: t('command.init.appendStarting'),
          },
          Date.now(),
        );
      }

      // 延迟100毫秒后清屏，避免显示长提示词
      setImmediate(() => {
        setIsInitChoiceDialogOpen(false);
      });

      const appendModeInstructions = choice === 'append'
        ? `

## ⚠️ CRITICAL: Append Mode Instructions

The DEEPV.md file already exists with content. You MUST follow these steps:

1. **FIRST**: Use read_file tool to read the CURRENT content of DEEPV.md
2. **THEN**: Analyze the project as instructed above
3. **FINALLY**: When writing to DEEPV.md, merge your new analysis with the existing content:
   - Preserve ALL valuable existing content
   - If sections already exist, enhance them rather than duplicate
   - Add new sections for additional insights
   - Maintain a coherent, unified document structure`
        : '';

      return {
        action: 'submit_prompt',
        content: INIT_COMMAND_PROMPT + appendModeInstructions,
      };
    },
    [initChoiceMetadata, addItem],
  );

  const exitInitChoiceDialog = useCallback(() => {
    setImmediate(() => {
      setIsInitChoiceDialogOpen(false);
    });
  }, []);

  return {
    isInitChoiceDialogOpen,
    initChoiceMetadata,
    openInitChoiceDialog,
    handleInitChoice,
    exitInitChoiceDialog,
  };
};
