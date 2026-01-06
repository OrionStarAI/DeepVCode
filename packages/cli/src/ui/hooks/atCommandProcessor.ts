/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { PartListUnion, PartUnion } from '@google/genai';
import {
  Config,
  PROJECT_CONFIG_DIR_NAME,
  getErrorMessage,
  isNodeError,
  ProjectSettingsManager,
  unescapePath,
} from 'deepv-code-core';
import {
  HistoryItem,
  IndividualToolCallDisplay,
  ToolCallStatus,
} from '../types.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import { isClipboardPath } from 'deepv-code-core';

interface HandleAtCommandParams {
  query: string;
  config: Config;
  addItem: UseHistoryManagerReturn['addItem'];
  onDebugMessage: (message: string) => void;
  messageId: number;
  signal: AbortSignal;
}

interface HandleAtCommandResult {
  processedQuery: PartListUnion | null;
  shouldProceed: boolean;
}

interface AtCommandPart {
  type: 'text' | 'atPath';
  content: string;
}


/**
 * Parses a query string to find all '@<path>' commands and text segments.
 * Handles:
 * - Backslash escaped spaces within paths (e.g., @file\ name.txt)
 * - Quoted paths (e.g., @"file name.txt" or @'file name.txt')
 * - Automatic path termination after file extensions
 */
function parseAllAtCommands(query: string): AtCommandPart[] {
  const parts: AtCommandPart[] = [];
  let currentIndex = 0;

  // Common file extensions that indicate end of path
  const fileExtensions = /\.(txt|md|js|ts|tsx|jsx|py|java|cpp|c|h|cs|go|rs|php|rb|swift|kt|html|css|scss|json|xml|yaml|yml|toml|ini|cfg|conf|log|sh|bat|ps1|cmd|docx?|xlsx?|pptx?|pdf|png|jpe?g|gif|svg|webp|mp[34]|wav|avi|mov|zip|tar|gz|bz2|7z|rar)$/i;

  while (currentIndex < query.length) {
    let atIndex = -1;
    let nextSearchIndex = currentIndex;
    // Find next unescaped '@'
    while (nextSearchIndex < query.length) {
      if (
        query[nextSearchIndex] === '@' &&
        (nextSearchIndex === 0 || query[nextSearchIndex - 1] !== '\\')
      ) {
        atIndex = nextSearchIndex;
        break;
      }
      nextSearchIndex++;
    }

    if (atIndex === -1) {
      // No more @
      if (currentIndex < query.length) {
        parts.push({ type: 'text', content: query.substring(currentIndex) });
      }
      break;
    }

    // Add text before @
    if (atIndex > currentIndex) {
      parts.push({
        type: 'text',
        content: query.substring(currentIndex, atIndex),
      });
    }

    // Parse @path
    let pathEndIndex = atIndex + 1;
    let inEscape = false;
    let inQuote: string | null = null; // Track quote type: '"' or "'"

    // Check if path starts with a quote
    if (pathEndIndex < query.length && (query[pathEndIndex] === '"' || query[pathEndIndex] === "'")) {
      inQuote = query[pathEndIndex];
      pathEndIndex++; // Skip opening quote
    }

    while (pathEndIndex < query.length) {
      const char = query[pathEndIndex];

      if (inQuote) {
        // Inside quoted path
        if (char === inQuote && !inEscape) {
          // Found closing quote
          pathEndIndex++; // Include closing quote
          break;
        } else if (char === '\\' && !inEscape) {
          inEscape = true;
        } else {
          inEscape = false;
        }
      } else {
        // Not in quoted path
        if (inEscape) {
          inEscape = false;
        } else if (char === '\\') {
          inEscape = true;
        } else if (/\s/.test(char)) {
          // Path ends at first whitespace not escaped
          break;
        } else if (pathEndIndex > atIndex + 1) {
          // Check for file extension pattern followed by non-path characters
          // Only check if we've read at least some characters
          const pathSoFar = query.substring(atIndex + 1, pathEndIndex + 1);

          // Check if current position completes a file extension
          if (fileExtensions.test(pathSoFar)) {
            // Check if next character is not a path separator or alphanumeric (likely start of new text)
            const nextChar = query[pathEndIndex + 1];
            if (nextChar && nextChar !== '/' && nextChar !== '\\' && !/[a-zA-Z0-9._-]/.test(nextChar)) {
              // This looks like end of file path
              pathEndIndex++; // Include current char
              break;
            }
          }
        }
      }
      pathEndIndex++;
    }

    let rawAtPath = query.substring(atIndex, pathEndIndex);

    // Remove quotes if present
    if (rawAtPath.length > 2) {
      const firstChar = rawAtPath[1]; // After '@'
      const lastChar = rawAtPath[rawAtPath.length - 1];
      if ((firstChar === '"' && lastChar === '"') || (firstChar === "'" && lastChar === "'")) {
        // Remove quotes: @"path" -> @path
        rawAtPath = '@' + rawAtPath.substring(2, rawAtPath.length - 1);
      }
    }

    // unescapePath expects the @ symbol to be present, and will handle it.
    const atPath = unescapePath(rawAtPath);
    parts.push({ type: 'atPath', content: atPath });
    currentIndex = pathEndIndex;
  }
  // Filter out empty text parts that might result from consecutive @paths or leading/trailing spaces
  return parts.filter(
    (part) => !(part.type === 'text' && part.content.trim() === ''),
  );
}

