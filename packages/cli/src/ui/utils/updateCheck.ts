/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPackageJson } from '../../utils/package.js';
import { t, tp, isChineseLocale } from './i18n.js';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// 服务器地址配置 - 动态获取以确保环境变量正确加载
function getServerUrl(): string {
  // 开发环境下默认使用本地服务器
  if (process.env.DEV === 'true' || process.env.NODE_ENV === 'development') {
    return process.env.DEEPX_SERVER_URL || 'http://localhost:6699';
  }

  return process.env.DEEPX_SERVER_URL || 'https://api-code.deepvlab.ai';
}

interface UpdateCheckResponse {
  success: boolean;
  hasUpdate: boolean;
  currentVersion?: string;
  latestVersion?: string;
  updateCommand?: string;
  downloadUrl?: string;
  forceUpdate?: boolean;
  message?: string;
}

interface UpdateCheckCache {
  lastCheckTime: number;
  lastResult: string | null;
  version: string;
}

// 获取缓存文件路径
function getCacheFilePath(): string {
  const settingsDir = join(homedir(), '.deepv');
  return join(settingsDir, 'update-check.json');
}

// 读取缓存
async function readUpdateCheckCache(): Promise<UpdateCheckCache | null> {
  try {
    const cacheFile = getCacheFilePath();
    const content = await fs.readFile(cacheFile, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

// 写入缓存
async function writeUpdateCheckCache(cache: UpdateCheckCache): Promise<void> {
  try {
    const cacheFile = getCacheFilePath();
    const settingsDir = join(homedir(), '.deepv');

    // 确保目录存在
    await fs.mkdir(settingsDir, { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.warn(tp('update.cache.write.error', { error: error instanceof Error ? error.message : String(error) }));
  }
}

// 格式化时间显示
function formatNextCheckTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  const locale = isChineseLocale() ? 'zh-CN' : 'en-US';
  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  if (date.toDateString() === now.toDateString()) {
    return tp('update.time.today', { time });
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) {
    return tp('update.time.tomorrow', { time });
  }

  return date.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function checkForUpdates(
  showProgress: boolean = false,
  forceCheck: boolean = false
): Promise<string | null> {
  try {
    // Skip update check when running from source (development mode) unless forced
    if (process.env.DEV === 'true' && !forceCheck) {
      if (showProgress) {
      }
      return null;
    }

    const packageJson = await getPackageJson();
    if (!packageJson || !packageJson.name || !packageJson.version) {
      return null;
    }

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000; // 24小时

    // 检查缓存（非强制模式）
    if (!forceCheck) {
      const cache = await readUpdateCheckCache();

      if (cache && cache.version === packageJson.version) {
        const timeSinceLastCheck = now - cache.lastCheckTime;

        if (timeSinceLastCheck < oneDayMs) {
          // 缓存有效，静默返回
          return cache.lastResult;
        }
      }
    }

    const serverUrl = getServerUrl();
    const updateApiUrl = `${serverUrl}/api/update-check?version=${encodeURIComponent(packageJson.version)}`;

    // 调用自己服务器的更新检测API
    const response = await fetch(
      updateApiUrl,
      {
        method: 'GET',
        headers: {
          'User-Agent': `${packageJson.name}/${packageJson.version}`,
        },
        // 设置超时
        signal: AbortSignal.timeout(10000), // 10秒超时
      }
    );

    if (!response.ok) {
      const message = tp('update.check.failed.http', { status: response.status });
      if (showProgress) {
        console.warn(message);
      } else {
        console.warn(message);
      }
      return null;
    }

    const data: UpdateCheckResponse = await response.json();

    if (!data.success) {
      const message = tp('update.check.failed.message', { message: String(data.message || '') });
      if (showProgress) {
        console.warn(message);
      } else {
        console.warn(message);
      }
      return null;
    }

    // 简化：移除不必要的显示

    let result: string | null = null;
    const MESSAGE_SEPARATOR = '::MSG::';

    if (data.hasUpdate && data.forceUpdate && data.latestVersion && data.updateCommand) {
      // 返回特殊标记，表示需要强制更新
      result = `FORCE_UPDATE:${data.latestVersion}:${data.updateCommand}${MESSAGE_SEPARATOR}${t('update.force.message.header')}
${tp('update.version.line', { current: packageJson.version, latest: String(data.latestVersion) })}
${tp('update.command.line', { command: String(data.updateCommand) })}

${t('update.after.success.exit')}`;
    } else if (data.hasUpdate && showProgress && data.latestVersion && data.updateCommand) {
      // 非强制更新时的提示
      result = `UPDATE_AVAILABLE:${data.latestVersion}:${data.updateCommand}${MESSAGE_SEPARATOR}${t('update.available.message.header')}
${tp('update.version.line', { current: packageJson.version, latest: String(data.latestVersion) })}
${tp('update.command.line', { command: String(data.updateCommand) })}`;
    }

    // 保存缓存（非强制检查时）
    if (!forceCheck) {
      const cache: UpdateCheckCache = {
        lastCheckTime: now,
        lastResult: result,
        version: packageJson.version
      };
      await writeUpdateCheckCache(cache);
    }

    return result;
  } catch (e) {
    // 网络错误或其他错误时静默失败，不影响正常使用
    const message = tp('update.check.failed.generic', { error: String(e) });
    console.warn(message);
    return null;
  }
}

// 执行自动更新命令
export async function executeUpdateCommand(updateCommand: string): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(t('update.auto.exec.start'));
    console.log(tp('update.command.line', { command: updateCommand }));

    // 解析命令
    const [command, ...args] = updateCommand.split(' ');

    const updateProcess = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });

    updateProcess.on('close', (code) => {
      if (code === 0) {
        console.log(t('update.completed'));
        resolve(true);
      } else {
        console.error(tp('update.failed.code', { code: String(code) }));
        console.error(t('update.manual.run.hint'));
        resolve(false);
      }
    });

    updateProcess.on('error', (error) => {
      console.error(tp('update.exec.command.error', { error: error.message }));
      console.error(t('update.manual.run.hint'));
      resolve(false);
    });
  });
}
