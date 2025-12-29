/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { t } from '../ui/utils/i18n.js';

/**
 * 远程模式专用日志系统
 */
export class RemoteLogger {
  private static instance: RemoteLogger;
  private logFile: string;
  private logStream: fs.WriteStream;

  private constructor() {
    // 创建日志目录
    const logDir = path.join(os.homedir(), '.deepv', 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // 创建日志文件
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(logDir, `remote-${timestamp}.log`);

    // 创建写入流
    this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });

    console.log(`${t('cloud.remote.log.file')} ${this.logFile}`);
    this.log('INFO', 'RemoteLogger', '日志系统初始化完成');
  }

  static getInstance(): RemoteLogger {
    if (!RemoteLogger.instance) {
      RemoteLogger.instance = new RemoteLogger();
    }
    return RemoteLogger.instance;
  }

  private formatMessage(level: string, component: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? `\nDATA: ${JSON.stringify(data, null, 2)}` : '';
    return `[${timestamp}] [${level}] [${component}] ${message}${dataStr}\n`;
  }

  log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', component: string, message: string, data?: any): void {
    const formattedMessage = this.formatMessage(level, component, message, data);

    // 写入文件
    this.logStream.write(formattedMessage);

    // 云端模式下不输出到控制台，避免暴露敏感信息和干扰用户
    // 所有日志已写入日志文件，可通过日志文件查看详细信息
  }

  info(component: string, message: string, data?: any): void {
    this.log('INFO', component, message, data);
  }

  warn(component: string, message: string, data?: any): void {
    this.log('WARN', component, message, data);
  }

  error(component: string, message: string, data?: any): void {
    this.log('ERROR', component, message, data);
  }

  debug(component: string, message: string, data?: any): void {
    this.log('DEBUG', component, message, data);
  }

  getLogFile(): string {
    return this.logFile;
  }

  close(): void {
    this.logStream.end();
  }
}

// 导出单例实例
export const remoteLogger = RemoteLogger.getInstance();