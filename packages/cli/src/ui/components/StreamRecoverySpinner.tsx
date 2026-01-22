/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Text } from 'ink';
import Spinner from 'ink-spinner';
import { Colors } from '../colors.js';
import { t, tp } from '../utils/i18n.js';

interface StreamRecoverySpinnerProps {
  isVisible: boolean;
  remaining: number;
}

export const StreamRecoverySpinner: React.FC<StreamRecoverySpinnerProps> = ({
  isVisible,
  remaining,
}) => {
  if (!isVisible) return null;

  const prefix = t('stream.interrupted.prefix');
  const suffix = tp('stream.interrupted.suffix', { seconds: remaining });

  return (
    <Text>
      <Text color={Colors.AccentGreen}><Spinner type="dots" /></Text>
      {' '}
      <Text color={Colors.AccentYellow}>{prefix}</Text>
      {' '}
      <Text color={Colors.AccentGreen}>{suffix}</Text>
    </Text>
  );
};
