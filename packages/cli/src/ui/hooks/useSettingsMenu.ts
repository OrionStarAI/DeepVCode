/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import { Config } from 'deepv-code-core';
import { LoadedSettings } from '../../config/settings.js';

export interface UseSettingsMenuReturn {
  isSettingsMenuDialogOpen: boolean;
  openSettingsMenuDialog: () => void;
  closeSettingsMenuDialog: () => void;
}

/**
 * Hook for managing the settings menu dialog state
 */
export const useSettingsMenu = (): UseSettingsMenuReturn => {
  const [isSettingsMenuDialogOpen, setIsSettingsMenuDialogOpen] = useState(false);

  const openSettingsMenuDialog = useCallback(() => {
    setIsSettingsMenuDialogOpen(true);
  }, []);

  const closeSettingsMenuDialog = useCallback(() => {
    setIsSettingsMenuDialogOpen(false);
  }, []);

  return {
    isSettingsMenuDialogOpen,
    openSettingsMenuDialog,
    closeSettingsMenuDialog,
  };
};
