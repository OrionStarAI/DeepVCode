/**
 * 独立的文件内容处理模块
 * 简化版本，用于 VSCode 插件
 */

import * as fs from 'fs';
import * as path from 'path';
import { Part } from '@google/genai';

export interface FileContentItem {
  fileName: string;
  filePath: string;
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
 */
function detectFileType(filePath: string): 'text' | 'binary' | 'image' {
  const ext = path.extname(filePath).toLowerCase();

  // 图片文件
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(ext)) {
    return 'image';
  }

  // 二进制文件
  if (['.zip', '.tar', '.gz', '.exe', '.dll', '.so', '.class', '.jar', '.war', '.7z',
       '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pdf', '.mp3', '.mp4',
       '.avi', '.mov', '.wav', '.flac'].includes(ext)) {
    return 'binary';
  }

  // 默认为文本文件
  return 'text';
}

/**
 * 简化的文件内容处理
 */
async function processSingleFileContent(filePath: string): Promise<{
  content: string;
  error?: string;
}> {
  try {
    if (!fs.existsSync(filePath)) {
      return { content: '', error: `File not found: ${filePath}` };
    }

    const stats = await fs.promises.stat(filePath);
    if (stats.isDirectory()) {
      return { content: '', error: `Path is a directory: ${filePath}` };
    }

    // 20MB 限制
    if (stats.size > 20 * 1024 * 1024) {
      return { content: '', error: `File too large: ${filePath}` };
    }

    const fileType = detectFileType(filePath);

    if (fileType === 'binary') {
      return { content: '', error: `Binary file cannot be processed: ${filePath}` };
    }

    if (fileType === 'image') {
      // 图片文件返回占位符
      return { content: `[Image file: ${path.basename(filePath)}]` };
    }

    // 文本文件
    const content = await fs.promises.readFile(filePath, 'utf8');
    return { content };

  } catch (error) {
    return {
      content: '',
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * 处理单个文件，生成两个 Part：
 * 1. 文件信息 Part（路径、说明）
 * 2. 文件内容 Part（文本内容）
 */
export async function processFileToPartsList(
  fileItem: FileContentItem,
  workspaceRoot?: string
): Promise<FileProcessingResult> {
  const { fileName, filePath } = fileItem;

  console.log(`🔍 [FileProcessor] 开始处理文件: ${fileName}, 路径: ${filePath}`);

  try {
    // 使用本地的文件类型检测
    const fileType = detectFileType(filePath);
    console.log(`🔍 [FileProcessor] 文件类型: ${fileType}`);

    // 二进制文件直接跳过，不传给 LLM
    if (fileType === 'binary') {
      console.warn(`⚠️ [FileProcessor] 二进制文件跳过: ${fileName}`);
      return {
        parts: [],
        skipped: true,
        skipReason: 'Binary file cannot be processed by LLM',
        fileType
      };
    }

    // 使用本地的文件内容处理
    const result = await processSingleFileContent(filePath);

    if (result.error) {
      console.error(`❌ [FileProcessor] 读取文件失败: ${fileName} - ${result.error}`);
      return {
        parts: [],
        skipped: true,
        skipReason: result.error,
        fileType
      };
    }

    console.log(`✅ [FileProcessor] 文件内容读取成功: ${fileName}, 长度: ${result.content.length} 字符`);

    const parts: Part[] = [];

    // 第一个 Part：文件信息说明
    const relativePath = workspaceRoot
      ? path.relative(workspaceRoot, filePath).replace(/\\/g, '/')
      : filePath;

    const fileInfoText = `--- File: ${relativePath} ---\n\nThe following content is from the file "${fileName}" located at "${filePath}" (type: ${fileType}):`;
    parts.push({
      text: fileInfoText
    });

    // 第二个 Part：文件内容
    parts.push({
      text: result.content
    });

    console.log(`✅ [FileProcessor] 生成 ${parts.length} 个 parts，准备发送给 AI`);

    return {
      parts,
      skipped: false,
      fileType,
      originalSize: undefined,
      compressedSize: undefined
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ [FileProcessor] 处理文件时异常: ${fileName} - ${errorMsg}`);
    return {
      parts: [],
      skipped: true,
      skipReason: errorMsg,
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
      skippedFiles.push({
        file,
        reason: result.skipReason || 'Unknown reason'
      });

      if (result.fileType === 'binary') {
        binaryFiles++;
      }
    } else {
      allParts.push(...result.parts);
      processedFiles.push(file);

      if (result.fileType === 'text' || result.fileType === 'svg') {
        textFiles++;
      } else if (['image', 'pdf', 'audio', 'video'].includes(result.fileType)) {
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

// 🎯 删除了向后兼容的 @[路径] 处理函数
// 现在完全使用结构化的 MessageContent 格式