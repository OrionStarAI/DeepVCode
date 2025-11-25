/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, SlashCommand, CommandContext } from './types.js';
import { ImageGeneratorAdapter, UnauthorizedError } from 'deepv-code-core';
import { MessageType } from '../types.js';
import { appEvents, AppEvent } from '../../utils/events.js';
import { t, tp } from '../utils/i18n.js';
import open from 'open';

const ALLOWED_RATIOS = ['auto', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

async function runImageGeneration(context: CommandContext, ratio: string, prompt: string) {
  const { addItem } = context.ui;
  const adapter = ImageGeneratorAdapter.getInstance();

  try {
    addItem({
      type: MessageType.INFO,
      text: tp('nanobanana.submitting', { prompt, ratio }),
    }, Date.now());

    const task = await adapter.submitImageGenerationTask(prompt, ratio);

    const estimatedTime = task.task_info.estimated_time || 60;
    const timeoutSeconds = estimatedTime + 60;
    const startTime = Date.now();

    // Emit credits consumed event if credits were deducted
    if (task.credits_deducted > 0) {
      appEvents.emit(AppEvent.CreditsConsumed, task.credits_deducted);
    }

    addItem({
      type: MessageType.INFO,
      text: tp('nanobanana.submitted', {
        taskId: task.task_id,
        credits: task.credits_deducted,
        estimatedTime
      }),
    }, Date.now());

    // Polling loop
    const pollInterval = setInterval(async () => {
      try {
        const elapsedSeconds = (Date.now() - startTime) / 1000;

        if (elapsedSeconds > timeoutSeconds) {
          clearInterval(pollInterval);
          addItem({
            type: MessageType.ERROR,
            text: tp('nanobanana.timeout', { seconds: Math.round(elapsedSeconds) }),
          }, Date.now());
          return;
        }

        const status = await adapter.getImageTaskStatus(task.task_id);

        if (status.status === 'completed') {
          clearInterval(pollInterval);
          const resultUrls = status.result_urls || [];
          const urlText = resultUrls.map((url, idx) => `Image ${idx + 1}: ${url}`).join('\n');

          addItem({
            type: MessageType.INFO,
            text: tp('nanobanana.completed', { urlText }),
          }, Date.now());

          // Automatically open images in browser
          for (const url of resultUrls) {
            try {
              await open(url);
            } catch (err) {
              console.error(`Failed to open URL: ${url}`, err);
            }
          }
        } else if (status.status === 'failed') {
          clearInterval(pollInterval);
          addItem({
            type: MessageType.ERROR,
            text: tp('nanobanana.failed', { error: status.error_message || 'Unknown error' }),
          }, Date.now());
        } else {
          // For 'pending' or 'processing', show a spinner-like update every 5 seconds
          // to keep the user informed without spamming
          const elapsed = Math.round(elapsedSeconds);
          if (elapsed % 5 === 0 && elapsed > 0) {
             // We could update a status line here if the UI supported it,
             // but for now we'll just rely on the initial "Polling..." message
             // or maybe log to debug console
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 1000);

  } catch (error) {
    if (error instanceof UnauthorizedError) {
      addItem({
        type: MessageType.ERROR,
        text: t('nanobanana.auth.failed'),
      }, Date.now());
    } else {
      addItem({
        type: MessageType.ERROR,
        text: tp('nanobanana.submit.failed', { error: error instanceof Error ? error.message : String(error) }),
      }, Date.now());
    }
  }
}

export const nanoBananaCommand: SlashCommand = {
  name: 'NanoBanana',
  altNames: ['nanobanana'],
  description: t('command.nanobanana.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const trimmedArgs = args.trim();
    if (!trimmedArgs) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('nanobanana.usage.error'),
      };
    }

    // Split by first space to get ratio and prompt
    const firstSpaceIndex = trimmedArgs.indexOf(' ');
    if (firstSpaceIndex === -1) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('nanobanana.missing.prompt'),
      };
    }

    let ratio = trimmedArgs.substring(0, firstSpaceIndex).trim();
    const prompt = trimmedArgs.substring(firstSpaceIndex + 1).trim();

    // Normalize ratio (1*1 -> 1:1, 1x1 -> 1:1)
    ratio = ratio.replace(/\*/g, ':').replace(/x/g, ':');

    if (!prompt) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('nanobanana.missing.prompt'),
      };
    }

    // Run in background (fire and forget from the command processor's perspective)
    runImageGeneration(context, ratio, prompt);

    // Return void to indicate handled without specific action return type
    return;
  },
  completion: async (_context, partialArg) => {
    // If the user has already typed a space, they are entering the prompt, so no completion.
    if (partialArg.includes(' ')) {
      return [];
    }

    // Filter allowed ratios based on what the user has typed so far
    const matches = ALLOWED_RATIOS.filter((ratio) =>
      ratio.startsWith(partialArg.toLowerCase())
    );

    return matches;
  },
};
