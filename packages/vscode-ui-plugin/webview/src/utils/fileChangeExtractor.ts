/**
 * 文件修改状态提取工具
 */

import { ChatMessage } from '../types';
import { ModifiedFile } from '../types/fileChanges';
import { TOOL_NAMES } from '../constants/toolConstants';

/**
 * 从聊天消息中提取修改的文件信息
 * @param messages 聊天消息列表
 * @param workspaceRoot 工作区根目录
 * @param startFromMessageId 从指定消息ID开始提取（不包含该消息）
 */
export function extractModifiedFiles(
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

    // 🎯 处理撤销逻辑：如果遇到撤销系统消息，从 Map 中移除该文件
    if (message.type === 'system' && (message as any).notificationType === 'undo_file') {
      const undonePath = (message as any).notificationTitle;
      if (undonePath) {
        filesMap.delete(undonePath);
        continue;
      }
    }

    // 遍历关联的toolCalls
    message.associatedToolCalls?.forEach(toolCall => {
      if (toolCall.result?.data?.fileDiff) {
        const diffData = toolCall.result.data;
        updateFileInMap(filesMap, diffData, workspaceRoot);
      }
      // 检测删除文件操作
      if (toolCall.toolName === TOOL_NAMES.DELETE_FILE && toolCall.result?.data) {
        const deleteData = toolCall.result.data;
        // delete-file现在返回FileDiff格式，需要转换为删除文件处理
        if (deleteData.fileDiff || deleteData.fileName) {
          updateDeletedFileFromFileDiff(filesMap, deleteData, workspaceRoot);
        }
      }
    });
  }

  return filesMap;
}

/**
 * 将绝对路径转换为相对路径用于显示
 */
function getDisplayPath(filePath: string, fileName: string, workspaceRoot?: string): string {
  if (!filePath) return fileName;

  // 如果filePath就是fileName，直接返回
  if (filePath === fileName) return fileName;

  // 🎯 如果有工作区根目录，计算相对路径
  if (workspaceRoot && filePath.startsWith(workspaceRoot)) {
    const relativePath = filePath.substring(workspaceRoot.length);
    let cleanPath = relativePath.startsWith('/') ? relativePath.substring(1) : relativePath;
    cleanPath = cleanPath.startsWith('\\') ? cleanPath.substring(1) : cleanPath;

    if (!cleanPath || cleanPath === fileName) {
      return '.';
    }
    return cleanPath;
  }

  // 🎯 如果没有工作区根目录，但filePath看起来像个路径（包含斜杠），尝试返回它
  if (filePath.includes('/') || filePath.includes('\\')) {
    // 如果是绝对路径且没有workspaceRoot，我们至少返回文件名及其父目录
    const parts = filePath.split(/[/\\]/);
    if (parts.length >= 2) {
      // 返回最后两级，例如 values-zh/strings.xml
      return parts.slice(-2).join('/');
    }
    return filePath;
  }

  return fileName;
}

/**
 * 获取工作区根目录
 */
function getWorkspaceRoot(): string | null {
  // 尝试从VSCode API获取工作区路径
  if (typeof window !== 'undefined' && (window as any).vscode) {
    // 这里可能需要通过消息传递获取工作区路径
    // 暂时使用简单的路径推断
    return null;
  }
  return null;
}


/**
 * 从FileDiff格式更新删除文件信息到文件映射表
 */
function updateDeletedFileFromFileDiff(filesMap: Map<string, ModifiedFile>, fileDiffData: any, workspaceRoot?: string): void {
  // 从FileDiff数据中提取文件信息
  const fileName = fileDiffData.fileName || '未知文件';
  const filePath = fileDiffData.filePath || '';
  const displayPath = getDisplayPath(filePath, fileName, workspaceRoot);

  // 获取删除的内容 (原始内容)
  const deletedContent = fileDiffData.originalContent || '';
  // newContent应该为空（文件被删除）
  const newContent = fileDiffData.newContent || '';

  // 对于删除操作，newContent应该是空的
  if (newContent !== '') {
    // 这可能不是删除操作，跳过
    return;
  }

  // 计算删除的行数
  const deletedLines = deletedContent ? deletedContent.split('\n').length : 0;

  // 🎯 使用完整路径作为Map的key，以区分同名但不同目录的文件（如Android项目的strings.xml）
  const mapKey = filePath || fileName;
  const existingFile = filesMap.get(mapKey);

  if (existingFile) {
    // 如果文件已存在于修改列表中，标记为已删除
    existingFile.isDeletedFile = true;
    existingFile.deletedContent = deletedContent;
    existingFile.modificationCount += 1;
    // 删除文件时，移除的行数就是原来的所有行数
    existingFile.linesRemoved += deletedLines;
    // 更新diff信息
    existingFile.latestFileDiff = fileDiffData.fileDiff || '';
    existingFile.latestNewContent = ''; // 删除后为空
  } else {
    // 添加新的删除文件记录
    filesMap.set(mapKey, {
      fileName,
      filePath: displayPath,
      absolutePath: filePath, // 🎯 保存绝对路径
      isNewFile: false,
      isDeletedFile: true,
      modificationCount: 1,
      firstOriginalContent: deletedContent,
      latestNewContent: '', // 删除文件后内容为空
      latestFileDiff: fileDiffData.fileDiff || '',
      linesAdded: 0,
      linesRemoved: deletedLines,
      deletedContent
    });
  }
}

/**
 * 更新文件映射表中的文件信息
 */
function updateFileInMap(filesMap: Map<string, ModifiedFile>, diffData: any, workspaceRoot?: string): void {
  const fileName = diffData.fileName || '未知文件';

  // 直接使用从后端传来的文件路径
  const rawFilePath = diffData.filePath || fileName;
  const displayPath = getDisplayPath(rawFilePath, fileName, workspaceRoot);

  // 检测是否为新文件
  const isNewFile = detectNewFile(diffData);

  // 解析行数统计
  const { linesAdded, linesRemoved } = parseDiffStats(diffData.fileDiff || '');

  // 🎯 使用完整路径作为Map的key，以区分同名但不同目录的文件（如Android项目的strings.xml）
  const mapKey = rawFilePath || fileName;
  const existingFile = filesMap.get(mapKey);

  if (existingFile) {
    // 更新现有文件
    existingFile.modificationCount += 1;
    // 保持第一次的原始内容不变，只更新最新内容
    existingFile.latestNewContent = diffData.newContent || '';
    existingFile.latestFileDiff = diffData.fileDiff || '';
    // 累加行数统计
    existingFile.linesAdded += linesAdded;
    existingFile.linesRemoved += linesRemoved;
    // 如果之前不是新文件，但这次是新文件，则标记为新文件
    if (!existingFile.isNewFile && isNewFile) {
      existingFile.isNewFile = true;
    }
  } else {
    // 添加新文件
    filesMap.set(mapKey, {
      fileName,
      filePath: displayPath,
      absolutePath: rawFilePath, // 🎯 保存绝对路径
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
 * 从diff内容中解析添加和删除的行数
 */
function parseDiffStats(diffContent: string): { linesAdded: number; linesRemoved: number } {
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
 * 检测是否为新文件
 */
function detectNewFile(diffData: any): boolean {
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

