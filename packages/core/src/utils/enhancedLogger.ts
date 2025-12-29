/**
 * Enhanced Logger with File Output Support
 * 增强的日志器，支持文件输出
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'os';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  filePath?: string;
  maxFileSize?: number; // MB
  maxFiles?: number;
}

export class EnhancedLogger {
  private config: LogConfig;
  private logBuffer: string[] = [];

  constructor(config: Partial<LogConfig> = {}) {
    this.config = {
      level: LogLevel.INFO,
      enableConsole: true,
      enableFile: false,
      maxFileSize: 10, // 10MB
      maxFiles: 5,
      ...config,
    };

    // 默认日志文件路径
    if (this.config.enableFile && !this.config.filePath) {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      this.config.filePath = path.join(
        os.homedir(),
        '.deepv',
        'logs',
        `deepv-${timestamp}.log`
      );
    }
  }

  private formatMessage(level: string, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    return `[${timestamp}] [${level}] ${message} ${formattedArgs}`.trim();
  }

  private async writeToFile(message: string): Promise<void> {
    if (!this.config.enableFile || !this.config.filePath) return;

    try {
      // 确保目录存在
      await fs.mkdir(path.dirname(this.config.filePath), { recursive: true });
      
      // 检查文件大小并轮转
      await this.rotateLogIfNeeded();
      
      // 写入日志
      await fs.appendFile(this.config.filePath, message + '\n', 'utf-8');
    } catch (error) {
      console.error('写入日志文件失败:', error);
    }
  }

  private async rotateLogIfNeeded(): Promise<void> {
    if (!this.config.filePath) return;

    try {
      const stats = await fs.stat(this.config.filePath);
      const fileSizeMB = stats.size / (1024 * 1024);

      if (fileSizeMB > (this.config.maxFileSize || 10)) {
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
        const rotatedPath = this.config.filePath.replace('.log', `-${timestamp}.log`);
        
        await fs.rename(this.config.filePath, rotatedPath);
        
        // 清理旧日志文件
        await this.cleanOldLogs();
      }
    } catch (error) {
      // 文件不存在时忽略错误
      if ((error as any).code !== 'ENOENT') {
        console.error('日志轮转失败:', error);
      }
    }
  }

  private async cleanOldLogs(): Promise<void> {
    if (!this.config.filePath) return;

    try {
      const logDir = path.dirname(this.config.filePath);
      const files = await fs.readdir(logDir);
      const logFiles = files
        .filter(f => f.startsWith('deepv-') && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(logDir, f),
          time: fs.stat(path.join(logDir, f)).then(s => s.mtime)
        }));

      const sortedFiles = await Promise.all(
        logFiles.map(async f => ({ ...f, time: await f.time }))
      );

      sortedFiles.sort((a, b) => b.time.getTime() - a.time.getTime());

      // 保留最新的几个文件
      const filesToDelete = sortedFiles.slice(this.config.maxFiles || 5);
      
      for (const file of filesToDelete) {
        await fs.unlink(file.path);
      }
    } catch (error) {
      console.error('清理旧日志失败:', error);
    }
  }

  private log(level: LogLevel, levelName: string, message: string, ...args: any[]): void {
    if (level < this.config.level) return;

    const formattedMessage = this.formatMessage(levelName, message, ...args);

    if (this.config.enableConsole) {
      const consoleMethod = level >= LogLevel.ERROR ? console.error :
                           level >= LogLevel.WARN ? console.warn :
                           level >= LogLevel.INFO ? console.log : console.debug;
      consoleMethod(formattedMessage);
    }

    if (this.config.enableFile) {
      this.writeToFile(formattedMessage);
    }
  }

  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, 'INFO', message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, 'WARN', message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, 'ERROR', message, ...args);
  }

  // API调用专用日志方法
  logApiRequest(endpoint: string, requestData: any): void {
    this.debug('API请求', {
      endpoint,
      timestamp: new Date().toISOString(),
      requestSize: JSON.stringify(requestData).length,
      // 在调试模式下记录完整请求
      ...(process.env.FILE_DEBUG === '1' ? { requestData } : {})
    });
  }

  logApiResponse(endpoint: string, responseData: any): void {
    this.debug('API响应', {
      endpoint,
      timestamp: new Date().toISOString(),
      responseSize: JSON.stringify(responseData).length,
      // 在调试模式下记录完整响应
      ...(process.env.FILE_DEBUG === '1' ? { responseData } : {})
    });
  }
}

// 全局日志实例
export const logger = new EnhancedLogger({
  level: process.env.FILE_DEBUG === '1' ? LogLevel.DEBUG : LogLevel.INFO,
  enableConsole: true,
  enableFile: process.env.LOG_TO_FILE === 'true',
  filePath: process.env.LOG_FILE_PATH,
});