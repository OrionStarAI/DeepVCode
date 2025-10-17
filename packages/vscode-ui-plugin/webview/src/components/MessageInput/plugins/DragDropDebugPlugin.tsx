/**
 * 拖拽调试插件
 * 用于调试和测试拖拽功能
 */

import React, { useState, useRef } from 'react';

interface DragDropDebugPluginProps {
  enabled?: boolean;
}

export function DragDropDebugPlugin({ enabled = false }: DragDropDebugPluginProps) {
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    setDebugInfo(prev => [...prev.slice(-9), logMessage]); // 保持最近10条日志
  };

  React.useEffect(() => {
    if (!enabled) return;

    const handleGlobalDragEvents = (e: DragEvent) => {
      const eventType = e.type;
      const hasFiles = e.dataTransfer?.types.includes('Files');
      const hasText = e.dataTransfer?.types.includes('text/plain');
      const target = (e.target as HTMLElement)?.className || 'unknown';

      addLog(`${eventType.toUpperCase()}: files=${hasFiles}, text=${hasText}, target=${target}`);
    };

    // 监听全局拖拽事件
    document.addEventListener('dragenter', handleGlobalDragEvents);
    document.addEventListener('dragover', handleGlobalDragEvents);
    document.addEventListener('dragleave', handleGlobalDragEvents);
    document.addEventListener('drop', handleGlobalDragEvents);

    return () => {
      document.removeEventListener('dragenter', handleGlobalDragEvents);
      document.removeEventListener('dragover', handleGlobalDragEvents);
      document.removeEventListener('dragleave', handleGlobalDragEvents);
      document.removeEventListener('drop', handleGlobalDragEvents);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      width: '300px',
      background: 'var(--vscode-editor-background)',
      border: '1px solid var(--vscode-panel-border)',
      borderRadius: '4px',
      padding: '8px',
      fontSize: '11px',
      zIndex: 9999,
      display: isVisible ? 'block' : 'none'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px'
      }}>
        <strong>拖拽调试日志</strong>
        <button
          onClick={() => setDebugInfo([])}
          style={{
            background: 'var(--vscode-button-background)',
            color: 'var(--vscode-button-foreground)',
            border: 'none',
            padding: '2px 6px',
            fontSize: '10px',
            cursor: 'pointer'
          }}
        >
          清空
        </button>
      </div>
      <div
        ref={logRef}
        style={{
          maxHeight: '200px',
          overflowY: 'auto',
          fontFamily: 'monospace',
          lineHeight: '1.3'
        }}
      >
        {debugInfo.map((log, index) => (
          <div key={index} style={{
            padding: '2px 0',
            borderBottom: '1px solid var(--vscode-panel-border)'
          }}>
            {log}
          </div>
        ))}
      </div>

      {/* 测试区域 */}
      <div style={{
        marginTop: '8px',
        padding: '8px',
        border: '2px dashed var(--vscode-panel-border)',
        textAlign: 'center',
        fontSize: '10px'
      }}>
        拖拽测试区域
      </div>
    </div>
  );
}

// 全局调试开关
export function enableDragDebug() {
  (window as any).__dragDebugEnabled = true;
  console.log('🎯 Drag debug enabled - check console for events');
}

export function disableDragDebug() {
  (window as any).__dragDebugEnabled = false;
  console.log('🎯 Drag debug disabled');
}

// 在控制台中可以调用的调试函数
if (typeof window !== 'undefined') {
  (window as any).enableDragDebug = enableDragDebug;
  (window as any).disableDragDebug = disableDragDebug;

  // 自动显示/隐藏调试面板的快捷键
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      const debugPanel = document.querySelector('[data-drag-debug]') as HTMLElement;
      if (debugPanel) {
        debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
      }
    }
  });
}