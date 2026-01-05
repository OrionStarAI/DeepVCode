/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ICommandLoader } from './types.js';
import { SlashCommand } from '../ui/commands/types.js';
import { Config } from 'deepv-code-core';
import { aboutCommand } from '../ui/commands/aboutCommand.js';
import { authCommand } from '../ui/commands/authCommand.js';
import { loginCommand } from '../ui/commands/loginCommand.js';
// import { chatCommand } from '../ui/commands/chatCommand.js'; // 已被 /session 替代
import { clearCommand } from '../ui/commands/clearCommand.js';
import { compressCommand } from '../ui/commands/compressCommand.js';
import { copyCommand } from '../ui/commands/copyCommand.js';
// import { corgiCommand } from '../ui/commands/corgiCommand.js'; // 已禁用
// import { docsCommand } from '../ui/commands/docsCommand.js'; // 已禁用
import { editorCommand } from '../ui/commands/editorCommand.js';
import { exportCommand } from '../ui/commands/exportCommand.js';
import { exportDebugCommand } from '../ui/commands/exportDebugCommand.js';
import { extensionsCommand } from '../ui/commands/extensionsCommand.js';
import { helpCommand } from '../ui/commands/helpCommand.js';
import { helpAskCommand } from '../ui/commands/helpAskCommand.js';
import { ideCommand } from '../ui/commands/ideCommand.js';
import { initCommand } from '../ui/commands/initCommand.js';
// import { mcpCommand } from '../ui/commands/mcpCommand.js'; // 已删除
import { memoryCommand } from '../ui/commands/memoryCommand.js';
import { modelCommand } from '../ui/commands/modelCommand.js';
// import { privacyCommand } from '../ui/commands/privacyCommand.js'; // 已删除
import { quitCommand } from '../ui/commands/quitCommand.js';
import { restoreCommand } from '../ui/commands/restoreCommand.js';
import { statsCommand } from '../ui/commands/statsCommand.js';
import { contextCommand } from '../ui/commands/contextCommand.js';
import { themeCommand } from '../ui/commands/themeCommand.js';
import { toolsCommand } from '../ui/commands/toolsCommand.js';
import { vimCommand } from '../ui/commands/vimCommand.js';
import { yoloCommand } from '../ui/commands/yoloCommand.js';
import { trimSpacesCommand } from '../ui/commands/trimSpacesCommand.js';
import { sessionCommand } from '../ui/commands/sessionCommand.js';
import { mcpCommand } from '../ui/commands/mcpCommand.js';
import { planCommand } from '../ui/commands/planCommand.js';
import { accountCommand } from '../ui/commands/accountCommand.js';
import { refineCommand } from '../ui/commands/refineCommand.js';
import { queueCommand } from '../ui/commands/queueCommand.js';
import { nanoBananaCommand } from '../ui/commands/nanoBananaCommand.js';
import { skillCommand } from '../ui/commands/skillCommand.js';
import { pptCommand } from '../ui/commands/pptCommand.js';
import { hooksCommand } from '../ui/commands/hooksCommand.js';

/**
 * Loads the core, hard-coded slash commands that are an integral part
 * of the DeepV Code application.
 */
export class BuiltinCommandLoader implements ICommandLoader {
  constructor(private config: Config | null) {}

  /**
   * Gathers all raw built-in command definitions, injects dependencies where
   * needed (e.g., config) and filters out any that are not available.
   *
   * @param _signal An AbortSignal (unused for this synchronous loader).
   * @returns A promise that resolves to an array of `SlashCommand` objects.
   */
  async loadCommands(_signal: AbortSignal): Promise<SlashCommand[]> {
    const allDefinitions: Array<SlashCommand | null> = [
      aboutCommand,
      authCommand,
      // loginCommand,
      // chatCommand, // 已被 /session 替代
      clearCommand,
      compressCommand,
      copyCommand,
      // corgiCommand, // 已禁用柯基模式命令
      // docsCommand, // 已禁用文档命令
      editorCommand,
      exportCommand,
      exportDebugCommand,
      extensionsCommand,
      helpCommand,
      helpAskCommand,
      hooksCommand,
      ideCommand(this.config),
      initCommand,
      memoryCommand,
      modelCommand,
      // privacyCommand, // 已删除
      mcpCommand, // 已删除
      nanoBananaCommand,
      planCommand,
      queueCommand,
      quitCommand,
      refineCommand,
      restoreCommand(this.config),
      sessionCommand,
      skillCommand,
      statsCommand,
      contextCommand,
      themeCommand,
      toolsCommand,
      trimSpacesCommand,
      vimCommand,
      yoloCommand,
      accountCommand,
      pptCommand,
    ];

    return allDefinitions.filter((cmd): cmd is SlashCommand => cmd !== null);
  }
}
