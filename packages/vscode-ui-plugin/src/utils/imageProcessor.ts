/**
 * 简化的图片处理模块
 * 前端已压缩，后端直接转换为 GenAI Part
 */

import { Part } from '@google/genai';

export interface ImageContent {
  fileName: string;
  data: string;        // base64 (前端已压缩)
  mimeType: string;
  originalSize: number;
  compressedSize: number;
  width?: number;
  height?: number;
}

/**
 * 将图片内容转换为 GenAI Part
 */
export function processImageToPart(imageContent: ImageContent): Part {
  return {
    inlineData: {
      mimeType: imageContent.mimeType,
      data: imageContent.data
    }
  };
}

/**
 * 验证图片内容
 */
export function validateImageContent(imageContent: ImageContent): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!imageContent.fileName) {
    errors.push('File name is required');
  }

  if (!imageContent.data) {
    errors.push('Image data is required');
  }

  if (!imageContent.mimeType || !imageContent.mimeType.startsWith('image/')) {
    errors.push('Valid image MIME type is required');
  }

  if (imageContent.compressedSize > 10 * 1024 * 1024) { // 10MB limit
    errors.push('Image size exceeds 10MB limit');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const base = 1024;
  const index = Math.floor(Math.log(bytes) / Math.log(base));
  const size = bytes / Math.pow(base, index);

  return `${size.toFixed(1)} ${units[index]}`;
}