/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
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
  customProxyUrl?: string,
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

        // 如果是代理认证，检查本地用户信息
        if (authType === AuthType.USE_PROXY_AUTH) {
          try {
            const { ProxyAuthManager } = await import('deepv-code-core');
            const proxyAuthManager = ProxyAuthManager.getInstance();

            // 检查是否已有用户信息（从本地文件自动加载）
            const userInfo = proxyAuthManager.getUserInfo();
            if (userInfo) {
              console.log(`🔄 Logged in user: ${userInfo.name} (${userInfo.email || userInfo.openId || 'N/A'})`);
            }
          } catch (error) {
            console.warn('⚠️ 恢复用户信息失败:', error);
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
  }, [isLoginDialogOpen, settings, config, setLoginError, openLoginDialog, customProxyUrl]);

  const handleLoginSelect = useCallback(
    async (authType: AuthType | undefined, scope: SettingScope) => {
      if (authType) {
        settings.setValue(scope, 'selectedAuthType', authType);

        if (authType === AuthType.USE_PROXY_AUTH) {
          console.log('🤖 使用代理认证，服务端将自动选择最佳模型');
        }

        // Browser launch suppression only applied to Google OAuth, not proxy auth
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
