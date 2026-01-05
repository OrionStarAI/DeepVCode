/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { SuggestionsDisplay } from './SuggestionsDisplay.js';
import { useInputHistory } from '../hooks/useInputHistory.js';
import { TextBuffer } from './shared/text-buffer.js';
import { cpSlice, cpLen, hasRealLineBreaks, getRealLineCount } from '../utils/textUtils.js';
import { sanitizePasteContent } from '../utils/displayUtils.js';
import chalk from 'chalk';
import stringWidth from 'string-width';
import { useShellHistory } from '../hooks/useShellHistory.js';
import { useCompletion } from '../hooks/useCompletion.js';
import { useKeypress, Key } from '../hooks/useKeypress.js';
import { CommandContext, SlashCommand } from '../commands/types.js';
import { Config } from 'deepv-code-core';
import {
  clipboardHasImage,
  saveClipboardImage,
  cleanupOldClipboardImages,
  getClipboardText,
} from '../utils/clipboardUtils.js';
import * as path from 'path';
import { t, tp } from '../utils/i18n.js';

export interface InputPromptProps {
  buffer: TextBuffer;
  onSubmit: (value: string) => void;
  userMessages: readonly string[];
  onClearScreen: () => void;
  openModelDialog: () => void;
  config: Config;
  slashCommands: readonly SlashCommand[];
  commandContext: CommandContext;
  placeholder?: string;
  focus?: boolean;
  inputWidth: number;
  suggestionsWidth: number;
  shellModeActive: boolean;
  setShellModeActive: (value: boolean) => void;
  helpModeActive: boolean;
  setHelpModeActive: (value: boolean) => void;
  vimHandleInput?: (key: Key) => boolean;
  isModalOpen?: boolean;
  isExecutingTools?: boolean; // 🔧 新增：指示是否有工具正在执行（用于隐藏边框避免闪烁）
  isBusy?: boolean; // 🚀 新增：AI 正在工作或有队列
  isInSpecialMode?: boolean; // 🚀 新增：正在润色/编辑队列等特殊模式
}

