/**
 * 图片预览模态组件
 * 用于显示放大的图片预览
 */

import React, { useEffect, useState } from 'react';
import './ImagePreviewModal.css';

interface ImagePreviewModalProps {
  fileName: string;
  imageData: string; // base64 data
  onClose: () => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  fileName,
  imageData,
  onClose,
}) => {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
      // 支持 + 和 - 键快捷缩放
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setScale(prev => Math.min(prev + 0.2, 3));
      }
      if (e.key === '-') {
        e.preventDefault();
        setScale(prev => Math.max(prev - 0.2, 0.5));
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 只在点击背景覆盖层时关闭，不处理内容区域的点击
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleContentClick = (e: React.MouseEvent) => {
    // 阻止内容区域的点击事件冒泡到覆盖层
    e.stopPropagation();
  };

  return (
    <div className="image-preview-overlay" onClick={handleOverlayClick}>
      <div className="image-preview-modal">
        <div className="image-preview-header">
          <span className="image-preview-title">{fileName}</span>
          <button
            className="image-preview-close-btn"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close image preview"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="icon"
            >
              <path
                d="M3.72 2.47L2.47 3.72 6.75 8l-4.28 4.28 1.25 1.25L8 9.25l4.28 4.28 1.25-1.25L9.25 8l4.28-4.28-1.25-1.25L8 6.75 3.72 2.47z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>
        <div className="image-preview-content" onClick={handleContentClick}>
          <div className="image-preview-viewer">
            <img
              src={`data:image/jpeg;base64,${imageData}`}
              alt={fileName}
              className="image-preview-img"
              style={{ transform: `scale(${scale})` }}
            />
          </div>
          <div className="image-preview-controls" onClick={(e) => e.stopPropagation()}>
            <button
              className="image-preview-zoom-btn"
              onClick={() => setScale(prev => Math.max(prev - 0.2, 0.5))}
              title="Zoom out (-)  "
              aria-label="Zoom out"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1"/>
                <line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" strokeWidth="1"/>
                <line x1="3" y1="6" x2="9" y2="6" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
            </button>
            <span className="image-preview-scale-display">{Math.round(scale * 100)}%</span>
            <button
              className="image-preview-zoom-btn"
              onClick={() => setScale(prev => Math.min(prev + 0.2, 3))}
              title="Zoom in (+)"
              aria-label="Zoom in"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1"/>
                <line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" strokeWidth="1"/>
                <line x1="3" y1="6" x2="9" y2="6" stroke="currentColor" strokeWidth="1.2"/>
                <line x1="6" y1="3" x2="6" y2="9" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
            </button>
            <button
              className="image-preview-reset-btn"
              onClick={() => setScale(1)}
              title="Reset zoom (100%)"
              aria-label="Reset zoom"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 8C2 4.686 4.686 2 8 2c1.657 0 3.157.671 4.243 1.757M14 8c0 3.314-2.686 6-6 6-1.657 0-3.157-.671-4.243-1.757"
                      stroke="currentColor" strokeWidth="1" fill="none"/>
                <path d="M13 3v3h-3" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImagePreviewModal;
