/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { CommandKind, SlashCommand, CommandContext } from './types.js';
import { ImageGeneratorAdapter, UnauthorizedError, proxyAuthManager, escapePath } from 'deepv-code-core';
import { MessageType } from '../types.js';
import { appEvents, AppEvent } from '../../utils/events.js';
import { t, tp } from '../utils/i18n.js';
import { fuzzyMatch } from '../utils/fuzzyMatch.js';
import { Suggestion } from '../components/SuggestionsDisplay.js';
import open from 'open';

const ALLOWED_RATIOS = ['auto', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.tif'];

async function runImageGeneration(context: CommandContext, ratio: string, prompt: string, imagePath?: string) {
  const { addItem } = context.ui;
  const adapter = ImageGeneratorAdapter.getInstance();

  try {
    let fromImgUrl: string | undefined;

    if (imagePath) {
      addItem({
        type: MessageType.INFO,
        text: tp('nanobanana.uploading_image', { path: imagePath }),
      }, Date.now());

      try {
        if (!fs.existsSync(imagePath)) {
          throw new Error(`Image file not found: ${imagePath}`);
        }

        const fileBuffer = fs.readFileSync(imagePath);
        const ext = path.extname(imagePath).toLowerCase();

        let contentType = 'image/jpeg'; // Default
        if (ext === '.png') contentType = 'image/png';
        else if (ext === '.webp') contentType = 'image/webp';
        else if (ext === '.gif') contentType = 'image/gif';
        else if (ext === '.bmp') contentType = 'image/bmp';
        else if (ext === '.tiff' || ext === '.tif') contentType = 'image/tiff';

        const userInfo = proxyAuthManager.getUserInfo();
        const username = (userInfo?.name || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
        const random = Math.random().toString(36).substring(2, 10);
        const filename = `${username}-${random}${ext}`;

        const { upload_url, public_url } = await adapter.getUploadUrl(filename, contentType);
        await adapter.uploadImage(upload_url, fileBuffer, contentType);

        fromImgUrl = public_url;

        addItem({
            type: MessageType.INFO,
            text: tp('nanobanana.image_uploaded', { url: public_url }),
        }, Date.now());

      } catch (error) {
         addItem({
            type: MessageType.ERROR,
            text: tp('nanobanana.upload_failed', { error: error instanceof Error ? error.message : String(error) }),
          }, Date.now());
          return; // Stop if upload fails
      }
    }

    addItem({
      type: MessageType.INFO,
      text: tp('nanobanana.submitting', { prompt, ratio }),
    }, Date.now());

    const task = await adapter.submitImageGenerationTask(prompt, ratio, fromImgUrl);

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

/**
 * 检查文件是否为支持的图片格式
 */
function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * 使用 glob 递归搜索图片文件，支持模糊匹配
 */
async function findImageFilesWithGlob(
  cwd: string,
  searchPrefix: string,
  maxResults = 50,
): Promise<Suggestion[]> {
  try {
    // 构建 glob 模式：搜索所有图片文件
    const imageGlobPattern = `**/*.{jpg,jpeg,png,webp,gif,bmp,tiff,tif}`;

    const files = await glob(imageGlobPattern, {
      cwd,
      dot: searchPrefix.startsWith('.'),
      nocase: true,
      ignore: ['**/node_modules/**', '**/.git/**'],
    });

    const suggestions: Suggestion[] = [];

    for (const file of files) {
      const fileName = path.basename(file);
      // 如果有搜索前缀，使用模糊匹配
      if (searchPrefix) {
        const matchResult = fuzzyMatch(fileName, searchPrefix);
        // 同时匹配路径
        const pathMatchResult = fuzzyMatch(file, searchPrefix);
        const bestScore = Math.max(matchResult.score, pathMatchResult.score);
        const matched = matchResult.matched || pathMatchResult.matched;

        if (!matched) {
          continue;
        }

        suggestions.push({
          label: file,
          value: '@' + escapePath(file),
          matchScore: bestScore,
        });
      } else {
        // 无搜索前缀时返回所有图片
        suggestions.push({
          label: file,
          value: '@' + escapePath(file),
          matchScore: 0,
        });
      }
    }

    // 按匹配分数和路径深度排序
    suggestions.sort((a, b) => {
      // 优先按匹配分数
      const scoreA = a.matchScore ?? 0;
      const scoreB = b.matchScore ?? 0;
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }

      // 同分数按路径深度（浅层优先）
      const depthA = (a.label.match(/\//g) || []).length;
      const depthB = (b.label.match(/\//g) || []).length;
      if (depthA !== depthB) {
        return depthA - depthB;
      }

      // 最后按文件名排序
      return a.label.localeCompare(b.label);
    });

    return suggestions.slice(0, maxResults);
  } catch {
    return [];
  }
}

/**
 * 获取指定目录下的图片文件和子目录
 */
async function getImageCompletionsInDir(
  basePath: string,
  prefix: string,
): Promise<Suggestion[]> {
  try {
    const absoluteDir = path.resolve(basePath);

    if (!fs.existsSync(absoluteDir)) {
      return [];
    }

    const entries = await fs.promises.readdir(absoluteDir, { withFileTypes: true });

    const suggestions: Suggestion[] = [];

    for (const entry of entries) {
      const name = entry.name;

      // 跳过隐藏文件（除非用户正在搜索隐藏文件）
      if (name.startsWith('.') && !prefix.startsWith('.')) {
        continue;
      }

      // 使用模糊匹配
      if (prefix) {
        const matchResult = fuzzyMatch(name, prefix);
        if (!matchResult.matched) {
          continue;
        }
      }

      // 只包含目录和图片文件
      if (entry.isDirectory()) {
        const displayPath = basePath === '.' ? name + '/' : path.join(basePath, name) + '/';
        suggestions.push({
          label: displayPath,
          value: '@' + escapePath(displayPath),
          matchScore: prefix ? fuzzyMatch(name, prefix).score : 0,
        });
      } else if (isImageFile(name)) {
        const displayPath = basePath === '.' ? name : path.join(basePath, name);
        suggestions.push({
          label: displayPath,
          value: '@' + escapePath(displayPath),
          matchScore: prefix ? fuzzyMatch(name, prefix).score : 0,
        });
      }
    }

    // 排序：目录优先，然后按名称
    suggestions.sort((a, b) => {
      const aIsDir = a.label.endsWith('/');
      const bIsDir = b.label.endsWith('/');
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return a.label.localeCompare(b.label);
    });

    return suggestions;
  } catch {
    return [];
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

    // Parse @path or --image/-i syntax
    let imagePath: string | undefined;
    let argsToParse = trimmedArgs;

    // 1. Check for @path syntax first
    const atImageRegex = /(?:^|\s)@(?:"([^"]+)"|([^\s]+))/;
    const atMatch = argsToParse.match(atImageRegex);

    if (atMatch) {
        imagePath = atMatch[1] || atMatch[2];
        argsToParse = argsToParse.replace(atMatch[0], '').trim();
    } else {
        // 2. Fallback to -i / --image syntax
        const imageFlagRegex = /\s+(-i|--image)\s+(?:"([^"]+)"|([^\s]+))/;
        const match = argsToParse.match(imageFlagRegex);
        if (match) {
            imagePath = match[2] || match[3];
            argsToParse = argsToParse.replace(match[0], '').trim();
        }
    }

    // Split by first space to get ratio and prompt
    const firstSpaceIndex = argsToParse.indexOf(' ');
    if (firstSpaceIndex === -1) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('nanobanana.missing.prompt'),
      };
    }

    let ratio = argsToParse.substring(0, firstSpaceIndex).trim();
    const prompt = argsToParse.substring(firstSpaceIndex + 1).trim();

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
    runImageGeneration(context, ratio, prompt, imagePath);

    // Return void to indicate handled without specific action return type
    return;
  },
  completion: async (context, partialArg) => {
    // 如果还没有空格，建议比例选项
    if (!partialArg.includes(' ')) {
      const matches = ALLOWED_RATIOS.filter((ratio) =>
        ratio.startsWith(partialArg.toLowerCase())
      );
      return matches;
    }

    // 否则，不提供补全（让全局 @ 补全接管）
    return [];
  },
};