export const InputPrompt: React.FC<InputPromptProps> = ({
  buffer,
  onSubmit,
  userMessages,
  onClearScreen,
  openModelDialog,
  config,
  slashCommands,
  commandContext,
  isExecutingTools = false,
  placeholder,
  focus = true,
  inputWidth,
  suggestionsWidth,
  shellModeActive,
  setShellModeActive,
  helpModeActive,
  setHelpModeActive,
  vimHandleInput,
  isModalOpen = false,
  isBusy = false,
  isInSpecialMode = false,
}) => {
  const [justNavigatedHistory, setJustNavigatedHistory] = useState(false);
  const [renderDebounceId, setRenderDebounceId] = useState(0);
  const [isClipboardImagePasting, setIsClipboardImagePasting] = useState(false);

  // 🎯 VS Code环境检测


  // 🚀 性能优化：渲染防抖，避免输入时过度重渲染
  const debouncedRenderTrigger = useCallback(() => {
    const id = Date.now();
    setRenderDebounceId(id);
    // 对于长文本，延迟一点渲染以减少卡顿
    if (buffer.text.length > 1000) {
      setTimeout(() => setRenderDebounceId(id), 50);
    }
  }, [buffer.text.length]);

  useEffect(() => {
    debouncedRenderTrigger();
  }, [buffer.text, debouncedRenderTrigger]);

  // 检测VSCode环境
  const isVSCodeTerminal = !!(
    process.env.VSCODE_PID ||
    process.env.TERM_PROGRAM === 'vscode'
  );

  // 根据操作系统和环境获取换行快捷键提示
  const getNewlineHint = () => {
    switch (process.platform) {
      case 'darwin':
        return isVSCodeTerminal ? t('input.hint.newline.darwin.vscode') : t('input.hint.newline.darwin');
      case 'win32':
        return isVSCodeTerminal ? t('input.hint.newline.win32.vscode') : t('input.hint.newline.win32');
      case 'linux':
        return t('input.hint.newline.linux');
      default: // other unix-like systems
        return t('input.hint.newline.default');
    }
  };

  // 生成带换行提示的placeholder
  const getPlaceholderWithHint = () => {
    if (placeholder) {
      return placeholder;
    }
    return `  ${t('input.placeholder.base')} (${getNewlineHint()})`;
  };

  // 长文本粘贴管理系统
  interface PasteSegment {
    originalContent: string;
    summaryContent: string;
  }

  const [pasteSegments, setPasteSegments] = useState<PasteSegment[]>([]);

  // 双重阈值控制
  const LONG_PASTE_THRESHOLD = 10;           // 超过10行显示摘要
  const LONG_PASTE_CHAR_THRESHOLD = 100;     // 超过100字符也显示摘要

  // 防抖和分片处理状态
  const lastPasteTimeRef = useRef(0);
  const pendingPasteContentRef = useRef('');
  const pasteTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pasteCounterRef = useRef(0);

  // 性能优化：字符宽度计算缓存
  const charWidthCacheRef = useRef(new Map<string, number>());
  const getCachedCharWidth = useCallback((char: string): number => {
    const cache = charWidthCacheRef.current;
    if (cache.has(char)) {
      return cache.get(char)!;
    }
    const width = stringWidth(char);
    cache.set(char, width);
    return width;
  }, []);

  const completion = useCompletion(
    buffer,
    config.getTargetDir(),
    slashCommands,
    commandContext,
    config,
    shellModeActive,
    isBusy,
    isInSpecialMode,
  );

  const resetCompletionState = completion.resetCompletionState;
  const shellHistory = useShellHistory(config.getProjectRoot());

  // 创建粘贴片段（增强版）
  const createPasteSegment = useCallback((content: string): PasteSegment | null => {
    // 只处理包含真正换行符的文本
    if (!hasRealLineBreaks(content)) {
      return null; // 单行文本，不需要摘要
    }

    const realLineCount = getRealLineCount(content);
    const contentLength = content.length;

    // 双重条件：行数超过10行 OR 字符数超过100个
    if (realLineCount <= LONG_PASTE_THRESHOLD && contentLength <= LONG_PASTE_CHAR_THRESHOLD) {
      return null;
    }

    // 生成唯一序号
    pasteCounterRef.current += 1;
    const pasteNumber = pasteCounterRef.current;

    // 简洁的摘要格式（与文档保持一致）
    const summaryContent = `[ PASTE #${pasteNumber}: ${realLineCount} lines]`;

    return {
      originalContent: content,
      summaryContent
    };
  }, [LONG_PASTE_THRESHOLD, LONG_PASTE_CHAR_THRESHOLD]);

  // 重构完整消息内容（增强版 - 添加文本清理）
  const reconstructFullMessage = useCallback((summaryText: string): string => {
    let fullMessage = summaryText;

    // 按照粘贴顺序逐个替换，使用精确匹配避免冲突
    pasteSegments.forEach((segment) => {
      const summary = segment.summaryContent;
      const original = segment.originalContent;

      // 只替换完全匹配的摘要，避免部分匹配导致的问题
      if (fullMessage.includes(summary)) {
        // 🔧 关键修复：清理原始内容中的特殊字符和ANSI转义序列
        const cleanedOriginal = sanitizePasteContent(original);
        fullMessage = fullMessage.replaceAll(summary, cleanedOriginal);
      }
    });

    return fullMessage;
  }, [pasteSegments]);

  // 智能合并多个粘贴片段
  const processMultiSegmentPaste = useCallback(() => {
    const finalContent = pendingPasteContentRef.current;
    pendingPasteContentRef.current = '';

    const pasteSegment = createPasteSegment(finalContent);

    if (pasteSegment) {
      // 保存片段信息
      setPasteSegments(prev => [...prev, pasteSegment]);

      // 显示摘要而不是原始内容
      const currentText = buffer.text;
      const cursorPosition = buffer.getCurrentOffset();
      const newInput = currentText.slice(0, cursorPosition) + pasteSegment.summaryContent + currentText.slice(cursorPosition);
      buffer.setText(newInput);
      buffer.moveToOffset(cursorPosition + pasteSegment.summaryContent.length);
    } else {
      // 短文本正常处理
      buffer.handleInput({
        name: '',
        ctrl: false,
        meta: false,
        shift: false,
        paste: true,
        sequence: finalContent
      });
    }
  }, [buffer, createPasteSegment]);

  const handleSubmitAndClear = useCallback(
    (submittedValue: string) => {
      if (shellModeActive) {
        shellHistory.addCommandToHistory(submittedValue);
      }
      // Clear the buffer *before* calling onSubmit to prevent potential re-submission
      // if onSubmit triggers a re-render while the buffer still holds the old value.
      buffer.setText('');

      // 重构完整消息内容
      const contentToSubmit = reconstructFullMessage(submittedValue);

      // Restore pasted content if there are segments
      // (Paste content will be restored silently)

      // 清除所有粘贴片段状态
      setPasteSegments([]);

      onSubmit(contentToSubmit);
      resetCompletionState();
    },
    [onSubmit, buffer, resetCompletionState, shellModeActive, shellHistory, reconstructFullMessage, isModalOpen, pasteSegments],
  );

  const customSetTextAndResetCompletionSignal = useCallback(
    (newText: string) => {
      buffer.setText(newText);
      setJustNavigatedHistory(true);
      // 清除所有粘贴片段状态
      setPasteSegments([]);
    },
    [buffer, setJustNavigatedHistory],
  );

  const inputHistory = useInputHistory({
    userMessages,
    onSubmit: handleSubmitAndClear,
    isActive:
      (!completion.showSuggestions || completion.suggestions.length === 1) &&
      !shellModeActive,
    currentQuery: buffer.text,
    onChange: customSetTextAndResetCompletionSignal,
  });

  // Effect to reset completion if history navigation just occurred and set the text
  useEffect(() => {
    if (justNavigatedHistory) {
      resetCompletionState();
      setJustNavigatedHistory(false);
    }
  }, [
    justNavigatedHistory,
    buffer.text,
    resetCompletionState,
    setJustNavigatedHistory,
  ]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (pasteTimeoutRef.current) {
        clearTimeout(pasteTimeoutRef.current);
      }
    };
  }, []);

  // Handle clipboard image pasting with Ctrl+V
  const handleClipboardImage = useCallback(async () => {
    try {
      const hasImage = await clipboardHasImage();
      if (hasImage) {
        // 显示粘贴提示
        let configDirPath = config.getProjectSettingsManager().getConfigDirPath();
        setIsClipboardImagePasting(true);
        const imagePath = await saveClipboardImage( configDirPath);
        if (imagePath) {
          // Clean up old images
          cleanupOldClipboardImages(configDirPath).catch(() => {
            // Ignore cleanup errors
          });

          // Get relative path from current directory
          const relativePath = path.relative(config.getTargetDir(), imagePath);

          // Insert @path reference at cursor position
          const insertText = `@${relativePath}`;
          const currentText = buffer.text;
          const [row, col] = buffer.cursor;

          // Calculate offset from row/col
          let offset = 0;
          for (let i = 0; i < row; i++) {
            offset += buffer.lines[i].length + 1; // +1 for newline
          }
          offset += col;

          // Add spaces around the path if needed
          let textToInsert = insertText;
          const charBefore = offset > 0 ? currentText[offset - 1] : '';
          const charAfter =
            offset < currentText.length ? currentText[offset] : '';

          if (charBefore && charBefore !== ' ' && charBefore !== '\n') {
            textToInsert = ' ' + textToInsert;
          }
          if (!charAfter || (charAfter !== ' ' && charAfter !== '\n')) {
            textToInsert = textToInsert + ' ';
          }

          // Insert at cursor position
          console.log('🖼️ [剪贴板图像] 插入文本:', textToInsert);
          buffer.replaceRangeByOffset(offset, offset, textToInsert);
        } else {
          console.log('🖼️ [剪贴板图像] 没有获得有效的图像路径');
        }
      } else {
        console.log('🖼️ [剪贴板图像] 剪贴板不包含图像，跳过处理');
      }
    } catch (error) {
      console.error('🖼️ [剪贴板图像] 错误:', error);
    } finally {
      // 无论成功或失败，都隐藏粘贴提示
      setIsClipboardImagePasting(false);
    }
    console.log('🖼️ [剪贴板图像] handleClipboardImage 执行完成');
  }, [buffer, config]);

  // 文本粘贴处理函数 - 处理所有文本粘贴逻辑
  const handleTextPaste = useCallback(async (key: Key) => {
    if (!key.sequence) {
      // 当没有文本内容时，可能是图片粘贴，直接检查图片
      try {
        const hasImage = await clipboardHasImage();
        if (hasImage) {
          await handleClipboardImage();
        }
      } catch (error) {
        // Silently ignore image detection errors
      }
      return;
    }

    console.log('📋 [Paste] Starting text paste handling:', {
      length: key.sequence.length,
      contentPreview: key.sequence.substring(0, 50).replace(/\r?\n/g, '\\n'),
      ctrl: key.ctrl,
      shift: key.shift,
      name: key.name
    });

    const now = Date.now();

    // 智能合并策略：短时间内的多个粘贴事件可能是同一个大文本被分割
    if (now - lastPasteTimeRef.current < 2000 && pendingPasteContentRef.current) {
      console.log('📋 [Paste] Detected possible split paste, merging content');
      pendingPasteContentRef.current += key.sequence;

      // 延长等待时间，看是否还有更多片段
      if (pasteTimeoutRef.current) {
        clearTimeout(pasteTimeoutRef.current);
      }

      pasteTimeoutRef.current = setTimeout(() => {
        processMultiSegmentPaste();
      }, 500); // 延长等待时间

      lastPasteTimeRef.current = now;
      return;
    }

    // 开始新的粘贴序列
    lastPasteTimeRef.current = now;
    pendingPasteContentRef.current = key.sequence;

    // 延迟处理，等待可能的后续片段
    if (pasteTimeoutRef.current) {
      clearTimeout(pasteTimeoutRef.current);
    }

    pasteTimeoutRef.current = setTimeout(() => {
      processMultiSegmentPaste();
    }, 300); // 300ms等待时间
  }, [lastPasteTimeRef, pendingPasteContentRef, pasteTimeoutRef, processMultiSegmentPaste]);

  // 统一粘贴处理函数 - 智能检测剪贴板内容类型
  const handleUnifiedPaste = useCallback(async (): Promise<boolean> => {
    try {
      // 首先检查剪贴板是否包含图像
      const hasImage = await clipboardHasImage();

      if (hasImage) {
        try {
          // 转发给现有的图像处理函数
          await handleClipboardImage();
          return true; // 表示已处理
        } catch (imageError) {
          return false;
        }
      }

      // 如果没有图像，尝试获取剪贴板文本
      const clipboardText = await getClipboardText();

      if (clipboardText && clipboardText.trim()) {
        // 创建一个伪造的粘贴键盘事件来触发现有的文本粘贴逻辑
        const fakeTextPasteEvent: Key = {
          paste: true,
          sequence: clipboardText,
          ctrl: false,
          shift: false,
          meta: false,
          name: '',
        };

        // 调用现有的文本粘贴处理逻辑
        await handleTextPaste(fakeTextPasteEvent);
        return true; // 表示已处理
      }

      return false; // 表示未处理

    } catch (error) {
      return false;
    }
  }, [handleClipboardImage, handleTextPaste]);

  // 清理无效的粘贴片段（摘要被删除的情况）
  const cleanupInvalidSegments = useCallback(() => {
    const currentText = buffer.text;
    setPasteSegments(prev =>
      prev.filter(segment => currentText.includes(segment.summaryContent))
    );
  }, [buffer]);

  // 🚀 性能优化：对于长文本，动态调整视口高度
  const getOptimalViewportHeight = useCallback(() => {
    const textLength = buffer.text.length;
    const lineCount = buffer.allVisualLines.length;

    // 根据内容长度动态调整视口高度
    if (textLength < 100) return Math.min(lineCount + 2, 5); // 短文本，较小视口
    if (textLength < 1000) return Math.min(lineCount + 3, 15); // 中等文本
    return Math.min(lineCount + 5, 25); // 长文本，较大视口但有上限
  }, [buffer.text.length, buffer.allVisualLines.length]);

  const handleInput = useCallback(
    (key: Key) => {
      // 🔍 针对Ctrl+V和粘贴相关的调试日志（已禁用以提升性能）
      // if (process.env.NODE_ENV === 'development' && (key.ctrl || key.paste || key.name === 'v')) {
      //   console.log('🔍 [按键调试]', {
      //     name: key.name,
      //     sequence: JSON.stringify(key.sequence),
      //     ctrl: key.ctrl,
      //     shift: key.shift,
      //     meta: key.meta,
      //     paste: key.paste,
      //   });
      // }

      // 🔍 针对Enter和Ctrl相关按键的调试日志（已禁用以提升性能）
      // if (key.name === 'return' || key.ctrl || key.sequence === '\n' || key.sequence === '\r' || key.name === 'j') {
      //   console.log('🚨 [按键调试]', {
      //     name: key.name,
      //     sequence: JSON.stringify(key.sequence),
      //     ctrl: key.ctrl,
      //     shift: key.shift,
      //     meta: key.meta,
      //     paste: key.paste,
      //     时间戳: new Date().toISOString()
      //   });
      // }

      /// We want to handle paste even when not focused to support drag and drop.
      if (!focus && !key.paste) {
        return;
      }

      // DEBUG & FIX: When a modal is open (model selection, auth, etc.),
      // InputPrompt should NOT handle keyboard input at all
      if (isModalOpen) {
        return;
      }

      // 对于非导航键，检查并清理无效的粘贴片段
      if (!key.paste && key.name !== 'up' && key.name !== 'down' &&
          key.name !== 'left' && key.name !== 'right' &&
          key.name !== 'home' && key.name !== 'end' &&
          key.name !== 'pageup' && key.name !== 'pagedown') {
        // 延迟执行清理，让文本更新后再检查
        setTimeout(cleanupInvalidSegments, 0);
      }

      if (vimHandleInput && vimHandleInput(key)) {
        // if (key.name === 'return' || key.ctrl) {
        //   console.log('🔷 [Vim处理] Vim模式处理了按键');
        // }
        return;
      }

      if (
        key.sequence === '!' &&
        buffer.text === '' &&
        !completion.showSuggestions
      ) {
        setShellModeActive(!shellModeActive);
        buffer.setText(''); // Clear the '!' from input
        return;
      }

      if (key.name === 'escape') {
        if (shellModeActive) {
          setShellModeActive(false);
          return;
        }

        if (helpModeActive) {
          setHelpModeActive(false);
          return;
        }

        if (completion.showSuggestions) {
          completion.resetCompletionState();
          return;
        }
      }

      if (key.ctrl && key.name === 'l') {
        openModelDialog();
        return;
      }

      // If the command is a perfect match, pressing enter should execute it.
      if (completion.isPerfectMatch && key.name === 'return') {
        inputHistory.handleSubmit(buffer.text);
        return;
      }

      if (completion.showSuggestions) {
        if (completion.suggestions.length > 1) {
          if (key.name === 'up' || (key.ctrl && key.name === 'p')) {
            completion.navigateUp();
            return;
          }
          if (key.name === 'down' || (key.ctrl && key.name === 'n')) {
            completion.navigateDown();
            return;
          }
        }

        // Tab键处理逻辑
        if (key.name === 'tab') {
          if (completion.suggestions.length > 0) {
            // 有建议时进行补全
            const targetIndex =
              completion.activeSuggestionIndex === -1
                ? 0 // Default to the first if none is active
                : completion.activeSuggestionIndex;
            if (targetIndex < completion.suggestions.length) {
              completion.handleAutocomplete(targetIndex);
            }
          } else if (shellModeActive && buffer.text.trim().length >= 1) {
            // Shell模式下，触发shell补全
            completion.triggerShellCompletion();
          } else if (!shellModeActive) {
            // 非shell模式下，重新触发补全
            completion.resetCompletionState();
          }
          return;
        }

        // 回车键的智能处理：
        // 1. 如果用户明确选择了建议项（activeSuggestionIndex > -1），则自动补全
        // 2. 如果用户没有选择建议项（activeSuggestionIndex === -1），则直接提交
        if (key.name === 'return' && !key.shift) {
          if (completion.activeSuggestionIndex > -1 && completion.suggestions.length > 0) {
            const selectedSuggestion = completion.suggestions[completion.activeSuggestionIndex];

            // 检查是否需要自动执行（用于 /model 等参数补全命令）
            if (selectedSuggestion?.willAutoExecute === true) {
              // 直接构造完整命令并执行，无需先补全到输入框
              const query = buffer.text;
              const suggestion = selectedSuggestion.value;

              // 构造完整的命令字符串（与 handleAutocomplete 逻辑一致）
              if (query.trimStart().startsWith('/')) {
                const parts = query.trimStart().substring(1).split(/\s+/).filter(Boolean);
                const hasTrailingSpace = query.endsWith(' ');
                const basePath = hasTrailingSpace ? parts : parts.slice(0, -1);
                const finalCommand = `/${[...basePath, suggestion].join(' ')}`;

                // 直接执行命令
                inputHistory.handleSubmit(finalCommand);
                return;
              }
            }

            // 🚀 修复：如果当前输入已经与建议值完全匹配，则直接提交而不是再次补全
            const trimmed = buffer.text.trim();
            const parts = trimmed.split(/\s+/);
            const lastPart = parts[parts.length - 1];

            // 如果当前参数与建议值完全相等，说明用户已经输完了，按回车是想执行
            if (lastPart === selectedSuggestion.value) {
               inputHistory.handleSubmit(buffer.text);
               return;
            }

            // 普通补全：只补全到输入框，不自动执行
            completion.handleAutocomplete(completion.activeSuggestionIndex);
            return;
          }
          // 用户没有选择建议项，或者没有建议项，直接提交命令
          // 这种情况下让后面的提交逻辑处理
        }
      }

      if (!shellModeActive) {
        if (key.ctrl && key.name === 'p') {
          inputHistory.navigateUp();
          return;
        }
        if (key.ctrl && key.name === 'n') {
          inputHistory.navigateDown();
          return;
        }
        // Handle arrow-up/down for history on single-line or at edges
        if (
          key.name === 'up' &&
          (buffer.allVisualLines.length === 1 ||
            (buffer.visualCursor[0] === 0 && buffer.visualScrollRow === 0))
        ) {
          inputHistory.navigateUp();
          return;
        }
        if (
          key.name === 'down' &&
          (buffer.allVisualLines.length === 1 ||
            buffer.visualCursor[0] === buffer.allVisualLines.length - 1)
        ) {
          inputHistory.navigateDown();
          return;
        }
      } else {
        // Shell History Navigation
        if (key.name === 'up') {
          const prevCommand = shellHistory.getPreviousCommand();
          if (prevCommand !== null) buffer.setText(prevCommand);
          return;
        }
        if (key.name === 'down') {
          const nextCommand = shellHistory.getNextCommand();
          if (nextCommand !== null) buffer.setText(nextCommand);
          return;
        }

        if (key.name === 'tab' && shellModeActive && buffer.text.trim().length >= 1) {
          // Shell模式下，触发shell补全
          completion.triggerShellCompletion();
        }
      }

      // Handle Shift+Enter for newline (macOS standard)
      if (key.name === 'return' && key.shift) {
        buffer.newline();
        return;
      }

      // Handle Ctrl+Enter for newline (cross-platform)
      if (key.name === 'return' && key.ctrl) {
        buffer.newline();
        return;
      }

      // Handle Alt+Enter for newline (VSCode compatibility)
      if (key.name === 'return' && key.meta) {
        buffer.newline();
        return;
      }

      // Handle Ctrl+J for newline (macOS VSCode compatibility)
      if (key.ctrl && key.name === 'j') {
        buffer.newline();
        return;
      }

      // Handle Enter for submit (only when not using modifiers)
      if (key.name === 'return' && !key.shift && !key.ctrl && !key.meta && !key.paste) {
        if (buffer.text.trim()) {
          const [row, col] = buffer.cursor;
          const line = buffer.lines[row];
          const charBefore = col > 0 ? cpSlice(line, col - 1, col) : '';
          if (charBefore === '\\') {
            buffer.backspace();
            buffer.newline();
          } else {
            inputHistory.handleSubmit(buffer.text);
          }
        }
        return;
      }

      // Handle paste with Enter (for multiline paste)
      if (key.name === 'return' && key.paste) {
        buffer.newline();
        return;
      }

      // Ctrl+A (Home) / Ctrl+E (End)
      if (key.ctrl && key.name === 'a') {
        buffer.move('home');
        return;
      }
      if (key.ctrl && key.name === 'e') {
        buffer.move('end');
        buffer.moveToOffset(cpLen(buffer.text));
        return;
      }
      // Ctrl+C (Clear input)
      if (key.ctrl && key.name === 'c') {
        if (buffer.text.length > 0) {
          buffer.setText('');
          resetCompletionState();
          return;
        }
        return;
      }

      // Kill line commands
      if (key.ctrl && key.name === 'k') {
        buffer.killLineRight();
        return;
      }
      if (key.ctrl && key.name === 'u') {
        buffer.killLineLeft();
        return;
      }

      // External editor
      const isCtrlX = key.ctrl && (key.name === 'x' || key.sequence === '\x18');
      if (isCtrlX) {
        buffer.openInExternalEditor();
        return;
      }

      // 统一的粘贴快捷键处理
      if (key.ctrl && key.name === 'v') {
        console.log('⌨️ [快捷键] 触发 Ctrl+V，使用统一粘贴处理');
        handleUnifiedPaste().catch(error => {
          console.error('⌨️ [快捷键] 统一粘贴处理失败:', error);
        });
        return;
      }

      // 保留 Ctrl+G 作为图像专用快捷键（向后兼容）
      if (key.ctrl && key.name === 'g') {
        handleClipboardImage().catch(error => {
          // Silently ignore errors
        });
        return;
      }

      // 处理终端的自动粘贴事件（空sequence通常表示特殊粘贴模式或图片粘贴）
      if (key.paste && !key.sequence) {
        // 空粘贴事件通常意味着终端无法处理的内容（如图片）
        handleClipboardImage().catch(error => {
          // Silently ignore errors
        });
        return;
      }

      // Windows下特殊处理：Ctrl+Enter和Shift+Enter可能被错误标记为paste
      if (key.paste && key.sequence && (key.sequence === '\n' || key.sequence === '\r')) {
        // 这很可能是Ctrl+Enter或Shift+Enter，不是真正的粘贴
        if (key.shift || (key.sequence === '\n' && !key.ctrl)) {
          // Shift+Enter或者裸露的换行 - 应该换行
          console.log('  └─ 判断为Shift+Enter或裸露换行，执行换行');
          buffer.newline();
          return;
        }
        if (key.ctrl) {
          // Ctrl+Enter - 也应该换行（Windows兼容性）
          console.log('  └─ 判断为Ctrl+Enter，执行换行');
          buffer.newline();
          return;
        }
      }

      // 处理终端的文本粘贴事件（bracketed paste 等）
      if (key.paste && key.sequence) {
        // 这里直接走文本粘贴逻辑，因为终端粘贴通常是文本
        handleTextPaste(key).catch(error => {
          console.error('⌨️ [快捷键] 文本粘贴处理失败:', error);
        });
        return;
      }

      // 兼容性：有些终端可能不设置 paste 标志，但发送多行内容
      if (key.sequence && key.sequence.includes('\n') && key.sequence.length > 50) {

        const pasteSegment = createPasteSegment(key.sequence);

        if (pasteSegment) {
          setPasteSegments(prev => [...prev, pasteSegment]);
          buffer.handleInput({ ...key, sequence: pasteSegment.summaryContent });
          return;
        }
      }

      // 🔧 智能抑制：只在参数阶段抑制自动补全，命令阶段保持正常体验
      const isUserTyping = !key.paste &&
        key.name !== 'up' && key.name !== 'down' &&
        key.name !== 'left' && key.name !== 'right' &&
        key.name !== 'home' && key.name !== 'end' &&
        key.name !== 'pageup' && key.name !== 'pagedown' &&
        key.name !== 'tab' && key.name !== 'escape' &&
        !(key.ctrl && (key.name === 'p' || key.name === 'n')) &&
        key.name !== 'return';

      const isPasting = key.paste;

      // 检查是否处于参数输入阶段（而不是命令/子命令输入阶段）
      const isInArgumentPhase = (() => {
        const trimmed = buffer.text.trimStart();
        if (!trimmed.startsWith('/')) return false;

        const parts = trimmed.substring(1).split(/\s+/).filter(p => p);
        if (parts.length === 0) return false;

        // 遍历命令树，检查当前是否已经到达了一个有效的可执行命令
        let currentCommands = slashCommands;
        let foundExecutableCommand = false;

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const foundCommand = currentCommands.find(cmd =>
            cmd.name === part || cmd.altNames?.includes(part)
          );

          if (foundCommand) {
            if (foundCommand.action) {
              foundExecutableCommand = true;
            }
            if (foundCommand.subCommands) {
              currentCommands = foundCommand.subCommands;
            } else {
              // 没有子命令了，说明已经到了终端命令
              break;
            }
          } else {
            // 没找到匹配的命令，可能是在输入参数
            break;
          }
        }

        // 如果找到了可执行命令且有多个部分，说明可能在输入参数
        return foundExecutableCommand && parts.length > 1;
      })();

      if ((isUserTyping || isPasting) && completion.showSuggestions && isInArgumentPhase) {
        // 🔧 检查用户输入是否与建议列表中的某项匹配
        const trimmed = buffer.text.trimStart();
        const parts = trimmed.substring(1).split(/\s+/).filter(p => p);
        const currentArg = parts.length > 0 ? parts[parts.length - 1] : '';

        // 如果当前输入与某个建议匹配，不要抑制，而是让自动补全系统自动选中它
        const hasExactMatch = completion.suggestions.some(s =>
          s.value === currentArg || s.label === currentArg
        );

        if (!hasExactMatch) {
          completion.suppressCompletion();
        }
        // 如果有精确匹配，让 useCompletion 的智能匹配逻辑自动处理
      }

      // Fall back to the text buffer's default input handling for all other keys
      // But don't let text buffer handle bare Enter key - that should be handled above
      if (key.name === 'return' && !key.shift && !key.ctrl && !key.meta && !key.paste) {
        // This is a bare Enter key that wasn't handled above - it should submit
        // But since we're in fallback, there might be no text to submit
        if (buffer.text.trim()) {
          inputHistory.handleSubmit(buffer.text);
        }
        return;
      }

      buffer.handleInput(key);
    },
    [
      focus,
      buffer,
      completion,
      shellModeActive,
      setShellModeActive,
      onClearScreen,
      inputHistory,
      handleSubmitAndClear,
      shellHistory,
      handleClipboardImage,
      resetCompletionState,
      vimHandleInput,
      createPasteSegment,
      cleanupInvalidSegments,
      isModalOpen,
    ],
  );

  // 这里去掉focus的限制，在Tabby中端中，粘贴多行的瞬间会弹框，导致app失去焦点
  // 如果不一直监听的话，无法处理这种case下的粘贴
  // 但当模态框（如模型选择、认证等）打开时，需要禁用输入框的键盘监听，避免模态框中的回车事件被输入框捕获
  useKeypress(handleInput, { isActive: !isModalOpen });

  // 🚀 动态高度：根据内容自动调整输入框高度
  const dynamicInputHeight = useMemo(() => {
    const contentLines = buffer.allVisualLines.length;
    const minHeight = 1; // 最小高度
    const maxHeight = Math.min(15, Math.floor(inputWidth / 10)); // 最大高度基于终端宽度

    // 当有内容时，显示所有行但不超过最大高度
    if (contentLines > 0) {
      return Math.min(Math.max(contentLines, minHeight), maxHeight);
    }
    return minHeight;
  }, [buffer.allVisualLines.length, inputWidth]);

  const linesToRender = buffer.viewportVisualLines;
  const [cursorVisualRowAbsolute, cursorVisualColAbsolute] =
    buffer.visualCursor;
  const scrollVisualRow = buffer.visualScrollRow;

  // 🚀 性能优化：缓存渲染的输入行，避免每次都重新计算
  const renderedInputLines = useMemo(() => {
    if (buffer.text.length === 0) return null;

    const cursorVisualRow = cursorVisualRowAbsolute - scrollVisualRow;

    return linesToRender.map((lineText, visualIdxInRenderedSet) => {
      // 对于非常长的行，进行截断避免渲染性能问题
      const maxDisplayLength = Math.min(inputWidth * 2, 1000); // 限制最大显示长度
      const truncatedLineText = cpLen(lineText) > maxDisplayLength
        ? cpSlice(lineText, 0, maxDisplayLength) + '...'
        : lineText;

      let display = cpSlice(truncatedLineText, 0, inputWidth);
      const currentVisualWidth = stringWidth(display);

      // 只在需要时才补充空格
      if (currentVisualWidth < inputWidth) {
        display = display + ' '.repeat(inputWidth - currentVisualWidth);
      }

      if (focus && visualIdxInRenderedSet === cursorVisualRow) {
        const relativeVisualColForHighlight = cursorVisualColAbsolute;

        // 🔧 调试单行光标问题
        // Removed debug logging for single line cursor

        if (relativeVisualColForHighlight >= 0) {
          if (relativeVisualColForHighlight < cpLen(display)) {
            const charToHighlight =
              cpSlice(
                display,
                relativeVisualColForHighlight,
                relativeVisualColForHighlight + 1,
              ) || ' ';
            const highlighted = chalk.bgWhite.black(charToHighlight);
            display =
              cpSlice(display, 0, relativeVisualColForHighlight) +
              highlighted +
              cpSlice(display, relativeVisualColForHighlight + 1);
          } else if (
            relativeVisualColForHighlight === cpLen(display) &&
            cpLen(display) === inputWidth
          ) {
            display = display + chalk.bgWhite(' ');
          }
        }
      }

      return <Text key={visualIdxInRenderedSet}>{display}</Text>;
    });
  }, [linesToRender, cursorVisualRowAbsolute, cursorVisualColAbsolute, scrollVisualRow, inputWidth, focus, buffer.text.length]);

  // 根据模式选择合适的 placeholder 文本
  const placeholderText = helpModeActive
    ? t('input.placeholder.help_ask')
    : t('input.placeholder.base');

  return (
    <>
      {/* Input content */}
      <Box paddingX={1} minHeight={dynamicInputHeight}>
        <Text
          color={shellModeActive ? Colors.AccentYellow : helpModeActive ? Colors.AccentCyan : Colors.AccentOrange}
        >
          {shellModeActive ? '! ' : helpModeActive ? '💡 ' : '> '}
        </Text>
        <Box flexGrow={1} flexDirection="column">
          {buffer.text.length === 0 ? (
            <Text>
              <Text color={Colors.Gray}>
                {focus ? chalk.inverse(placeholderText.charAt(0)) : placeholderText.charAt(0)}{placeholderText.slice(1)}
              </Text>
              {!helpModeActive ? <Text color={Colors.AccentYellow}> ({getNewlineHint()}, esc: Cancel)</Text> : null}
            </Text>
          ) : (
            renderedInputLines
          )}
        </Box>
      </Box>

      {/* 长文本粘贴提示 */}
      {pasteSegments.length > 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={Colors.AccentYellow}>
            💡 {tp('input.paste.detected', { count: pasteSegments.length })}
          </Text>
          {pasteSegments.map((segment, index) => (
            <Text key={index} color={Colors.Gray} dimColor>
              • 片段 {index + 1}: {getRealLineCount(segment.originalContent)} 行内容
            </Text>
          ))}
        </Box>
      ) : null}

      {/* 剪贴板图片粘贴提示 */}
      {isClipboardImagePasting ? (
        <Box marginTop={1}>
          <Text color={Colors.AccentYellow}>
            {t('input.paste.clipboard.image')}
          </Text>
        </Box>
      ) : null}

      {completion.showSuggestions && (
        <Box>
          <SuggestionsDisplay
            suggestions={completion.suggestions}
            activeIndex={completion.activeSuggestionIndex}
            isLoading={completion.isLoadingSuggestions}
            width={suggestionsWidth}
            scrollOffset={completion.visibleStartIndex}
            userInput={buffer.text}
          />
        </Box>
      )}
    </>
  );
};
