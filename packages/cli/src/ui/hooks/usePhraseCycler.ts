/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { isChineseLocale } from '../utils/i18n.js';
import { useSmallWindowOptimization, getOptimalRefreshInterval, shouldSkipAnimation } from './useSmallWindowOptimization.js';

// Knowledge tips (higher probability)
export const KNOWLEDGE_TIPS_EN = [
  // CLI Shortcuts
  'Press Ctrl+L to quickly switch AI models',
  'Press Ctrl+T to toggle tool descriptions',
  'Press Ctrl+V (macOS/Linux) or Ctrl+G (Windows) to paste screenshots',
  'Press Alt+Left/Right to move cursor by word',
  'Press Esc to abort tasks and send new instructions',
  'Use dvcode -c to continue your last conversation',
  'Use dvcode -y for auto-confirm mode',
  'Use dvcode -u to force check for version updates',
  'Use dvcode --cloud-mode for remote access',
  'Hold Ctrl/Alt/Shift + Enter to add line breaks in input',
  // Slash Commands
  'Type /model to switch AI models interactively',
  'Type /clear to clear screen',
  'Type /restore to rollback to a checkpoint',
  'Type /session list to browse all conversations',
  'Type /session new to start a fresh conversation',
  'Type /session select <number> to switch conversations',
  'Type /memory show to view loaded project context',
  'Type /memory refresh to reload all DEEPV.md files',
  'Type /memory add <text> to add to AI memory',
  'Type /compress to compress context and save tokens',
  'Type /stats to view token usage and session stats',
  'Type /stats tools to view tool usage statistics',
  'Type /mcp to list configured MCP servers',
  'Type /mcp desc to show detailed tool descriptions',
  'Type /tools to list all available tools',
  'Type /tools nodesc to show only tool names',
  'Type /extensions list to view available extensions',
  'Type /extensions info to learn about installing/uninstalling extensions',
  'Type /ext: to use installed context-type extension commands',
  'Type /theme to change color themes',
  'Type /plan to enable read-only analysis mode',
  'Type /plan off to exit read-only mode',
  'Type /plan status to check current mode',
  'Type /init to auto-generate DEEPV.md for your project',
  'Type /auth to re-authenticate if session expired',
  'Type /help to view traditional help',
  'Type /help-ask to ask AI questions about CLI features',
  'Type /copy to copy AI\'s last response',
  'Type /editor to select editor for viewing diffs',
  // File Inclusion (@) Commands
  'Use @filepath to include files in conversations',
  'Use @filename question to help AI understand your problem',
  'Use @directory to include entire directories',
  'Use @report.pdf to analyze PDF documents',
  'Use @data.xlsx to analyze Excel spreadsheets',
  'Use @document.docx to work with Word documents',
  'Use @clipboard to paste text or screenshots from clipboard',
  // Shell Commands (!)
  'Use !command to run shell commands directly',
  'Use ! alone to switch to shell mode',
  'Examples: !npm run build, !git status, !python script.py',
  // Custom Commands & Configuration
  'Create custom slash commands in ~/.deepv/commands/',
  'Use {{args}} in custom commands to inject parameters',
  'Configure MCP servers in .deepv/settings.json',
  'Set preferredEditor in settings.json for diff viewing',
  'Use DEEPV.md for project-specific AI instructions',
  // Advanced Features
  'Try @src/ followed by your question for whole codebase analysis',
  'Combine @ and ! commands for powerful workflows',
];

export const KNOWLEDGE_TIPS_ZH = [
  // 快捷键
  '按 Ctrl+L 快速打开模型切换菜单',
  '按 Ctrl+T 切换工具描述显示',
  '按 Ctrl+V (macOS/Linux) 或 Ctrl+G (Windows) 粘贴截图',
  '按 Alt+Left/Right 按单词移动光标',
  '按 Esc 可以中止任务并允许发新的指令',
  '使用 dvcode -c 启动，可以继续上次的对话',
  '使用 dvcode -y 启动，可以免确认模式',
  '使用 dvcode -u 启动，可以强制检查版本更新',
  '使用 dvcode --cloud-mode 连接云端服务器进行远程访问',
  '按住 Ctrl/Alt/Shift+回车 可以输入框换行',
  // 斜杠命令
  '输入 /model 可以交互式切换 AI 模型',
  '输入 /clear 可以清空屏幕',
  '输入 /restore 可以回滚到检查点',
  '输入 /session list 可以浏览所有对话会话',
  '输入 /session new 可以随时开始全新对话',
  '输入 /session select <编号> 可以切换不同对话',
  '输入 /memory show 可以查看已加载的项目上下文',
  '输入 /memory refresh 可以重新加载所有 DEEPV.md 文件',
  '输入 /memory add <文本> 可以添加到 AI 记忆',
  '输入 /compress 可以压缩上下文并节省 token',
  '输入 /stats 可以查看 token 用量和会话统计',
  '输入 /stats tools 可以查看工具使用统计',
  '输入 /mcp 可以列出配置的 MCP 服务器',
  '输入 /mcp desc 可以显示详细的工具描述',
  '输入 /tools 可以列出所有可用工具',
  '输入 /tools nodesc 可以只显示工具名称',
  '输入 /extensions list 可以查看可用的扩展',
  '输入 /extensions info 可以了解扩展的安装和卸载知识',
  '输入 /ext: 可以使用已安装的 context 类型扩展命令',
  '输入 /theme 可以更换主题配色',
  '输入 /plan 可以启用只读分析模式',
  '输入 /plan off 可以退出只读模式',
  '输入 /plan status 可以检查当前模式',
  '输入 /init 可以自动为项目生成 DEEPV.md',
  '输入 /auth 可以在会话过期时重新认证',
  '输入 /help 可以查看传统帮助',
  '输入 /help-ask 可以询问 AI 关于 CLI 功能的问题',
  '输入 /copy 可以复制 AI 的最后一条回复',
  '输入 /editor 可以选择编辑器查看 diff',
  // @ 文件包含命令
  '使用 @文件路径 可以在对话中包含文件内容',
  '使用 @文件名 加问题可以帮助 AI 理解问题',
  '使用 @目录 可以包含整个目录',
  '使用 @报告.pdf 可以分析 PDF 文档',
  '使用 @数据.xlsx 可以分析 Excel 电子表格',
  '使用 @文档.docx 可以处理 Word 文档',
  '使用 @clipboard 可以粘贴剪贴板中的文本或截图',
  // ! Shell 命令
  '使用 !命令 可以直接运行 shell 命令',
  '单独输入 ! 可以切换到 shell 模式',
  '示例：!npm run build, !git status, !python script.py',
  // 自定义命令和配置
  '可以在 ~/.deepv/commands/ 创建自定义斜杠命令',
  '在自定义命令中使用 {{args}} 注入参数',
  '在 .deepv/settings.json 中配置 MCP 服务器',
  '在 settings.json 中设置 preferredEditor 用于 diff 查看',
  '使用 DEEPV.md 文件为项目编写 AI 特定指令',
  // 高级功能
  '试试 @src/ 加上你的问题来分析整个代码库',
  '结合 @ 和 ! 命令可以建立强大的工作流',
];

