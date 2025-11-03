/**
 * 文件回滚服务
 * 负责处理消息回滚时对应的文件系统回滚操作
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { ChatMessage } from '../types/messages';
import { ROLLBACK_MESSAGES, FILE_OPERATION_MESSAGES } from '../i18n/messages';

// 🎯 复制共享类型到extension层，避免跨目录引用问题
interface ModifiedFile {
  fileName: string;
  filePath: string;
  isNewFile: boolean;
  isDeletedFile: boolean;
  modificationCount: number;
  firstOriginalContent: string;
  latestNewContent: string;
  latestFileDiff: string;
  linesAdded: number;
  linesRemoved: number;
  deletedContent?: string;
}

export interface FileRollbackResult {
  success: boolean;
  rolledBackFiles: string[];
  failedFiles: { fileName: string; error: string }[];
  totalFiles: number;
}

export class FileRollbackService {
  private static instance: FileRollbackService;
  private logger: Logger;

  private constructor(logger: Logger) {
    this.logger = logger;
  }

  public static getInstance(logger: Logger): FileRollbackService {
    if (!FileRollbackService.instance) {
      FileRollbackService.instance = new FileRollbackService(logger);
    }
    return FileRollbackService.instance;
  }

  /**
   * 🎯 核心方法：回滚文件到指定消息状态
   * @param messages 完整的消息历史
   * @param targetMessageId 回滚目标消息ID
   * @param workspaceRoot 工作区根目录
   */
  async rollbackFilesToMessage(
    messages: ChatMessage[],
    targetMessageId: string,
    workspaceRoot?: string
  ): Promise<FileRollbackResult> {
    this.logger.info(`🔄 ${ROLLBACK_MESSAGES.FILE_ROLLBACK_STARTED}: ${targetMessageId}`);

    try {
      // 🎯 1. 计算需要回滚的文件
      const filesToRollback = this.extractModifiedFiles(
        messages,
        workspaceRoot,
        targetMessageId // 从这个消息ID之后的修改都要回滚
      );

      this.logger.info(`📊 文件回滚分析:`, {
        targetMessageId,
        totalFilesToRollback: filesToRollback.size,
        fileList: Array.from(filesToRollback.keys())
      });

      if (filesToRollback.size === 0) {
        this.logger.info('📝 没有需要回滚的文件');
        return {
          success: true,
          rolledBackFiles: [],
          failedFiles: [],
          totalFiles: 0
        };
      }

      // 🎯 2. 执行文件回滚
      const result = await this.executeFileRollback(filesToRollback);

      this.logger.info(`✅ ${ROLLBACK_MESSAGES.FILE_ROLLBACK_COMPLETED}:`, {
        成功文件数: result.rolledBackFiles.length,
        失败文件数: result.failedFiles.length,
        总文件数: result.totalFiles
      });

      return result;

    } catch (error) {
      this.logger.error(`❌ ${ROLLBACK_MESSAGES.FILE_ROLLBACK_FAILED}:`, error instanceof Error ? error : undefined);
      return {
        success: false,
        rolledBackFiles: [],
        failedFiles: [{ fileName: 'unknown', error: error instanceof Error ? error.message : String(error) }],
        totalFiles: 0
      };
    }
  }

  /**
   * 🎯 执行文件回滚操作
   */
  private async executeFileRollback(filesToRollback: Map<string, ModifiedFile>): Promise<FileRollbackResult> {
    const rolledBackFiles: string[] = [];
    const failedFiles: { fileName: string; error: string }[] = [];

    // 🎯 并行处理所有文件回滚
    const rollbackPromises = Array.from(filesToRollback.entries()).map(
      async ([fileName, fileInfo]) => {
        try {
          await this.rollbackSingleFile(fileName, fileInfo);
          rolledBackFiles.push(fileName);
          this.logger.info(`✅ 文件回滚成功: ${fileName}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          failedFiles.push({ fileName, error: errorMsg });
          this.logger.error(`❌ 文件回滚失败 ${fileName}:`, error instanceof Error ? error : undefined);
        }
      }
    );

    await Promise.allSettled(rollbackPromises);

    return {
      success: failedFiles.length === 0,
      rolledBackFiles,
      failedFiles,
      totalFiles: filesToRollback.size
    };
  }

  /**
   * 🎯 回滚单个文件
   */
  private async rollbackSingleFile(fileName: string, fileInfo: ModifiedFile): Promise<void> {
    if (fileInfo.isDeletedFile) {
      // 🎯 恢复被删除的文件
      await this.restoreDeletedFile(fileInfo, fileName);

    } else if (fileInfo.isNewFile) {
      // 🎯 删除新建的文件
      await this.deleteNewFile(fileInfo, fileName);

    } else {
      // 🎯 恢复修改的文件到原始状态
      await this.restoreModifiedFile(fileInfo, fileName);
    }
  }

  /**
   * 🎯 恢复被删除的文件
   */
  private async restoreDeletedFile(fileInfo: ModifiedFile, fileName: string): Promise<void> {
    this.logger.info(`🔄 ${FILE_OPERATION_MESSAGES.RESTORING_DELETED_FILE(fileName)}`);

    const contentToRestore = fileInfo.deletedContent || fileInfo.firstOriginalContent;
    if (!contentToRestore) {
      throw new Error(`无法恢复文件 ${fileName}: 缺少原始内容`);
    }

    // 🎯 确保目录存在
    const dir = path.dirname(fileInfo.filePath);
    await fs.mkdir(dir, { recursive: true });

    // 🎯 写入文件内容
    await fs.writeFile(fileInfo.filePath, contentToRestore, 'utf8');
  }

  /**
   * 🎯 删除新建的文件
   */
  private async deleteNewFile(fileInfo: ModifiedFile, fileName: string): Promise<void> {
    this.logger.info(`🗑️ ${FILE_OPERATION_MESSAGES.DELETING_NEW_FILE(fileName)}`);

    try {
      // 检查文件是否存在
      await fs.access(fileInfo.filePath);

      // 文件存在，执行删除
      await fs.unlink(fileInfo.filePath);

    } catch (error) {
      // 如果文件不存在，则认为已经达到目标状态
      if (error instanceof Error && (error as any).code === 'ENOENT') {
        this.logger.info(FILE_OPERATION_MESSAGES.FILE_ALREADY_DELETED(fileName));
        return;
      }
      throw error;
    }
  }

  /**
   * 🎯 恢复修改的文件到原始状态
   */
  private async restoreModifiedFile(fileInfo: ModifiedFile, fileName: string): Promise<void> {
    this.logger.info(`📝 ${FILE_OPERATION_MESSAGES.REVERTING_MODIFIED_FILE(fileName)}`);

    if (!fileInfo.firstOriginalContent) {
      throw new Error(`无法恢复文件 ${fileName}: 缺少原始内容`);
    }

    try {
      // 检查文件是否存在
      await fs.access(fileInfo.filePath);

      // 恢复文件内容
      await fs.writeFile(fileInfo.filePath, fileInfo.firstOriginalContent, 'utf8');

    } catch (error) {
      if (error instanceof Error && (error as any).code === 'ENOENT') {
        this.logger.warn(`文件 ${fileName} 不存在，无法恢复`);
        throw new Error(`文件 ${fileName} 不存在，无法恢复`);
      }
      throw error;
    }
  }

  /**
   * 🎯 预览回滚操作（不实际执行）
   * 用于在用户确认前显示将要回滚的文件列表
   */
  async previewRollback(
    messages: ChatMessage[],
    targetMessageId: string,
    workspaceRoot?: string
  ): Promise<{
    filesToRestore: ModifiedFile[];    // 将要恢复的文件
    filesToDelete: ModifiedFile[];     // 将要删除的文件
    filesToRevert: ModifiedFile[];     // 将要回滚内容的文件
    totalFiles: number;
  }> {
    const filesToRollback = this.extractModifiedFiles(messages, workspaceRoot, targetMessageId);

    const filesToRestore: ModifiedFile[] = [];
    const filesToDelete: ModifiedFile[] = [];
    const filesToRevert: ModifiedFile[] = [];

    for (const [, fileInfo] of filesToRollback) {
      if (fileInfo.isDeletedFile) {
        filesToRestore.push(fileInfo);
      } else if (fileInfo.isNewFile) {
        filesToDelete.push(fileInfo);
      } else {
        filesToRevert.push(fileInfo);
      }
    }

    return {
      filesToRestore,
      filesToDelete,
      filesToRevert,
      totalFiles: filesToRollback.size
    };
  }

  /**
   * 🎯 从聊天消息中提取修改的文件信息（extension层专用版本）
   */
  private extractModifiedFiles(
    messages: ChatMessage[],
    workspaceRoot?: string,
    startFromMessageId?: string
  ): Map<string, ModifiedFile> {
    const filesMap = new Map<string, ModifiedFile>();

    // 如果指定了起始消息ID，找到该消息的索引
    let startIndex = 0;
    if (startFromMessageId) {
      const messageIndex = messages.findIndex(msg => msg.id === startFromMessageId);
      if (messageIndex !== -1) {
        startIndex = messageIndex + 1; // 从下一条消息开始
      }
    }

    // 从指定位置开始处理消息
    for (let i = startIndex; i < messages.length; i++) {
      const message = messages[i];

      // 检查消息是否有关联的工具调用
      if (message.associatedToolCalls) {
        message.associatedToolCalls.forEach(toolCall => {
          if (toolCall.result?.data?.fileDiff) {
            const diffData = toolCall.result.data;
            this.updateFileInMap(filesMap, diffData, workspaceRoot);
          }

          // 检测删除文件操作
          if (toolCall.toolName === 'delete_file' && toolCall.result?.data) {
            const deleteData = toolCall.result.data;
            if (deleteData.fileDiff || deleteData.fileName) {
              this.updateDeletedFileFromFileDiff(filesMap, deleteData, workspaceRoot);
            }
          }
        });
      }
    }

    return filesMap;
  }

  /**
   * 🎯 更新文件映射表中的文件信息
   */
  private updateFileInMap(filesMap: Map<string, ModifiedFile>, diffData: any, workspaceRoot?: string): void {
    const fileName = diffData.fileName || '未知文件';
    const rawFilePath = diffData.filePath || fileName;
    // 🎯 获取绝对路径用于文件操作
    const absolutePath = this.getAbsolutePath(rawFilePath, workspaceRoot);

    // 检测是否为新文件
    const isNewFile = this.detectNewFile(diffData);

    // 解析行数统计
    const { linesAdded, linesRemoved } = this.parseDiffStats(diffData.fileDiff || '');

    const existingFile = filesMap.get(fileName);

    if (existingFile) {
      // 更新现有文件
      existingFile.modificationCount += 1;
      existingFile.latestNewContent = diffData.newContent || '';
      existingFile.latestFileDiff = diffData.fileDiff || '';
      existingFile.linesAdded += linesAdded;
      existingFile.linesRemoved += linesRemoved;
      if (!existingFile.isNewFile && isNewFile) {
        existingFile.isNewFile = true;
      }
    } else {
      // 添加新文件
      filesMap.set(fileName, {
        fileName,
        filePath: absolutePath, // 🎯 使用绝对路径用于文件操作
        isNewFile,
        isDeletedFile: false,
        modificationCount: 1,
        firstOriginalContent: diffData.originalContent || '',
        latestNewContent: diffData.newContent || '',
        latestFileDiff: diffData.fileDiff || '',
        linesAdded,
        linesRemoved
      });
    }
  }

  /**
   * 🎯 从FileDiff格式更新删除文件信息到文件映射表
   */
  private updateDeletedFileFromFileDiff(filesMap: Map<string, ModifiedFile>, fileDiffData: any, workspaceRoot?: string): void {
    const fileName = fileDiffData.fileName || '未知文件';
    const filePath = fileDiffData.filePath || '';
    // 🎯 获取绝对路径用于文件操作
    const absolutePath = this.getAbsolutePath(filePath, workspaceRoot);

    const deletedContent = fileDiffData.originalContent || '';
    const newContent = fileDiffData.newContent || '';

    // 对于删除操作，newContent应该是空的
    if (newContent !== '') {
      return;
    }

    const deletedLines = deletedContent ? deletedContent.split('\n').length : 0;
    const existingFile = filesMap.get(fileName);

    if (existingFile) {
      existingFile.isDeletedFile = true;
      existingFile.deletedContent = deletedContent;
      existingFile.modificationCount += 1;
      existingFile.linesRemoved += deletedLines;
      existingFile.latestFileDiff = fileDiffData.fileDiff || '';
      existingFile.latestNewContent = '';
    } else {
      filesMap.set(fileName, {
        fileName,
        filePath: absolutePath, // 🎯 使用绝对路径用于文件操作
        isNewFile: false,
        isDeletedFile: true,
        modificationCount: 1,
        firstOriginalContent: deletedContent,
        latestNewContent: '',
        latestFileDiff: fileDiffData.fileDiff || '',
        linesAdded: 0,
        linesRemoved: deletedLines,
        deletedContent
      });
    }
  }

  /**
   * 🎯 获取绝对路径用于文件操作
   * 
   * 平台兼容性处理：
   * - Mac/Linux: 使用 / 作为路径分隔符
   * - Windows: 使用 \ 作为路径分隔符，支持 C:\ 格式的驱动器盘符
   * - 使用 Node.js path 模块统一处理，确保跨平台兼容
   */
  private getAbsolutePath(filePath: string, workspaceRoot?: string): string {
    if (!filePath) {
      return workspaceRoot || '';
    }

    // 🎯 统一路径分隔符（将 / 和 \ 都转换为当前系统的分隔符）
    const normalizedFilePath = path.normalize(filePath);

    // 🎯 检测是否已经是绝对路径
    // path.isAbsolute() 可以正确处理：
    // - Mac/Linux: /Users/xxx
    // - Windows: C:\Users\xxx 或 \\server\share
    if (path.isAbsolute(normalizedFilePath)) {
      return normalizedFilePath;
    }

    // 🎯 如果有工作区根目录，组合成绝对路径
    if (workspaceRoot) {
      // 使用 path.join 自动处理路径分隔符，确保跨平台兼容
      return path.join(workspaceRoot, normalizedFilePath);
    }

    // 🎯 否则返回规范化后的路径
    return normalizedFilePath;
  }



  /**
   * 🎯 从diff内容中解析添加和删除的行数
   */
  private parseDiffStats(diffContent: string): { linesAdded: number; linesRemoved: number } {
    if (!diffContent) {
      return { linesAdded: 0, linesRemoved: 0 };
    }

    const lines = diffContent.split('\n');
    let linesAdded = 0;
    let linesRemoved = 0;

    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        linesAdded++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        linesRemoved++;
      }
    }

    return { linesAdded, linesRemoved };
  }

  /**
   * 🎯 检测是否为新文件
   */
  private detectNewFile(diffData: any): boolean {
    // 方法1: 检查originalContent是否为空
    if (!diffData.originalContent || diffData.originalContent.trim() === '') {
      return true;
    }

    // 方法2: 检查diff内容中是否包含新文件标记
    if (diffData.fileDiff) {
      const diffLines = diffData.fileDiff.split('\n');
      for (const line of diffLines) {
        if (line.includes('new file mode') ||
            line.includes('--- /dev/null') ||
            line.includes('--- a/dev/null')) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 🎯 清理和重置
   */
  dispose(): void {
    this.logger.info('🔄 FileRollbackService disposed');
  }
}