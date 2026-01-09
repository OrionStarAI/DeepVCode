/**
 * Compression Confirmation Dialog
 * 模型切换时上下文压缩确认弹窗
 */

import React from 'react';
import { AlertTriangle, Minimize2, X } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import './CompressionConfirmationDialog.css';

export interface CompressionConfirmationDialogProps {
  isOpen: boolean;
  targetModel: string;
  currentTokens: number;
  targetTokenLimit: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export const CompressionConfirmationDialog: React.FC<CompressionConfirmationDialogProps> = ({
  isOpen,
  targetModel,
  currentTokens,
  targetTokenLimit,
  onConfirm,
  onCancel
}) => {
  const { t } = useTranslation();

  // 🎯 处理 ESC 键关闭
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="compression-dialog-overlay" onClick={onCancel}>
      <div className="compression-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="compression-dialog__header">
          <div className="compression-dialog__icon">
            <AlertTriangle size={24} />
          </div>
          <h3 className="compression-dialog__title">
            {t('compression.confirmTitle', {}, 'Context Compression Required')}
          </h3>
          <button className="compression-dialog__close" onClick={onCancel}>
            <X size={16} />
          </button>
        </div>

        <div className="compression-dialog__content">
          <p className="compression-dialog__message">
            {t('compression.confirmMessage', {},
              'Your current context exceeds the target model\'s limit. Compression is required to switch models.'
            )}
          </p>

          <div className="compression-dialog__stats">
            <div className="compression-dialog__stat">
              <span className="compression-dialog__stat-label">
                {t('compression.currentTokens', {}, 'Current Tokens')}
              </span>
              <span className="compression-dialog__stat-value">
                {currentTokens.toLocaleString()}
              </span>
            </div>
            <div className="compression-dialog__stat">
              <span className="compression-dialog__stat-label">
                {t('compression.targetLimit', {}, 'Target Model Limit')}
              </span>
              <span className="compression-dialog__stat-value">
                {targetTokenLimit.toLocaleString()}
              </span>
            </div>
            <div className="compression-dialog__stat">
              <span className="compression-dialog__stat-label">
                {t('compression.targetModel', {}, 'Target Model')}
              </span>
              <span className="compression-dialog__stat-value compression-dialog__stat-value--model">
                {targetModel}
              </span>
            </div>
          </div>

          <p className="compression-dialog__hint">
            {t('compression.confirmHint', {},
              'Compression will summarize older messages while preserving recent context and key information.'
            )}
          </p>
        </div>

        <div className="compression-dialog__actions">
          <button
            className="compression-dialog__btn compression-dialog__btn--cancel"
            onClick={onCancel}
          >
            {t('compression.cancel', {}, 'Cancel')}
          </button>
          <button
            className="compression-dialog__btn compression-dialog__btn--confirm"
            onClick={onConfirm}
          >
            <Minimize2 size={14} />
            {t('compression.confirmAndSwitch', {}, 'Compress & Switch')}
          </button>
        </div>
      </div>
    </div>
  );
};
