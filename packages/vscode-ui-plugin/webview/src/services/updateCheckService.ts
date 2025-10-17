/**
 * Update Check Service - Version Update Detection
 * 版本更新检测服务
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

// 从VS Code webview消息获取当前版本
declare const vscode: {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
};

/** 更新检测响应类型 */
export interface UpdateCheckResponse {
  success: boolean;
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  forceUpdate: boolean;
  timestamp: string;
  downloadUrl: string;
}

/** 更新检测状态 */
export interface UpdateCheckState {
  hasChecked: boolean;
  lastCheckTime?: string;
  // 🎯 移除skipPromptThisSession，它应该只在内存中存在，不在持久化状态中
  updateInfo?: UpdateCheckResponse;
}

/** 更新检测服务类 */
export class UpdateCheckService {
  private static instance: UpdateCheckService;
  private checkState: UpdateCheckState = { hasChecked: false };
  private currentVersion: string = '';
  // 🎯 session级别的跳过状态，不持久化
  private skipPromptThisSessionFlag: boolean = false;

  private constructor() {
    // 从localStorage恢复状态
    this.loadState();
  }

  /** 获取单例实例 */
  public static getInstance(): UpdateCheckService {
    if (!UpdateCheckService.instance) {
      UpdateCheckService.instance = new UpdateCheckService();
    }
    return UpdateCheckService.instance;
  }

  /** 设置当前版本号 */
  public setCurrentVersion(version: string): void {
    this.currentVersion = version;
  }

  /** 获取当前版本号 */
  public getCurrentVersion(): string {
    return this.currentVersion;
  }

  /** 检查是否需要进行更新检测 */
  public shouldCheckForUpdates(): boolean {
    console.log('[UpdateCheck] 🤔 Checking if update check is needed...');
    console.log('[UpdateCheck] Current state:', this.checkState);

    // 如果还没有检查过，则需要检查
    if (!this.checkState.hasChecked) {
      console.log('[UpdateCheck] ✅ Need to check - never checked before');
      return true;
    }

    // 🎯 如果上次检测发现有升级，继续检测以便显示提示
    // 这确保了"只要版本低就要提示"的需求，即使24小时内检测过
    if (this.checkState.updateInfo && this.checkState.updateInfo.hasUpdate) {
      console.log('[UpdateCheck] ✅ Need to check - update available, need to show prompt');
      return true;
    }

    // 🎯 正常24小时间隔检测，避免频繁打扰用户
    if (this.checkState.lastCheckTime) {
      const lastCheck = new Date(this.checkState.lastCheckTime);
      const now = new Date();
      const diffHours = (now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60);
      console.log('[UpdateCheck] ⏰ Hours since last check:', diffHours);

      if (diffHours > 24) {
        console.log('[UpdateCheck] ✅ Need to check - more than 24 hours since last check');
        return true;
      } else {
        console.log('[UpdateCheck] ⏭️ Skipping - checked recently and no pending updates');
        return false;
      }
    }

    console.log('[UpdateCheck] ⏭️ Skipping - unknown state');
    return false;
  }

  /** 执行更新检测 */
  public async checkForUpdates(): Promise<UpdateCheckResponse | null> {
    try {
      if (!this.currentVersion) {
        console.warn('[UpdateCheck] ⚠️ Current version not set, skipping update check');
        return null;
      }

      console.log('[UpdateCheck] 🔍 Checking for updates, current version:', this.currentVersion);
      console.log('[UpdateCheck] 📡 Requesting update check via Extension...');

      // 通过消息通信请求Extension进行更新检测
      const result = await this.requestUpdateCheckFromExtension();

      if (result && !result.error) {
        console.log('[UpdateCheck] ✅ Update check completed successfully:', result);

        // 保存检测结果
        this.checkState = {
          hasChecked: true,
          lastCheckTime: new Date().toISOString(),
          updateInfo: result as UpdateCheckResponse
        };
        this.saveState();

        return result as UpdateCheckResponse;
      } else {
        console.error('[UpdateCheck] ❌ Update check failed:', result?.error || 'Unknown error');

        // 标记为已检查，避免重复失败
        this.checkState = {
          hasChecked: true,
          lastCheckTime: new Date().toISOString()
        };
        this.saveState();

        return null;
      }

    } catch (error) {
      console.error('[UpdateCheck] ❌ Failed to check for updates:', error);

      // 标记为已检查，避免重复失败
      this.checkState = {
        hasChecked: true,
        lastCheckTime: new Date().toISOString()
      };
      this.saveState();

      return null;
    }
  }

