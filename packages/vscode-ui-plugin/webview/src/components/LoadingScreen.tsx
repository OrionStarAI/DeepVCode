/**
 * Loading Screen Component - Startup Loading Interface
 * High-End "Quantum Core" Design
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React, { useEffect, useState, useRef } from 'react';
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
  const [currentStage, setCurrentStage] = useState('Initializing Neural Core...');
  const [isFadingOut, setIsFadingOut] = useState(false);

  // 🎯 三个并行任务的状态
  const [loginCheckComplete, setLoginCheckComplete] = useState(false);
  const [updateCheckComplete, setUpdateCheckComplete] = useState(false);
  const [serviceInitComplete, setServiceInitComplete] = useState(false);

  // 🎯 检测结果
  const [loginResult, setLoginResult] = useState<{ isLoggedIn: boolean; error?: string } | null>(null);
  const [updateResult, setUpdateResult] = useState<{ updateInfo: UpdateCheckResponse; forceUpdate: boolean } | null>(null);

  const updateCheckService = getUpdateCheckService();

  // 🎯 1. 统一的进度条动画控制逻辑
  useEffect(() => {
    let animationFrameId: number;
    const startTime = Date.now();
    const maxDuration = 12000; // 12秒内到达98%

    const animate = () => {
      const now = Date.now();
      const allTasksComplete = loginCheckComplete && updateCheckComplete && serviceInitComplete;

      setCurrentProgress(prev => {
        // 如果已经满了，停止
        if (prev >= 100) return 100;

        let nextProgress = prev;

        if (allTasksComplete) {
          // 🚀 任务完成：平滑冲刺模式
          // 目标 100，速度优雅且克制
          // 动态步长：剩余距离的 2% + 基础速度 0.1
          // 限制最大步长为 0.8 (每帧最多 0.8%)，确保不会瞬间跳变
          const remaining = 100 - prev;
          const step = Math.min(0.8, Math.max(0.1, remaining * 0.02));
          nextProgress = prev + step;

          if (nextProgress >= 99.8) nextProgress = 100;
        } else {
          // 🐢 任务未完成：慢速等待模式
          // 使用 Sine Ease In Out 算法，但在 12秒内到 98
          const elapsed = now - startTime;
          const progressRatio = Math.min(elapsed / maxDuration, 1);

          // Sine Ease In Out
          const easedProgress = 0.5 * (1 - Math.cos(progressRatio * Math.PI));
          const target = 98;

          // 计算理论上的当前进度
          const theoreticalProgress = easedProgress * target;

          // 确保进度单调递增，且不超过 98
          // 如果理论进度比当前快，就跟上；如果比当前慢（比如之前冲刺过），就保持
          if (theoreticalProgress > prev && theoreticalProgress < 98) {
             nextProgress = theoreticalProgress;
          } else if (prev < 98) {
             // 即使时间到了，如果还没到 98，也慢慢蹭过去?
             // 不，按时间算就行。如果时间到了就停在 98。
             // 但为了防止倒退，取 max
             nextProgress = Math.max(prev, theoreticalProgress);
             if (nextProgress > 98) nextProgress = 98;
          }
        }

        return nextProgress;
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrameId);
  }, [loginCheckComplete, updateCheckComplete, serviceInitComplete]);

  // 🎯 2. 并行启动三个任务：登录检测、升级检测、服务初始化
  useEffect(() => {
    console.log('[LoadingScreen] 🚀 Starting parallel login, update, and service initialization...');

    // 🎯 A. 启动登录检测
    const startLoginCheck = async () => {
      try {
        setCurrentStage('Authenticating Neural Link...');
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

      } catch (error) {
        console.error('[LoadingScreen] ❌ Login check failed:', error);
        setLoginResult({ isLoggedIn: false, error: 'Login check failed' });
        setLoginCheckComplete(true);
      }
    };

    // 🎯 B. 启动升级检测
    const startUpdateCheck = async () => {
      try {
        setCurrentStage('Syncing Knowledge Base...');
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
        setCurrentStage('Calibrating AI Models...');
        console.log('[LoadingScreen] 🔍 Starting service initialization...');

        const handleMessage = (event: MessageEvent) => {
          if (event.data?.type === 'service_initialization_done') {
            console.log('🔍 [DEBUG-UI-FLOW] [LoadingScreen] Received service_initialization_done');
            setServiceInitComplete(true);
            window.removeEventListener('message', handleMessage);
          } else if (event.data?.type === 'sessions_ready') {
            console.log('🔍 [DEBUG-UI-FLOW] [LoadingScreen] Received sessions_ready');
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

  // 🎯 3. 监听任务完成状态，更新文字
  useEffect(() => {
    if (loginCheckComplete && updateCheckComplete && serviceInitComplete) {
      setCurrentStage('System Ready.');
    }
  }, [loginCheckComplete, updateCheckComplete, serviceInitComplete]);

  // 🎯 4. 监听进度条到达 100%，执行跳转
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    if (currentProgress >= 100 && !hasCompletedRef.current) {
      console.log('🔍 [DEBUG-UI-FLOW] [LoadingScreen] Progress reached 100%, finalizing...');
      hasCompletedRef.current = true;

      // 立即触发淡出动画
      setIsFadingOut(true);

      // 延迟一下让淡出动画播放一小会儿，然后真正切换界面
      // 这样用户看到的是界面正在消失，而不是卡在 100%
      const timer = setTimeout(() => {
        // 🎯 优先级：升级 > 登录 > 主应用
        if (updateResult) {
          console.log('[LoadingScreen] 🔄 Redirecting to update prompt');
          onUpdateRequired?.(updateResult.updateInfo, updateResult.forceUpdate);
        } else if (loginResult && !loginResult.isLoggedIn) {
          console.log('[LoadingScreen] 🔄 Redirecting to login');
          onLoginRequired?.(loginResult.error);
        } else {
          console.log('🔍 [DEBUG-UI-FLOW] [LoadingScreen] Redirecting to main app');
          onLoadingComplete?.();
        }
      }, 300); // 300ms 淡出时间

      return () => clearTimeout(timer);
    }
  }, [currentProgress, loginResult, updateResult, onLoadingComplete, onLoginRequired, onUpdateRequired]);

  // SVG Circle Configuration
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (currentProgress / 100) * circumference;

  return (
    <div className={`loading-screen ${className} ${isFadingOut ? 'loading-screen--fadeout' : ''}`}>
      <div className="loading-screen__container">

        {/* Quantum Core Visualization */}
        <div className="quantum-core">
          {/* Decorative Rings */}
          <div className="quantum-core__ring quantum-core__ring--outer" />
          <div className="quantum-core__ring quantum-core__ring--inner" />

          {/* Progress Ring SVG */}
          <svg className="progress-ring__svg" width="160" height="160" viewBox="0 0 160 160">
            <circle
              className="progress-ring__circle-bg"
              cx="80"
              cy="80"
              r={radius}
            />
            <circle
              className="progress-ring__circle-fg"
              cx="80"
              cy="80"
              r={radius}
              style={{
                strokeDasharray: circumference,
                strokeDashoffset: strokeDashoffset
              }}
            />
          </svg>

          {/* Central Icon - Inline SVG from assets/icon.svg */}
          <svg
            className="quantum-core__icon"
            width="64"
            height="64"
            viewBox="0 0 256 256"
            fill="none"
            stroke="currentColor"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* 外框：圆角方形 */}
            <rect x="10" y="10" width="236" height="236" rx="44" strokeWidth="12" />

            {/* 左上角的 “>” */}
            <polyline points="58,56 82,70 58,84" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"/>

            {/* 光标短横（右下方，稍微低） */}
            <line x1="92" y1="90" x2="118" y2="90" strokeWidth="10" strokeLinecap="round"/>

            {/* 对勾感的 V：右边更长更高 */}
            <polyline points="72,140 128,220 200,120" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {/* Text Info */}
        <div className="loading-info">
          <h1 className="app-title">DeepV Code</h1>
          <div className="app-subtitle">for VS Code</div>

          <div className="status-text">
            {currentStage}
          </div>

          <div className="percentage-display">
            {Math.round(currentProgress)}%
          </div>
        </div>

      </div>
    </div>
  );
};