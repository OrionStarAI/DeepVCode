/**
 * 简单回退服务 - 基于Git的实现
 * 不依赖复杂的版本控制，直接使用Git命令
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface SimpleRevertResult {
  success: boolean;
  message: string;
  revertedFiles?: string[];
  error?: string;
}

interface FileSnapshot {
  messageId: string;
  timestamp: number;
  files: Map<string, string>; // filepath -> content
  commitHash?: string;
}

export class SimpleRevertService {
  private snapshots: Map<string, FileSnapshot> = new Map(); // messageId -> snapshot
  private workspaceRoot: string;
  
  constructor(private logger: Logger) {
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  }

  /**
   * 在AI修改文件前创建快照
   */
  async createSnapshot(messageId: string, filesWillModify?: string[]): Promise<void> {
    try {
      this.logger.info(`📸 Creating snapshot for message: ${messageId}`);
      
      const snapshot: FileSnapshot = {
        messageId,
        timestamp: Date.now(),
        files: new Map()
      };

      // 如果指定了文件列表，只快照这些文件
      if (filesWillModify && filesWillModify.length > 0) {
        for (const filePath of filesWillModify) {
          try {
            const fullPath = path.isAbsolute(filePath) 
              ? filePath 
              : path.join(this.workspaceRoot, filePath);
            
            if (fs.existsSync(fullPath)) {
              const content = fs.readFileSync(fullPath, 'utf-8');
              snapshot.files.set(filePath, content);
              this.logger.debug(`Saved snapshot of ${filePath}`);
            }
          } catch (error) {
            this.logger.warn(`Failed to snapshot file ${filePath}`, error);
          }
        }
      }

      // 尝试创建Git commit作为备份
      try {
        const commitHash = await this.createGitCommit(messageId);
        if (commitHash) {
          snapshot.commitHash = commitHash;
          this.logger.info(`Created git commit: ${commitHash}`);
        }
      } catch (error) {
        this.logger.debug('Git commit failed, using file snapshots only');
      }

      this.snapshots.set(messageId, snapshot);
      this.logger.info(`✅ Snapshot created for ${snapshot.files.size} files`);
      
    } catch (error) {
      this.logger.error('Failed to create snapshot', error instanceof Error ? error : undefined);
    }
  }

  /**
   * 回退到指定消息的状态
   */
  async revertToMessage(messageId: string): Promise<SimpleRevertResult> {
    try {
      this.logger.info(`🔄 Reverting to message: ${messageId}`);

      // 方案1: 尝试使用Git回退
      const gitResult = await this.tryGitRevert(messageId);
      if (gitResult.success) {
        return gitResult;
      }

      // 方案2: 使用文件快照回退
      const snapshot = this.snapshots.get(messageId);
      if (snapshot && snapshot.files.size > 0) {
        return await this.revertFromSnapshot(snapshot);
      }

      // 方案3: 简单的撤销最近的修改
      return await this.simpleUndo();
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error('Revert failed', error instanceof Error ? error : undefined);
      return {
        success: false,
        message: '回退失败',
        error: errorMsg
      };
    }
  }

  /**
   * 获取可回退的消息ID列表
   */
  getRevertableMessageIds(): string[] {
    return Array.from(this.snapshots.keys()).sort();
  }

  /**
   * 使用Git回退
   */
  private async tryGitRevert(messageId: string): Promise<SimpleRevertResult> {
    try {
      const snapshot = this.snapshots.get(messageId);
      if (!snapshot?.commitHash) {
        return { success: false, message: 'No git commit found' };
      }

      // 执行git reset到指定commit
      await this.execGitCommand(['reset', '--hard', snapshot.commitHash]);
      
      return {
        success: true,
        message: `已通过Git回退到: ${messageId}`,
        revertedFiles: Array.from(snapshot.files.keys())
      };
      
    } catch (error) {
      this.logger.debug('Git revert failed', error);
      return { success: false, message: 'Git revert failed' };
    }
  }

  /**
   * 从快照恢复文件
   */
  private async revertFromSnapshot(snapshot: FileSnapshot): Promise<SimpleRevertResult> {
    const revertedFiles: string[] = [];
    const edit = new vscode.WorkspaceEdit();

    for (const [filePath, content] of snapshot.files) {
      try {
        const fullPath = path.isAbsolute(filePath) 
          ? filePath 
          : path.join(this.workspaceRoot, filePath);
        
        const uri = vscode.Uri.file(fullPath);
        
        // 如果文件存在，替换内容；如果不存在，创建文件
        if (fs.existsSync(fullPath)) {
          const document = await vscode.workspace.openTextDocument(uri);
          const fullRange = new vscode.Range(
            document.lineAt(0).range.start,
            document.lineAt(document.lineCount - 1).range.end
          );
          edit.replace(uri, fullRange, content);
        } else {
          edit.createFile(uri, { contents: Buffer.from(content, 'utf-8') });
        }
        
        revertedFiles.push(filePath);
      } catch (error) {
        this.logger.warn(`Failed to revert file ${filePath}`, error);
      }
    }

    const success = await vscode.workspace.applyEdit(edit);
    
    return {
      success,
      message: success ? `已恢复 ${revertedFiles.length} 个文件` : '恢复失败',
      revertedFiles
    };
  }

  /**
   * 简单撤销（删除最近创建的文件）
   */
  private async simpleUndo(): Promise<SimpleRevertResult> {
    try {
      // 获取最近修改的文件（通过Git status）
      const modifiedFiles = await this.getRecentlyModifiedFiles();
      
      if (modifiedFiles.length === 0) {
        return {
          success: false,
          message: '没有找到最近修改的文件'
        };
      }

      const edit = new vscode.WorkspaceEdit();
      const revertedFiles: string[] = [];

      for (const file of modifiedFiles) {
        const uri = vscode.Uri.file(path.join(this.workspaceRoot, file));
        
        // 检查是否是新文件
        const isNew = await this.isNewFile(file);
        if (isNew) {
          // 删除新文件
          edit.deleteFile(uri);
          revertedFiles.push(file);
        }
      }

      if (revertedFiles.length > 0) {
        const success = await vscode.workspace.applyEdit(edit);
        return {
          success,
          message: `已删除 ${revertedFiles.length} 个新创建的文件`,
          revertedFiles
        };
      }

      return {
        success: false,
        message: '没有可撤销的操作'
      };
      
    } catch (error) {
      return {
        success: false,
        message: '撤销失败',
        error: String(error)
      };
    }
  }

  /**
   * 创建Git commit
   */
  private async createGitCommit(messageId: string): Promise<string | null> {
    try {
      // 添加所有修改
      await this.execGitCommand(['add', '-A']);
      
      // 创建commit
      const message = `AI checkpoint: ${messageId}`;
      await this.execGitCommand(['commit', '-m', message, '--allow-empty']);
      
      // 获取commit hash
      const hash = await this.execGitCommand(['rev-parse', 'HEAD']);
      return hash.trim();
      
    } catch (error) {
      this.logger.debug('Failed to create git commit', error);
      return null;
    }
  }

  /**
   * 获取最近修改的文件
   */
  private async getRecentlyModifiedFiles(): Promise<string[]> {
    try {
      const output = await this.execGitCommand(['status', '--porcelain']);
      const lines = output.split('\n').filter(line => line.trim());
      
      const files: string[] = [];
      for (const line of lines) {
        const match = line.match(/^[AM\?\s]+\s+(.+)$/);
        if (match) {
          files.push(match[1]);
        }
      }
      
      return files;
    } catch {
      return [];
    }
  }

  /**
   * 检查是否是新文件
   */
  private async isNewFile(filePath: string): Promise<boolean> {
    try {
      const output = await this.execGitCommand(['status', '--porcelain', filePath]);
      return output.startsWith('??') || output.startsWith('A');
    } catch {
      return false;
    }
  }

  /**
   * 执行Git命令
   */
  private execGitCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      cp.exec(
        `git ${args.join(' ')}`,
        { cwd: this.workspaceRoot },
        (error, stdout, stderr) => {
          if (error) {
            reject(error);
          } else {
            resolve(stdout);
          }
        }
      );
    });
  }

  /**
   * 清理旧快照
   */
  cleanupOldSnapshots(keepCount: number = 10): void {
    if (this.snapshots.size <= keepCount) {
      return;
    }

    const sorted = Array.from(this.snapshots.entries())
      .sort((a, b) => b[1].timestamp - a[1].timestamp);
    
    const toDelete = sorted.slice(keepCount);
    for (const [messageId] of toDelete) {
      this.snapshots.delete(messageId);
    }
    
    this.logger.debug(`Cleaned up ${toDelete.length} old snapshots`);
  }

  dispose(): void {
    this.snapshots.clear();
  }
}



