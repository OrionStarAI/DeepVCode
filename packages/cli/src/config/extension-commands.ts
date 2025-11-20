/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { Extension } from './extension.js';

/**
 * Extension Command Configuration
 * Extensions can define CLI commands in their gemini-extension.json
 */
export interface ExtensionCommandConfig {
  name: string;
  description?: string;
  module: string; // Path to the command module (relative to extension dir)
}

/**
 * Extension Command Definition with metadata
 */
export interface ExtensionCommand {
  extension: Extension;
  command: CommandModule;
  config: ExtensionCommandConfig;
}

const EXTENSION_COMMANDS_FILENAME = 'cli-commands.json';

/**
 * Load CLI commands from an extension
 * Commands are defined in extension-root/cli-commands.json
 */
export async function loadExtensionCommands(
  extension: Extension,
): Promise<ExtensionCommand[]> {
  if (!extension.path) {
    return [];
  }

  const commandsFile = path.join(extension.path, EXTENSION_COMMANDS_FILENAME);
  if (!fs.existsSync(commandsFile)) {
    return [];
  }

  try {
    const content = fs.readFileSync(commandsFile, 'utf-8');
    const configs = JSON.parse(content) as ExtensionCommandConfig[];

    if (!Array.isArray(configs)) {
      console.warn(
        `Warning: ${EXTENSION_COMMANDS_FILENAME} in extension ${extension.config.name} should contain an array of commands`,
      );
      return [];
    }

    const commands: ExtensionCommand[] = [];

    for (const config of configs) {
      try {
        const modulePath = path.join(extension.path, config.module);
        if (!fs.existsSync(modulePath)) {
          console.warn(
            `Warning: Extension command module not found: ${modulePath}`,
          );
          continue;
        }

        // Dynamically import the command module
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const module = await import(pathToFileURL(modulePath).href) as any;
        const commandModule = module.default || module.command;

        if (!commandModule) {
          console.warn(
            `Warning: Extension command module ${modulePath} does not export a default command`,
          );
          continue;
        }

        commands.push({
          extension,
          command: commandModule as CommandModule,
          config,
        });
      } catch (error) {
        console.error(
          `Error loading command ${config.name} from extension ${extension.config.name}:`,
          error,
        );
      }
    }

    return commands;
  } catch (error) {
    console.warn(
      `Warning: failed to load commands from extension ${extension.config.name}:`,
      error,
    );
    return [];
  }
}

/**
 * Load all CLI commands from all extensions
 */
export async function loadAllExtensionCommands(
  extensions: Extension[],
): Promise<ExtensionCommand[]> {
  const allCommands: ExtensionCommand[] = [];

  for (const extension of extensions) {
    const commands = await loadExtensionCommands(extension);
    allCommands.push(...commands);
  }

  return allCommands;
}

/**
 * Register extension commands to a yargs instance
 */
export function registerExtensionCommands(
  yargs: any, // Yargs instance
  commands: ExtensionCommand[],
): any {
  for (const { command, config } of commands) {
    // Validate command name and add extension prefix to avoid conflicts
    if (!config.name) {
      console.warn('Extension command missing name, skipping');
      continue;
    }

    // Use the command name from config, or fall back to command definition
    const commandName = command.command || config.name;

    yargs.command(command);

    if (commands.length > 0) {
      console.log(
        `[Extension Commands] Registered command: ${commandName} from ${config.name || 'unknown'}`,
      );
    }
  }

  return yargs;
}
