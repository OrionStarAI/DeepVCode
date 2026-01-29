/**
 * Agent Style Setting Item Component
 * Agent 风格设置项组件
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import './SettingItem.css';

// =============================================================================
// Agent Style 类型定义
// =============================================================================

export type AgentStyle = 'default' | 'codex' | 'cursor' | 'augment' | 'claude-code' | 'antigravity' | 'windsurf';

// =============================================================================
// Agent Style 配置项
// =============================================================================

interface AgentStyleOption {
  value: AgentStyle;
  icon: string;
  labelKey: string;
  descriptionKey: string;
}

const AGENT_STYLE_OPTIONS: AgentStyleOption[] = [
  {
    value: 'default',
    icon: '𝓥',
    labelKey: 'settings.agentStyle.default.label',
    descriptionKey: 'settings.agentStyle.default.description'
  },
  {
    value: 'codex',
    icon: '⚡',
    labelKey: 'settings.agentStyle.codex.label',
    descriptionKey: 'settings.agentStyle.codex.description'
  },
  {
    value: 'cursor',
    icon: '↗️',
    labelKey: 'settings.agentStyle.cursor.label',
    descriptionKey: 'settings.agentStyle.cursor.description'
  },
  {
    value: 'augment',
    icon: '🚀',
    labelKey: 'settings.agentStyle.augment.label',
    descriptionKey: 'settings.agentStyle.augment.description'
  },
  {
    value: 'claude-code',
    icon: '✳️',
    labelKey: 'settings.agentStyle.claudeCode.label',
    descriptionKey: 'settings.agentStyle.claudeCode.description'
  },
  {
    value: 'antigravity',
    icon: '🌈',
    labelKey: 'settings.agentStyle.antigravity.label',
    descriptionKey: 'settings.agentStyle.antigravity.description'
  },
  {
    value: 'windsurf',
    icon: '🌊',
    labelKey: 'settings.agentStyle.windsurf.label',
    descriptionKey: 'settings.agentStyle.windsurf.description'
  }
];

// =============================================================================
// 组件接口
// =============================================================================

interface AgentStyleSettingItemProps {
  /** 唯一标识符 */
  id: string;
  /** 标签文本 */
  label: string;
  /** 描述文本（可选） */
  description?: string;
  /** 当前值 */
  value: AgentStyle;
  /** 值改变回调 */
  onChange: (value: AgentStyle) => void;
  /** 是否禁用 */
  disabled?: boolean;
}

// =============================================================================
// 组件实现
// =============================================================================

export const AgentStyleSettingItem: React.FC<AgentStyleSettingItemProps> = ({
  id,
  label,
  description,
  value,
  onChange,
  disabled = false
}) => {
  const { t } = useTranslation();

  const handleChange = (newValue: AgentStyle) => {
    if (!disabled && newValue !== value) {
      onChange(newValue);
    }
  };

  return (
    <div className="setting-item">
      {/* 标签和描述 */}
      <div className="setting-item__header">
        <label htmlFor={id} className="setting-item__label">
          {label}
        </label>
        {description && (
          <p className="setting-item__description">
            {description}
          </p>
        )}
      </div>

      {/* Agent Style 选项卡 */}
      <div className="agent-style-grid">
        {AGENT_STYLE_OPTIONS.map((option) => {
          const isSelected = value === option.value;
          const optionLabel = t(option.labelKey);
          const optionDescription = t(option.descriptionKey);

          return (
            <div
              key={option.value}
              className={`agent-style-card ${isSelected ? 'agent-style-card--selected' : ''} ${disabled ? 'agent-style-card--disabled' : ''}`}
              onClick={() => handleChange(option.value)}
              role="button"
              tabIndex={disabled ? -1 : 0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleChange(option.value);
                }
              }}
              aria-label={`${optionLabel}: ${optionDescription}`}
            >
              {/* 图标 */}
              <div className="agent-style-card__icon">
                {option.icon}
              </div>

              {/* 标题 */}
              <div className="agent-style-card__title">
                {optionLabel}
              </div>

              {/* 描述 */}
              <div className="agent-style-card__description">
                {optionDescription}
              </div>

              {/* 选中指示器 */}
              {isSelected && (
                <div className="agent-style-card__indicator">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="8" fill="currentColor" />
                    <path
                      d="M11.5 5.5L7 10L4.5 7.5"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Codex 特别提示 */}
      {value === 'codex' && (
        <div className="agent-style-note">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 4v5M8 11v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span>{t('settings.agentStyle.codex.yoloNote')}</span>
        </div>
      )}
    </div>
  );
};
