/**
 * HealthyUseReminder Component
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import './HealthyUseReminder.css';

interface HealthyUseReminderProps {
  onDismiss: () => void;
}

export const HealthyUseReminder: React.FC<HealthyUseReminderProps> = ({ onDismiss }) => {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState(300); // 300 seconds cooldown
  const [canDismiss, setCanDismiss] = useState(false);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    } else {
      setCanDismiss(true);
    }
  }, [countdown]);

  return (
    <div className="healthy-use-reminder">
      <div className="healthy-use-reminder__container">
        <div className="healthy-use-reminder__icon">🌙</div>
        <div className="healthy-use-reminder__title">{t('healthy.reminderTitle')}</div>

        <div className="healthy-use-reminder__content">
          {t('healthy.reminderContent')}
        </div>

        <div className="healthy-use-reminder__suggestion">
          {t('healthy.reminderSuggestion')}
        </div>

        <div className="healthy-use-reminder__agent-note">
          ⚡ {t('healthy.agentRunning')}
        </div>

        <div className="healthy-use-reminder__footer">
          <button
            className="healthy-use-reminder__button"
            onClick={onDismiss}
            disabled={!canDismiss}
          >
            {t('healthy.dismiss')}
            {!canDismiss && (
              <span className="healthy-use-reminder__countdown">
                {' '}({countdown}s)
              </span>
            )}
          </button>

          {!canDismiss && (
            <div className="healthy-use-reminder__countdown">
              {t('healthy.waiting').replace('{{seconds}}', countdown.toString())}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
