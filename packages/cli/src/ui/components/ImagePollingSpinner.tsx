/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { Colors } from '../colors.js';
import { isChineseLocale } from '../utils/i18n.js';

interface ImagePollingSpinnerProps {
  isVisible: boolean;
  elapsed: number;
  estimated: number;
}

export const ImagePollingSpinner: React.FC<ImagePollingSpinnerProps> = ({
  isVisible,
  elapsed,
  estimated,
}) => {
  if (!isVisible) return null;

  const isChinese = isChineseLocale();
  const remaining = Math.max(0, estimated - elapsed);
  const progress = Math.min(100, Math.round((elapsed / estimated) * 100));

  const message = isChinese
    ? `${elapsed}s/${estimated}s (${progress}%)`
    : `${elapsed}s/${estimated}s (${progress}%)`;

  return (
    <Text color={Colors.AccentGreen}>
      <Spinner type="dots" /> {message}
    </Text>
  );
};
