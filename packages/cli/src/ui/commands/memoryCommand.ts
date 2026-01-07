/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getErrorMessage,
  loadServerHierarchicalMemory,
  MemoryTool,
  getCoreSystemPrompt,
} from 'deepv-code-core';
import { encodingForModel, getEncoding } from 'js-tiktoken';
import { MessageType } from '../types.js';
import {
  CommandKind,
  SlashCommand,
  SlashCommandActionReturn,
} from './types.js';
import { t } from '../utils/i18n.js';

export const memoryCommand: SlashCommand = {
  name: 'memory',
  description: t('command.memory.description'),
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'show',
      description: t('command.memory.show.description'),
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        const memoryContent = context.services.config?.getUserMemory() || '';
        const fileCount = context.services.config?.getGeminiMdFileCount() || 0;

        const messageContent =
          memoryContent.length > 0
            ? `当前记忆中来自 ${fileCount} 个文件的内容:\n\n---\n${memoryContent}\n---`
            : '记忆当前为空。';

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: messageContent,
          },
          Date.now(),
        );
      },
    },
    {
      name: 'add',
      description: t('command.memory.add.description'),
      kind: CommandKind.BUILT_IN,
      action: async (context, args): Promise<SlashCommandActionReturn | void> => {
        if (!args || args.trim() === '') {
          return {
            type: 'message',
            messageType: 'error',
            content: '用法: /memory add <要记住的文本>',
          };
        }

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: `${t('memory.add.trying')}: "${args.trim()}"`,
          },
          Date.now(),
        );

        try {
          // 直接调用save_memory工具，而不是返回工具调用请求
          const config = await context.services.config;
          if (config) {
            const memoryTool = new MemoryTool(config);
            const result = await memoryTool.execute(
              { fact: args.trim() },
              new AbortController().signal
            );

            // 显示执行结果
            const displayText = typeof result.returnDisplay === 'string'
              ? result.returnDisplay
              : JSON.stringify(result.returnDisplay);
            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: displayText,
              },
              Date.now(),
            );

            // 自动刷新记忆以重载更新后的文件
            try {
              const { memoryContent, fileCount, filePaths } =
                await loadServerHierarchicalMemory(
                  config.getWorkingDir(),
                  config.getDebugMode(),
                  config.getFileService(),
                  config.getExtensionContextFilePaths(),
                  config.getFileFilteringOptions(),
                  context.services.settings.merged.memoryDiscoveryMaxDirs,
                );
              config.setUserMemory(memoryContent);
              config.setGeminiMdFileCount(fileCount);
              config.setGeminiMdFilePaths(filePaths);

              // 计算并更新 memory token
              try {
                const enc = getEncoding('cl100k_base');
                const memoryTokenCount = enc.encode(memoryContent).length;
                config.setMemoryTokenCount(memoryTokenCount);
              } catch (e) {
                config.setMemoryTokenCount(0);
              }

              // 🔥 关键修复：更新当前模型实例的系统指令
              try {
                const geminiClient = await config.getGeminiClient();
                if (geminiClient && (geminiClient as any).chat) {
                  const isVSCode = config.getVsCodePluginMode();
                  const agentStyle = config.getAgentStyle();
                  const updatedSystemInstruction = getCoreSystemPrompt(memoryContent, isVSCode, undefined, agentStyle);
                  (geminiClient as any).chat.generationConfig.systemInstruction = updatedSystemInstruction;
                }
              } catch (updateError) {
                console.warn('更新模型系统指令失败:', updateError);
              }

              // 显示刷新成功信息
              let refreshMessage = `${t('memory.add.refreshSuccess')} ${t('memory.refreshed').replace('{fileCount}', fileCount.toString()).replace('{charCount}', memoryContent.length.toString())}`;
              if (fileCount > 0 && filePaths.length > 0) {
                refreshMessage += `\nMemory files:\n${filePaths.map(f => `  - ${f}`).join('\n')}`;
              }
              context.ui.addItem(
                {
                  type: MessageType.INFO,
                  text: refreshMessage,
                },
                Date.now(),
              );
            } catch (refreshError) {
              // 显示刷新失败信息
              const errorMessage = refreshError instanceof Error ? refreshError.message : String(refreshError);
              context.ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: `${t('memory.add.refreshError')}: ${errorMessage}`,
                },
                Date.now(),
              );
            }
          } else {
            context.ui.addItem(
              {
                type: MessageType.ERROR,
                text: t('memory.add.configNotLoaded'),
              },
              Date.now(),
            );
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `${t('memory.add.saveError')}: ${errorMessage}`,
            },
            Date.now(),
          );
        }
      },
    },
    {
      name: 'refresh',
      description: t('command.memory.refresh.description'),
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: t('memory.refresh.refreshing'),
          },
          Date.now(),
        );

        try {
          const config = await context.services.config;
          if (config) {
            const { memoryContent, fileCount, filePaths } =
              await loadServerHierarchicalMemory(
                config.getWorkingDir(),
                config.getDebugMode(),
                config.getFileService(),
                config.getExtensionContextFilePaths(),
                config.getFileFilteringOptions(),
                context.services.settings.merged.memoryDiscoveryMaxDirs,
              );
            config.setUserMemory(memoryContent);
            config.setGeminiMdFileCount(fileCount);
            config.setGeminiMdFilePaths(filePaths);

            // 计算并更新 memory token
            try {
              const enc = getEncoding('cl100k_base');
              const memoryTokenCount = enc.encode(memoryContent).length;
              config.setMemoryTokenCount(memoryTokenCount);
            } catch (e) {
              config.setMemoryTokenCount(0);
            }

            // 🔥 关键修复：更新当前模型实例的系统指令
            try {
              const geminiClient = await config.getGeminiClient();
              if (geminiClient && (geminiClient as any).chat) {
                const isVSCode = config.getVsCodePluginMode();
                const agentStyle = config.getAgentStyle();
                const updatedSystemInstruction = getCoreSystemPrompt(memoryContent, isVSCode, undefined, agentStyle);
                (geminiClient as any).chat.generationConfig.systemInstruction = updatedSystemInstruction;
              }
            } catch (updateError) {
              console.warn('更新模型系统指令失败:', updateError);
            }

            let successMessage =
              memoryContent.length > 0
                ? `${t('memory.refresh.success')} ${t('memory.refreshed').replace('{fileCount}', fileCount.toString()).replace('{charCount}', memoryContent.length.toString())}`
                : t('memory.refresh.noContent');

            // Add file paths to the success message
            if (fileCount > 0 && filePaths.length > 0) {
              successMessage += `\nMemory files:\n${filePaths.map(f => `  - ${f}`).join('\n')}`;
            }

            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: successMessage,
              },
              Date.now(),
            );
          }
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error refreshing memory: ${errorMessage}`,
            },
            Date.now(),
          );
        }
      },
    },
  ],
};
