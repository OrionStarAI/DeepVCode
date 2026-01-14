/**
 * Plan Mode Toggle Component
 * 计划模式开关 - 支持只讨论不改代码的纯规划模式
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React from 'react';
import { Lightbulb } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import './PlanModeToggle.css';

interface PlanModeToggleProps {
  isPlanMode: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export const PlanModeToggle: React.FC<PlanModeToggleProps> = ({
  isPlanMode,
  onToggle,
  disabled = false,
  className = ''
}) => {
  const { t } = useTranslation();

  const handleClick = () => {
    if (!disabled) {
      onToggle(!isPlanMode);
    }
  };

  return (
    <button
      className={`plan-mode-toggle ${isPlanMode ? 'active' : ''} ${className}`}
      onClick={handleClick}
      disabled={disabled}
      title={isPlanMode ? t('plan.mode.activeTooltip', {}, 'Plan mode active - exit to modify code') : t('plan.mode.inactiveTooltip', {}, 'Enable plan mode - read-only analysis')}
      aria-label="Plan mode toggle"
      aria-pressed={isPlanMode}
    >
      <Lightbulb size={16} stroke="currentColor" />
      {isPlanMode && <span className="plan-mode-badge">ON</span>}
    </button>
  );
};

export default PlanModeToggle;
