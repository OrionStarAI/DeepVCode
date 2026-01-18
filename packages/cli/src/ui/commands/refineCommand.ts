/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { CommandKind, SlashCommand, SlashCommandActionReturn, CommandContext } from './types.js';
import { MessageType } from '../types.js';
import { t, tp } from '../utils/i18n.js';
import { SceneType } from 'deepv-code-core';
import { readStdin } from '../../utils/readStdin.js';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { buildEngineeringRefinePrompt, type RefinePromptOptions } from './refine_prompt_builder.js';
import { getAvailableModels } from './modelCommand.js';

const execAsync = promisify(exec);

/**
 * Refine命令选项
 */
interface RefineOptions {
  // 语气预设
  tone: 'neutral' | 'friendly' | 'formal' | 'concise' | 'marketing' | 'tech';
  // 语言
  lang: string;
  // 强度
  level: 'light' | 'medium' | 'deep';
  // 保护格式
  keepFormat: boolean;
  // 保护代码
  keepCode: boolean;
  // 不添加表情符号
  noEmoji: boolean;
  // 最大长度
  max?: number;
  // 术语表文件
  glossary?: string;
  // 自定义规则
  rules: string[];
  // 来源
  from?: 'last' | 'selection';
  // 从标准输入读取
  stdin: boolean;
  // 文件路径
  file?: string;
  // 输出格式
  out: 'pretty' | 'text' | 'json' | 'md';
  // 仅预演不写回
  dryRun: boolean;
}

/**
 * Refine结果
 */
interface RefineResult {
  langDetected: string;
  langTarget: string;
  tone: string;
  level: string;
  keepFormat: boolean;
  keepCode: boolean;
  rules: string[];
  glossaryHits?: Array<{ term: string; kept: boolean }>;
  diff?: string;
  result: string;
  modelUsed?: string;
  fallbackReason?: string;
}

/**
 * 解析命令参数
 */
function parseRefineArguments(args: string): { text?: string; options: RefineOptions } {
  const trimmedArgs = args.trim();
  let text: string | undefined;
  const options: RefineOptions = {
    tone: 'neutral',
    lang: 'auto',
    level: 'medium', // 默认提升为 medium，确保有基本的意图延展
    keepFormat: true,
    keepCode: true,
    noEmoji: false,
    rules: [],
    stdin: false,
    out: 'pretty',
    dryRun: false,
  };

  // 如果没有参数，直接返回
  if (!trimmedArgs) {
    return { text, options };
  }

  // 找到第一个 -- 选项的位置
  const firstOptionMatch = trimmedArgs.match(/\s--/);
  const firstOptionIndex = firstOptionMatch ? trimmedArgs.indexOf(firstOptionMatch[0]) : -1;

  // 提取文本部分（-- 之前的所有内容）
  if (firstOptionIndex === -1) {
    // 没有选项，整个字符串都是文本
    text = trimmedArgs;
  } else if (firstOptionIndex > 0) {
    // 有选项，提取 -- 之前的文本
    text = trimmedArgs.substring(0, firstOptionIndex).trim();
  }

  // 如果有选项，解析选项部分
  if (firstOptionIndex !== -1) {
    const optionsString = trimmedArgs.substring(firstOptionIndex).trim();
    const parts = optionsString.split(/\s+/);

    for (let i = 0; i < parts.length; i++) {
      const arg = parts[i];
      const nextArg = parts[i + 1];

      switch (arg) {
        case '--tone':
          if (nextArg && !nextArg.startsWith('--')) {
            options.tone = nextArg as RefineOptions['tone'];
            i++;
          }
          break;
        case '--lang':
          if (nextArg && !nextArg.startsWith('--')) {
            options.lang = nextArg;
            i++;
          }
          break;
        case '--level':
          if (nextArg && !nextArg.startsWith('--')) {
            options.level = nextArg as RefineOptions['level'];
            i++;
          }
          break;
        case '--keep-format':
          options.keepFormat = true;
          break;
        case '--no-keep-format':
          options.keepFormat = false;
          break;
        case '--keep-code':
          options.keepCode = true;
          break;
        case '--no-keep-code':
          options.keepCode = false;
          break;
        case '--no-emoji':
          options.noEmoji = true;
          break;
        case '--max':
          if (nextArg && !nextArg.startsWith('--')) {
            options.max = parseInt(nextArg, 10);
            i++;
          }
          break;
        case '--glossary':
          if (nextArg && !nextArg.startsWith('--')) {
            options.glossary = nextArg;
            i++;
          }
          break;
        case '--rule':
          if (nextArg && !nextArg.startsWith('--')) {
            options.rules.push(nextArg);
            i++;
          }
          break;
        case '--from':
          if (nextArg && !nextArg.startsWith('--')) {
            options.from = nextArg as 'last' | 'selection';
            i++;
          }
          break;
        case '--stdin':
          options.stdin = true;
          break;
        case '--file':
          if (nextArg && !nextArg.startsWith('--')) {
            options.file = nextArg;
            i++;
          }
          break;
        case '--out':
          if (nextArg && !nextArg.startsWith('--')) {
            options.out = nextArg as RefineOptions['out'];
            i++;
          }
          break;
        case '--dry-run':
          options.dryRun = true;
          break;
      }
    }
  }

  return { text, options };
}

