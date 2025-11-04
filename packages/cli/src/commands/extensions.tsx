/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandModule } from 'yargs';
import { installCommand } from './extensions/install.js';
import { uninstallCommand } from './extensions/uninstall.js';
import { listCommand } from './extensions/list.js';
import { linkCommand } from './extensions/link.js';
import { newCommand } from './extensions/new.js';
import { validateCommand } from './extensions/validate.js';

export const extensionsCommand: CommandModule = {
  command: 'extensions',
  aliases: ['extension'],
  describe: 'Manage dvcode extensions.',
  builder: (yargs) =>
    yargs
      .command(installCommand)
      .command(uninstallCommand)
      .command(listCommand)
      .command(linkCommand)
      .command(newCommand)
      .command(validateCommand)
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false)
      .help(),
  handler: () => {
    // This handler is not called when a subcommand is provided.
    // Yargs will show the help menu.
  },
};
