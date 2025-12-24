/**
 * Session Statistics Dialog Component
 * 会话统计对话框组件
 *
 * 展示当前会话的积分消耗、Token 使用情况以及各模型的调用统计
 */

import React, { useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { ChatMessage } from '../types';
import { X, BarChart2, Zap, TrendingUp, Info } from 'lucide-react';
import './SessionStatisticsDialog.css';

interface ModelStatEntry {
  modelId: string;
  displayName: string;
  calls: number;
  tokens: number;
  credits: number;
}

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

  // 计算统计数据
  const stats = useMemo(() => {
    let totalCredits = 0;
    let totalTokens = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const modelMap = new Map<string, ModelStatEntry>();

    messages.forEach(msg => {
      // 只统计助手消息且带有 token 使用情况的
      if (msg.type === 'assistant' && msg.tokenUsage) {
        const usage = msg.tokenUsage;
        const credits = usage.creditsUsage || 0;
        const tokens = usage.totalTokens || 0;

        totalCredits += credits;
        totalTokens += tokens;
        totalInputTokens += usage.inputTokens || 0;
        totalOutputTokens += usage.outputTokens || 0;

        const modelId = msg.modelName || 'auto';
        const displayName = modelNameMap[modelId] || modelId;

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

        {/* 主体 */}
        <div className="stats-dialog-body">
          {/* 总览卡片 */}
          <div className="stats-summary-grid">
            <div className="stats-summary-card highlights">
              <div className="stats-card-icon">
                <Zap size={20} />
              </div>
              <div className="stats-card-content">
                <div className="stats-card-label">{t('stats.totalConsumption')}</div>
                <div className="stats-card-value">
                  {stats.totalCredits.toFixed(3)}
                  <span className="stats-unit">credits</span>
                </div>
              </div>
            </div>

            <div className="stats-summary-card">
              <div className="stats-card-icon">
                <TrendingUp size={20} />
              </div>
              <div className="stats-card-content">
                <div className="stats-card-label">{t('stats.totalTokens')}</div>
                <div className="stats-card-value">
                  {stats.totalTokens.toLocaleString()}
                  <span className="stats-unit">tokens</span>
                </div>
              </div>
            </div>
          </div>

          {/* 详细 Token 拆分 */}
          <div className="stats-token-breakdown">
             <div className="token-item">
                <span className="token-label">{t('tokenUsage.input')}:</span>
                <span className="token-value">{stats.totalInputTokens.toLocaleString()}</span>
             </div>
             <div className="token-item">
                <span className="token-label">{t('tokenUsage.output')}:</span>
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
        </div>

        {/* 底部 */}
        <div className="stats-dialog-footer">
          <button className="stats-button-primary" onClick={onClose}>
            {t('common.ok')}
          </button>
        </div>
      </div>
    </div>
  );
};
