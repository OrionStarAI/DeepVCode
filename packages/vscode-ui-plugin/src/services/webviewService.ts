/**
 * WebView Service - Manages the WebView panel and its lifecycle
 */

import * as vscode from 'vscode';
import { MultiSessionCommunicationService } from './multiSessionCommunicationService';
import { Logger } from '../utils/logger';

export class WebViewService {
  private disposables: vscode.Disposable[] = [];

  constructor(
    private context: vscode.ExtensionContext,
    private communicationService: MultiSessionCommunicationService,
    private logger: Logger
  ) {}

  async initialize() {
    try {
      this.logger.info('Initializing WebViewService');

      // Register view provider for the sidebar
      const provider = new DeepVWebviewViewProvider(
        this.context,
        this.communicationService,
        this.logger
      );

      const registration = vscode.window.registerWebviewViewProvider(
        'deepv.aiAssistant',
        provider,
        {
          webviewOptions: {
            retainContextWhenHidden: true
          }
        }
      );

      this.disposables.push(registration);
      this.logger.info('WebView provider registered successfully');

      // 🎯 在启动时自动显示侧边栏视图（如同 AugmentCode 的行为）
      this.show();
    } catch (error) {
      this.logger.error('Failed to initialize WebViewService', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  async show() {
    try {
      // 🎯 通过命令行显示并聚焦侧边栏视图，这样即使关闭也会自动恢复
      await vscode.commands.executeCommand('deepv.aiAssistant.focus');
      this.logger.info('Sidebar view revealed');
    } catch (error) {
      this.logger.error('Failed to show sidebar view', error instanceof Error ? error : undefined);
    }
  }

  private getWebviewContent(webview: vscode.Webview): string {
    // In development, we might want to load from a dev server
    // In production, we load the built React app

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'build', 'bundle.js')
    );

    const nonce = this.generateNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource}; img-src 'self' data: blob: ${webview.cspSource}; object-src 'none'; media-src 'none';">
    <style>
      html, body, #root {
        margin: 0;
        padding: 0;
        height: 100%;
        overflow: hidden;
        background: var(--vscode-editor-background, #181818);
        color: var(--vscode-editor-foreground, #cccccc);
        font-family: var(--vscode-font-family, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif);
      }

      #root {
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
      }

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

      * {
        scrollbar-width: thin;
        scrollbar-color: var(--vscode-scrollbarSlider-background) transparent;
      }

      .theme-light {
        /* Light theme specific styling */
      }

      .theme-light .todo-display-container {
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }

      .theme-dark {
        /* Dark theme specific styling */
      }
    </style>
    <title>DeepVCode</title>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
    <script nonce="${nonce}">
      console.log('🎯 WebView initialized');
    </script>
</body>
</html>`;
  }

  private generateNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  async dispose() {
    this.logger.info('Disposing WebViewService');

    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}

/**
 * WebView View Provider for the sidebar integration
 */
class DeepVWebviewViewProvider implements vscode.WebviewViewProvider {
  constructor(
    private context: vscode.ExtensionContext,
    private communicationService: MultiSessionCommunicationService,
    private logger: Logger
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): Thenable<void> | void {

    webviewView.webview.options = {
      enableScripts: true,
      enableForms: true, // 🎯 启用表单和拖拽支持
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'build'),
        vscode.Uri.joinPath(this.context.extensionUri, 'assets')
      ]
    };

    // Set up communication
    this.communicationService.setWebview(webviewView.webview);

    // Set webview content
    webviewView.webview.html = this.getWebviewContent(webviewView.webview);

    this.logger.info('Resolved WebView view for sidebar');
  }

  private getWebviewContent(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'build', 'bundle.js')
    );

    const nonce = this.generateNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource}; img-src 'self' data: blob: ${webview.cspSource}; object-src 'none'; media-src 'none';">
    <title>DeepVCode</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        height: 100vh;
        overflow: hidden;
        font-family: var(--vscode-font-family, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif);
        font-size: var(--vscode-font-size, 13px);
        color: var(--vscode-foreground, #cccccc);
        background-color: var(--vscode-editor-background, #1e1e1e);
      }
      #root {
        height: 100%;
        display: flex;
        flex-direction: column;
        min-height: 100vh;
      }
      /* 基础样式确保可见性 */
      .multi-session-app {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        background-color: var(--vscode-editor-background, #1e1e1e);
        color: var(--vscode-foreground, #cccccc);
      }

      /* 🎯 初始加载屏幕样式 - 在React加载前显示 */
      .initial-loading {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: 100%;
        height: 100%;
        background: var(--vscode-editor-background, #1e1e1e);
        color: var(--vscode-foreground, #cccccc);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        font-family: var(--vscode-font-family, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif);
        animation: fadeIn 0.3s ease-out;
      }

      .initial-loading__container {
        text-align: center;
        max-width: 300px;
        padding: 2rem;
      }

      .initial-loading__logo {
        width: 60px;
        height: 60px;
        margin: 0 auto 1.5rem;
        background: linear-gradient(135deg,
          var(--vscode-button-background, #0e639c) 0%,
          var(--vscode-button-hoverBackground, #1177bb) 50%,
          var(--vscode-textLink-foreground, #3794ff) 100%
        );
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: logoSpin 2s linear infinite;
        box-shadow: 0 0 20px rgba(55, 148, 255, 0.3);
      }

      .initial-loading__logo-text {
        color: var(--vscode-editor-background, #1e1e1e);
        font-weight: bold;
        font-size: 14px;
        letter-spacing: 1px;
      }

      .initial-loading__title {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0 0 0.5rem;
        color: var(--vscode-foreground, #cccccc);
      }

      .initial-loading__subtitle {
        font-size: 0.9rem;
        margin: 0 0 1.5rem;
        color: var(--vscode-descriptionForeground, #cccccc99);
      }

      .initial-loading__status {
        font-size: 0.8rem;
        color: var(--vscode-descriptionForeground, #cccccc99);
        opacity: 0.8;
      }

      .initial-loading__dots {
        display: inline-block;
        animation: dotPulse 1.5s ease-in-out infinite;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes logoSpin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      @keyframes dotPulse {
        0%, 60%, 100% { opacity: 0.3; }
        30% { opacity: 1; }
      }
    </style>
</head>
<body>
    <!-- 🎯 初始加载屏幕 - 在React加载前显示 -->
    <div id="initial-loading" class="initial-loading">
      <div class="initial-loading__container">
        <div class="initial-loading__logo">
          <div class="initial-loading__logo-text">DV</div>
        </div>
        <div class="initial-loading__title">DeepV Code</div>
        <div class="initial-loading__subtitle">AI Assistant</div>
        <div class="initial-loading__status">
          正在加载界面<span class="initial-loading__dots">...</span>
        </div>
      </div>
    </div>

    <div id="root"></div>
    <script nonce="${nonce}">
      // Pass VS Code API to the React app
      window.vscode = acquireVsCodeApi();
      window.isVSCodeSidebar = true;

      // 🎯 初始化VSCode webview状态（用于传递customProxyServerUrl等配置）
      (function initializeWebViewState() {
        const vsCodeApi = window.vscode;
        if (vsCodeApi && typeof vsCodeApi.getState === 'function') {
          try {
            const currentState = vsCodeApi.getState?.() || {};
            // 🎯 从VSCode配置中读取customProxyServerUrl
            // 这里可以通过postMessage向extension请求配置，或者直接从扩展传递
            // 由于脚本在初始化时无法访问异步数据，customProxyServerUrl将由MessageInput组件通过postMessage获取
            vsCodeApi.setState(currentState);
          } catch (error) {
            console.debug('Failed to initialize webview state:', error);
          }
        }
      })();

      // 🎯 恢复简单的拖拽事件支持（需要Shift键）
      console.log('🎯 Sidebar WebView initialized with standard drag support');

      // 🎯 React应用加载完成后隐藏初始loading
      window.addEventListener('DOMContentLoaded', function() {
        // 监听React应用的挂载
        const checkReactReady = () => {
          const root = document.getElementById('root');
          if (root && root.children.length > 0) {
            // React已挂载，隐藏初始loading
            const initialLoading = document.getElementById('initial-loading');
            if (initialLoading) {
              initialLoading.style.transition = 'opacity 0.3s ease-out';
              initialLoading.style.opacity = '0';
              setTimeout(() => {
                if (initialLoading.parentNode) {
                  initialLoading.parentNode.removeChild(initialLoading);
                }
              }, 300);
            }
          } else {
            // React还未挂载，继续检查
            setTimeout(checkReactReady, 100);
          }
        };

        // 延迟一下开始检查，给React一点启动时间
        setTimeout(checkReactReady, 200);
      });
    </script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private generateNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}