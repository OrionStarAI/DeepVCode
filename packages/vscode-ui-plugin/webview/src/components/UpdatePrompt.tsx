/**
 * Update Prompt Component - Version Update Notification
 * Modern dark-themed update dialog with Apple/VS Code style
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React from 'react';
import { AlertTriangle, Download, ExternalLink, X } from 'lucide-react';
import { UpdateCheckResponse } from '../services/updateCheckService';
import './UpdatePrompt.css';

interface UpdatePromptProps {
  /** Update information */
  updateInfo: UpdateCheckResponse;
  /** Whether this is a force update */
  forceUpdate: boolean;
  /** Download VSIX callback */
  onDownloadVsix: () => void;
  /** Go to marketplace callback */
  onGoToMarketplace: () => void;
  /** Skip update callback (only shown for non-force updates) */
  onSkip?: () => void;
  /** Close dialog callback (only shown for non-force updates) */
  onClose?: () => void;
}

/**
 * UpdatePrompt - Modern Update Dialog Component
 *
 * Features:
 * - Modern dark-themed design
 * - Clear version comparison
 * - Primary and secondary actions
 * - Professional Apple/VS Code style
 */
export const UpdatePrompt: React.FC<UpdatePromptProps> = ({
  updateInfo,
  forceUpdate,
  onDownloadVsix,
  onGoToMarketplace,
  onSkip,
  onClose
}) => {
  const { currentVersion, latestVersion } = updateInfo;

  return (
    <div className="update-prompt">
      <div className="update-prompt__backdrop" />

      <div className="update-prompt__container">
        {/* Header with warning icon and title */}
        <div className="update-prompt__header">
          <div className="update-prompt__icon">
            <AlertTriangle className="update-prompt__warning-icon" size={24} />
          </div>
          <h2 className="update-prompt__title">
            {forceUpdate ? 'UPDATE REQUIRED' : 'UPDATE AVAILABLE'}
          </h2>
          {!forceUpdate && onClose && (
            <button
              className="update-prompt__close"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Version information */}
        <div className="update-prompt__version-section">
          <div className="update-prompt__version-row">
            <span className="update-prompt__version-label">Current Version</span>
            <span className="update-prompt__version-current">{currentVersion}</span>
          </div>
          <div className="update-prompt__version-row">
            <span className="update-prompt__version-label">Latest Version</span>
            <span className="update-prompt__version-latest">{latestVersion}</span>
          </div>
        </div>

        {/* Support message */}
        <div className="update-prompt__message">
          {forceUpdate ? (
            <p className="update-prompt__support-text">
              Your current version is outdated and no longer supported. Please update to continue using DeepV Code.
            </p>
          ) : (
            <p className="update-prompt__support-text">
              A new version is available with improvements and bug fixes.
            </p>
          )}
        </div>

        {/* Primary and secondary actions */}
        <div className="update-prompt__actions">
          <button
            className="update-prompt__button update-prompt__button--primary"
            onClick={onGoToMarketplace}
          >
            <ExternalLink size={16} />
            Update on Marketplace
          </button>

          <button
            className="update-prompt__button update-prompt__button--secondary"
            onClick={onDownloadVsix}
          >
            <Download size={16} />
            Download VSIX File
          </button>

          {!forceUpdate && onSkip && (
            <button
              className="update-prompt__button update-prompt__button--text"
              onClick={onSkip}
            >
              Remind Me Later
            </button>
          )}
        </div>

        {/* Additional instructions */}
        <div className="update-prompt__footer">
          <p className="update-prompt__instructions">
            Option 1: Search "DeepV AI Assistant" in VS Code Extensions marketplace
            <br />
            Option 2: Download VSIX file and install via "Install from VSIX" in VS Code
          </p>
        </div>
      </div>
    </div>
  );
};