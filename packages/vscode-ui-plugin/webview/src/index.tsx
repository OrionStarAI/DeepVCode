/**
 * WebView React App Entry Point
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { MultiSessionApp } from './components/MultiSessionApp';
import { I18nProvider } from './hooks/useTranslation';
import { ProjectSettingsProvider } from './hooks/useProjectSettings';
import { getGlobalMessageService } from './services/globalMessageService';
import { applyThemeClass, watchThemeChange } from './utils/themeUtils';

// 🎯 关键：初始化 VSCode API
declare function acquireVsCodeApi(): any;

// 🎯 必须：获取 VSCode API（这是 webview 与扩展通信的桥梁）
try {
  if (!window.vscode) {
    window.vscode = acquireVsCodeApi();
    console.log('✅ VSCode API acquired successfully');
  }
} catch (error) {
  console.error('❌ Failed to acquire VSCode API:', error);
}

// 添加全局样式以确保webview容器正确设置
const globalStyles = `
  html, body, #root {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
    background: var(--vscode-editor-background, #181818);
    color: var(--vscode-editor-foreground, #cccccc);
    font-family: var(--vscode-font-family, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif);
  }

  /* 确保webview不会超出边界 */
  #root {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
  }

  /* 默认滚动条样式 */
  *::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  *::-webkit-scrollbar-track {
    background: transparent;
  }

  *::-webkit-scrollbar-thumb {
    background: var(--vscode-scrollbarSlider-background, rgba(121, 121, 121, 0.4));
    border-radius: 3px;
  }

  *::-webkit-scrollbar-thumb:hover {
    background: var(--vscode-scrollbarSlider-hoverBackground, rgba(100, 100, 100, 0.7));
  }

  /* Firefox */
  * {
    scrollbar-width: thin;
    scrollbar-color: var(--vscode-scrollbarSlider-background) transparent;
  }

  /* 主题特定优化 */
  .theme-light {
    /* 亮色主题下的特殊处理 */
  }

  .theme-light .todo-display-container {
    /* 亮色主题下的 Todo 容器额外优化 */
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .theme-dark {
    /* 暗色主题下的特殊处理 */
  }
`;

// 创建并插入样式
const styleElement = document.createElement('style');
styleElement.textContent = globalStyles;
document.head.appendChild(styleElement);

// 🌐 预先创建全局MessageService实例（但不启动）
console.log('🚀 Pre-creating global MessageService instance...');
const messageService = getGlobalMessageService();

// 🎯 提前注册 refine 相关的监听器，避免消息丢失
console.log('🎯 Registering refine command listeners...');
messageService.onRefineResult((data: any) => {
  console.log('[Global Init] refine_result received:', data);
  // 广播事件，让订阅者知道
  window.dispatchEvent(new CustomEvent('refine-result', { detail: data }));
});

messageService.onRefineError((data: any) => {
  console.log('[Global Init] refine_error received:', data);
  // 广播事件，让订阅者知道
  window.dispatchEvent(new CustomEvent('refine-error', { detail: data }));
});
console.log('✅ Refine listeners registered');

// Get the root element
const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

// 应用主题类到根元素
applyThemeClass(document.body);

// 监听主题变化
watchThemeChange((theme) => {
  console.log('🎨 Theme changed to:', theme);
  applyThemeClass(document.body);
});

// Create React root and render the app
const root = createRoot(container);
root.render(
  <I18nProvider>
    <ProjectSettingsProvider>
      <MultiSessionApp />
    </ProjectSettingsProvider>
  </I18nProvider>
);