/**
 * Processes user input potentially containing one or more '@<path>' commands.
 * If found, it attempts to read the specified files/directories using the
 * 'read_many_files' tool. The user query is modified to include resolved paths,
 * and the content of the files is appended in a structured block.
 *
 * @returns An object indicating whether the main hook should proceed with an
 *          LLM call and the processed query parts (including file content).
 */
export async function handleAtCommand({
  query,
  config,
  addItem,
  onDebugMessage,
  messageId: userMessageTimestamp,
  signal,
}: HandleAtCommandParams): Promise<HandleAtCommandResult> {
  const commandParts = parseAllAtCommands(query);
  const atPathCommandParts = commandParts.filter(
    (part) => part.type === 'atPath',
  );

  if (atPathCommandParts.length === 0) {
    addItem({ type: 'user', text: query }, userMessageTimestamp);
    return { processedQuery: [{ text: query }], shouldProceed: true };
  }

  addItem({ type: 'user', text: query }, userMessageTimestamp);

  // Get centralized file discovery service
  const fileDiscovery = config.getFileService();

  const respectFileIgnore = config.getFileFilteringOptions();

  const pathSpecsToRead: string[] = [];
  const atPathToResolvedSpecMap = new Map<string, string>();
  const contentLabelsForDisplay: string[] = [];
  const skippedDirectories: string[] = [];
  const ignoredByReason: Record<string, string[]> = {
    git: [],
    gemini: [],
    both: [],
  };

  const toolRegistry = await config.getToolRegistry();
  const readManyFilesTool = toolRegistry.getTool('read_many_files');
  const globTool = toolRegistry.getTool('glob');

  if (!readManyFilesTool) {
    addItem(
      { type: 'error', text: 'Error: read_many_files tool not found.' },
      userMessageTimestamp,
    );
    return { processedQuery: null, shouldProceed: false };
  }

  for (const atPathPart of atPathCommandParts) {
    const originalAtPath = atPathPart.content; // e.g., "@file.txt" or "@"

    if (originalAtPath === '@') {
      onDebugMessage(
        'Lone @ detected, will be treated as text in the modified query.',
      );
      continue;
    }

    const pathName = originalAtPath.substring(1);
    if (!pathName) {
      // This case should ideally not be hit if parseAllAtCommands ensures content after @
      // but as a safeguard:
      addItem(
        {
          type: 'error',
          text: `Error: Invalid @ command '${originalAtPath}'. No path specified.`,
        },
        userMessageTimestamp,
      );
      // Decide if this is a fatal error for the whole command or just skip this @ part
      // For now, let's be strict and fail the command if one @path is malformed.
      return { processedQuery: null, shouldProceed: false };
    }

    // 🎯 特殊处理：@clipboard 命令
    if (pathName === 'clipboard') {
      onDebugMessage('Processing @clipboard command - detecting clipboard content type');

      try {
        // 导入剪贴板工具函数
        const { clipboardHasImage, saveClipboardImage, getClipboardText } = await import('../utils/clipboardUtils.js');

        // 检查剪贴板内容类型
        const hasImage = await clipboardHasImage();

        if (hasImage) {
          onDebugMessage('@clipboard detected image content');
          // 处理图片
          const configDirPath = config.getProjectSettingsManager().getConfigDirPath();
          const imagePath = await saveClipboardImage(configDirPath);

          if (imagePath) {
            onDebugMessage(`@clipboard image saved to: ${imagePath}`);
            // 获取相对路径
            const relativePath = path.relative(config.getTargetDir(), imagePath);
            // 将图片路径加入待读取列表
            pathSpecsToRead.push(relativePath);
            atPathToResolvedSpecMap.set(originalAtPath, relativePath);
            contentLabelsForDisplay.push(`clipboard image (${relativePath})`);
          } else {
            addItem(
              { type: 'error', text: 'Error: Failed to save clipboard image.' },
              userMessageTimestamp,
            );
            return { processedQuery: null, shouldProceed: false };
          }
        } else {
          onDebugMessage('@clipboard detected text content');
          // 处理文本
          const clipboardText = await getClipboardText();
          onDebugMessage(`@clipboard getClipboardText() 返回: ${clipboardText ? `"${clipboardText.substring(0, 100)}..."` : 'null'}`);

          if (clipboardText && clipboardText.trim()) {
            onDebugMessage(`@clipboard text content length: ${clipboardText.length}`);
            // 直接返回文本内容，不需要文件系统处理
            addItem(
              { type: 'info', text: `📋 Clipboard content (${clipboardText.length} characters)` },
              userMessageTimestamp,
            );

            // 记录剪贴板文本，但不加入文件读取列表
            atPathToResolvedSpecMap.set(originalAtPath, `__CLIPBOARD_TEXT__${clipboardText}`);
            contentLabelsForDisplay.push('clipboard text');
          } else {
            onDebugMessage(`@clipboard 文本为空或无效。clipboardText=${clipboardText}, trimmed=${clipboardText?.trim()}`);
            addItem(
              { type: 'error', text: 'Error: Clipboard is empty or contains no accessible content.' },
              userMessageTimestamp,
            );
            return { processedQuery: null, shouldProceed: false };
          }
        }

        continue; // 跳过后续的文件处理逻辑
      } catch (error) {
        onDebugMessage(`@clipboard processing error: ${getErrorMessage(error)}`);
        addItem(
          { type: 'error', text: `Error processing @clipboard: ${getErrorMessage(error)}` },
          userMessageTimestamp,
        );
        return { processedQuery: null, shouldProceed: false };
      }
    }

    // Check if path should be ignored based on filtering options
    // Skip filtering for clipboard files to allow access to clipboard images
    const isClipboardFile = isClipboardPath(pathName, config.getTargetDir(), PROJECT_CONFIG_DIR_NAME);

    if (!isClipboardFile) {
      const gitIgnored =
        respectFileIgnore.respectGitIgnore &&
        fileDiscovery.shouldIgnoreFile(pathName, {
          respectGitIgnore: true,
          respectGeminiIgnore: false,
        });
      const geminiIgnored =
        respectFileIgnore.respectGeminiIgnore &&
        fileDiscovery.shouldIgnoreFile(pathName, {
          respectGitIgnore: false,
          respectGeminiIgnore: true,
        });

      if (gitIgnored || geminiIgnored) {
        const reason =
          gitIgnored && geminiIgnored ? 'both' : gitIgnored ? 'git' : 'gemini';
        ignoredByReason[reason].push(pathName);
        const reasonText =
          reason === 'both'
            ? 'ignored by both git and gemini'
            : reason === 'git'
              ? 'git-ignored'
              : 'gemini-ignored';
        onDebugMessage(`Path ${pathName} is ${reasonText} and will be skipped.`);
        continue;
      }
    } else {
      onDebugMessage(`Path ${pathName} is in clipboard directory, skipping git filtering.`);
    }

    let currentPathSpec = pathName;
    let resolvedSuccessfully = false;

    try {
      const absolutePath = path.resolve(config.getTargetDir(), pathName);
      const stats = await fs.stat(absolutePath);
      if (stats.isDirectory()) {
        onDebugMessage(
          `Path ${pathName} resolved to directory, skipping content reading (only files are read)`,
        );
        // 跟踪被跳过的文件夹，稍后提供反馈
        skippedDirectories.push(pathName);
        continue;
      } else {
        onDebugMessage(`Path ${pathName} resolved to file: ${absolutePath}`);
        currentPathSpec = pathName; // 只处理单个文件
      }
      resolvedSuccessfully = true;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        if (config.getEnableRecursiveFileSearch() && globTool) {
          onDebugMessage(
            `Path ${pathName} not found directly, attempting glob search.`,
          );
          try {
            const globResult = await globTool.execute(
              {
                pattern: `**/*${pathName}*`,
                path: config.getTargetDir(),
              },
              signal,
            );
            if (
              globResult.llmContent &&
              typeof globResult.llmContent === 'string' &&
              !globResult.llmContent.startsWith('No files found') &&
              !globResult.llmContent.startsWith('Error:')
            ) {
              const lines = globResult.llmContent.split('\n');
              if (lines.length > 1 && lines[1]) {
                const firstMatchAbsolute = lines[1].trim();
                currentPathSpec = path.relative(
                  config.getTargetDir(),
                  firstMatchAbsolute,
                );
                onDebugMessage(
                  `Glob search for ${pathName} found ${firstMatchAbsolute}, using relative path: ${currentPathSpec}`,
                );
                resolvedSuccessfully = true;
              } else {
                onDebugMessage(
                  `Glob search for '**/*${pathName}*' did not return a usable path. Path ${pathName} will be skipped.`,
                );
              }
            } else {
              onDebugMessage(
                `Glob search for '**/*${pathName}*' found no files or an error. Path ${pathName} will be skipped.`,
              );
            }
          } catch (globError) {
            console.error(
              `Error during glob search for ${pathName}: ${getErrorMessage(globError)}`,
            );
            onDebugMessage(
              `Error during glob search for ${pathName}. Path ${pathName} will be skipped.`,
            );
          }
        } else {
          onDebugMessage(
            `Glob tool not found. Path ${pathName} will be skipped.`,
          );
        }
      } else {
        console.error(
          `Error stating path ${pathName}: ${getErrorMessage(error)}`,
        );
        onDebugMessage(
          `Error stating path ${pathName}. Path ${pathName} will be skipped.`,
        );
      }
    }

    if (resolvedSuccessfully) {
      pathSpecsToRead.push(currentPathSpec);
      atPathToResolvedSpecMap.set(originalAtPath, currentPathSpec);
      contentLabelsForDisplay.push(pathName);
    }
  }

  // Construct the initial part of the query for the LLM
  let initialQueryText = '';
  for (let i = 0; i < commandParts.length; i++) {
    const part = commandParts[i];
    if (part.type === 'text') {
      initialQueryText += part.content;
    } else {
      // type === 'atPath'
      const resolvedSpec = atPathToResolvedSpecMap.get(part.content);
      if (
        i > 0 &&
        initialQueryText.length > 0 &&
        !initialQueryText.endsWith(' ') &&
        resolvedSpec
      ) {
        // Add space if previous part was text and didn't end with space, or if previous was @path
        const prevPart = commandParts[i - 1];
        if (
          prevPart.type === 'text' ||
          (prevPart.type === 'atPath' &&
            atPathToResolvedSpecMap.has(prevPart.content))
        ) {
          initialQueryText += ' ';
        }
      }
      if (resolvedSpec) {
        // 🎯 特殊处理：剪贴板文本内容
        if (resolvedSpec.startsWith('__CLIPBOARD_TEXT__')) {
          const clipboardText = resolvedSpec.substring('__CLIPBOARD_TEXT__'.length);
          initialQueryText += clipboardText;
        } else {
          initialQueryText += `@${resolvedSpec}`;
        }
      } else {
        // If not resolved for reading (e.g. lone @ or invalid path that was skipped),
        // add the original @-string back, ensuring spacing if it's not the first element.
        if (
          i > 0 &&
          initialQueryText.length > 0 &&
          !initialQueryText.endsWith(' ') &&
          !part.content.startsWith(' ')
        ) {
          initialQueryText += ' ';
        }
        initialQueryText += part.content;
      }
    }
  }
  initialQueryText = initialQueryText.trim();

  // Inform user about ignored paths
  const totalIgnored =
    ignoredByReason.git.length +
    ignoredByReason.gemini.length +
    ignoredByReason.both.length;

  if (totalIgnored > 0) {
    const messages = [];
    if (ignoredByReason.git.length) {
      messages.push(`Git-ignored: ${ignoredByReason.git.join(', ')}`);
    }
    if (ignoredByReason.gemini.length) {
      messages.push(`Gemini-ignored: ${ignoredByReason.gemini.join(', ')}`);
    }
    if (ignoredByReason.both.length) {
      messages.push(`Ignored by both: ${ignoredByReason.both.join(', ')}`);
    }

    const message = `Ignored ${totalIgnored} files:\n${messages.join('\n')}`;
    console.log(message);
    onDebugMessage(message);
  }

  // Fallback for lone "@" or completely invalid @-commands resulting in empty initialQueryText
  if (pathSpecsToRead.length === 0) {
    onDebugMessage('No valid file paths found in @ commands to read.');

    // 如果有被跳过的文件夹，提供反馈信息
    if (skippedDirectories.length > 0) {
      const skippedInfo = `ℹ️ Skipped directories (only files are read): ${skippedDirectories.join(', ')}`;
      addItem(
        { type: 'info', text: skippedInfo },
        userMessageTimestamp,
      );
      onDebugMessage(skippedInfo);
    }

    if (initialQueryText === '@' && query.trim() === '@') {
      // If the only thing was a lone @, pass original query (which might have spaces)
      return { processedQuery: [{ text: query }], shouldProceed: true };
    } else if (!initialQueryText && query) {
      // If all @-commands were invalid and no surrounding text, pass original query
      return { processedQuery: [{ text: query }], shouldProceed: true };
    }
    // Otherwise, proceed with the (potentially modified) query text that doesn't involve file reading
    return {
      processedQuery: [{ text: initialQueryText || query }],
      shouldProceed: true,
    };
  }

  const processedQueryParts: PartUnion[] = [{ text: initialQueryText }];

  const toolArgs = {
    paths: pathSpecsToRead,
    file_filtering_options: {
      respect_git_ignore: respectFileIgnore.respectGitIgnore,
      respect_gemini_ignore: respectFileIgnore.respectGeminiIgnore,
    },
    allowLocalExecution: true, // Always allow external file access for @ syntax
    useDefaultExcludes: false, // Don't skip files based on default patterns when explicitly requested
  };
  let toolCallDisplay: IndividualToolCallDisplay;

  try {
    const result = await readManyFilesTool.execute(toolArgs, signal);
    toolCallDisplay = {
      callId: `client-read-${userMessageTimestamp}`,
      name: readManyFilesTool.displayName,
      toolId: 'read_many_files',
      description: readManyFilesTool.getDescription(toolArgs),
      status: ToolCallStatus.Success,
      resultDisplay:
        result.returnDisplay ||
        `Successfully read: ${contentLabelsForDisplay.join(', ')}`,
      confirmationDetails: undefined,
    };

    if (Array.isArray(result.llmContent)) {
      const fileContentRegex = /^--- (.*?) ---\n\n([\s\S]*?)\n\n$/;
      processedQueryParts.push({
        text: '\n--- Content from referenced files ---',
      });
      for (const part of result.llmContent) {
        if (typeof part === 'string') {
          const match = fileContentRegex.exec(part);
          if (match) {
            const filePathSpecInContent = match[1]; // This is a resolved pathSpec
            const fileActualContent = match[2].trim();
            processedQueryParts.push({
              text: `\nContent from @${filePathSpecInContent}:\n`,
            });
            processedQueryParts.push({ text: fileActualContent });
          } else {
            processedQueryParts.push({ text: part });
          }
        } else {
          // part is a Part object.
          processedQueryParts.push(part);
        }
      }
      processedQueryParts.push({ text: '\n--- End of content ---' });
    } else {
      onDebugMessage(
        'read_many_files tool returned no content or empty content.',
      );
    }

    addItem(
      { type: 'tool_group', tools: [toolCallDisplay] } as Omit<
        HistoryItem,
        'id'
      >,
      userMessageTimestamp,
    );

    // 如果有被跳过的文件夹，提供反馈信息
    if (skippedDirectories.length > 0) {
      const skippedInfo = `ℹ️ Skipped directories (only files are read): ${skippedDirectories.join(', ')}`;
      addItem(
        { type: 'info', text: skippedInfo },
        userMessageTimestamp,
      );
    }

    return { processedQuery: processedQueryParts, shouldProceed: true };
  } catch (error: unknown) {
    toolCallDisplay = {
      callId: `client-read-${userMessageTimestamp}`,
      name: readManyFilesTool.displayName,
      toolId: 'read_many_files',
      description: readManyFilesTool.getDescription(toolArgs),
      status: ToolCallStatus.Error,
      resultDisplay: `Error reading files (${contentLabelsForDisplay.join(', ')}): ${getErrorMessage(error)}`,
      confirmationDetails: undefined,
    };
    addItem(
      { type: 'tool_group', tools: [toolCallDisplay] } as Omit<
        HistoryItem,
        'id'
      >,
      userMessageTimestamp,
    );
    return { processedQuery: null, shouldProceed: false };
  }
}