export const WITTY_LOADING_PHRASES_EN = [
  'Processing your request...',
  'Analyzing the context...',
  'Generating response...',
  'Consulting the documentation...',
  'Loading the knowledge base...',
  'Gathering information...',
  'Preparing the answer...',
  'Compiling the response...',
  'Almost ready...',
  'Finalizing output...',
];

export const WITTY_LOADING_PHRASES_ZH = [
  '正在处理您的请求...',
  '分析上下文中...',
  '生成回复中...',
  '查阅文档中...',
  '加载知识库...',
  '收集信息中...',
  '准备答案...',
  '编译回复中...',
  '即将完成...',
  '最终处理中...',
];

// Determine which phrase set to use based on system locale
const WITTY_LOADING_PHRASES = isChineseLocale() ? WITTY_LOADING_PHRASES_ZH : WITTY_LOADING_PHRASES_EN;
const KNOWLEDGE_TIPS = isChineseLocale() ? KNOWLEDGE_TIPS_ZH : KNOWLEDGE_TIPS_EN;

export { WITTY_LOADING_PHRASES };

/**
 * Get a random phrase with higher probability for knowledge tips
 * 80% chance to show knowledge tips, 20% for loading phrases
 */
const getRandomPhrase = () => {
  // 80% chance to show knowledge tip
  if (Math.random() < 0.8) {
    const randomIndex = Math.floor(Math.random() * KNOWLEDGE_TIPS.length);
    return KNOWLEDGE_TIPS[randomIndex];
  } else {
    const randomIndex = Math.floor(Math.random() * WITTY_LOADING_PHRASES.length);
    return WITTY_LOADING_PHRASES[randomIndex];
  }
};

export const PHRASE_CHANGE_INTERVAL_MS = 15000;

/**
 * Custom hook to manage cycling through loading phrases.
 * @param isActive Whether the phrase cycling should be active.
 * @param isWaiting Whether to show a specific waiting phrase.
 * @returns The current loading phrase.
 */
export const usePhraseCycler = (isActive: boolean, isWaiting: boolean) => {
  const [currentLoadingPhrase, setCurrentLoadingPhrase] = useState(
    WITTY_LOADING_PHRASES[0],
  );
  const phraseIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const smallWindowConfig = useSmallWindowOptimization();

  useEffect(() => {
    // 🎯 关键修复：优先处理等待状态，确保完全停止动画
    if (isWaiting) {
      // 立即清除任何现有的定时器
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }

      // 设置静态等待消息
      const waitingMessage = isChineseLocale()
        ? '等待用户确认...'
        : 'Waiting for user confirmation...';
      setCurrentLoadingPhrase(waitingMessage);

      // 强制返回，不执行任何其他逻辑
      return () => {
        if (phraseIntervalRef.current) {
          clearInterval(phraseIntervalRef.current);
          phraseIntervalRef.current = null;
        }
      };
    }

    if (isActive) {
      // 清除之前的定时器
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }

      // 选择初始随机短语（使用新的随机选择逻辑）
      setCurrentLoadingPhrase(getRandomPhrase());

      // 🎯 小窗口优化：在极小窗口下禁用短语切换
      if (!shouldSkipAnimation(smallWindowConfig, 'phrase')) {
        // 🎯 小窗口优化：根据窗口大小调整刷新间隔
        const refreshInterval = smallWindowConfig.sizeLevel === 'normal'
          ? PHRASE_CHANGE_INTERVAL_MS
          : getOptimalRefreshInterval(smallWindowConfig.sizeLevel) * 3; // 小窗口下延长3倍间隔

        // 启动新的定时器
        phraseIntervalRef.current = setInterval(() => {
          setCurrentLoadingPhrase(getRandomPhrase());
        }, refreshInterval);
      }
    } else {
      // 空闲或其他状态，清除定时器并重置为第一个短语
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
      setCurrentLoadingPhrase(WITTY_LOADING_PHRASES[0]);
    }

    // 清理函数
    return () => {
      if (phraseIntervalRef.current) {
        clearInterval(phraseIntervalRef.current);
        phraseIntervalRef.current = null;
      }
    };
  }, [isActive, isWaiting]);

  return currentLoadingPhrase;
};
