/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect, RadioSelectItem } from './shared/RadioButtonSelect.js';
import { t, tp } from '../utils/i18n.js';

interface InitChoiceDialogProps {
  fileSize: number;
  lineCount: number;
  onChoice: (choice: 'append' | 'overwrite' | 'cancel') => void;
}

export function InitChoiceDialog({
  fileSize,
  lineCount,
  onChoice,
}: InitChoiceDialogProps): React.JSX.Element {
  const items = useMemo(() => [
    {
      label: t('command.init.choiceAppend'),
      value: 'append',
      rightText: t('command.init.choiceAppendDesc'),
    },
    {
      label: t('command.init.choiceOverwrite'),
      value: 'overwrite',
      rightText: t('command.init.choiceOverwriteDesc'),
    },
    {
      label: t('command.init.choiceCancel'),
      value: 'cancel',
      rightText: t('command.init.choiceCancelDesc'),
    },
  ], []);

  useInput((input, key) => {
    if (key.escape) {
      onChoice('cancel');
    }
  });

  const handleSelect = useCallback((value: string) => {
    onChoice(value as 'append' | 'overwrite' | 'cancel');
  }, [onChoice]);

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={1}
      paddingRight={1}
      width="100%"
    >
      <Text bold>
        {t('command.init.fileExistsTitle')}
      </Text>
      <Box marginTop={0} marginBottom={1}>
        <Text color={Colors.Gray}>
          {tp('command.init.fileExistsInfo', {
            size: fileSize,
            lines: lineCount,
          })}
        </Text>
      </Box>
      <Box marginTop={1} marginBottom={1}>
        <RadioButtonSelect
          items={items}
          onSelect={handleSelect}
          isFocused={true}
        />
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.Gray}>{t('command.init.choiceHint')}</Text>
      </Box>
    </Box>
  );
}
