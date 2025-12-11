/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { HistoryItemCompression, MessageType } from '../types.js';
import { CommandKind, SlashCommand } from './types.js';
import { t } from '../utils/i18n.js';

export const compressCommand: SlashCommand = {
  name: 'compress',
  altNames: ['summarize'],
  description: t('command.compress.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context) => {
    const { ui } = context;
    const geminiClient = context.services.config?.getGeminiClient();

    // 检查UI层面的pending状态
    if (ui.pendingItem) {
      ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Already compressing, wait for previous request to complete',
        },
        Date.now(),
      );
      return;
    }

    // 检查GeminiClient层面的压缩锁状态
    if (geminiClient?.isCompressionInProgress()) {
      ui.addItem(
        {
          type: MessageType.ERROR,
          text: 'Compression already in progress at client level, please wait',
        },
        Date.now(),
      );
      return;
    }

    // 立即显示压缩开始提示
    ui.addItem(
      {
        type: MessageType.INFO,
        text: t('command.compress.starting'),
      },
      Date.now(),
    );

    const pendingMessage: HistoryItemCompression = {
      type: MessageType.COMPRESSION,
      compression: {
        isPending: true,
        originalTokenCount: null,
        newTokenCount: null,
      },
    };

    try {
      ui.setPendingItem(pendingMessage);
      const promptId = `compress-${Date.now()}`;
      const compressed = await geminiClient?.tryCompressChat(promptId, new AbortController().signal, true);
      if (compressed) {
        ui.addItem(
          {
            type: MessageType.COMPRESSION,
            compression: {
              isPending: false,
              originalTokenCount: compressed.originalTokenCount,
              newTokenCount: compressed.newTokenCount,
            },
          } as HistoryItemCompression,
          Date.now(),
        );
      } else {
        ui.addItem(
          {
            type: MessageType.ERROR,
            text: 'Failed to compress chat history.',
          },
          Date.now(),
        );
      }
    } catch (e) {
      ui.addItem(
        {
          type: MessageType.ERROR,
          text: `Failed to compress chat history: ${
            e instanceof Error ? e.message : String(e)
          }`,
        },
        Date.now(),
      );
    } finally {
      ui.setPendingItem(null);
    }
  },
};
