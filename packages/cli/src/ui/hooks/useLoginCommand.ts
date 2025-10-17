/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import {
  AuthType,
  Config,
  SceneManager,
  SceneType,
  getErrorMessage,
} from 'deepv-code-core';
import { runExitCleanup } from '../../utils/cleanup.js';

export const useLoginCommand = (
  settings: LoadedSettings,
  setLoginError: (error: string | null) => void,
  config: Config,
  setCurrentModel?: (model: string) => void,
) => {
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false);

  const openLoginDialog = useCallback(() => {
    setIsLoginDialogOpen(true);
  }, []);

  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    const loginFlow = async () => {
      const authType = settings.merged.selectedAuthType;
      if (isLoginDialogOpen || !authType) {
        return;
      }

      try {
        setIsAuthenticating(true);

        // 如果是 Cheeth OA 认证，先从设置中恢复飞书 token
        if (authType === AuthType.USE_CHEETH_OA) {
          try {
            const { ProxyAuthManager } = await import('deepv-code-core');
            const proxyAuthManager = ProxyAuthManager.getInstance();

            // 检查是否已有用户信息（从本地文件自动加载）
            const userInfo = proxyAuthManager.getUserInfo();
            if (userInfo) {
              console.log(`🔄 已登录用户: ${userInfo.name} (${userInfo.email || userInfo.openId || 'N/A'})`);
            }
          } catch (error) {
            console.warn('⚠️ 恢复飞书token失败:', error);
          }
        }

        await config.refreshAuth(authType);
        console.log(`Authenticated via "${authType}".`);
      } catch (e) {
        setLoginError(`Failed to login. Message: ${getErrorMessage(e)}`);
        openLoginDialog();
      } finally {
        setIsAuthenticating(false);
      }
    };

    void loginFlow();
  }, [isLoginDialogOpen, settings, config, setLoginError, openLoginDialog]);

  const handleLoginSelect = useCallback(
    async (authType: AuthType | undefined, scope: SettingScope) => {
      if (authType) {
        settings.setValue(scope, 'selectedAuthType', authType);

        if (authType === AuthType.USE_CHEETH_OA) {
          console.log('🤖 使用Cheeth OA认证，服务端将自动选择最佳模型');
        }

        // Browser launch suppression only applied to Google OAuth, not Cheeth OA
        if (false) {
          runExitCleanup();
          console.log(
            `
----------------------------------------------------------------
Logging in with Google... Please restart DeepV Code CLI to continue.
----------------------------------------------------------------
            `,
          );
          process.exit(0);
        }
      }
      // Delay closing the dialog to prevent the Enter key from being processed by InputPrompt
      setImmediate(() => {
        setIsLoginDialogOpen(false);
      });
      setLoginError(null);
    },
    [settings, setLoginError, config, setCurrentModel],
  );

  const cancelAuthentication = useCallback(() => {
    setIsAuthenticating(false);
  }, []);

  return {
    isLoginDialogOpen,
    openLoginDialog,
    handleLoginSelect,
    isAuthenticating,
    cancelAuthentication,
  };
};
