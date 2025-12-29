/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { SlashCommand } from '../commands/types.js';
import { t, tp } from '../utils/i18n.js';

interface Help {
  commands: readonly SlashCommand[];
}

export const Help: React.FC<Help> = ({ commands }) => {
  // Helper function to get newline shortcut key
  const getNewlineShortcut = () => {
    return process.platform === 'win32' ? 'Ctrl+Enter' : 'Ctrl+J';
  };

  // Helper function to get newline description
  const getNewlineDescription = () => {
    if (process.platform === 'linux') {
      return t('help.shortcut.newline.linux');
    }
    return t('help.shortcut.newline');
  };

  return (
    <Box
      flexDirection="column"
      marginBottom={1}
      borderColor={Colors.Gray}
      borderStyle="round"
      padding={1}
    >
      {/* Basics */}
      <Text bold color={Colors.Foreground}>
        {t('help.basics.title')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          {t('help.add.context')}
        </Text>
        {tp('help.add.context.description', {
          symbol: '@',
          example: '@src/myFile.ts'
        })}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          {t('help.shell.mode')}
        </Text>
        {tp('help.shell.mode.description', {
          symbol: '!',
          example1: '!npm run start',
          example2: 'start server'
        })}
      </Text>

      <Box height={1} />

      {/* Commands */}
      <Text bold color={Colors.Foreground}>
        {t('help.commands.title')}
      </Text>
      {commands
        .filter((command) => command.description)
        .map((command: SlashCommand) => (
          <Box key={command.name} flexDirection="column">
            <Text color={Colors.Foreground}>
              <Text bold color={Colors.AccentPurple}>
                {' '}
                /{command.name}
              </Text>
              {command.description && ' - ' + command.description}
            </Text>
            {command.subCommands &&
              command.subCommands.map((subCommand) => (
                <Text key={subCommand.name} color={Colors.Foreground}>
                  <Text bold color={Colors.AccentPurple}>
                    {'   '}
                    {subCommand.name}
                  </Text>
                  {subCommand.description && ' - ' + subCommand.description}
                </Text>
              ))}
          </Box>
        ))}
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          {' '}
          !{' '}
        </Text>
        {t('help.shell.command.description')}
      </Text>

      <Box height={1} />

      {/* Shortcuts */}
      <Text bold color={Colors.Foreground}>
        {t('help.shortcuts.title')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Enter
        </Text>{' '}
        {t('help.shortcut.enter')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          {getNewlineShortcut()}
        </Text>{' '}
        {getNewlineDescription()}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Up/Down
        </Text>{' '}
        {t('help.shortcut.history')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Alt+Left/Right
        </Text>{' '}
        {t('help.shortcut.word.jump')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Shift+Tab
        </Text>{' '}
        {t('help.shortcut.toggle.edit')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Ctrl+Y
        </Text>{' '}
        {t('help.shortcut.yolo.mode')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Ctrl+L
        </Text>{' '}
        {t('help.shortcut.model.switch')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Esc
        </Text>{' '}
        {t('help.shortcut.cancel')}
      </Text>
      <Text color={Colors.Foreground}>
        <Text bold color={Colors.AccentPurple}>
          Ctrl+C
        </Text>{' '}
        {t('help.shortcut.exit')}
      </Text>
    </Box>
  );
};
