/**
 * 独立的文件内容处理模块
 * 简化版本，用于 VSCode 插件
 */

import * as fs from 'fs';
import * as path from 'path';
import { Part } from '@google/genai';
import { processSingleFileContent as coreProcessFile } from 'deepv-code-core';

export interface FileContentItem {
  fileName: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
}

export interface FileProcessingResult {
  parts: Part[];
  skipped: boolean;
  skipReason?: string;
  fileType: string;
  originalSize?: number;
  compressedSize?: number;
}

export interface MultipleFilesResult {
  allParts: Part[];
  processedFiles: FileContentItem[];
  skippedFiles: { file: FileContentItem; reason: string }[];
  summary: {
    totalFiles: number;
    processedCount: number;
    skippedCount: number;
    textFiles: number;
    imageFiles: number;
    binaryFiles: number;
  };
}

/**
 * 简化的文件类型检测
 * 移除了 Office 和 PDF，由后续逻辑或 Core 兜底处理
 */
function detectFileType(filePath: string): 'text' | 'binary' | 'image' | 'office_pdf' {
  const ext = path.extname(filePath).toLowerCase();

  // 图片文件
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico', '.cur'].includes(ext)) {
    return 'image';
  }

  // Office 和 PDF 文件
  if (['.doc', '.docx', '.xls', '.xlsx', '.pdf'].includes(ext)) {
    return 'office_pdf';
  }

  // 确认不支持的二进制文件和格式
  if (
    [
      // Archives
      '.zip', '.tar', '.gz', '.7z', '.rar', '.bz2', '.xz',
      // Executables/Binaries
      '.exe', '.dll', '.so', '.class', '.jar', '.war', '.bin', '.dat', '.obj', '.o', '.a', '.lib', '.wasm',
      // Python bytecode
      '.pyc', '.pyo', '.pyd',
      // Fonts
      '.ttf', '.otf', '.woff', '.woff2', '.eot',
      // Media
      '.mp3', '.mp4', '.m4a', '.wav', '.flac', '.ogg', '.avi', '.mov', '.wmv', '.mkv',
      // PPT (目前核心库暂不支持提取文本，仍视为二进制)
      '.ppt', '.pptx', '.odt', '.ods', '.odp'
    ].includes(ext)
  ) {
    return 'binary';
  }

  // 默认为文本文件
  return 'text';
}

/**
 * 健壮的二进制检测逻辑（基于内容采样）
 */
async function isBinaryContent(filePath: string): Promise<boolean> {
  let fileHandle: fs.promises.FileHandle | undefined;
  try {
    fileHandle = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.alloc(4096); // 读取前4KB
    const { bytesRead } = await fileHandle.read(buffer, 0, 4096, 0);

    if (bytesRead === 0) return false;

    // 检查空字节 (Null Byte) - 二进制文件的最强特征
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) return true;
    }

    return false;
  } catch {
    return false;
  } finally {
    if (fileHandle) await fileHandle.close();
  }
}

/**
 * 文件内容处理：本地处理文本，复杂格式委托给 core
 */
