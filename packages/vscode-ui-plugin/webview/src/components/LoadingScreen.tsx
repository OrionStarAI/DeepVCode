/**
 * Loading Screen Component - Startup Loading Interface
 * Elegant loading screen with DeepV Code logo and progress bar
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React, { useEffect, useState } from 'react';
import { UpdatePrompt } from './UpdatePrompt';
import { getUpdateCheckService, UpdateCheckResponse } from '../services/updateCheckService';
import './LoadingScreen.css';

interface LoadingScreenProps {
  /** Additional CSS class name */
  className?: string;
  /** Callback when loading is complete and should proceed to main app */
  onLoadingComplete?: () => void;
  /** Callback when login is required */
  onLoginRequired?: (error?: string) => void;
  /** Callback when update is required */
  onUpdateRequired?: (updateInfo: UpdateCheckResponse, forceUpdate: boolean) => void;
}

/**
 * LoadingScreen - Startup Loading Interface Component
 *
 * 重新设计的启动协调器：
 * - 内部管理假进度条
 * - 并行执行登录检测和升级检测
 * - 等待两个检测都完成才决定下一步
 * - 根据检测结果决定进入登录页面、升级页面或主应用
 */
export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  className = '',
  onLoadingComplete,
  onLoginRequired,
  onUpdateRequired
}) => {
  // 🎯 内部进度条状态
  const [currentProgress, setCurrentProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState('Starting DeepV Code AI Assistant...');

  // 🎯 三个并行任务的状态
  const [loginCheckComplete, setLoginCheckComplete] = useState(false);
  const [updateCheckComplete, setUpdateCheckComplete] = useState(false);
  const [serviceInitComplete, setServiceInitComplete] = useState(false);
  
  // 🎯 检测结果
  const [loginResult, setLoginResult] = useState<{ isLoggedIn: boolean; error?: string } | null>(null);
  const [updateResult, setUpdateResult] = useState<{ updateInfo: UpdateCheckResponse; forceUpdate: boolean } | null>(null);

  const updateCheckService = getUpdateCheckService();

  // 🎯 1. 内部假进度条逻辑
  useEffect(() => {
    let progressTimer: NodeJS.Timeout;
    const startTime = Date.now();
    const maxDuration = 8000; // 8秒内到达95%
    const targetProgress = 95;

    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const progressRatio = Math.min(elapsed / maxDuration, 1);
      
      // 缓动函数
      const easedProgress = 1 - Math.pow(1 - progressRatio, 3);
      const newProgress = Math.floor(easedProgress * targetProgress);
      
      setCurrentProgress(newProgress);
      
      if (progressRatio < 1) {
        progressTimer = setTimeout(updateProgress, 150);
      }
    };

    updateProgress();

    return () => {
      if (progressTimer) {
        clearTimeout(progressTimer);
      }
    };
  }, []);

  // 🎯 2. 并行启动三个任务：登录检测、升级检测、服务初始化
  useEffect(() => {
    console.log('[LoadingScreen] 🚀 Starting parallel login, update, and service initialization...');
    
    // 🎯 A. 启动登录检测
    const startLoginCheck = async () => {
      try {
        setCurrentStage('Checking login status...');
        console.log('[LoadingScreen] 🔍 Starting login check...');
        
        const hasReceivedResponse = { current: false };
        
        const handleLoginResponse = (data: { isLoggedIn: boolean; error?: string }) => {
          console.log('[LoadingScreen] 📄 Login check result:', data);
          hasReceivedResponse.current = true;
          setLoginResult(data);
          setLoginCheckComplete(true);
        };

        // 监听登录状态响应
        const messageHandler = (event: MessageEvent) => {
          if (event.data?.type === 'login_status_response') {
            handleLoginResponse(event.data.payload);
            window.removeEventListener('message', messageHandler);
          }
        };
        
        window.addEventListener('message', messageHandler);
        
        // 发送登录检查请求
        if (window.vscode) {
          window.vscode.postMessage({
            type: 'login_check_status' as any,
            payload: {}
          });
        }
        
        // 清理函数
        // setTimeout(() => {
        //   window.removeEventListener('message', messageHandler);
        //   if (!hasReceivedResponse.current) {
        //     console.warn('[LoadingScreen] ⚠️ Login check timeout');
        //     setLoginResult({ isLoggedIn: false, error: 'Login check timeout' });
        //     setLoginCheckComplete(true);
        //   }
        // }, 10000);
        
      } catch (error) {
        console.error('[LoadingScreen] ❌ Login check failed:', error);
        setLoginResult({ isLoggedIn: false, error: 'Login check failed' });
        setLoginCheckComplete(true);
      }
    };

    // 🎯 B. 启动升级检测
    const startUpdateCheck = async () => {
      try {
        setCurrentStage('Checking for updates...');
        console.log('[LoadingScreen] 🔍 Starting update check...');

        const handleMessage = (event: MessageEvent) => {
          if (event.data?.type === 'extension_version_response') {
            const version = event.data.payload?.version;
            console.log('[LoadingScreen] 📦 Received extension version:', version);

            if (version) {
              updateCheckService.setCurrentVersion(version);
              performUpdateCheck(version);
            } else {
              console.warn('[LoadingScreen] ⚠️ No version received');
              setUpdateCheckComplete(true);
            }
          }
        };

        const performUpdateCheck = async (version: string) => {
          try {
            if (!updateCheckService.shouldCheckForUpdates()) {
              console.log('[LoadingScreen] ⏭️ Skipping update check');
              setUpdateCheckComplete(true);
              return;
            }

            const updateResult = await updateCheckService.checkForUpdates();
            console.log('[LoadingScreen] 📋 Update check response:', updateResult);

            if (updateResult && updateResult.hasUpdate) {
              const shouldShow = updateCheckService.shouldShowUpdatePrompt(updateResult);
              if (shouldShow) {
                console.log('[LoadingScreen] ✅ Update available, will show prompt');
                setUpdateResult({ 
                  updateInfo: updateResult, 
                  forceUpdate: updateResult.forceUpdate 
                });
              }
            }
            
            setUpdateCheckComplete(true);
          } catch (error) {
            console.error('[LoadingScreen] ❌ Update check failed:', error);
            setUpdateCheckComplete(true);
          }
        };

        window.addEventListener('message', handleMessage);

        // 请求扩展版本号
        if (window.vscode) {
          window.vscode.postMessage({
            type: 'get_extension_version',
            payload: {}
          });
        } else {
          console.error('[LoadingScreen] ❌ VSCode API not available');
          setUpdateCheckComplete(true);
        }

        // 超时处理
        setTimeout(() => {
          window.removeEventListener('message', handleMessage);
          if (!updateCheckComplete) {
            console.warn('[LoadingScreen] ⚠️ Update check timeout');
            setUpdateCheckComplete(true);
          }
        }, 15000);

      } catch (error) {
        console.error('[LoadingScreen] ❌ Update check initialization failed:', error);
        setUpdateCheckComplete(true);
      }
    };

    // 🎯 C. 启动服务初始化
    const startServiceInit = async () => {
      try {
        setCurrentStage('Initializing services...');
        console.log('[LoadingScreen] 🔍 Starting service initialization...');

        const handleMessage = (event: MessageEvent) => {
          if (event.data?.type === 'service_initialization_done') {
            console.log('[LoadingScreen] ✅ Service initialization completed');
            setServiceInitComplete(true);
            window.removeEventListener('message', handleMessage);
          }
        };

        window.addEventListener('message', handleMessage);

        // 发送服务初始化请求
        if (window.vscode) {
          window.vscode.postMessage({
            type: 'start_services' as any,
            payload: {}
          });
        } else {
          console.error('[LoadingScreen] ❌ VSCode API not available');
          setServiceInitComplete(true);
        }

        // 超时处理
        // setTimeout(() => {
        //   window.removeEventListener('message', handleMessage);
        //   if (!serviceInitComplete) {
        //     console.warn('[LoadingScreen] ⚠️ Service initialization timeout');
        //     setServiceInitComplete(true);
        //   }
        // }, 20000); // 20秒超时

      } catch (error) {
        console.error('[LoadingScreen] ❌ Service initialization failed:', error);
        setServiceInitComplete(true);
      }
    };

    // 🎯 D. 并行执行三个任务
    startLoginCheck();
    startUpdateCheck();
    startServiceInit();
  }, [updateCheckService]);

  // 🎯 3. 当三个任务都完成时，决定下一步
  useEffect(() => {
    if (loginCheckComplete && updateCheckComplete && serviceInitComplete) {
      console.log('[LoadingScreen] ✅ All three tasks completed:', { 
        loginResult, 
        updateResult, 
        serviceInitComplete 
      });
      
      setCurrentStage('Finalizing...');
      setCurrentProgress(100);

      // 延迟一下让用户看到100%
      setTimeout(() => {
        // 🎯 优先级：升级 > 登录 > 主应用
        if (updateResult) {
          console.log('[LoadingScreen] 🔄 Redirecting to update prompt');
          onUpdateRequired?.(updateResult.updateInfo, updateResult.forceUpdate);
        } else if (loginResult && !loginResult.isLoggedIn) {
          console.log('[LoadingScreen] 🔄 Redirecting to login');
          onLoginRequired?.(loginResult.error);
        } else {
          console.log('[LoadingScreen] 🔄 Redirecting to main app');
          onLoadingComplete?.();
        }
      }, 500);
    }
  }, [loginCheckComplete, updateCheckComplete, serviceInitComplete, loginResult, updateResult, onLoadingComplete, onLoginRequired, onUpdateRequired]);

  return (
    <div className={`loading-screen ${className}`}>
      <div className="loading-screen__container">
        {/* Logo区域 */}
        <div className="loading-screen__logo">
          <div className="loading-screen__logo-icon">
            <div className="loading-screen__logo-shape">
              <div className="loading-screen__logo-inner">
                <span>DV</span>
              </div>
            </div>
          </div>
          <div className="loading-screen__logo-text">
            <h1 className="loading-screen__title">DeepV Code</h1>
            <p className="loading-screen__subtitle">AI Assistant</p>
          </div>
        </div>

        {/* 加载状态 */}
        <div className="loading-screen__status">
          <div className="loading-screen__stage">
            {currentStage}
          </div>
          <div className="loading-screen__progress">
            <div className="loading-screen__progress-bar">
              <div
                className="loading-screen__progress-fill"
                style={{
                  width: `${Math.min(currentProgress, 100)}%`,
                  transition: 'width 0.4s ease-out',
                  transformOrigin: 'left center'
                }}
              />
            </div>
            <div className="loading-screen__progress-text">
              {Math.round(currentProgress)}%
            </div>
          </div>
        </div>

        {/* 加载动画点 */}
        <div className="loading-screen__dots">
          <span className="loading-screen__dot loading-screen__dot--1">.</span>
          <span className="loading-screen__dot loading-screen__dot--2">.</span>
          <span className="loading-screen__dot loading-screen__dot--3">.</span>
        </div>
      </div>
    </div>
  );
};