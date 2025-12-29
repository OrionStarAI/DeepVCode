/**
 * @license
 * Copyright 2025 DeepV Code
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Slash Command Service for VSCode UI Plugin
 *
 * Loads custom slash commands from .toml files, sharing the same configuration
 * paths as the CLI (~/.deepv/commands and <project>/.deepvcode/commands).
 *
 * This is a simplified version of CLI's FileCommandLoader, adapted for VSCode environment.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import * as toml from '@iarna/toml';
import { glob } from 'glob';
import { getUserCommandsDir, getProjectCommandsDir } from 'deepv-code-core';
import { Logger } from '../utils/logger';

/**
 * Slash command info sent to webview (serializable)
 */
export interface SlashCommandInfo {
  /** Command name (e.g., 'git:commit', 'test') */
  name: string;
  /** Human-readable description */
  description: string;
  /** Command source: 'file' for custom commands, 'built-in' for hardcoded */
  kind: 'file' | 'built-in';
  /** The prompt template */
  prompt: string;
}

/**
 * TOML command definition schema
 */
interface TomlCommandDef {
  prompt: string;
  description?: string;
}

/**
 * Placeholder for shorthand argument injection
 */
const SHORTHAND_ARGS_PLACEHOLDER = '{{args}}';

/**
 * Service for managing custom slash commands in VSCode
 */
export class SlashCommandService {
  private commands: Map<string, SlashCommandInfo> = new Map();
  private initialized = false;

  constructor(private readonly logger: Logger) {}

  /**
   * Initialize and load all commands
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.loadCommands();
      this.initialized = true;
      this.logger.info(`[SlashCommandService] Loaded ${this.commands.size} custom commands`);
    } catch (error) {
      this.logger.error('[SlashCommandService] Failed to initialize', error instanceof Error ? error : undefined);
    }
  }

  /**
   * Reload all commands (useful when files change)
   */
  async reload(): Promise<void> {
    this.commands.clear();
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Get all available commands
   */
  getCommands(): SlashCommandInfo[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get a specific command by name
   */
  getCommand(name: string): SlashCommandInfo | undefined {
    return this.commands.get(name);
  }

  /**
   * Process a command's prompt with given arguments
   * @param command The command to execute
   * @param args User-provided arguments
   * @returns Processed prompt ready for AI
   */
  processCommandPrompt(command: SlashCommandInfo, args: string): string {
    let prompt = command.prompt;

    // Handle {{args}} placeholder (shorthand mode)
    if (prompt.includes(SHORTHAND_ARGS_PLACEHOLDER)) {
      prompt = prompt.split(SHORTHAND_ARGS_PLACEHOLDER).join(args);
    } else if (args.trim()) {
      // Default mode: append raw input to prompt
      prompt = `${prompt}\n\n/${command.name} ${args}`;
    }

    return prompt;
  }

  /**
   * Load commands from both user and project directories
   */
  private async loadCommands(): Promise<void> {
    const globOptions = {
      nodir: true,
      dot: true,
    };

    // Load user-level commands (~/.deepv/commands)
    const userDir = getUserCommandsDir();
    await this.loadCommandsFromDir(userDir, globOptions);

    // Load project-level commands (project/.deepvcode/commands)
    // Project commands override user commands with the same name
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      const projectDir = getProjectCommandsDir(workspaceRoot);
      await this.loadCommandsFromDir(projectDir, globOptions);
    }
  }

  /**
   * Load commands from a specific directory
   */
  private async loadCommandsFromDir(
    baseDir: string,
    globOptions: { nodir: boolean; dot: boolean }
  ): Promise<void> {
    try {
      // Check if directory exists
      await fs.access(baseDir);

      const files = await glob('**/*.toml', {
        ...globOptions,
        cwd: baseDir,
      });

      for (const file of files) {
        const filePath = path.join(baseDir, file);
        const command = await this.parseTomlFile(filePath, baseDir);
        if (command) {
          this.commands.set(command.name, command);
        }
      }
    } catch {
      // Directory doesn't exist or not accessible - that's fine
      this.logger.debug(`[SlashCommandService] Directory not accessible: ${baseDir}`);
    }
  }

  /**
   * Parse a single .toml file into a SlashCommandInfo
   */
  private async parseTomlFile(
    filePath: string,
    baseDir: string
  ): Promise<SlashCommandInfo | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = toml.parse(content) as unknown as TomlCommandDef;

      // Validate required fields
      if (!parsed.prompt || typeof parsed.prompt !== 'string') {
        this.logger.warn(`[SlashCommandService] Invalid command file (missing prompt): ${filePath}`);
        return null;
      }

      // Calculate command name from file path
      // e.g., 'git/commit.toml' -> 'git:commit'
      const relativePathWithExt = path.relative(baseDir, filePath);
      const relativePath = relativePathWithExt.substring(
        0,
        relativePathWithExt.length - 5 // remove '.toml'
      );
      const commandName = relativePath
        .split(path.sep)
        .map((segment) => segment.split(':').join('_'))
        .join(':');

      return {
        name: commandName,
        description: parsed.description || `Custom command from ${path.basename(filePath)}`,
        kind: 'file',
        prompt: parsed.prompt,
      };
    } catch (error) {
      this.logger.error(
        `[SlashCommandService] Failed to parse ${filePath}`,
        error instanceof Error ? error : undefined
      );
      return null;
    }
  }
}
