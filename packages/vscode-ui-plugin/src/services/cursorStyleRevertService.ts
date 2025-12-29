/**
 * Cursor风格的回退服务
 * 核心思路：在AI修改文件之前，保存文件的完整内容，回退时直接恢复
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

interface FileBackup {
  filePath: string;
  content: string;
  existed: boolean; // 文件是否存在（区分新建和修改）
}

interface MessageBackup {
  messageId: string;
  timestamp: number;
  files: FileBackup[];
}

export class CursorStyleRevertService {
  private backups: Map<string, MessageBackup> = new Map();
  private workspaceRoot: string;
  
  constructor(private logger: Logger) {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  }

  /**
   * 在AI开始处理前备份所有相关文件
   */
  async backupBeforeAI(messageId: string): Promise<void> {
    try {
      this.logger.info(`💾 Creating backup for message: ${messageId}`);
      
      // 获取所有当前打开的文件
      const openFiles = vscode.workspace.textDocuments
        .filter(doc => !doc.isUntitled && doc.uri.scheme === 'file')
        .map(doc => doc.uri.fsPath);
      
      const backup: MessageBackup = {
        messageId,
        timestamp: Date.now(),
        files: []
      };

      // 备份所有打开的文件
      for (const filePath of openFiles) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          backup.files.push({
            filePath,
            content,
            existed: true
          });
        } catch (error) {
          this.logger.debug(`Failed to backup ${filePath}`, error);
        }
      }

      this.backups.set(messageId, backup);
      this.logger.info(`✅ Backed up ${backup.files.length} files for ${messageId}`);
      
      // 只保留最近20个备份
      this.cleanupOldBackups(20);
      
    } catch (error) {
      this.logger.error('Failed to create backup', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 在AI创建新文件时记录
   */
  async trackNewFile(messageId: string, filePath: string): Promise<void> {
    const backup = this.backups.get(messageId);
    if (backup) {
      backup.files.push({
        filePath,
        content: '',
        existed: false
      });
    }
  }

  /**
   * 回退到指定消息之前的状态
   */
  async revertToMessage(messageId: string): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.info(`🔄 Reverting to message: ${messageId}`);

      const backup = this.backups.get(messageId);
      if (!backup) {
        // 如果没有备份，尝试撤销最近的文件修改
        return await this.undoRecentChanges();
      }

      let revertedCount = 0;
      let deletedCount = 0;

      for (const fileBackup of backup.files) {
        try {
          const uri = vscode.Uri.file(fileBackup.filePath);
          
          if (fileBackup.existed) {
            // 文件原本存在，恢复内容
            await fs.promises.writeFile(fileBackup.filePath, fileBackup.content, 'utf-8');
            revertedCount++;
            this.logger.debug(`Restored: ${fileBackup.filePath}`);
          } else {
            // 文件是新创建的，删除它
            if (fs.existsSync(fileBackup.filePath)) {
              await vscode.workspace.fs.delete(uri);
              deletedCount++;
              this.logger.debug(`Deleted: ${fileBackup.filePath}`);
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to revert ${fileBackup.filePath}`, error);
        }
      }

      return {
        success: true,
        message: `已恢复 ${revertedCount} 个文件，删除 ${deletedCount} 个新文件`
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('Revert failed', error instanceof Error ? error : undefined);
      return {
        success: false,
        message: `回退失败: ${errorMsg}`
      };
    }
  }

  /**
   * 撤销最近的文件修改（降级方案）
   */
  private async undoRecentChanges(): Promise<{ success: boolean; message: string }> {
    try {
      // 获取workspace中最近修改的文件
      const recentFiles = await this.getRecentlyModifiedFiles();
      
      if (recentFiles.length === 0) {
        return {
          success: false,
          message: '没有找到可以回退的文件'
        };
      }

      let count = 0;
      for (const file of recentFiles) {
        try {
          // 尝试使用 VSCode 的撤销功能
          const document = await vscode.workspace.openTextDocument(file);
          const editor = await vscode.window.showTextDocument(document, { preview: false, preserveFocus: true });
          
          // 执行撤销命令
          await vscode.commands.executeCommand('undo');
          count++;
        } catch (error) {
          this.logger.debug(`Failed to undo ${file}`, error);
        }
      }

      if (count > 0) {
        return {
          success: true,
          message: `已撤销 ${count} 个文件的修改`
        };
      }

      return {
        success: false,
        message: '无法执行撤销操作'
      };

    } catch (error) {
      return {
        success: false,
        message: '撤销失败'
      };
    }
  }

  /**
   * 获取最近修改的文件
   */
  private async getRecentlyModifiedFiles(): Promise<string[]> {
    const files: string[] = [];
    
    // 获取所有打开的文档
    for (const doc of vscode.workspace.textDocuments) {
      if (!doc.isUntitled && doc.uri.scheme === 'file' && doc.isDirty) {
        files.push(doc.uri.fsPath);
      }
    }

    return files;
  }

  /**
   * 获取所有可回退的消息ID
   */
  getAllRevertableMessageIds(): string[] {
    return Array.from(this.backups.keys()).sort();
  }

  /**
   * 清理旧备份
   */
  private cleanupOldBackups(keepCount: number): void {
    if (this.backups.size <= keepCount) {
      return;
    }

    const sorted = Array.from(this.backups.entries())
      .sort((a, b) => b[1].timestamp - a[1].timestamp);
    
    const toDelete = sorted.slice(keepCount);
    for (const [messageId] of toDelete) {
      this.backups.delete(messageId);
    }
    
    this.logger.debug(`Cleaned up ${toDelete.length} old backups`);
  }

  /**
   * 清除所有备份
   */
  dispose(): void {
    this.backups.clear();
  }
}




