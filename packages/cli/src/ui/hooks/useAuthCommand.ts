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

export const useAuthCommand = (
  settings: LoadedSettings,
  setAuthError: (error: string | null) => void,
  config: Config,
  setCurrentModel?: (model: string) => void,
  customProxyUrl?: string,
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
        console.log('[AuthCommand] checking auth at startup...');

        // 对于代理认证，检查本地用户信息
        if (authType === AuthType.USE_PROXY_AUTH) {
          const { ProxyAuthManager } = await import('deepv-code-core');
          const proxyAuthManager = ProxyAuthManager.getInstance();
          const userInfo = proxyAuthManager.getUserInfo();

          if (!userInfo) {
            if (customProxyUrl) {
              console.log('[AuthCommand] Custom proxy URL configured, skipping auto-login dialog on startup');
            } else {
              console.log('[AuthCommand] auth expired at startup, opening auth dialog');
              openAuthDialog();
            }
          } else {
            console.log(`[AuthCommand] auth check passed: ${userInfo.name}`);
          }
        } else {
          // 对于其他认证类型，尝试简单的认证刷新来检查状态
          try {
            await config.refreshAuth(authType);
            console.log('[AuthCommand] auth check passed');
          } catch (error) {
            if (customProxyUrl) {
              console.log('[AuthCommand] Custom proxy URL configured, skipping auto-login dialog on startup');
            } else {
              console.log('[AuthCommand] auth expired at startup, opening auth dialog');
              openAuthDialog();
            }
          }
        }
      } catch (error) {
        console.warn('[AuthCommand] auth check at startup failed:', error);
        // 认证检查失败时，不强制显示对话框，等用户操作时再处理
      } finally {
        setStartupAuthCheckCompleted(true);
      }
    };

    // 只在首次启动时执行认证检查
    if (!startupAuthCheckCompleted) {
      void checkAuthOnStartup();
    }
  }, [isAuthDialogOpen, settings.merged.selectedAuthType, startupAuthCheckCompleted, config, setAuthError, openAuthDialog, customProxyUrl]);

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
        // 如果是代理认证，只需检查本地用户信息即可
        if (authType === AuthType.USE_PROXY_AUTH) {
          try {
            const { ProxyAuthManager } = await import('deepv-code-core');
            const proxyAuthManager = ProxyAuthManager.getInstance();

            // 检查是否已有用户信息（从本地文件自动加载）
            const userInfo = proxyAuthManager.getUserInfo();
            if (userInfo) {
              console.log(`✅ Logged in user: ${userInfo.name} (${userInfo.email || userInfo.openId || 'N/A'})`);
              // 有用户信息说明认证有效，不需要立即刷新
              return;
            }

            // 如果配置了自定义代理URL但没有JWT，设置一个占位符以允许GeminiClient初始化
            if (customProxyUrl) {
              console.log('[AuthCommand] Custom proxy URL configured without JWT - setting placeholder token for initialization');
              // 设置一个占位符JWT，允许client初始化，实际认证由代理处理
              const placeholderJwt = {
                accessToken: 'placeholder-token-for-custom-proxy',
                refreshToken: 'placeholder-refresh',
                expiresIn: 86400, // 24小时
                expiresAt: Date.now() + 86400 * 1000,
                savedAt: new Date().toISOString()
              };
              // 直接在ProxyAuthManager上设置JWT（需要查看是否有公共方法）
              // 暂时跳过，让用户通过 /auth 命令登录
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

  // 状态：是否处于"自定义模型专用"流程中
  const [isCustomModelOnlyMode, setIsCustomModelOnlyMode] = useState(false);

  // 处理"使用自定义模型"选项
  const handleUseCustomModel = useCallback(() => {
    console.log('[AuthCommand] User selected "Use Custom Model" option');
    // 关闭认证对话框
    setIsAuthDialogOpen(false);
    // 标记为自定义模型专用模式
    setIsCustomModelOnlyMode(true);
  }, []);

  // 重置自定义模型模式
  const resetCustomModelOnlyMode = useCallback(() => {
    setIsCustomModelOnlyMode(false);
  }, []);

  return {
    isAuthDialogOpen,
    openAuthDialog,
    handleAuthSelect,
    isAuthenticating,
    isPreparingEnvironment,
    cancelAuthentication,
    // 自定义模型专用模式相关
    handleUseCustomModel,
    isCustomModelOnlyMode,
    resetCustomModelOnlyMode,
  };
};
