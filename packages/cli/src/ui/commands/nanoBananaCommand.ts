/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
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

// ANSI Color Constants
const COLOR_GREEN = '\u001b[32m';
const COLOR_YELLOW = '\u001b[33m';
const COLOR_RED = '\u001b[31m';
const COLOR_CYAN = '\u001b[36m';
const COLOR_BLUE = '\u001b[34m';
const COLOR_MAGENTA = '\u001b[35m';
const COLOR_GREY = '\u001b[90m';
const RESET_COLOR = '\u001b[0m';
const BOLD = '\u001b[1m';

async function runImageGeneration(context: CommandContext, ratio: string, prompt: string, imagePath?: string, imageSize?: string) {
  const { addItem } = context.ui;
  const adapter = ImageGeneratorAdapter.getInstance();

  try {
    let fromImgUrl: string | undefined;

    if (imagePath) {
      addItem({
        type: MessageType.INFO,
        text: `${COLOR_CYAN}📤 ${tp('nanobanana.uploading_image', { path: `${BOLD}${imagePath}${RESET_COLOR}${COLOR_CYAN}` })}${RESET_COLOR}`,
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
            text: `${COLOR_GREEN}✅ ${tp('nanobanana.image_uploaded', { url: `${COLOR_CYAN}${public_url}${RESET_COLOR}${COLOR_GREEN}` })}${RESET_COLOR}`,
        }, Date.now());

      } catch (error) {
         addItem({
            type: MessageType.ERROR,
            text: `${COLOR_RED}❌ ${tp('nanobanana.upload_failed', { error: error instanceof Error ? error.message : String(error) })}${RESET_COLOR}`,
          }, Date.now());
          return; // Stop if upload fails
      }
    }

    addItem({
      type: MessageType.INFO,
      text: `${COLOR_CYAN}🎨 ${t('nanobanana.submitting').split('\n')[0]}${RESET_COLOR}\n` +
            `${BOLD}Prompt:${RESET_COLOR} ${COLOR_CYAN}"${prompt}"${RESET_COLOR}\n` +
            `${BOLD}Ratio:${RESET_COLOR} ${COLOR_YELLOW}${ratio}${RESET_COLOR}`,
    }, Date.now());

    const task = await adapter.submitImageGenerationTask(prompt, ratio, fromImgUrl, imageSize);

    const estimatedTime = task.task_info.estimated_time || 60;
    const timeoutSeconds = estimatedTime + 120;
    const startTime = Date.now();

    // Emit credits consumed event if credits were deducted
    if (task.credits_deducted > 0) {
      appEvents.emit(AppEvent.CreditsConsumed, task.credits_deducted);
    }

    addItem({
      type: MessageType.INFO,
      text: `${COLOR_GREEN}✅ ${t('nanobanana.submitted').split('\n')[0].replace('{taskId}', `${COLOR_CYAN}${task.task_id}${RESET_COLOR}${COLOR_GREEN}`)}${RESET_COLOR}\n` +
            `${COLOR_YELLOW}💰 ${t('nanobanana.submitted').split('\n')[1].replace('{credits}', `${BOLD}${task.credits_deducted}${RESET_COLOR}${COLOR_YELLOW}`)}${RESET_COLOR}\n` +
            `${COLOR_CYAN}⏳ ${t('nanobanana.submitted').split('\n')[2]}${RESET_COLOR}`,
    }, Date.now());

    // Emit event to show polling spinner
    appEvents.emit(AppEvent.ImagePollingStart, {
      taskId: task.task_id,
      estimatedTime
    });

    // Polling loop
    let displayedEstimatedTime = estimatedTime; // 用于显示的预估时间，会动态扩展
    let isFinished = false; // Flag to prevent duplicate completion handling

    const pollInterval = setInterval(async () => {
      if (isFinished) {
        clearInterval(pollInterval);
        return;
      }

      try {
        const elapsedSeconds = (Date.now() - startTime) / 1000;

        if (elapsedSeconds > timeoutSeconds) {
          isFinished = true;
          clearInterval(pollInterval);
          addItem({
            type: MessageType.ERROR,
            text: `${COLOR_RED}❌ ${tp('nanobanana.timeout', { seconds: Math.round(elapsedSeconds) })}${RESET_COLOR}`,
          }, Date.now());
          return;
        }

        const status = await adapter.getImageTaskStatus(task.task_id);

        // Double check isFinished after await, in case another interval fired and finished it
        if (isFinished) {
            clearInterval(pollInterval);
            return;
        }

        if (status.status === 'completed') {
          isFinished = true;
          clearInterval(pollInterval);
          appEvents.emit(AppEvent.ImagePollingEnd, { success: true });

          const resultUrls = status.result_urls || [];
          const urlText = resultUrls.map((url, idx) => `${BOLD}Image ${idx + 1}:${RESET_COLOR} ${COLOR_CYAN}${url}${RESET_COLOR}`).join('\n');

          // Use credits_actual if available, otherwise fallback to credits_deducted
          // @ts-ignore - credits_actual might not be in the type definition yet
          const actualCredits = status.credits_actual !== undefined ? status.credits_actual : (status.credits_deducted || 0);

          addItem({
            type: MessageType.INFO,
            text: `${COLOR_GREEN}🎉 ${t('nanobanana.completed').split('\n')[0]}${RESET_COLOR}\n` +
                  `${COLOR_YELLOW}💰 ${t('nanobanana.completed').split('\n')[1].replace('{credits}', `${BOLD}${actualCredits}${RESET_COLOR}${COLOR_YELLOW}`)}${RESET_COLOR}\n` +
                  `${urlText}`,
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
          isFinished = true;
          clearInterval(pollInterval);
          appEvents.emit(AppEvent.ImagePollingEnd, { success: false });

          addItem({
            type: MessageType.ERROR,
            text: `${COLOR_RED}❌ ${tp('nanobanana.failed', { error: status.error_message || 'Unknown error' })}${RESET_COLOR}`,
          }, Date.now());
        } else {
          // For 'pending' or 'processing', dynamically extend estimated time if elapsed exceeds it
          if (elapsedSeconds > displayedEstimatedTime) {
            // 如果超过了预估时间，动态扩展预估时间（每次增加30秒）
            displayedEstimatedTime = Math.ceil(elapsedSeconds) + 30;
          }

          // Emit polling progress event with dynamic estimated time
          appEvents.emit(AppEvent.ImagePollingProgress, {
            elapsed: Math.round(elapsedSeconds),
            estimated: displayedEstimatedTime
          });
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 1000);

  } catch (error) {
    if (error instanceof UnauthorizedError) {
      addItem({
        type: MessageType.ERROR,
        text: `${COLOR_RED}❌ ${t('nanobanana.auth.failed')}${RESET_COLOR}`,
      }, Date.now());
    } else {
      addItem({
        type: MessageType.ERROR,
        text: `${COLOR_RED}❌ ${tp('nanobanana.submit.failed', { error: error instanceof Error ? error.message : String(error) })}${RESET_COLOR}`,
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

    // Parse: <ratio> <size> <prompt> [@image]
    // @image can appear anywhere in the command (before, after, or within the prompt)
    // Example: /nanobanana 16:9 2K "A futuristic city" @ref.jpg
    // Example: /nanobanana 16:9 2K @ref.jpg "A futuristic city"
    // Example: /nanobanana @ref.jpg 16:9 2K "A futuristic city"

    // First, extract all @image references and remove them from the string
    let imagePath: string | undefined;
    const atImageRegex = /(?:^|\s)@(?:"([^"]+)"|([^\s]+))/g;
    let argsWithoutImage = trimmedArgs;
    let match;

    // Find all @references and take the first valid image file
    while ((match = atImageRegex.exec(trimmedArgs)) !== null) {
      const potentialPath = match[1] || match[2];
      // Check if it looks like an image file
      if (isImageFile(potentialPath)) {
        if (!imagePath) {
          imagePath = potentialPath;
        }
        // Remove this @reference from the args string
        argsWithoutImage = argsWithoutImage.replace(match[0], ' ');
      }
    }

    // Clean up multiple spaces
    argsWithoutImage = argsWithoutImage.replace(/\s+/g, ' ').trim();

    const parts = argsWithoutImage.split(/\s+/);
    if (parts.length < 2) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('nanobanana.missing.prompt'),
      };
    }

    // Find ratio and size in the parts (they can be in any order among the first few tokens)
    let ratio: string | undefined;
    let imageSize: string | undefined;
    let ratioIndex = -1;
    let sizeIndex = -1;

    for (let i = 0; i < Math.min(parts.length, 3); i++) {
      const part = parts[i];
      const normalizedPart = part.replace(/\*/g, ':').replace(/x/g, ':');

      // Check if it's a ratio
      if (!ratio && ALLOWED_RATIOS.includes(normalizedPart)) {
        ratio = normalizedPart;
        ratioIndex = i;
        continue;
      }

      // Check if it's a size
      if (!imageSize && ['1K', '2K'].includes(part.toUpperCase())) {
        imageSize = part.toUpperCase();
        sizeIndex = i;
        continue;
      }
    }

    // Validate ratio
    if (!ratio) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('nanobanana.usage.error'),
      };
    }

    // Validate size
    if (!imageSize) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('nanobanana.invalid.size'),
      };
    }

    // Extract prompt: everything except ratio and size
    const promptParts = parts.filter((_, i) => i !== ratioIndex && i !== sizeIndex);
    const prompt = promptParts.join(' ').trim();

    if (!prompt) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('nanobanana.missing.prompt'),
      };
    }

    // Run in background (fire and forget from the command processor's perspective)
    runImageGeneration(context, ratio, prompt, imagePath, imageSize);

    // Return void to indicate handled without specific action return type
    return;
  },
  completion: async (context, partialArg) => {
    const trimmed = partialArg.trim();
    const parts = trimmed.split(/\s+/).filter((p) => p.length > 0);

    // Check if user has trailing space (e.g., "16:9 " with space)
    // This indicates they're moving to the next parameter
    const hasTrailingSpace = partialArg.endsWith(' ') || partialArg.endsWith('\t');

    // First parameter: suggest ratios
    if (parts.length === 0) {
      // User just typed the command name, suggest all ratios
      return ALLOWED_RATIOS;
    }

    if (parts.length === 1 && !hasTrailingSpace) {
      // User typed ratio prefix, suggest matching ratios
      // Normalize for matching (support 1*1, 1x1 formats)
      const normalizedInput = parts[0].replace(/\*/g, ':').replace(/x/g, ':').toLowerCase();
      const matches = ALLOWED_RATIOS.filter((ratio) =>
        ratio.toLowerCase().startsWith(normalizedInput)
      );

      // If user input is an exact match for a ratio, also show size options
      // This handles the case where user typed complete ratio like "16:9" without trailing space
      if (matches.length === 1 && matches[0].toLowerCase() === normalizedInput) {
        return ['1K', '2K'];
      }

      return matches;
    }

    // Second parameter: suggest image sizes
    if ((parts.length === 2 && !hasTrailingSpace) || (parts.length === 1 && hasTrailingSpace)) {
      const sizeOptions = ['1K', '2K'];
      const searchText = hasTrailingSpace ? '' : (parts[1] || '');
      return sizeOptions.filter((size) =>
        size.toLowerCase().startsWith(searchText.toLowerCase())
      );
    }

    // Otherwise, let global @ completion handle file suggestions
    return [];
  },
};