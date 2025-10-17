/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { t } from '../utils/i18n.js';

interface AboutBoxProps {
  cliVersion: string;
  osVersion: string;
  sandboxEnv: string;
  modelVersion?: string;
  selectedAuthType?: string;
  gcpProject?: string;
}

const getOSDisplayName = (osVersion: string): string => {
  switch (osVersion) {
    case 'darwin':
      return 'Mac OS';
    case 'win32':
      return 'Windows';
    case 'linux':
      return 'Linux';
    default:
      return osVersion;
  }
};

export const AboutBox: React.FC<AboutBoxProps> = ({
  cliVersion,
  osVersion,
  sandboxEnv,
}) => (
  <Box
    borderStyle="round"
    borderColor={Colors.Gray}
    flexDirection="column"
    padding={1}
    marginY={1}
    width="100%"
  >
    <Box marginBottom={1}>
      <Text bold color={Colors.AccentPurple}>
        {t('about.title')}
      </Text>
    </Box>
    <Box flexDirection="row">
      <Box width="35%">
        <Text bold color={Colors.LightBlue}>
          Version
        </Text>
      </Box>
      <Box>
        <Text>{cliVersion}</Text>
      </Box>
    </Box>
    <Box flexDirection="row">
      <Box width="35%">
        <Text bold color={Colors.LightBlue}>
          Sandbox
        </Text>
      </Box>
      <Box>
        <Text>{sandboxEnv}</Text>
      </Box>
    </Box>
    <Box flexDirection="row">
      <Box width="35%">
        <Text bold color={Colors.LightBlue}>
          OS
        </Text>
      </Box>
      <Box>
        <Text>{getOSDisplayName(osVersion)}</Text>
      </Box>
    </Box>
    <Box flexDirection="row">
      <Box width="35%">
        <Text bold color={Colors.LightBlue}>
          Web
        </Text>
      </Box>
      <Box>
        <Text color={Colors.LightBlue}>https://www.deepvlab.ai/</Text>
      </Box>
    </Box>
  </Box>
);
