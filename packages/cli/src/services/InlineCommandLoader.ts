/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { Config } from 'deepv-code-core';
import { ICommandLoader } from './types.js';
import {
  CommandContext,
  CommandKind,
  SlashCommand,
  SubmitPromptActionReturn,
} from '../ui/commands/types.js';
import {
  getEnabledInlineCommands,
  type InlineCommandDef,
} from './inlineCommands.js';
import {
  DefaultArgumentProcessor,
  ShorthandArgumentProcessor,
} from './prompt-processors/argumentProcessor.js';
import {
  IPromptProcessor,
  SHORTHAND_ARGS_PLACEHOLDER,
} from './prompt-processors/types.js';

/**
 * 内置命令加载器
 *
 * 这个加载器的核心优势：
 * ✅ 快速修改：只需修改 inlineCommands.ts 中的字符串即可调整命令行为
 * ✅ 零配置：无需外部文件，内置在代码中
 * ✅ 类型安全：完整的TypeScript类型支持
 * ✅ 热更新：修改后重新编译即可生效
 *
 * 使用场景：
 * - 快速原型开发
 * - 频繁调整的命令
 * - 不希望依赖外部配置文件的场景
 * - 需要版本控制的命令定义
 */
export class InlineCommandLoader implements ICommandLoader {
  constructor(private readonly config: Config | null) {}

  /**
   * 加载所有内置命令
   * @param signal 取消信号
   * @returns 内置命令数组
   */
  async loadCommands(signal: AbortSignal): Promise<SlashCommand[]> {
    // 检查是否被取消
    if (signal.aborted) {
      return [];
    }

    const enabledCommands = getEnabledInlineCommands();

    return enabledCommands.map((commandDef) =>
      this.createSlashCommand(commandDef)
    );
  }

  /**
   * 将内置命令配置转换为可执行的 SlashCommand 对象
   * @param commandDef 命令定义
   * @returns SlashCommand 对象
   */
  private createSlashCommand(commandDef: InlineCommandDef): SlashCommand {
    const processors = this.createPromptProcessors(commandDef.prompt);

    return {
      name: commandDef.name,
      description: commandDef.description,
      altNames: commandDef.altNames,
      kind: CommandKind.INLINE, // 需要在 types.js 中添加这个枚举值
      action: async (
        context: CommandContext,
        _args: string,
      ): Promise<SubmitPromptActionReturn> => {
        if (!context.invocation) {
          console.error(
            `[InlineCommandLoader] Critical error: Command '${commandDef.name}' was executed without invocation context.`,
          );
          return {
            type: 'submit_prompt',
            content: commandDef.prompt, // 回退到未处理的提示词
          };
        }

        // 处理提示词模板
        let processedPrompt = commandDef.prompt;
        for (const processor of processors) {
          processedPrompt = await processor.process(processedPrompt, context);
        }

        return {
          type: 'submit_prompt',
          content: processedPrompt,
        };
      },
    };
  }

  /**
   * 根据提示词内容创建相应的处理器
   * @param prompt 提示词模板
   * @returns 处理器数组
   */
  private createPromptProcessors(prompt: string): IPromptProcessor[] {
    const processors: IPromptProcessor[] = [];

    // 检查是否包含 {{args}} 占位符来决定使用哪种处理器
    if (prompt.includes(SHORTHAND_ARGS_PLACEHOLDER)) {
      processors.push(new ShorthandArgumentProcessor());
    } else {
      processors.push(new DefaultArgumentProcessor());
    }

    return processors;
  }
}

/**
 * 便捷的命令创建器函数
 * 用于快速创建新的内置命令，无需了解内部实现细节
 *
 * @example
 * ```typescript
 * const myCommand = createInlineCommand({
 *   name: 'mycommand',
 *   description: '我的自定义命令',
 *   prompt: '请帮我处理: {{args}}',
 *   altNames: ['my', 'cmd']
 * });
 * ```
 */
export function createInlineCommand(def: InlineCommandDef): SlashCommand {
  const loader = new InlineCommandLoader(null);
  return (loader as any).createSlashCommand(def);
}