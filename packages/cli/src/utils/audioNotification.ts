/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { restoreWindowTitle } from '../gemini.js';

export enum NotificationSound {
  RESPONSE_COMPLETE = 'response-complete',
  CONFIRMATION_REQUIRED = 'confirmation-required',
  SELECTION_MADE = 'selection-made'
}

export interface AudioSettings {
  enabled: boolean;
  responseComplete: boolean;
  confirmationRequired: boolean;
  selectionMade: boolean;
}

export class AudioNotification {
  private static settings: AudioSettings = {
    enabled: true,
    responseComplete: true,
    confirmationRequired: true,
    selectionMade: true
  };

  private static initialized = false;

  static configure(settings: Partial<AudioSettings>) {
    this.settings = { ...this.settings, ...settings };
    this.initialized = true;
  }

  static initializeFromSettings(userSettings?: any) {
    if (this.initialized) return;

    const audioSettings = userSettings?.audioNotifications;
    if (audioSettings) {
      this.configure({
        enabled: audioSettings.enabled ?? true,
        responseComplete: audioSettings.responseComplete ?? true,
        confirmationRequired: audioSettings.confirmationRequired ?? true,
        selectionMade: audioSettings.selectionMade ?? true,
      });
    }
  }

  static setEnabled(enabled: boolean) {
    this.settings.enabled = enabled;
  }

  static async play(sound: NotificationSound): Promise<void> {
    if (!this.settings.enabled) return;

    // 检查具体音效是否启用
    switch (sound) {
      case NotificationSound.RESPONSE_COMPLETE:
        if (!this.settings.responseComplete) return;
        break;
      case NotificationSound.CONFIRMATION_REQUIRED:
        if (!this.settings.confirmationRequired) return;
        break;
      case NotificationSound.SELECTION_MADE:
        if (!this.settings.selectionMade) return;
        break;
    }

    try {
      // 优先尝试播放自定义音频文件
      await this.playCustomSound(sound);
    } catch (error) {
      console.debug('[AudioNotification] Custom sound failed, trying system command:', error);
      // 备选方案：使用系统命令
      await this.playWithSystemCommand(sound);
    }
  }

  private static async playCustomSound(sound: NotificationSound): Promise<void> {
    const soundFile = this.getSoundFile(sound);
    if (!fs.existsSync(soundFile)) {
      console.debug(`[AudioNotification] Sound file not found: ${soundFile}`);
      throw new Error(`Sound file not found: ${soundFile}`);
    }

    const platform = process.platform;

    try {
      switch (platform) {
        case 'win32':
          // Windows: 使用 PowerShell 播放 WAV 文件
          await this.executeCommand('powershell', [
            '-c',
            `(New-Object Media.SoundPlayer "${soundFile}").PlaySync()`
          ]);
          break;
        case 'darwin':
          // macOS: 使用 afplay 播放音频文件
          await this.executeCommand('afplay', [soundFile]);
          break;
        case 'linux':
          // Linux: 尝试多种音频播放命令
          try {
            await this.executeCommand('paplay', [soundFile]);
          } catch {
            try {
              await this.executeCommand('aplay', [soundFile]);
            } catch {
              await this.executeCommand('ffplay', ['-nodisp', '-autoexit', soundFile]);
            }
          }
          break;
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }
    } catch (error) {
      throw new Error(`Custom sound playback failed: ${error}`);
    }
  }

  private static async playWithSystemCommand(sound: NotificationSound): Promise<void> {
    const platform = process.platform;

    try {
      switch (platform) {
        case 'win32':
          // Windows: 使用不同频率的提示音区分不同类型
          const frequency = this.getSoundFrequency(sound);
          await this.executeCommand('powershell', ['-c', `[console]::beep(${frequency},200)`]);
          break;
        case 'darwin':
          // macOS: 使用不同的系统音效
          const macSound = this.getMacSystemSound(sound);
          await this.executeCommand('afplay', [macSound]);
          break;
        case 'linux':
          // Linux: 尝试多种音频播放命令
          const linuxSound = this.getLinuxSystemSound(sound);
          try {
            await this.executeCommand('paplay', [linuxSound]);
          } catch {
            try {
              await this.executeCommand('aplay', [linuxSound]);
            } catch {
              // 最后备选：使用不同频率的提示音
              const frequency = this.getSoundFrequency(sound);
              await this.executeCommand('speaker-test', ['-t', 'sine', '-f', frequency.toString(), '-l', '1', '-s', '1']);
            }
          }
          break;
        default:
          console.debug(`[AudioNotification] Unsupported platform: ${platform}`);
      }
    } catch (error) {
      console.debug(`[AudioNotification] System command failed:`, error);
    }
  }

