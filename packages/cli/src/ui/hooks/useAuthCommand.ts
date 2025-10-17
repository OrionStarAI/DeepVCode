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

export const useAuthCommand = (
  settings: LoadedSettings,
  setAuthError: (error: string | null) => void,
  config: Config,
  setCurrentModel?: (model: string) => void,
) => {
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(
    settings.merged.selectedAuthType === undefined,
  );

  const openAuthDialog = useCallback(() => {
    setIsAuthDialogOpen(true);
  }, []);

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isPreparingEnvironment, setIsPreparingEnvironment] = useState(false);
  const [startupAuthCheckCompleted, setStartupAuthCheckCompleted] = useState(false);

  // 启动时检查认证状态
  useEffect(() => {
    const checkAuthOnStartup = async () => {
      const authType = settings.merged.selectedAuthType;

      // 如果没有设置认证类型，直接标记检查完成
      if (!authType) {
        setStartupAuthCheckCompleted(true);
        return;
      }

      // 如果认证对话框已经打开，跳过检查
      if (isAuthDialogOpen) {
        setStartupAuthCheckCompleted(true);
        return;
      }

      try {
        console.log('🔍 [AuthCommand] 启动时检查认证状态...');

        // 对于 Cheeth OA 认证，检查本地用户信息
        if (authType === AuthType.USE_CHEETH_OA) {
          const { ProxyAuthManager } = await import('deepv-code-core');
          const proxyAuthManager = ProxyAuthManager.getInstance();
          const userInfo = proxyAuthManager.getUserInfo();

          if (!userInfo) {
            console.log('🚨 [AuthCommand] 启动时发现认证过期，显示认证对话框');
            openAuthDialog();
          } else {
            console.log(`✅ [AuthCommand] 启动时认证检查通过: ${userInfo.name}`);
          }
        } else {
          // 对于其他认证类型，尝试简单的认证刷新来检查状态
          try {
            await config.refreshAuth(authType);
            console.log('✅ [AuthCommand] 启动时认证检查通过');
          } catch (error) {
            console.log('🚨 [AuthCommand] 启动时发现认证过期，显示认证对话框');
            openAuthDialog();
          }
        }
      } catch (error) {
        console.warn('⚠️ [AuthCommand] 启动时认证检查失败:', error);
        // 认证检查失败时，不强制显示对话框，等用户操作时再处理
      } finally {
        setStartupAuthCheckCompleted(true);
      }
    };

    // 只在首次启动时执行认证检查
    if (!startupAuthCheckCompleted) {
      void checkAuthOnStartup();
    }
  }, [isAuthDialogOpen, settings.merged.selectedAuthType, startupAuthCheckCompleted, config, setAuthError, openAuthDialog]);

  useEffect(() => {
    const authFlow = async () => {
      const authType = settings.merged.selectedAuthType;
      if (isAuthDialogOpen || !authType || !startupAuthCheckCompleted) {
        return;
      }

      // 如果没有配置主题，等待主题配置完成后再开始认证流程
      if (!settings.merged.theme) {
        console.log('🔄 [AuthCommand] 等待主题配置完成后再开始认证流程');
        return;
      }

      // 🚀 启动优化: 延迟认证刷新，不阻塞CLI界面
      // 策略：启动时只检查认证状态，不立即刷新
      // 真正的认证刷新会在用户发送第一个消息时进行
      // 这样可以让CLI界面立即可用，提升用户体验

      try {
        // 如果是 Cheeth OA 认证，只需检查本地用户信息即可
        if (authType === AuthType.USE_CHEETH_OA) {
          try {
            const { ProxyAuthManager } = await import('deepv-code-core');
            const proxyAuthManager = ProxyAuthManager.getInstance();

            // 检查是否已有用户信息（从本地文件自动加载）
            const userInfo = proxyAuthManager.getUserInfo();
            if (userInfo) {
              console.log(`✅ 已登录用户: ${userInfo.name} (${userInfo.email || userInfo.openId || 'N/A'})`);
              // 有用户信息说明认证有效，不需要立即刷新
              return;
            }
          } catch (error) {
            console.warn('⚠️ 检查用户信息失败:', error);
            // 检查失败，可能需要重新认证，但不在启动时阻塞
            return;
          }
        }

        // 对于其他认证类型，也延迟到真正需要时再刷新
        // 这里只做最小化的状态检查
        console.log(`✅ 认证类型: ${authType} (将在首次使用时刷新)`);

      } catch (e) {
        console.warn('⚠️ 认证检查失败:', e);
        // 检查失败不影响CLI启动，用户发送消息时会重新认证
      }
    };

    void authFlow();
  }, [isAuthDialogOpen, settings, config, setAuthError, openAuthDialog, startupAuthCheckCompleted]);

  const handleAuthSelect = useCallback(
    async (authType: AuthType | undefined, scope: SettingScope) => {
      if (authType) {
        // clearCachedCredentialFile() - no longer needed for Cheeth OA auth

        settings.setValue(scope, 'selectedAuthType', authType);

        // ✅ 移除认证类型与模型的耦合 - 服务端内部决定模型
        // 客户端不再需要根据认证类型设置特定模型
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
        setIsAuthDialogOpen(false);
      });
      setAuthError(null);
    },
    [settings, setAuthError, config, setCurrentModel],
  );

  const cancelAuthentication = useCallback(() => {
    setIsAuthenticating(false);
    setIsPreparingEnvironment(false);
  }, []);

  // 监听客户端初始化状态，当初始化完成时停止环境准备状态
  useEffect(() => {
    if (isPreparingEnvironment) {
      const checkClientReady = () => {
        const client = config.getGeminiClient();
        if (client?.isInitialized?.()) {
          setIsPreparingEnvironment(false);
        } else {
          // 继续检查
          setTimeout(checkClientReady, 200);
        }
      };

      // 开始检查客户端状态
      setTimeout(checkClientReady, 300);
    }
  }, [isPreparingEnvironment, config]);

  return {
    isAuthDialogOpen,
    openAuthDialog,
    handleAuthSelect,
    isAuthenticating,
    isPreparingEnvironment,
    cancelAuthentication,
  };
};
