/**
 * Stream Recovery Overlay - Dynamic Island Edition (Refined Text)
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import './StreamRecoveryOverlay.css';

interface StreamRecoveryOverlayProps {
  /** 是否显示 */
  isVisible: boolean;
  /** 剩余秒数 */
  remaining: number;
  /** 总秒数 */
  total: number;
}

/**
 * StreamRecoveryOverlay - 灵动岛胶囊版 (语义增强型)
 */
export const StreamRecoveryOverlay: React.FC<StreamRecoveryOverlayProps> = ({
  isVisible,
  remaining,
  total
}) => {
  const { t } = useTranslation();

  if (!isVisible) return null;

  // 动态状态文本：前3秒告知原因，之后显示恢复状态
  const getStatusText = () => {
    if (remaining > total - 3) return t('streamRecovery.jitter');
    return t('streamRecovery.resuming');
  };

  return (
    <div className="stream-recovery-overlay">
      <div className="stream-recovery-overlay__content">
        {/* 指示灯 */}
        <div className="stream-recovery-overlay__indicator" />

        {/* 胶囊内容 */}
        <div className="stream-recovery-overlay__text-group">
          <span className="stream-recovery-overlay__label" key={getStatusText()}>
            {getStatusText()}
          </span>
          <span className="stream-recovery-overlay__countdown-badge">{remaining}s</span>
        </div>
      </div>
    </div>
  );
};
