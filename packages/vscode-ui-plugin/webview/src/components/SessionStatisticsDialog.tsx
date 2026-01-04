/**
 * Session Statistics Dialog Component
 * 会话统计对话框组件
 *
 * 展示当前会话的积分消耗、Token 使用情况以及各模型的调用统计
 * 支持切换到积分概览标签页查看用户总体积分信息
 */

import React, { useMemo, useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { ChatMessage } from '../types';
import { X, BarChart2, Zap, TrendingUp, Info, Wallet, ExternalLink } from 'lucide-react';
import './SessionStatisticsDialog.css';

export interface UserStats {
  /** 总额度（估算） */
  totalQuota: number;
  /** 已使用积分 */
  usedCredits: number;
  /** 剩余积分（估算） */
  remainingCredits: number;
  /** 使用百分比 */
  usagePercentage: number;
}

interface ModelStatEntry {
  modelId: string;
  displayName: string;
  calls: number;
  tokens: number;
  credits: number;
}

type TabType = 'session' | 'points';

interface SessionStatisticsDialogProps {
  /** 是否显示对话框 */
  isOpen: boolean;
  /** 关闭对话框回调 */
  onClose: () => void;
  /** 当前会话的消息列表 */
  messages: ChatMessage[];
  /** 模型 ID 到显示名称的映射 */
  modelNameMap?: Record<string, string>;
}

export const SessionStatisticsDialog: React.FC<SessionStatisticsDialogProps> = ({
  isOpen,
  onClose,
  messages,
  modelNameMap = {}
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('session');
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  // 加载用户积分统计 - 通过消息通信
  useEffect(() => {
    if (isOpen && activeTab === 'points' && !userStats) {
      setIsLoadingStats(true);
      setStatsError(null);

      // 向 Extension 请求用户积分数据
      window.vscode.postMessage({
        type: 'request_user_stats',
        payload: {}
      });
    }
  }, [isOpen, activeTab, userStats]);

  // 监听用户积分响应
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'user_stats_response') {
        setIsLoadingStats(false);
        if (message.payload.error) {
          setStatsError(message.payload.error);
        } else {
          setUserStats(message.payload.stats);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  // 重置状态当对话框关闭时
  useEffect(() => {
    if (!isOpen) {
      setActiveTab('session');
      setUserStats(null);
      setStatsError(null);
    }
  }, [isOpen]);

  // 计算统计数据
  const stats = useMemo(() => {
    let totalCredits = 0;
    let totalTokens = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const modelMap = new Map<string, ModelStatEntry>();

    messages.forEach(msg => {
      // 只统计助手消息且带有 token 使用情况的
      if (msg.type === 'assistant' && msg.tokenUsage && typeof msg.tokenUsage === 'object') {
        const usage = msg.tokenUsage;

        // 🎯 P2 修复：使用 ?? 确保即使值为 0 也能正确处理，并增强防御性
        const credits = usage.creditsUsage ?? 0;
        const tokens = usage.totalTokens ?? 0;
        const inputTokens = usage.inputTokens ?? 0;
        const outputTokens = usage.outputTokens ?? 0;

        totalCredits += credits;
        totalTokens += tokens;
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;

        // 🎯 P1 修复：增强模型查找逻辑和回退机制
        // 标准化 ID 以提高匹配率
        const modelId = (msg.modelName || 'auto').toLowerCase();

        // 多层级查找显示名称
        let displayName = modelNameMap[modelId] ||
                         modelNameMap[msg.modelName || ''] ||
                         msg.modelName;

        // 最终回退
        if (!displayName) {
          displayName = modelId === 'auto' ? 'Auto' : (msg.modelName || modelId);
        }

        const existing = modelMap.get(modelId);
        if (existing) {
          existing.calls += 1;
          existing.tokens += tokens;
          existing.credits += credits;
        } else {
          modelMap.set(modelId, {
            modelId,
            displayName,
            calls: 1,
            tokens,
            credits
          });
        }
      }
    });

    return {
      totalCredits,
      totalTokens,
      totalInputTokens,
      totalOutputTokens,
      modelStats: Array.from(modelMap.values()).sort((a, b) => b.credits - a.credits)
    };
  }, [messages, modelNameMap]);

  if (!isOpen) return null;

  // 格式化积分数字
  const formatCredits = (value: number): string => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toFixed(0);
  };

  return (
    <div className="stats-dialog-backdrop" onClick={onClose}>
      <div className="stats-dialog" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="stats-dialog-header">
          <div className="stats-dialog-title">
            <BarChart2 size={18} />
            <span>{t('stats.title')}</span>
          </div>
          <button className="stats-dialog-close" onClick={onClose} title={t('common.close')}>
            <X size={18} />
          </button>
        </div>

        {/* 标签切换 */}
        <div className="stats-tabs">
          <button
            className={`stats-tab ${activeTab === 'session' ? 'active' : ''}`}
            onClick={() => setActiveTab('session')}
          >
            {t('stats.sessionTab')}
          </button>
          <button
            className={`stats-tab ${activeTab === 'points' ? 'active' : ''}`}
            onClick={() => setActiveTab('points')}
          >
            {t('stats.pointsTab')}
          </button>
        </div>

        {/* 主体 */}
        <div className="stats-dialog-body">
          {/* 会话统计标签页 */}
          {activeTab === 'session' && (
            <>
              {/* 总览卡片 */}
              <div className="stats-summary-grid">
            <div className="stats-summary-card">
              <div className="stats-card-header">
                <div className="stats-card-icon">
                  <Zap size={14} />
                </div>
                <div className="stats-card-label">{t('stats.totalConsumption')}</div>
              </div>
              <div className="stats-card-value">
                {stats.totalCredits.toFixed(3)}
                <span className="stats-unit">credits</span>
              </div>
            </div>

            <div className="stats-summary-card">
              <div className="stats-card-header">
                <div className="stats-card-icon">
                  <TrendingUp size={14} />
                </div>
                <div className="stats-card-label">{t('stats.totalTokens')}</div>
              </div>
              <div className="stats-card-value">
                {stats.totalTokens.toLocaleString()}
                <span className="stats-unit">tokens</span>
              </div>
            </div>
          </div>

          {/* 详细 Token 拆分 */}
          <div className="stats-token-breakdown">
             <div className="token-item">
                <span className="token-label">{t('tokenUsage.input')}</span>
                <span className="token-value">{stats.totalInputTokens.toLocaleString()}</span>
             </div>
             <div className="token-item">
                <span className="token-label">{t('tokenUsage.output')}</span>
                <span className="token-value">{stats.totalOutputTokens.toLocaleString()}</span>
             </div>
          </div>

          {/* 模型统计列表 */}
          <div className="stats-section">
            <h3 className="stats-section-title">
              {t('stats.modelStats')}
            </h3>

            {stats.modelStats.length > 0 ? (
              <div className="stats-table-container">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th className="text-left">{t('stats.modelName')}</th>
                      <th className="text-right">{t('stats.callCount')}</th>
                      <th className="text-right">{t('stats.avgTokens')}</th>
                      <th className="text-right">{t('stats.consumption')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.modelStats.map((stat) => (
                      <tr key={stat.modelId}>
                        <td className="text-left font-medium">{stat.displayName}</td>
                        <td className="text-right">{stat.calls}</td>
                        <td className="text-right">
                          {Math.round(stat.tokens / stat.calls).toLocaleString()}
                        </td>
                        <td className="text-right credits-value">
                          {stat.credits.toFixed(3)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="stats-empty">
                <Info size={32} />
                <p>{t('stats.noData')}</p>
              </div>
            )}
          </div>
            </>
          )}

          {/* 积分概览标签页 */}
          {activeTab === 'points' && (
            <>
              {isLoadingStats ? (
                <div className="stats-loading">
                  <Info size={32} />
                  <p>{t('stats.loading')}</p>
                </div>
              ) : statsError ? (
                <div className="stats-error">
                  <Info size={32} />
                  <p>{t('stats.loadError')}</p>
                  <button
                    className="stats-retry-button"
                    onClick={() => {
                      setUserStats(null);
                      setStatsError(null);
                    }}
                  >
                    {t('stats.retry')}
                  </button>
                </div>
              ) : userStats ? (
                <>
                  {/* 积分概览标题 */}
                  <div className="points-overview-header">
                    <h3 className="points-overview-title">
                      {t('stats.pointsOverviewTitle')}
                    </h3>
                  </div>

                  {/* 积分卡片 */}
                  <div className="points-cards-grid">
                    <div className="points-card">
                      <div className="points-card-label">{t('stats.totalQuota')}</div>
                      <div className="points-card-value">
                        {formatCredits(userStats.totalQuota)}
                      </div>
                    </div>

                    <div className="points-card">
                      <div className="points-card-label">{t('stats.usedCredits')}</div>
                      <div className="points-card-value used">
                        {formatCredits(userStats.usedCredits)}
                      </div>
                    </div>

                    <div className="points-card">
                      <div className="points-card-label">{t('stats.remainingCredits')}</div>
                      <div className="points-card-value remaining">
                        {formatCredits(userStats.remainingCredits)}
                      </div>
                    </div>
                  </div>

                  {/* 进度条 */}
                  <div className="points-progress-section">
                    <div className="points-progress-bar">
                      <div
                        className="points-progress-fill"
                        style={{ width: `${Math.min(userStats.usagePercentage, 100)}%` }}
                      />
                    </div>
                    <div className="points-progress-label">
                      {userStats.usagePercentage.toFixed(1)}%
                    </div>
                  </div>
                </>
              ) : (
                <div className="stats-empty">
                  <Wallet size={32} />
                  <p>{t('stats.noPointsData')}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
