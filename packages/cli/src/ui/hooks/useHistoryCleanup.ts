/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useCallback } from 'react';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { getHistoryDir, getDirectorySize, formatBytes } from '../../utils/historyUtils.js';
import * as fs from 'node:fs';
import { t, tp } from '../utils/i18n.js';

interface HistoryCleanupState {
  /** Whether the cleanup check is in progress */
  isChecking: boolean;
  /** Whether a cleanup prompt should be shown */
  needsCleanup: boolean;
  /** Size of the history directory in bytes */
  historySize: number;
  /** Formatted size string */
  historySizeFormatted: string;
}

interface UseHistoryCleanupReturn {
  state: HistoryCleanupState;
  /** Perform the cleanup */
  performCleanup: () => Promise<void>;
  /** Dismiss the cleanup prompt without cleaning */
  dismissCleanup: () => void;
}

/**
 * Hook to check and handle checkpoint history cleanup
 * This is a non-blocking alternative to the previous readline-based prompt
 */
export function useHistoryCleanup(settings: LoadedSettings): UseHistoryCleanupReturn {
  const [state, setState] = useState<HistoryCleanupState>({
    isChecking: true,
    needsCleanup: false,
    historySize: 0,
    historySizeFormatted: '',
  });

  // Check history size on mount
  useEffect(() => {
    const checkHistorySize = async () => {
      // Check if we've already checked within the last 7 days
      const lastCheck = settings.merged.lastHistoryCleanupCheck;
      const now = Date.now();
      const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;

      if (lastCheck && now - lastCheck < sevenDaysInMs) {
        setState(prev => ({ ...prev, isChecking: false }));
        return;
      }

      const historyDir = getHistoryDir();
      try {
        // Check if directory exists
        await fs.promises.access(historyDir);

        // Calculate size
        const size = await getDirectorySize(historyDir);
        const threshold = 2 * 1024 * 1024 * 1024; // 2GB

        if (size > threshold) {
          setState({
            isChecking: false,
            needsCleanup: true,
            historySize: size,
            historySizeFormatted: formatBytes(size),
          });
        } else {
          // Size is under threshold, record check timestamp
          settings.setValue(SettingScope.User, 'lastHistoryCleanupCheck', now);
          setState(prev => ({ ...prev, isChecking: false }));
        }
      } catch {
        // Directory doesn't exist or other error, skip silently
        setState(prev => ({ ...prev, isChecking: false }));
      }
    };

    // Delay the check to not block initial render
    const timer = setTimeout(checkHistorySize, 2000);
    return () => clearTimeout(timer);
  }, [settings]);

  const performCleanup = useCallback(async () => {
    const historyDir = getHistoryDir();
    try {
      await fs.promises.rm(historyDir, { recursive: true, force: true });
      settings.setValue(SettingScope.User, 'lastHistoryCleanupCheck', Date.now());
      setState(prev => ({
        ...prev,
        needsCleanup: false,
        historySize: 0,
        historySizeFormatted: '',
      }));
    } catch {
      // Cleanup failed, dismiss the prompt anyway
      setState(prev => ({ ...prev, needsCleanup: false }));
    }
  }, [settings]);

  const dismissCleanup = useCallback(() => {
    // User chose not to clean, record timestamp to avoid asking again
    settings.setValue(SettingScope.User, 'lastHistoryCleanupCheck', Date.now());
    setState(prev => ({ ...prev, needsCleanup: false }));
  }, [settings]);

  return {
    state,
    performCleanup,
    dismissCleanup,
  };
}
