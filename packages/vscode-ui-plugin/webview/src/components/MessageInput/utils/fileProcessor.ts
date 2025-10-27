/**
 * 统一的文件处理工具
 * 处理图片压缩和文本文件读取
 */

import { FileType, FileUploadResult, LANGUAGE_MAP, SUPPORTED_TEXT_EXTENSIONS, SUPPORTED_IMAGE_EXTENSIONS } from './fileTypes';
import { processClipboardImage } from './imageProcessor';
import { detectFileType } from './fileTypeDetector';

const MAX_TEXT_FILE_SIZE = 5 * 1024 * 1024;  // 5MB
const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * 处理上传的文件
 */
export async function processFile(file: File): Promise<FileUploadResult> {
  const fileType = detectFileType(file.name);
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  // 检查文件是否真的被支持
  if (!SUPPORTED_IMAGE_EXTENSIONS.includes(ext) && !SUPPORTED_TEXT_EXTENSIONS.includes(ext)) {
    throw new Error(`不支持的文件类型: ${file.name}`);
  }

  if (fileType === FileType.IMAGE) {
    return await processImageFile(file);
  }

  if (fileType === FileType.TEXT) {
    return await processTextFile(file);
  }

  throw new Error(`无法识别文件类型: ${file.name}`);
}

/**
 * 处理图片文件
 */
async function processImageFile(file: File): Promise<FileUploadResult> {
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    throw new Error(
      `图片文件过大: ${(file.size / 1024 / 1024).toFixed(1)}MB (最大 10MB)`
    );
  }

  console.log(`🖼️ 开始处理图片: ${file.name}`);
  const imageRef = await processClipboardImage(file);

  if (!imageRef) {
    throw new Error(`图片处理失败: ${file.name}`);
  }

  console.log(`✅ 图片处理完成: ${file.name}`);

  return {
    type: FileType.IMAGE,
    id: imageRef.id,
    fileName: imageRef.fileName,
    size: file.size,
    imageData: {
      data: imageRef.data,
      mimeType: imageRef.mimeType,
      originalSize: imageRef.originalSize,
      compressedSize: imageRef.compressedSize,
      width: imageRef.width,
      height: imageRef.height,
    },
  };
}

/**
 * 处理文本文件（代码 + Markdown）
 */
async function processTextFile(file: File): Promise<FileUploadResult> {
  if (file.size > MAX_TEXT_FILE_SIZE) {
    throw new Error(
      `文本文件过大: ${(file.size / 1024 / 1024).toFixed(1)}MB (最大 5MB)`
    );
  }

  console.log(`📄 开始处理文本文件: ${file.name}`);
  const content = await readFileAsText(file);
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const language = LANGUAGE_MAP[ext];

  console.log(`✅ 文本文件处理完成: ${file.name}${language ? ` (${language})` : ''}`);

  return {
    type: FileType.TEXT,
    id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    fileName: file.name,
    size: file.size,
    textData: {
      content,
      language,
      encoding: 'utf-8',
    },
  };
}

/**
 * 尝试多种编码读取文件内容
 */
async function readFileAsText(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();

    // 优先尝试 UTF-8
    try {
      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(arrayBuffer);

      // 检查解码是否成功（是否有有效的文本内容）
      if (text && !text.includes('\uFFFD')) {
        return text;
      }
    } catch (error) {
      console.warn('UTF-8 解码失败，尝试其他编码');
    }

    // 回退到 UTF-8 + 允许替换无效字符
    const decoder = new TextDecoder('utf-8', { fatal: false });
    return decoder.decode(arrayBuffer);
  } catch (error) {
    throw new Error(
      `读取文件失败: ${error instanceof Error ? error.message : '未知错误'}`
    );
  }
}
