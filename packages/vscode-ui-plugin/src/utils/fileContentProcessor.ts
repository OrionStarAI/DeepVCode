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
async function processSingleFileContent(filePath: string, startLine?: number, endLine?: number): Promise<{
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
    let content = await fs.promises.readFile(filePath, 'utf8');

    // 🎯 如果指定了行号范围，截取内容
    if (startLine !== undefined && endLine !== undefined) {
      const lines = content.split(/\r?\n/);
      // 行号是 1-based，数组索引是 0-based
      // startLine - 1 是起始索引
      // endLine 是结束索引（slice 不包含结束索引，所以不需要减 1，因为我们要包含 endLine 这一行）
      // 但是 slice 的第二个参数是 end index (exclusive)，所以如果是 endLine 行，索引是 endLine-1，slice 应该是 endLine
      const start = Math.max(0, startLine - 1);
      const end = Math.min(lines.length, endLine);

      if (start < lines.length) {
        content = lines.slice(start, end).join('\n');
      }
    }

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
  const { fileName, filePath, startLine, endLine } = fileItem;

  console.log(`🔍 [FileProcessor] 开始处理文件: ${fileName}, 路径: ${filePath}, 范围: ${startLine}-${endLine}`);

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
    const result = await processSingleFileContent(filePath, startLine, endLine);

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
    // 🎯 平台兼容性：统一使用 / 作为显示路径分隔符（跨平台标准，AI模型更容易理解）
    // path.relative() 在 Windows 上会返回 \ 分隔符，需要转换为 /
    const relativePath = workspaceRoot
      ? path.relative(workspaceRoot, filePath).replace(/\\/g, '/')
      : filePath;

    let fileInfoText = `--- File: ${relativePath} ---\n\nThe following content is from the file "${fileName}" located at "${filePath}" (type: ${fileType})`;

    if (startLine !== undefined && endLine !== undefined) {
      fileInfoText += ` (lines ${startLine}-${endLine}):`;
    } else {
      fileInfoText += ':';
    }

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