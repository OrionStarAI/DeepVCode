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
  '💡 Use dvcode -c to continue your last conversation',
  '💡 Press Esc to abort tasks and send new instructions',
  '💡 Use dvcode -y for auto-confirm mode',
  '💡 Use dvcode -u to force check for version updates',
  '💡 Use dvcode --cloud-mode to connect to cloud server for remote access',
  '💡 Hold Ctrl/Alt/Shift + Enter to add line breaks in input',
  '💡 Type /help in chat to see more tips',
  '💡 Type /theme in chat to change color themes',
  '💡 Type /memory in chat to manage memory',
  '💡 Type /compress in chat to compress context',
  '💡 Type /session list to browse all your conversation sessions',
  '💡 Type /session select <number> to switch between conversations',
  '💡 Use /session new to start a fresh conversation anytime',
  // Programming prompt tips
  '💡 Say "Please focus on this specific issue" to improve AI focus',
  '💡 Use "Please print logs and wait for my input" for better debugging',
  '💡 Use @filename to help AI locate problems more precisely',
  '💡 Start with "Step by step:" for complex problem solving',
  '💡 Say "Show me the minimal example" to get concise solutions',
  '💡 Use "Explain your reasoning" to understand AI\'s thought process',
  '💡 Say "Check edge cases" to improve code robustness',
  '💡 Use "Follow existing code patterns" for consistent style',
  '💡 Say "Add error handling" to make code more reliable',
  '💡 Use "Write tests first" for better code quality',
  '💡 Say "Optimize for readability" over clever solutions',
  '💡 Use "Break this into smaller functions" for better design',
  '💡 Say "Add comments explaining why, not what"',
  '💡 Use "Show me alternatives" to explore different approaches',
  '💡 Say "Make it configurable" for flexible solutions',
  '💡 Use "Consider performance implications" for efficient code',
  '💡 Say "Follow SOLID principles" for better architecture',
  '💡 Use "Add input validation" to prevent bugs',
  '💡 Say "Make it type-safe" for better code reliability',
  '💡 Use "Extract common logic" to reduce duplication',
  '💡 Say "Add logging for debugging" to track execution',
  '💡 Use "Handle async operations properly" for robust code',
  '💡 Say "Consider memory usage" for resource efficiency',
  '💡 Use "Make it testable" for better code design',
  '💡 Say "Add documentation" for future maintainers',
  '💡 Use "Follow naming conventions" for code clarity',
  '💡 Say "Consider thread safety" for concurrent code',
  '💡 Use "Implement graceful degradation" for better UX',
  '💡 Say "Add monitoring and metrics" for production code',
  '💡 Use "Consider security implications" for safe code',
  '💡 Say "Make it backwards compatible" for stable APIs',
];

export const KNOWLEDGE_TIPS_ZH = [
  '💡 使用dvcode -c启动，可以继续上次的对话',
  '💡 按esc键可以中止任务并允许发新的指令',
  '💡 使用dvcode -y启动，可以免确认模式',
  '💡 使用dvcode -u启动，可以强制检查版本更新',
  '💡 使用 dvcode --cloud-mode 连接云端服务器进行远程访问',
  '💡 按住Ctrl/Alt/Shift+回车可以输入框换行',
  '💡 对话框内打 /help 可以看到更多技巧',
  '💡 对话框内打 /theme可以更换主题配色',
  '💡 对话框内打 /memory 可以管理记忆',
  '💡 在与模型的对话框内打 /compress 可以压缩上下文',
  '💡 输入 /session list 可以浏览所有对话会话',
  '💡 输入 /session select <编号> 可以切换不同对话',
  '💡 使用 /session new 可以随时开始全新对话',
  // 编程提示词技巧
  '💡 说"请专注这个具体问题"可以提高AI专注度',
  '💡 使用"请打印日志并等待我提供"可以更好地调试',
  '💡 使用@文件名可以让AI更精确地定位问题',
  '💡 以"一步一步："开始可以解决复杂问题',
  '💡 说"给我最简示例"可以得到简洁方案',
  '💡 使用"解释你的推理过程"来理解AI思路',
  '💡 说"检查边界情况"可以提高代码健壮性',
  '💡 使用"遵循现有代码模式"保持风格一致',
  '💡 说"添加错误处理"让代码更可靠',
  '💡 使用"先写测试"提高代码质量',
  '💡 说"优化可读性"胜过巧妙方案',
  '💡 使用"拆分成小函数"改善设计',
  '💡 说"添加注释解释为什么，不是做什么"',
  '💡 使用"给我看替代方案"探索不同思路',
  '💡 说"让它可配置"获得灵活方案',
  '💡 使用"考虑性能影响"编写高效代码',
  '💡 说"遵循SOLID原则"改善架构',
  '💡 使用"添加输入验证"预防bug',
  '💡 说"让它类型安全"提高代码可靠性',
  '💡 使用"提取公共逻辑"减少重复',
  '💡 说"添加调试日志"跟踪执行过程',
  '💡 使用"正确处理异步操作"编写健壮代码',
  '💡 说"考虑内存使用"提高资源效率',
  '💡 使用"让它可测试"改善代码设计',
  '💡 说"添加文档"为未来维护者考虑',
  '💡 使用"遵循命名约定"提高代码清晰度',
  '💡 说"考虑线程安全"处理并发代码',
  '💡 使用"实现优雅降级"改善用户体验',
  '💡 说"添加监控和指标"用于生产代码',
  '💡 使用"考虑安全隐患"编写安全代码',
  '💡 说"保持向后兼容"维护稳定API',
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
