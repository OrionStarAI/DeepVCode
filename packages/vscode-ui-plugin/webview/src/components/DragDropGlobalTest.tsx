/**
 * 全局拖拽测试组件
 * 用于诊断webview拖拽功能的基础问题
 */

import React, { useEffect, useState } from 'react';

interface DragDropGlobalTestProps {
  enabled?: boolean;
}

export const DragDropGlobalTest: React.FC<DragDropGlobalTestProps> = ({
  enabled = process.env.NODE_ENV === 'development'
}) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    setLogs(prev => [...prev.slice(-9), logMessage]);
    console.log('🎯 ' + logMessage);
  };

  useEffect(() => {
    if (!enabled) return;

    addLog('拖拽测试组件已启动');

    // 在最高层级绑定事件
    const events = ['dragenter', 'dragover', 'dragleave', 'drop'];

    const handlers = events.map(eventName => {
      const handler = (e: Event) => {
        const dragEvent = e as DragEvent;
        const hasFiles = dragEvent.dataTransfer?.types.includes('Files');
        const hasText = dragEvent.dataTransfer?.types.includes('text/plain');
        const hasUriList = dragEvent.dataTransfer?.types.includes('text/uri-list');
        const target = (dragEvent.target as HTMLElement)?.tagName || 'unknown';
        const className = (dragEvent.target as HTMLElement)?.className || '';

        addLog(`${eventName.toUpperCase()}: files=${hasFiles}, text=${hasText}, uri=${hasUriList}, target=${target}.${className}`);

        // 🎯 不要阻止事件传播，只是记录
        // 让应用层的事件处理器正常工作
        if (eventName === 'dragover' || eventName === 'dragenter') {
          // 只在没有其他处理器的情况下才preventDefault
          // dragEvent.preventDefault();
        }

        if (eventName === 'drop') {
          // 不要阻止drop事件，让应用层处理
          // dragEvent.preventDefault();
          // dragEvent.stopPropagation();

          if (dragEvent.dataTransfer) {
            addLog(`Drop data: files=${dragEvent.dataTransfer.files.length}, types=[${Array.from(dragEvent.dataTransfer.types).join(', ')}]`);

            // 尝试读取文件信息
            Array.from(dragEvent.dataTransfer.files).forEach((file, index) => {
              addLog(`File ${index}: ${file.name} (${file.size} bytes)`);
            });

            // 尝试读取文本数据
            try {
              const textData = dragEvent.dataTransfer.getData('text/plain');
              if (textData) {
                addLog(`Text data: ${textData.substring(0, 100)}...`);
              }
            } catch (err) {
              addLog(`Error reading text data: ${err}`);
            }
          }
        }
      };

      document.addEventListener(eventName, handler, false); // 🎯 改为冒泡阶段，不干扰捕获
      return { eventName, handler };
    });

    // 键盘快捷键切换显示
    const keyHandler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        setIsVisible(prev => !prev);
        addLog(isVisible ? '隐藏测试面板' : '显示测试面板');
      }
    };

    document.addEventListener('keydown', keyHandler);

    return () => {
      handlers.forEach(({ eventName, handler }) => {
        document.removeEventListener(eventName, handler, false);
      });
      document.removeEventListener('keydown', keyHandler);
    };
  }, [enabled, isVisible]);

  if (!enabled) return null;

  return (
    <>
      {/* 快捷键提示 */}
      <div style={{
        position: 'fixed',
        top: '5px',
        left: '5px',
        background: '#333',
        color: '#fff',
        padding: '4px 8px',
        fontSize: '10px',
        borderRadius: '3px',
        zIndex: 999999,
        opacity: 0.7
      }}>
        Ctrl+Shift+T: 切换拖拽测试
      </div>

      {/* 调试面板 */}
      {isVisible && (
        <div style={{
          position: 'fixed',
          top: '30px',
          left: '5px',
          width: '350px',
          maxHeight: '400px',
          background: 'var(--vscode-editor-background, #1e1e1e)',
          color: 'var(--vscode-foreground, #cccccc)',
          border: '2px solid var(--vscode-focusBorder, #007ACC)',
          borderRadius: '6px',
          padding: '10px',
          fontSize: '11px',
          zIndex: 999998,
          fontFamily: 'monospace',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px',
            borderBottom: '1px solid var(--vscode-panel-border)',
            paddingBottom: '8px'
          }}>
            <strong>🎯 拖拽调试日志</strong>
            <div>
              <button
                onClick={() => setLogs([])}
                style={{
                  background: 'var(--vscode-button-background)',
                  color: 'var(--vscode-button-foreground)',
                  border: 'none',
                  padding: '3px 8px',
                  fontSize: '10px',
                  cursor: 'pointer',
                  marginRight: '5px'
                }}
              >
                清空
              </button>
              <button
                onClick={() => setIsVisible(false)}
                style={{
                  background: 'var(--vscode-button-background)',
                  color: 'var(--vscode-button-foreground)',
                  border: 'none',
                  padding: '3px 8px',
                  fontSize: '10px',
                  cursor: 'pointer'
                }}
              >
                隐藏
              </button>
            </div>
          </div>

          <div style={{
            maxHeight: '200px',
            overflowY: 'auto',
            lineHeight: '1.4'
          }}>
            {logs.length === 0 ? (
              <div style={{ color: '#888', fontStyle: 'italic' }}>
                等待拖拽事件...
              </div>
            ) : (
              logs.map((log, index) => (
                <div key={index} style={{
                  padding: '2px 0',
                  borderBottom: '1px solid var(--vscode-panel-border)',
                  wordBreak: 'break-all'
                }}>
                  {log}
                </div>
              ))
            )}
          </div>

          {/* 测试拖拽区域 */}
          <div style={{
            marginTop: '10px',
            padding: '15px',
            border: '3px dashed var(--vscode-focusBorder, #007ACC)',
            textAlign: 'center',
            fontSize: '12px',
            backgroundColor: 'var(--vscode-input-background)',
            borderRadius: '4px'
          }}>
            🧪 拖拽测试区域<br />
            <small>将文件拖到这里测试</small>
          </div>
        </div>
      )}
    </>
  );
};

export default DragDropGlobalTest;