/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StatsDisplay } from './StatsDisplay.js';
import { t } from '../utils/i18n.js';
import { Config } from 'deepv-code-core';

interface SessionSummaryDisplayProps {
  duration: string;
  credits?: number;
  config?: Config;
}

export const SessionSummaryDisplay: React.FC<SessionSummaryDisplayProps> = ({
  duration,
  credits,
  config,
}) => (
  <StatsDisplay
    title={t('agent.powering.down')}
    duration={duration}
    totalCredits={credits}
    config={config}
  />
);
