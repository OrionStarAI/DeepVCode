/**
 * Binary File Warning Notification Component
 * 显示不支持的二进制文件拖拽警告
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React, { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import './BinaryFileWarningNotification.css';

interface BinaryFileWarningNotificationProps {
  fileName?: string;
  visible: boolean;
  onDismiss: () => void;
  autoCloseDuration?: number; // 自动关闭延迟（毫秒），0 表示不自动关闭
}

export const BinaryFileWarningNotification: React.FC<BinaryFileWarningNotificationProps> = ({
  fileName = 'file',
  visible,
  onDismiss,
  autoCloseDuration = 4000
}) => {
  const { t } = useTranslation();
  const [isShowing, setIsShowing] = useState(visible);

  useEffect(() => {
    setIsShowing(visible);

    if (visible && autoCloseDuration > 0) {
      // 自动关闭通知
      const timer = setTimeout(() => {
        setIsShowing(false);
        onDismiss();
      }, autoCloseDuration);

      return () => clearTimeout(timer);
    }
  }, [visible, onDismiss, autoCloseDuration]);

  if (!isShowing) {
    return null;
  }

  const handleDismiss = () => {
    setIsShowing(false);
    onDismiss();
  };

  return (
    <div className="binary-file-warning-notification">
      <div className="notification-content">
        <AlertTriangle size={18} className="notification-icon" />
        <div className="notification-text">
          <div className="notification-title">
            {t('chat.binaryFileWarningTitle', {}, 'Unsupported Binary File')}
          </div>
          <div className="notification-message">
            {t('chat.binaryFileWarning', { fileName }, `The file "${fileName}" is a binary file and cannot be processed. Please drag text or code files instead.`)}
          </div>
        </div>
      </div>
      <button
        className="notification-close"
        onClick={handleDismiss}
        aria-label="Close notification"
        title="Close"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export default BinaryFileWarningNotification;
