/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { shortenPath, tildeifyPath, tokenLimit, IDEConnectionStatus, Config } from 'deepv-code-core';
import { ConsoleSummaryDisplay } from './ConsoleSummaryDisplay.js';
import process from 'node:process';
import Gradient from 'ink-gradient';
import { MemoryUsageDisplay } from './MemoryUsageDisplay.js';
import { t } from '../utils/i18n.js';
import { getModelDisplayName } from '../commands/modelCommand.js';
import { getFooterDisplayConfig, getShortVersion, getShortModelName, getContextDisplay } from '../utils/footerUtils.js';

interface FooterProps {
  model: string;
  targetDir: string;
  branchName?: string;
  debugMode: boolean;
  debugMessage: string;
  corgiMode: boolean;
  errorCount: number;
  showErrorDetails: boolean;
  showMemoryUsage?: boolean;
  promptTokenCount: number;
  nightly: boolean;
  vimMode?: string;
  version?: string;
  ideConnectionStatus?: IDEConnectionStatus;
  config?: Config;
  terminalWidth?: number;
}

export const Footer: React.FC<FooterProps> = ({
  model,
  targetDir,
  branchName,
  debugMode,
  debugMessage,
  corgiMode,
  errorCount,
  showErrorDetails,
  showMemoryUsage,
  promptTokenCount,
  nightly,
  vimMode,
  version,
  ideConnectionStatus,
  config,
  terminalWidth = 80,
}) => {
  const limit = tokenLimit(model, config);
  const percentage = promptTokenCount / limit;

  // 获取响应式显示配置
  const displayConfig = getFooterDisplayConfig(terminalWidth);

  // 计算显示内容
  const contextPercentage = ((1 - percentage) * 100).toFixed(1);
  const versionDisplay = version ? getShortVersion(version, displayConfig.showNodeVersion) : null;
  const contextDisplay = getContextDisplay(contextPercentage, displayConfig.simplifyContext);
  const modelDisplay = getModelDisplayName(model, config);
  const modelShortDisplay = getShortModelName(modelDisplay, displayConfig.simplifyModel);

  return (
    <Box justifyContent="space-between" width="100%" marginTop={1}>
      <Box>
        {vimMode && <Text color={Colors.Gray}>[{vimMode}] </Text>}
        {nightly ? (
          <Gradient colors={Colors.GradientColors}>
            <Text>
              {shortenPath(tildeifyPath(targetDir), 70)}
              {branchName && <Text> ({branchName}*)</Text>}
            </Text>
          </Gradient>
        ) : (
          <Text color={Colors.LightBlue}>
            {shortenPath(tildeifyPath(targetDir), 70)}
            {branchName && <Text color={Colors.Gray}> ({branchName}*)</Text>}
          </Text>
        )}
        {debugMode && (
          <Text color={Colors.AccentRed}>
            {' ' + (debugMessage || '--debug')}
          </Text>
        )}
      </Box>

      {/* Middle Section: Centered Sandbox Info */}
      <Box
        flexGrow={1}
        alignItems="center"
        justifyContent="center"
        display="flex"
      >
        {process.env.SANDBOX && process.env.SANDBOX !== 'sandbox-exec' ? (
          <Text color="green">
            {process.env.SANDBOX.replace(/^gemini-(?:cli-)?/, '')}
          </Text>
        ) : process.env.SANDBOX === 'sandbox-exec' ? (
          <Text color={Colors.AccentYellow}>
            macOS Seatbelt{' '}
            <Text color={Colors.Gray}>({process.env.SEATBELT_PROFILE})</Text>
          </Text>
        ) : null}
      </Box>

      {/* Right Section: Version, Context Info and Console Summary */}
      <Box alignItems="center">
        {versionDisplay && (
          <Box>
            <Text color={Colors.Gray}>{versionDisplay}</Text>
            <Text color={Colors.Gray}> | </Text>
          </Box>
        )}
        {contextDisplay && (
          <Text color={Colors.Gray}>
            {contextDisplay}
          </Text>
        )}

        {/* Current Model Display */}
        {model && (
          <Box>
            {contextDisplay && <Text color={Colors.Gray}> | </Text>}
            {displayConfig.simplifyModel ? (
              <Text color={Colors.AccentBlue}>{modelShortDisplay}</Text>
            ) : (
              <Text color={Colors.AccentBlue}>{t('footer.current.model')}: {modelDisplay}</Text>
            )}
          </Box>
        )}

        {/* IDE Connection Status */}
        {ideConnectionStatus === IDEConnectionStatus.Connected && (
          <Box>
            <Text color={Colors.Gray}> | </Text>
            <Text color="green">{t('ide.connected')}</Text>
          </Box>
        )}

        {/* Corgi mode display disabled
        {corgiMode && (
          <Text>
            <Text color={Colors.Gray}>| </Text>
            <Text color={Colors.AccentRed}>▼</Text>
            <Text color={Colors.Foreground}>(´</Text>
            <Text color={Colors.AccentRed}>ᴥ</Text>
            <Text color={Colors.Foreground}>`)</Text>
            <Text color={Colors.AccentRed}>▼ </Text>
          </Text>
        )}
        */}
        {!showErrorDetails && errorCount > 0 && (
          <Box>
            <Text color={Colors.Gray}>| </Text>
            <ConsoleSummaryDisplay errorCount={errorCount} />
          </Box>
        )}
        {showMemoryUsage && <MemoryUsageDisplay />}
      </Box>
    </Box>
  );
};
