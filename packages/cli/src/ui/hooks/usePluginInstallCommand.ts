/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback } from 'react';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import { MessageType } from '../types.js';

/**
 * Hook to manage the plugin install dialog state
 */
export function usePluginInstallCommand(
  addItem: UseHistoryManagerReturn['addItem'],
) {
  const [isPluginInstallDialogOpen, setIsPluginInstallDialogOpen] = useState(false);

  const openPluginInstallDialog = useCallback(() => {
    setIsPluginInstallDialogOpen(true);
  }, []);

  const handlePluginInstallClose = useCallback((installed: boolean, message?: string) => {
    setIsPluginInstallDialogOpen(false);

    if (message) {
      addItem(
        {
          type: installed ? MessageType.INFO : MessageType.ERROR,
          text: message,
        },
        Date.now(),
      );
    }
  }, [addItem]);

  return {
    isPluginInstallDialogOpen,
    openPluginInstallDialog,
    handlePluginInstallClose,
  };
}
