/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import path from 'path';
import toml from '@iarna/toml';
import { glob } from 'glob';
import { z } from 'zod';
import { Config } from 'deepv-code-core';
import { ICommandLoader } from './types.js';
import {
  CommandContext,
  CommandKind,
  SlashCommand,
  SubmitPromptActionReturn,
} from '../ui/commands/types.js';
import {
  DefaultArgumentProcessor,
  ShorthandArgumentProcessor,
} from './prompt-processors/argumentProcessor.js';
import {
  IPromptProcessor,
  SHORTHAND_ARGS_PLACEHOLDER,
} from './prompt-processors/types.js';

/**
 * Defines the Zod schema for a command definition file
 */
const TomlCommandDefSchema = z.object({
  prompt: z.string({
    required_error: "The 'prompt' field is required.",
    invalid_type_error: "The 'prompt' field must be a string.",
  }),
  description: z.string().optional(),
});

/**
 * Loads slash commands from installed extensions in .deepv/extensions directory.
 *
 * This loader scans all extension directories and loads TOML command files,
 * making them available as slash commands with the naming pattern:
 * /ext:{extension-name}:{command-name}
 */
export class ExtensionCommandLoader implements ICommandLoader {
  private readonly projectRoot: string;

  constructor(private readonly config: Config | null) {
    this.projectRoot = config?.getProjectRoot() || process.cwd();
  }

  /**
   * Loads all commands from installed extensions
   * @param signal An AbortSignal to cancel the loading process
   * @returns A promise that resolves to an array of loaded SlashCommands
   */
  async loadCommands(signal: AbortSignal): Promise<SlashCommand[]> {
    const commandMap = new Map<string, SlashCommand>();
    const extensionsDir = path.join(this.projectRoot, '.deepv', 'extensions');

    try {
      // Check if extensions directory exists
      await fs.access(extensionsDir);
    } catch {
      // Extensions directory doesn't exist, which is fine
      return [];
    }

    try {
      const entries = await fs.readdir(extensionsDir, {
        withFileTypes: true,
      });

      const extensionDirs = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

      const globOptions = {
        nodir: true,
        dot: true,
        signal,
      };

      // Load commands from each extension
      for (const extName of extensionDirs) {
        const commandsDir = path.join(
          extensionsDir,
          extName,
          'commands',
        );

        try {
          // Check if commands directory exists in this extension
          await fs.access(commandsDir);
        } catch {
          // This extension has no commands directory
          continue;
        }

        try {
          const files = await glob('**/*.toml', {
            ...globOptions,
            cwd: commandsDir,
          });

          const extCommandPromises = files.map((file) =>
            this.parseAndAdaptFile(
              path.join(commandsDir, file),
              commandsDir,
              extName,
            ),
          );

          const extCommands = (
            await Promise.all(extCommandPromises)
          ).filter((cmd): cmd is SlashCommand => cmd !== null);

          for (const cmd of extCommands) {
            commandMap.set(cmd.name, cmd);
            console.debug(
              `[ExtensionCommandLoader] Loaded extension command: /${cmd.name}`,
            );
          }
        } catch (error) {
          console.warn(
            `[ExtensionCommandLoader] Failed to load commands from extension '${extName}':`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    } catch (error) {
      console.warn(
        `[ExtensionCommandLoader] Failed to scan extensions directory:`,
        error instanceof Error ? error.message : String(error),
      );
    }

    if (commandMap.size > 0) {
      console.log(
        `[ExtensionCommandLoader] Loaded ${commandMap.size} command(s) from extensions`,
      );
    }

    return Array.from(commandMap.values());
  }

  /**
   * Parses a single .toml file and transforms it into a SlashCommand object
   * @param filePath The absolute path to the .toml file
   * @param baseDir The root command directory for name calculation
   * @param extensionName The name of the extension providing this command
   * @returns A promise resolving to a SlashCommand, or null if the file is invalid
   */
  private async parseAndAdaptFile(
    filePath: string,
    baseDir: string,
    extensionName: string,
  ): Promise<SlashCommand | null> {
    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (error: unknown) {
      console.error(
        `[ExtensionCommandLoader] Failed to read file ${filePath}:`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }

    let parsed: unknown;
    try {
      parsed = toml.parse(fileContent);
    } catch (error: unknown) {
      console.error(
        `[ExtensionCommandLoader] Failed to parse TOML file ${filePath}:`,
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }

    const validationResult = TomlCommandDefSchema.safeParse(parsed);

    if (!validationResult.success) {
      console.error(
        `[ExtensionCommandLoader] Skipping invalid command file: ${filePath}. Validation errors:`,
        validationResult.error.flatten(),
      );
      return null;
    }

    const validDef = validationResult.data;

    const relativePathWithExt = path.relative(baseDir, filePath);
    const relativePath = relativePathWithExt.substring(
      0,
      relativePathWithExt.length - 5, // length of '.toml'
    );
    const pathSegments = relativePath
      .split(path.sep)
      .map((segment) => segment.replaceAll(':', '_'));

    // Format: ext:{extension-name}:{command-path}
    const commandName = `ext:${extensionName}:${pathSegments.join(':')}`;

    const processors: IPromptProcessor[] = [];

    // The presence of '{{args}}' is the switch that determines the behavior
    if (validDef.prompt.includes(SHORTHAND_ARGS_PLACEHOLDER)) {
      processors.push(new ShorthandArgumentProcessor());
    } else {
      processors.push(new DefaultArgumentProcessor());
    }

    return {
      name: commandName,
      description:
        validDef.description ||
        `Extension command from ${extensionName}/${path.basename(filePath)}`,
      kind: CommandKind.FILE,
      action: async (
        context: CommandContext,
        _args: string,
      ): Promise<SubmitPromptActionReturn> => {
        if (!context.invocation) {
          console.error(
            `[ExtensionCommandLoader] Critical error: Command '${commandName}' was executed without invocation context.`,
          );
          return {
            type: 'submit_prompt',
            content: validDef.prompt,
          };
        }

        let processedPrompt = validDef.prompt;
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
}