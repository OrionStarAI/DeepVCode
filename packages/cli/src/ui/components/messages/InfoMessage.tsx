/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../../colors.js';

interface InfoMessageProps {
  text: string;
}

export const InfoMessage: React.FC<InfoMessageProps> = ({ text }) => {
  return (
    <Box flexDirection="row" marginTop={1} marginLeft={2}>
      <Box flexGrow={1}>
        <Text wrap="wrap">
          {text}
        </Text>
      </Box>
    </Box>
  );
};
