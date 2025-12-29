/**
 * 文件类型检测工具
 */

import { FileType, SUPPORTED_TEXT_EXTENSIONS, SUPPORTED_IMAGE_EXTENSIONS } from './fileTypes';

/**
 * 根据文件名检测文件类型
 */
export function detectFileType(fileName: string): FileType {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
    return FileType.IMAGE;
  }

  if (SUPPORTED_TEXT_EXTENSIONS.includes(ext)) {
    return FileType.TEXT;
  }

  return FileType.IMAGE; // 默认作为未知类型（会在处理时抛出错误）
}

/**
 * 检查文件是否支持
 */
export function isSupportedFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return (
    SUPPORTED_IMAGE_EXTENSIONS.includes(ext) ||
    SUPPORTED_TEXT_EXTENSIONS.includes(ext)
  );
}
