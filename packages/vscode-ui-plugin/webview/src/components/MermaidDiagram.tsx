import React, { useEffect, useMemo, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Copy, Check, Download, Maximize2, AlertTriangle } from 'lucide-react';

import { MermaidViewerModal } from './MermaidViewerModal';
import { useTranslation } from '../hooks/useTranslation';
import './MermaidDiagram.css';

declare const window: Window & {
  vscode?: {
    postMessage: (message: any) => void;
  };
};

function stableHash(input: string): string {
  // Small, deterministic hash for DOM ids (not cryptographic)
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim();
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      // result is data:<mime>;base64,....
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function ensureSvgHasXmlns(svg: string): string {
  if (svg.includes('xmlns="http://www.w3.org/2000/svg"')) return svg;
  return svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
}

function getVscodeBackgroundColor(): string {
  const bg = getComputedStyle(document.body).getPropertyValue('--vscode-editor-background').trim();
  return bg || '#ffffff';
}

async function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  const svgWithXmlns = ensureSvgHasXmlns(svg);
  
  // 🎯 使用 Data URL 而不是 Blob URL，避免 VSCode Webview 的 CSP 限制
  const base64Svg = btoa(unescape(encodeURIComponent(svgWithXmlns)));
  const dataUrl = `data:image/svg+xml;base64,${base64Svg}`;

  const img = new Image();
  const loadPromise = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(new Error(`Failed to load SVG into image: ${e}`));
  });

  // 🎯 设置 crossOrigin 为 anonymous 以允许 canvas 导出
  img.crossOrigin = 'anonymous';
  img.src = dataUrl;
  await loadPromise;

  // 如果 SVG 没有明确的宽高，使用默认值
  const width = Math.max(1, Math.floor((img.naturalWidth || img.width || 800) * scale));
  const height = Math.max(1, Math.floor((img.naturalHeight || img.height || 600) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.fillStyle = getVscodeBackgroundColor();
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const pngBlob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to create PNG blob'))), 'image/png');
  });

  return pngBlob;
}

export interface MermaidDiagramProps {
  code: string;
  title?: string;
}

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ code, title }) => {
  const { t } = useTranslation();
  const renderId = useMemo(() => `mermaid-${stableHash(code)}`, [code]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const lastGoodSvgRef = useRef<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isRendering, setIsRendering] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let errorTimer: number | undefined;

    const run = async () => {
      if (!code || code.trim().length === 0) {
        setSvg('');
        setError('');
        return;
      }

      setIsRendering(true);
      // Clear error optimistically; keep previous SVG visible until new one succeeds.
      setError('');

      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'neutral',
          suppressErrorRendering: true,
        } as any);

        const result = await mermaid.render(renderId, code);
        if (cancelled) return;

        const nextSvg = typeof result === 'string' ? result : result.svg;
        setSvg(nextSvg);
        lastGoodSvgRef.current = nextSvg;

        // Bind interactive functions if provided by mermaid
        const bind = (result as any)?.bindFunctions;
        if (typeof bind === 'function' && containerRef.current) {
          try {
            bind(containerRef.current);
          } catch {
            // ignore binding errors
          }
        }
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        // Delay setting a hard error to tolerate partial/streaming diagrams.
        if (errorTimer) window.clearTimeout(errorTimer);
        errorTimer = window.setTimeout(() => {
          if (!cancelled) setError(message || 'Mermaid render failed');
        }, 600);
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    };

    // Debounce to tolerate streaming/partial diagrams
    timer = window.setTimeout(run, 250);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      if (errorTimer) window.clearTimeout(errorTimer);
    };
  }, [code, renderId]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const exportSvg = async () => {
    const fileName = sanitizeFileName(title || 'mermaid-diagram') + '.svg';
    const svgWithXmlns = ensureSvgHasXmlns(svg);

    // Prefer saving via extension (more reliable in VS Code webview)
    if (window.vscode?.postMessage) {
      window.vscode.postMessage({
        type: 'export_mermaid_diagram',
        payload: {
          format: 'svg',
          fileName,
          data: svgWithXmlns,
        },
      });
      return;
    }

    downloadBlob(new Blob([svgWithXmlns], { type: 'image/svg+xml;charset=utf-8' }), fileName);
  };

  const exportPng = async () => {
    const fileName = sanitizeFileName(title || 'mermaid-diagram') + '.png';

    try {
      const pngBlob = await svgToPngBlob(svg, 2);

      if (window.vscode?.postMessage) {
        const base64 = await blobToBase64(pngBlob);
        window.vscode.postMessage({
          type: 'export_mermaid_diagram',
          payload: {
            format: 'png',
            fileName,
            data: base64,
          },
        });
        return;
      }

      downloadBlob(pngBlob, fileName);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message || 'PNG export failed');
    }
  };

  return (
    <div className="mermaid-block-wrapper">
      <div className="mermaid-header">
        <span className="mermaid-language">mermaid</span>
        <div className="mermaid-header-actions">
          <button
            className="mermaid-action-btn"
            onClick={() => setIsViewerOpen(true)}
            title={t('mermaid.openViewer', {}, 'Open viewer')}
            aria-label={t('mermaid.openViewer', {}, 'Open viewer')}
            disabled={!svg || !!error}
          >
            <Maximize2 size={14} />
          </button>
          <button
            className="mermaid-action-btn"
            onClick={() => copyToClipboard(code)}
            title={isCopied ? t('mermaid.copied', {}, 'Copied') : t('mermaid.copySource', {}, 'Copy Mermaid source')}
            aria-label={isCopied ? t('mermaid.copied', {}, 'Copied') : t('mermaid.copySource', {}, 'Copy Mermaid source')}
          >
            {isCopied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button
            className="mermaid-action-btn"
            onClick={exportSvg}
            title={t('mermaid.exportSvg', {}, 'Export SVG')}
            aria-label={t('mermaid.exportSvg', {}, 'Export SVG')}
            disabled={!svg || !!error}
          >
            <Download size={14} />
            <span className="mermaid-action-text">SVG</span>
          </button>
          <button
            className="mermaid-action-btn"
            onClick={exportPng}
            title={t('mermaid.exportPng', {}, 'Export PNG')}
            aria-label={t('mermaid.exportPng', {}, 'Export PNG')}
            disabled={!svg || !!error}
          >
            <Download size={14} />
            <span className="mermaid-action-text">PNG</span>
          </button>
        </div>
      </div>

      <div className="mermaid-content">
        {isRendering && !svg && !error && (
          <div className="mermaid-status">{t('mermaid.rendering', {}, 'Rendering...')}</div>
        )}

        {error && !svg ? (
          <div className="mermaid-error">
            <div className="mermaid-error-title">
              <AlertTriangle size={14} />
              <span>{t('mermaid.renderFailed', {}, 'Mermaid render failed')}</span>
            </div>
            <div className="mermaid-error-message">{error}</div>
            <pre className="mermaid-fallback"><code>{code}</code></pre>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="mermaid-svg-container"
            // Mermaid returns an SVG string; keep it local to the component.
            dangerouslySetInnerHTML={{ __html: svg || lastGoodSvgRef.current }}
          />
        )}
      </div>

      {isViewerOpen && svg && !error && (
        <MermaidViewerModal
          title={title || t('mermaid.title', {}, 'Mermaid Diagram')}
          svg={svg}
          onClose={() => setIsViewerOpen(false)}
          onExportSvg={exportSvg}
          onExportPng={exportPng}
        />
      )}
    </div>
  );
};