  private static getSoundFrequency(sound: NotificationSound): number {
    switch (sound) {
      case NotificationSound.RESPONSE_COMPLETE:
        return 800; // 中音
      case NotificationSound.CONFIRMATION_REQUIRED:
        return 1000; // 高音
      case NotificationSound.SELECTION_MADE:
        return 600; // 低音
      default:
        return 800;
    }
  }

  private static getMacSystemSound(sound: NotificationSound): string {
    switch (sound) {
      case NotificationSound.RESPONSE_COMPLETE:
        return '/System/Library/Sounds/Glass.aiff';
      case NotificationSound.CONFIRMATION_REQUIRED:
        return '/System/Library/Sounds/Ping.aiff';
      case NotificationSound.SELECTION_MADE:
        return '/System/Library/Sounds/Pop.aiff';
      default:
        return '/System/Library/Sounds/Glass.aiff';
    }
  }

  private static getLinuxSystemSound(sound: NotificationSound): string {
    switch (sound) {
      case NotificationSound.RESPONSE_COMPLETE:
        return '/usr/share/sounds/alsa/Front_Left.wav';
      case NotificationSound.CONFIRMATION_REQUIRED:
        return '/usr/share/sounds/alsa/Front_Right.wav';
      case NotificationSound.SELECTION_MADE:
        return '/usr/share/sounds/alsa/Front_Center.wav';
      default:
        return '/usr/share/sounds/alsa/Front_Left.wav';
    }
  }

  private static executeCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: 'ignore',
        timeout: 2000 // 2秒超时
      });

      child.on('close', (code) => {
        // PowerShell 播放音频时可能返回 null 或非零代码，但实际播放成功
        // 只要没有 error 事件，就认为成功

        // 音频播放完成后，恢复CLI标题（特别是在Windows上PowerShell可能会影响标题）
        this.restoreCliTitle();

        resolve();
      });

      child.on('error', reject);
    });
  }

  /**
   * 恢复CLI标题 - 用于音频播放完成后恢复被PowerShell等子进程影响的标题
   */
  private static restoreCliTitle(): void {
    try {
      // 方法1: 使用主模块的标题恢复函数
      restoreWindowTitle();

      // 方法2: 备选 - 从环境变量恢复
      if (process.env.CLI_TITLE) {
        const windowTitle = process.env.CLI_TITLE.replace(
          // eslint-disable-next-line no-control-regex
          /[\x00-\x1F\x7F]/g,
          '',
        );
        process.stdout.write(`\x1b]2;${windowTitle}\x07`);
      }
    } catch (error) {
      // 静默处理错误，避免音频播放失败影响主要功能
      console.debug('[AudioNotification] Failed to restore CLI title:', error);
    }
  }

  private static getSoundFile(sound: NotificationSound): string {
    // 获取当前模块的目录
    const currentDir = path.dirname(fileURLToPath(import.meta.url));

    // 检测是否为打包版本 (dvcode.js)
    const currentFile = path.basename(fileURLToPath(import.meta.url));
    const isBundle = currentFile === 'dvcode.js';

    // 对于打包版本，音频文件在同级的 assets/sounds 目录
    // 对于开发版本，音频文件在 ../assets/sounds 目录
    const soundsDir = isBundle
      ? path.join(currentDir, 'assets/sounds')
      : path.join(currentDir, '../assets/sounds');

    return path.join(soundsDir, `${sound}.wav`);
  }

  /**
   * 测试音频播放功能
   */
  static async test(): Promise<void> {
    console.log('Testing audio notifications...');

    for (const sound of Object.values(NotificationSound)) {
      console.log(`Playing ${sound}...`);
      await this.play(sound as NotificationSound);
      // 等待一下再播放下一个
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('Audio test completed.');
  }
}
