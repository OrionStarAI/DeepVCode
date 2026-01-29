import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Download, Minus, Plus, RotateCcw, X } from 'lucide-react';

import { useTranslation } from '../hooks/useTranslation';
import './MermaidViewerModal.css';

function ensureSvgHasXmlns(svg: string): string {
  if (svg.includes('xmlns="http://www.w3.org/2000/svg"')) return svg;
  return svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
}

export interface MermaidViewerModalProps {
  title: string;
  svg: string;
  onClose: () => void;
  onExportSvg: () => void;
  onExportPng: () => void;
}

export const MermaidViewerModal: React.FC<MermaidViewerModalProps> = ({
  title,
  svg,
  onClose,
  onExportSvg,
  onExportPng,
}) => {
  const { t } = useTranslation();
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const normalizedSvg = useMemo(() => ensureSvgHasXmlns(svg), [svg]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setScale((prev) => Math.min(prev + 0.2, 5));
      }
      if (e.key === '-') {
        e.preventDefault();
        setScale((prev) => Math.max(prev - 0.2, 0.2));
      }
      if (e.key === '0') {
        e.preventDefault();
        handleReset();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        dragStartRef.current = null;
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging]);

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    // Zoom with Ctrl/Meta + process wheel for pan otherwise? 
    // Usually map viewers use wheel for zoom directly.
    // Let's implement wheel zoom by default as it is intuitive for maps/diagrams.
    
    e.preventDefault();
    e.stopPropagation();

    const ZOOM_SPEED = 0.001;
    const newScale = Math.min(Math.max(scale - e.deltaY * ZOOM_SPEED, 0.2), 5);
    setScale(newScale);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging && dragStartRef.current) {
      e.preventDefault();
      setPosition({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y
      });
    }
  };

  return (
    <div className="mermaid-viewer-overlay" onClick={handleOverlayClick}>
      <div className="mermaid-viewer-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mermaid-viewer-header">
          <span className="mermaid-viewer-title">{title}</span>
          <div className="mermaid-viewer-header-actions">
            <button
              className="mermaid-viewer-btn"
              onClick={onExportSvg}
              title={t('mermaid.exportSvg', {}, 'Export SVG')}
              aria-label={t('mermaid.exportSvg', {}, 'Export SVG')}
            >
              <Download size={16} />
              <span>SVG</span>
            </button>
            <button
              className="mermaid-viewer-btn"
              onClick={onExportPng}
              title={t('mermaid.exportPng', {}, 'Export PNG')}
              aria-label={t('mermaid.exportPng', {}, 'Export PNG')}
            >
              <Download size={16} />
              <span>PNG</span>
            </button>
            <button
              className="mermaid-viewer-close-btn"
              onClick={onClose}
              title={t('mermaid.close', {}, 'Close (Esc)')}
              aria-label={t('mermaid.close', {}, 'Close')}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div 
          className="mermaid-viewer-content" 
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          style={{ 
            cursor: isDragging ? 'grabbing' : 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            position: 'relative'
          }}
        >
          <div 
            className="mermaid-viewer-canvas" 
            style={{ 
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              transformOrigin: 'center center' // Zoom from center usually better with pan
            }}
          >
            <div
              className="mermaid-viewer-svg"
              dangerouslySetInnerHTML={{ __html: normalizedSvg }}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
            />
          </div>
        </div>

        <div className="mermaid-viewer-controls" onClick={(e) => e.stopPropagation()}>
           <button
            className="mermaid-viewer-icon-btn"
            onClick={handleReset}
            title={t('mermaid.reset', {}, 'Reset View')}
            aria-label={t('mermaid.reset', {}, 'Reset View')}
          >
            <RotateCcw size={16} />
          </button>
          <button
            className="mermaid-viewer-icon-btn"
            onClick={() => setScale(s => Math.max(s - 0.2, 0.2))}
            title={t('mermaid.zoomOut', {}, 'Zoom Out (-)')}
            aria-label={t('mermaid.zoomOut', {}, 'Zoom Out')}
          >
            <Minus size={16} />
          </button>
          <span className="mermaid-viewer-scale">{Math.round(scale * 100)}%</span>
          <button
            className="mermaid-viewer-icon-btn"
            onClick={() => setScale(s => Math.min(s + 0.2, 5))}
            title={t('mermaid.zoomIn', {}, 'Zoom In (+)')}
            aria-label={t('mermaid.zoomIn', {}, 'Zoom In')}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