async function processSingleFileContent(
  filePath: string,
  rootDirectory: string,
  startLine?: number,
  endLine?: number
): Promise<{
  content: string | Part;
  error?: string;
  fileType: string;
}> {
  try {
    if (!fs.existsSync(filePath)) {
      return { content: '', error: `File not found: ${filePath}`, fileType: 'unknown' };
    }

    const stats = await fs.promises.stat(filePath);
    if (stats.isDirectory()) {
      return { content: '', error: `Path is a directory: ${filePath}`, fileType: 'directory' };
    }

    // 20MB 限制
    if (stats.size > 20 * 1024 * 1024) {
      return { content: '', error: `File too large: ${filePath}`, fileType: 'large' };
    }

    const fileType = detectFileType(filePath);

    if (fileType === 'binary') {
      return { content: '', error: `Binary file cannot be processed: ${filePath}`, fileType };
    }

    // 如果是 Office、PDF 或图片，委托给 core 处理
    if (fileType === 'office_pdf' || fileType === 'image') {
      const offset = startLine ? startLine - 1 : undefined;
      const limit = (startLine && endLine) ? (endLine - startLine + 1) : undefined;
      const result = await coreProcessFile(filePath, rootDirectory, offset, limit);

      if (result.error) {
        return { content: '', error: result.error, fileType };
      }

      // 处理 core 返回的内容 (string 或 Part)
      return {
        content: result.llmContent as any,
        fileType: fileType === 'office_pdf' ? 'text' : fileType // 提取后视为文本或图片
      };
    }

    // 对于疑似文本的文件，进行内容二次验证
    if (fileType === 'text' && stats.size > 0) {
      if (await isBinaryContent(filePath)) {
        return { content: '', error: `File appears to be binary: ${filePath}`, fileType: 'binary' };
      }
    }

    // 文本文件本地高效处理
    let content = await fs.promises.readFile(filePath, 'utf8');

    // 如果指定了行号范围，截取内容
    if (startLine !== undefined && endLine !== undefined) {
      const lines = content.split(/\r?\n/);
      const start = Math.max(0, startLine - 1);
      const end = Math.min(lines.length, endLine);
      if (start < lines.length) {
        content = lines.slice(start, end).join('\n');
      }
    }

    return { content, fileType: 'text' };

  } catch (error) {
    return {
      content: '',
      error: error instanceof Error ? error.message : String(error),
      fileType: 'unknown'
    };
  }
}

/**
 * 处理单个文件，生成 Parts 列表
 */
export async function processFileToPartsList(
  fileItem: FileContentItem,
  workspaceRoot?: string
): Promise<FileProcessingResult> {
  const { fileName, filePath, startLine, endLine } = fileItem;
  const rootDir = workspaceRoot || '';

  try {
    const result = await processSingleFileContent(filePath, rootDir, startLine, endLine);

    if (result.error) {
      return {
        parts: [],
        skipped: true,
        skipReason: result.error,
        fileType: result.fileType
      };
    }

    const parts: Part[] = [];
    const relativePath = workspaceRoot
      ? path.relative(workspaceRoot, filePath).replace(/\\/g, '/')
      : filePath;

    let fileInfoText = `--- File: ${relativePath} ---\n\nThe following content is from the file "${fileName}" (type: ${result.fileType})`;
    if (startLine !== undefined && endLine !== undefined) {
      fileInfoText += ` (lines ${startLine}-${endLine}):`;
    } else {
      fileInfoText += ':';
    }

    parts.push({ text: fileInfoText });

    if (typeof result.content === 'string') {
      parts.push({ text: result.content });
    } else {
      parts.push(result.content as Part);
    }

    return {
      parts,
      skipped: false,
      fileType: result.fileType
    };

  } catch (error) {
    return {
      parts: [],
      skipped: true,
      skipReason: error instanceof Error ? error.message : String(error),
      fileType: 'unknown'
    };
  }
}

/**
 * 处理多个文件，汇总所有 Part
 */
export async function processMultipleFilesToPartsList(
  files: FileContentItem[],
  workspaceRoot?: string
): Promise<MultipleFilesResult> {
  const allParts: Part[] = [];
  const processedFiles: FileContentItem[] = [];
  const skippedFiles: { file: FileContentItem; reason: string }[] = [];

  let textFiles = 0;
  let imageFiles = 0;
  let binaryFiles = 0;

  for (const file of files) {
    const result = await processFileToPartsList(file, workspaceRoot);

    if (result.skipped) {
      skippedFiles.push({ file, reason: result.skipReason || 'Unknown reason' });
      if (result.fileType === 'binary') binaryFiles++;
    } else {
      allParts.push(...result.parts);
      processedFiles.push(file);
      if (result.fileType === 'text') {
        textFiles++;
      } else {
        imageFiles++;
      }
    }
  }

  return {
    allParts,
    processedFiles,
    skippedFiles,
    summary: {
      totalFiles: files.length,
      processedCount: processedFiles.length,
      skippedCount: skippedFiles.length,
      textFiles,
      imageFiles,
      binaryFiles
    }
  };
}