  /** 通过Extension进行更新检测 */
  private async requestUpdateCheckFromExtension(): Promise<any> {
    return new Promise((resolve, reject) => {
      // 设置超时
      const timeout = setTimeout(() => {
        window.removeEventListener('message', messageHandler);
        reject(new Error('Update check request timeout'));
      }, 15000); // 15秒超时

      // 监听响应
      const messageHandler = (event: MessageEvent) => {
        if (event.data?.type === 'update_check_response') {
          console.log('[UpdateCheck] 📥 Received update check response:', event.data.payload);
          clearTimeout(timeout);
          window.removeEventListener('message', messageHandler);
          resolve(event.data.payload);
        }
      };

      window.addEventListener('message', messageHandler);

      // 发送请求
      if (window.vscode) {
        console.log('[UpdateCheck] 📤 Sending update check request to Extension...');
        window.vscode.postMessage({
          type: 'check_for_updates',
          payload: {}
        });
      } else {
        clearTimeout(timeout);
        window.removeEventListener('message', messageHandler);
        reject(new Error('VSCode API not available'));
      }
    });
  }

  /** 用户选择跳过本次session的升级提示（仅限非强制升级） */
  public skipPromptThisSession(): void {
    this.skipPromptThisSessionFlag = true;
    // 🎯 只在内存中生效，重启后会重新检测和提示
    console.log('[UpdateCheck] User chose to skip upgrade prompt for this session');
  }

  /** 检查是否应该显示升级提示 */
  public shouldShowUpdatePrompt(updateInfo: UpdateCheckResponse): boolean {
    // 🎯 强制升级：总是显示，不允许跳过
    if (updateInfo.forceUpdate) {
      console.log('[UpdateCheck] ✅ Should show prompt - force update required');
      return true;
    }

    // 🎯 非强制升级：检查用户是否跳过了本次session的提示
    if (this.skipPromptThisSessionFlag) {
      console.log('[UpdateCheck] ⏭️ Skip prompt - user chose to skip this session');
      return false;
    }

    console.log('[UpdateCheck] ✅ Should show prompt - optional update available');
    return true;
  }

  /** 重置检测状态（用于测试或重启后） */
  public resetCheckState(): void {
    this.checkState = { hasChecked: false };
    this.saveState();
  }

  /** 重置session跳过状态（模拟重启） */
  public resetSessionSkip(): void {
    this.skipPromptThisSessionFlag = false;
    console.log('[UpdateCheck] Reset session skip state - will show prompts again');
  }

  /** 获取当前检测状态 */
  public getCheckState(): UpdateCheckState {
    return { ...this.checkState };
  }

  /** 版本比较：检查是否有新版本 */
  public static compareVersions(current: string, latest: string): { hasUpdate: boolean; isNewer: boolean } {
    const parseVersion = (version: string) => {
      // 移除 'v' 前缀并按 '.' 分割
      const clean = version.replace(/^v/, '');
      return clean.split('.').map(num => parseInt(num, 10) || 0);
    };

    const currentParts = parseVersion(current);
    const latestParts = parseVersion(latest);

    // 确保两个版本号长度一致
    const maxLength = Math.max(currentParts.length, latestParts.length);
    while (currentParts.length < maxLength) currentParts.push(0);
    while (latestParts.length < maxLength) latestParts.push(0);

    for (let i = 0; i < maxLength; i++) {
      if (latestParts[i] > currentParts[i]) {
        return { hasUpdate: true, isNewer: true };
      } else if (latestParts[i] < currentParts[i]) {
        return { hasUpdate: false, isNewer: false };
      }
    }

    return { hasUpdate: false, isNewer: false };
  }

  /** 保存状态到localStorage */
  private saveState(): void {
    try {
      localStorage.setItem('deepv-update-check-state', JSON.stringify(this.checkState));
    } catch (error) {
      console.warn('[UpdateCheck] Failed to save state to localStorage:', error);
    }
  }

  /** 从localStorage加载状态 */
  private loadState(): void {
    try {
      const saved = localStorage.getItem('deepv-update-check-state');
      if (saved) {
        this.checkState = JSON.parse(saved);
        console.log('[UpdateCheck] Loaded state from localStorage:', this.checkState);
      }
    } catch (error) {
      console.warn('[UpdateCheck] Failed to load state from localStorage:', error);
      this.checkState = { hasChecked: false };
    }
  }
}

/** 获取更新检测服务单例 */
export const getUpdateCheckService = () => UpdateCheckService.getInstance();