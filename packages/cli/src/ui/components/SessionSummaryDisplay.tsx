/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StatsDisplay } from './StatsDisplay.js';
import { t } from '../utils/i18n.js';

interface SessionSummaryDisplayProps {
  duration: string;
  credits?: number;
}

export const SessionSummaryDisplay: React.FC<SessionSummaryDisplayProps> = ({
  duration,
  credits,
}) => (
  <StatsDisplay title={t('agent.powering.down')} duration={duration} totalCredits={credits} />
);