/**
 * 执行文本润色
 */
/**
 * 过滤历史记录，移除包含工具调用（functionCall）和工具响应（functionResponse）的消息
 *
 * 某些模型（如 OpenAI/GPT）要求工具调用必须有对应的工具结果，
 * 如果历史中有工具调用但没有完整的回环，会导致错误：
 * "No tool output found for function call"
 *
 * 润色功能只需要纯文本上下文，因此过滤掉所有工具相关消息
 */
function filterHistoryForRefine(history: any[]): any[] {
  if (!Array.isArray(history)) return [];

  return history.filter(content => {
    // 检查消息中是否包含工具调用或工具响应
    if (!content.parts || !Array.isArray(content.parts)) return true;

    const hasToolCall = content.parts.some((part: any) =>
      part.functionCall !== undefined || part.functionResponse !== undefined
    );

    // 如果消息包含工具调用/响应，过滤掉整条消息
    if (hasToolCall) return false;

    // 只保留有有效文本内容的消息
    const hasTextContent = content.parts.some((part: any) =>
      part.text !== undefined && part.text.trim() !== ''
    );

    return hasTextContent;
  });
}

/**
 * 执行文本润色
 */
async function refineText(
  context: CommandContext,
  text: string,
  options: RefineOptions
): Promise<RefineResult> {
  const config = context.services.config;

  if (!config) {
    throw new Error(t('error.config.not.loaded'));
  }

  const geminiClient = config.getGeminiClient();
  if (!geminiClient) {
    throw new Error(t('error.config.not.loaded'));
  }

  // 构建提示词
  const prompt = buildRefinePrompt(text, options);

  // 默认使用当前会话的模型，确保与聊天上下文一致且智能程度足够
  // 不再强行指定 Haiku 4.5，因为对于复杂的 Prompt 优化，更强的模型效果更好
  const refineModel = config.getModel();

  try {
    // 获取当前会话历史，使润色具有上下文感知能力
    const chat = geminiClient.getChat();
    const rawHistory = await chat.getHistory();

    // 🔧 过滤历史记录：移除工具调用/响应消息
    // 解决某些模型（如 OpenAI）报错 "No tool output found for function call" 的问题
    const history = filterHistoryForRefine(rawHistory);

    // 使用 generateContent 方法调用模型
    const contentGenerator = geminiClient.getContentGenerator();

    const response = await contentGenerator.generateContent(
      {
        model: refineModel,
        contents: [
          ...history, // 注入历史记录
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        config: {
          temperature: 1.0,
          maxOutputTokens: 4096,
        },
      },
      SceneType.SUB_AGENT // 使用 SUB_AGENT 场景
    );

    // 提取响应文本
    let responseText = '';
    if (response.text) {
      responseText = response.text;
    } else if (response.candidates && response.candidates[0]?.content?.parts) {
      const parts = response.candidates[0].content.parts;
      responseText = parts.map((p: any) => p.text || '').join('');
    }

    if (!responseText) {
      throw new Error('模型未返回有效响应');
    }

    // 后处理：清理可能的无关输出
    responseText = cleanRefineOutput(responseText);

    // 检测语言
    const langDetected = detectLanguage(text);
    const langTarget = options.lang === 'auto' ? langDetected : options.lang;

    const result: RefineResult = {
      langDetected,
      langTarget,
      tone: options.tone,
      level: options.level,
      keepFormat: options.keepFormat,
      keepCode: options.keepCode,
      rules: options.rules,
      result: responseText.trim(),
      modelUsed: refineModel, // 记录使用的模型
    };

    return result;
  } catch (error) {
    throw new Error(`润色失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 清理润色输出中的无关内容
 *
 * 优先尝试提取 <dvcode-refine-prompt> 标签内的内容
 */
function cleanRefineOutput(text: string): string {
  let cleaned = text.trim();

  // 1. 尝试提取 <dvcode-refine-prompt>...</dvcode-refine-prompt> 标签内的内容
  const tagMatch = cleaned.match(/<dvcode-refine-prompt>([\s\S]*?)<\/dvcode-refine-prompt>/);
  if (tagMatch && tagMatch[1]) {
    return tagMatch[1].trim();
  }

  // 2. 如果没有标签，则使用原有的 regex 清理逻辑作为降级方案
  const unwantedPrefixes = [
    // 中文模式
    /^[\s\n]*(?:我理解了|明白了|好的|收到|了解)[^。！？\n]*[。！？\n]+/,
    /^[\s\n]*(?:这是|以下是|根据|按照)[^：:]*[：:]\s*/,
    /^[\s\n]*(?:优化结果|润色结果|修改后)[^：:]*[：:]\s*/,
    /^[\s\n]*\*\*(?:结果|优化后|润色后)[^*]*\*\*\s*/,

    // 英文模式
    /^[\s\n]*(?:I understand|Got it|Here is|Based on)[^\n]*\n+/i,
    /^[\s\n]*(?:The refined|Refined|Polished|Optimized)[^\n:]*[:\n]\s*/i,
    /^[\s\n]*\*\*(?:Result|Output|Refined)[^*]*\*\*\s*/i,
  ];

  for (const pattern of unwantedPrefixes) {
    cleaned = cleaned.replace(pattern, '');
  }

  // 3. 移除常见的 Markdown 装饰
  cleaned = cleaned.replace(/^```(?:\w+)?\n([\s\S]*?)\n```$/i, '$1');

  // 4. 移除多余的空行（保留最多2个连续换行）
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * 简单的语言检测
 */
function detectLanguage(text: string): string {
  // 检测是否包含中文字符
  const chineseRegex = /[\u4e00-\u9fa5]/;
  if (chineseRegex.test(text)) {
    return 'zh';
  }
  return 'en';
}

/**
 * 构建润色提示词（研发友好版）
 */
/**
 * 构建符合 VS Code 标准的增强提示词（对齐 VS Code 效果）
 */
function buildVsCodeStyleRefinePrompt(text: string, options: RefineOptions): string {
  let langInstruction = 'The enhanced instruction should be in the same language as the original instruction.';
  if (options.lang !== 'auto') {
    langInstruction = `The enhanced instruction must be in ${options.lang} language.`;
  }

  return `⚠️ NO TOOLS ALLOWED ⚠️

Here is an instruction that I'd like to give you, but it needs to be improved. Rewrite and enhance this instruction to make it clearer, more specific, less ambiguous, and correct any mistakes. ${langInstruction} Do not use any tools: reply immediately with your answer, even if you're not sure. Consider the context of our conversation history when enhancing the prompt. If there is code in triple backticks (\`\`\`) consider whether it is a code sample and should remain unchanged.Reply with the following format:
### BEGIN RESPONSE ###
Here is an enhanced version of the original instruction that is more specific and clear:
<dvcode-refine-prompt>enhanced prompt goes here</dvcode-refine-prompt>
### END RESPONSE ###

Here is my original instruction:

 ${text}`;
}

/**
 * 构建润色提示词
 */
function buildRefinePrompt(text: string, options: RefineOptions): string {
  // 🎯 核心变更：默认使用 VS Code 风格的增强提示词，除非用户显式指定了规则
  if (options.rules.length === 0 && options.level !== 'light') {
    return buildVsCodeStyleRefinePrompt(text, options);
  }

  const promptOptions: RefinePromptOptions = {
    tone: options.tone,
    level: options.level,
    lang: options.lang,
    max: options.max,
    keepCode: options.keepCode,
    keepFormat: options.keepFormat,
    noEmoji: options.noEmoji,
    glossary: options.glossary,
    rules: options.rules,
  };

  return buildEngineeringRefinePrompt(text, promptOptions);
}

/**
 * 生成 diff
 */
async function generateDiff(original: string, refined: string): Promise<string> {
  try {
    // 将内容写入临时文件
    const tmpDir = '/tmp';
    const originalFile = path.join(tmpDir, `refine-original-${Date.now()}.txt`);
    const refinedFile = path.join(tmpDir, `refine-refined-${Date.now()}.txt`);

    fs.writeFileSync(originalFile, original, 'utf-8');
    fs.writeFileSync(refinedFile, refined, 'utf-8');

    try {
      // 使用 diff 命令生成 unified diff
      const { stdout } = await execAsync(`diff -u "${originalFile}" "${refinedFile}"`, {
        encoding: 'utf-8',
      });
      return stdout;
    } catch (error: any) {
      // diff 命令在文件有差异时返回退出码 1，这是正常的
      if (error.code === 1 && error.stdout) {
        return error.stdout;
      }
      // 如果是其他错误，抛出
      throw error;
    } finally {
      // 清理临时文件
      try {
        fs.unlinkSync(originalFile);
        fs.unlinkSync(refinedFile);
      } catch {
        // 忽略清理错误
      }
    }
  } catch (error) {
    // 如果 diff 命令不可用，返回简单的对比
    return `原文：\n${original}\n\n润色后：\n${refined}`;
  }
}

/**
 * 格式化输出
 */
async function formatOutput(
  result: RefineResult,
  options: RefineOptions,
  originalText: string
): Promise<string> {
  switch (options.out) {
    case 'json':
      // 为 JSON 输出生成 diff
      if (options.file || options.dryRun) {
        result.diff = await generateDiff(originalText, result.result);
      }
      return JSON.stringify(result, null, 2);

    case 'text':
      return result.result;

    case 'md':
      return result.result;

    case 'pretty':
    default:
      let output = '';
      output += '\n' + t('command.refine.result.title') + '\n\n';
      output += t('command.refine.result.params') + '\n';
      output += tp('command.refine.result.params.language', {
        detected: result.langDetected,
        target: result.langTarget
      }) + '\n';
      output += tp('command.refine.result.params.tone', {
        tone: result.tone,
        level: result.level
      }) + '\n';
      const formatProtection = result.keepFormat ? '✅ ' + t('common.format') : '❌ ' + t('common.format');
      const codeProtection = result.keepCode ? ' ✅ ' + t('common.code') : ' ❌ ' + t('common.code');
      output += tp('command.refine.result.params.protection', {
        format: formatProtection,
        code: codeProtection
      }) + '\n';
      if (result.modelUsed) {
        output += tp('command.refine.result.params.model', { model: result.modelUsed }) + '\n';
      }
      if (result.rules.length > 0) {
        output += tp('command.refine.result.params.rules', { rules: result.rules.join(', ') }) + '\n';
      }
      output += '\n' + '─'.repeat(60) + '\n\n';

      // 如果是文件模式或 dry-run，显示 diff
      if (options.file || options.dryRun) {
        const diff = await generateDiff(originalText, result.result);
        if (diff) {
          output += t('command.refine.result.changes') + '\n\n';
          output += diff;
          output += '\n' + '─'.repeat(60) + '\n\n';
        }
      }

      output += t('command.refine.result.output') + '\n\n';
      output += result.result;
      output += '\n\n' + '─'.repeat(60) + '\n';
      output += t('command.refine.result.next-step') + '\n';

      return output;
  }
}

/**
 * Refine命令实现
 */
export const refineCommand: SlashCommand = {
  name: 'refine',
  description: t('command.refine.description'),
  kind: CommandKind.BUILT_IN,
  action: async (context: CommandContext, args: string): Promise<SlashCommandActionReturn> => {
    const startTime = Date.now();
    let source: 'text' | 'stdin' | 'file' | 'last' = 'text';
    let success = false;
    let errorCode: string | undefined;

    try {
      const { text, options } = parseRefineArguments(args);

      // 记录数据来源
      if (options.stdin) {
        source = 'stdin';
      } else if (options.file) {
        source = 'file';
      } else if (options.from === 'last') {
        source = 'last';
      }

      // 获取要润色的文本
      let inputText: string | undefined = text;

      // 从标准输入读取
      if (options.stdin) {
        try {
          inputText = await readStdin();
          if (!inputText || inputText.trim() === '') {
            return {
              type: 'message',
              messageType: 'error',
              content: tp('command.refine.error.read-stdin', { error: t('error.empty.content') }),
            };
          }
        } catch (error) {
          return {
            type: 'message',
            messageType: 'error',
            content: tp('command.refine.error.read-stdin', {
              error: error instanceof Error ? error.message : String(error)
            }),
          };
        }
      }

      // 从文件读取
      if (options.file) {
        try {
          inputText = fs.readFileSync(options.file, 'utf-8');
        } catch (error) {
          return {
            type: 'message',
            messageType: 'error',
            content: tp('command.refine.error.read-file', {
              file: options.file,
              error: error instanceof Error ? error.message : String(error)
            }),
          };
        }
      }

      // 从上一条结果读取
      if (options.from === 'last') {
        // TODO: 实现从上一条结果读取
        return {
          type: 'message',
          messageType: 'error',
          content: t('command.refine.error.from-last'),
        };
      }

      // 如果没有文本，进入交互模式
      if (!inputText) {
        // TODO: 实现交互式多行输入
        return {
          type: 'message',
          messageType: 'error',
          content: t('command.refine.error.no-input'),
        };
      }

      // 调试日志：确认输入文本已被正确还原（如果包含 PASTE 占位符）
      if (inputText.includes('[ PASTE #')) {
        console.warn('[refineCommand] ⚠️ WARNING: Input text contains PASTE placeholder! This should have been restored.');
        console.warn('[refineCommand] Input text preview:', inputText.substring(0, 200));
      } else {
        console.log('[refineCommand] ✅ Input text received (length:', inputText.length, 'chars)');
      }

      // 执行润色
      let result: RefineResult;
      try {
        result = await refineText(context, inputText, options);
      } catch (error) {
        errorCode = 'model';
        throw error;
      }

      // 格式化输出（可能需要生成 diff）
      const output = await formatOutput(result, options, inputText);

      // 写回文件（如果需要）
      if (options.file && !options.dryRun) {
        try {
          fs.writeFileSync(options.file, result.result, 'utf-8');
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: tp('command.refine.success.file-written', { file: options.file }),
            },
            Date.now()
          );
        } catch (error) {
          errorCode = 'write';
          throw new Error(tp('command.refine.error.write-file', {
            error: error instanceof Error ? error.message : String(error)
          }));
        }
      } else if (options.file && options.dryRun) {
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: t('command.refine.info.dry-run'),
          },
          Date.now()
        );
      }

      success = true;

      // TODO: 添加更详细的遥测记录
      // 记录命令执行成功（暂时跳过日志，因为 Logger 不适合此用途）

      // 如果是非交互模式（JSON/text输出），直接返回消息
      if (options.out !== 'pretty') {
        return {
          type: 'message',
          messageType: 'info',
          content: output,
        };
      }

      // 交互模式：返回润色结果，等待用户确认
      console.log('[refineCommand] 返回 refine_result，原文长度:', inputText.length, '润色后长度:', result.result.length);
      return {
        type: 'refine_result',
        original: inputText,
        refined: result.result,
        options: {
          tone: options.tone,
          level: options.level,
          lang: options.lang,
          keepFormat: options.keepFormat,
          keepCode: options.keepCode,
        },
      };
    } catch (error) {
      // 记录错误（暂时使用 console，因为 Logger 不适合此用途）
      const stage = errorCode || 'unknown';
      console.error(`Refine command failed: ${stage}`, error);

      return {
        type: 'message',
        messageType: 'error',
        content: tp('command.refine.error.refine-failed', {
          error: error instanceof Error ? error.message : String(error)
        }),
      };
    }
  },

  completion: async (context: CommandContext, partialArg: string) => {
    const completions: string[] = [];

    // 提供选项补全
    if (partialArg.startsWith('--')) {
      const options = [
        '--tone',
        '--lang',
        '--level',
        '--keep-format',
        '--keep-code',
        '--no-emoji',
        '--max',
        '--glossary',
        '--rule',
        '--from',
        '--stdin',
        '--file',
        '--out',
        '--dry-run',
      ];
      return options.filter(opt => opt.startsWith(partialArg));
    }

    // 如果是tone选项值
    if (partialArg.includes('--tone ')) {
      return ['neutral', 'friendly', 'formal', 'concise', 'marketing', 'tech'];
    }

    // 如果是level选项值
    if (partialArg.includes('--level ')) {
      return ['light', 'medium', 'deep'];
    }

    // 如果是out选项值
    if (partialArg.includes('--out ')) {
      return ['pretty', 'text', 'json', 'md'];
    }

    return completions;
  },
};

