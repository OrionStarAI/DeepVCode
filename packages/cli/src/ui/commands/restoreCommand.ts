/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import path from 'path';
import {
  type CommandContext,
  type SlashCommand,
  type SlashCommandActionReturn,
  CommandKind,
} from './types.js';
import type { Suggestion } from '../components/SuggestionsDisplay.js';
import { Config, SessionManager } from 'deepv-code-core';
import { t } from '../utils/i18n.js';

async function restoreAction(
  context: CommandContext,
  args: string,
): Promise<void | SlashCommandActionReturn> {
  const { services, ui } = context;
  const { config, git: gitService } = services;
  const { addItem, loadHistory } = ui;

  const projectRoot = config?.getProjectRoot();
  if (!projectRoot) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Could not determine project root directory.',
    };
  }

  const sessionManager = new SessionManager(projectRoot);

  try {
    if (!args) {
      // 列出当前session的可恢复checkpoints
      const currentSessionId = config?.getSessionId();
      if (!currentSessionId) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'Could not determine current session ID.',
        };
      }

      const sessionData = await sessionManager.loadSession(currentSessionId);
      if (!sessionData || sessionData.checkpoints.length === 0) {
        return {
          type: 'message',
          messageType: 'info',
          content: t('command.restore.no_checkpoints'),
        };
      }

      let checkpointList = '📋 Current Session Checkpoints:\n\n';

      for (const checkpoint of sessionData.checkpoints) {
        const summaryPrefix = checkpoint.summary ? `(${checkpoint.summary}) ` : '';
        const preview = checkpoint.lastUserMessage?.substring(0, 50) || '无消息';
        checkpointList += `  ${checkpoint.timeString} - ${summaryPrefix}"${preview}${checkpoint.lastUserMessage?.length > 50 ? '...' : ''}"\n`;
      }

      return {
        type: 'message',
        messageType: 'info',
        content: `${checkpointList}\n💡 使用 /restore <checkpoint-id> 来恢复指定的checkpoint`
      };
    }

    // 尝试恢复指定的checkpoint (仅在当前session中查找)
    const currentSessionId = config?.getSessionId();
    if (!currentSessionId) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Could not determine current session ID.',
      };
    }

    const sessionData = await sessionManager.loadSession(currentSessionId);
    if (!sessionData || sessionData.checkpoints.length === 0) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('command.restore.no_checkpoints'),
      };
    }

    const checkpoint = sessionData.checkpoints.find(cp => cp.id === args);
    if (!checkpoint) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Checkpoint not found in current session: ${args}`,
      };
    }

    // 恢复Git状态到checkpoint时的状态
    if (checkpoint.commitHash) {
      if (gitService && gitService.isGitDisabled?.()) {
        addItem(
          {
            type: 'error',
            text: `无法恢复文件状态：Git服务已禁用 (${gitService.getDisabledReason?.() || '未知原因'})`,
          },
          Date.now(),
        );
      } else {
        try {
          await gitService?.restoreProjectFromSnapshot(checkpoint.commitHash);
        } catch (error) {
          addItem(
            {
              type: 'error',
              text: `恢复文件状态失败: ${error instanceof Error ? error.message : String(error)}`,
            },
            Date.now(),
          );
        }
      }

      const timeInfo = checkpoint.timeString || new Date(checkpoint.timestamp).toLocaleString();
      const messageInfo = checkpoint.lastUserMessage ? ` - "${checkpoint.lastUserMessage.substring(0, 50)}${checkpoint.lastUserMessage.length > 50 ? '...' : ''}"` : '';

      addItem(
        {
          type: 'info',
          text: `已恢复到checkpoint时的项目状态: ${timeInfo}${messageInfo}`,
        },
        Date.now(),
      );

      return {
        type: 'message',
        messageType: 'info',
        content: 'Checkpoint恢复完成。项目文件已回滚到checkpoint创建时的状态。',
      };
    } else {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Checkpoint缺少Git commit信息，无法恢复。',
      };
    }
  } catch (error) {
    return {
      type: 'message',
      messageType: 'error',
      content: `Could not restore checkpoint. This is the error: ${error}`,
    };
  }
}



async function completion(
  context: CommandContext,
  _partialArg: string,
): Promise<Suggestion[]> {
  const { services } = context;
  const { config } = services;

  const projectRoot = config?.getProjectRoot();
  const currentSessionId = config?.getSessionId();
  if (!projectRoot || !currentSessionId) {
    return [];
  }

  const sessionManager = new SessionManager(projectRoot);

  try {
    // 只获取当前session的checkpoint IDs，并包含lastUserMessage作为描述
    const sessionData = await sessionManager.loadSession(currentSessionId);
    if (sessionData && sessionData.checkpoints.length > 0) {
      return sessionData.checkpoints.map(cp => ({
        label: cp.timeString || cp.id,  // 优先显示时间，没有则显示 ID
        value: cp.id,  // 实际值还是 ID
        description: cp.summary
          ? `(${cp.summary}) ${cp.lastUserMessage?.substring(0, 40) || ''}${cp.lastUserMessage && cp.lastUserMessage.length > 40 ? '...' : ''}`
          : cp.lastUserMessage
            ? `${cp.lastUserMessage.substring(0, 50)}${cp.lastUserMessage.length > 50 ? '...' : ''}`
            : '无消息记录'
      }));
    }

    return [];
  } catch (_err) {
    return [];
  }
}

export const restoreCommand = (config: Config | null): SlashCommand | null => {
  if (!config) {
    return null;
  }

  return {
    name: 'restore',
    description: t('command.restore.description'),
    kind: CommandKind.BUILT_IN,
    action: restoreAction,
    completion,
  };
};
