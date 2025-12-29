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
 * 🎯 保守的 Token 控制策略：
 * - 文件大小限制：5MB（灵活实用）
 * - Token 限制：20,000 tokens（约 60KB 文本，确保不超过 API 限制）
 * - 成本：约 $0.38/次（Flash），经济实惠
 * - 响应时间：5-8 秒，快速响应
 * 
 * 注意：需要为系统提示词、VSCode 上下文等预留空间
 */
async function processTextFile(file: File): Promise<FileUploadResult> {
  const MAX_TOKENS = 20000; // 🎯 2 万 tokens（约 60KB，为系统提示词预留空间）
  
  // 1️⃣ 检查文件大小
  if (file.size > MAX_TEXT_FILE_SIZE) {
    throw new Error(
      `❌ 文件过大：${(file.size / 1024 / 1024).toFixed(2)}MB\n\n` +
      `当前限制：最大 5MB\n\n` +
      `💡 建议：\n` +
      `• 使用 @ 符号从项目中选择文件（无大小限制）\n` +
      `• 压缩或分割文件后再上传\n` +
      `• 提取关键部分单独上传`
    );
  }

  console.log(`📄 [FileUpload] 开始处理文本文件: ${file.name}, 大小: ${(file.size / 1024).toFixed(1)}KB`);
  
  // 2️⃣ 读取文件内容
  let content = await readFileAsText(file);
  const originalLength = content.length;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const language = LANGUAGE_MAP[ext];

  // 3️⃣ Token 估算和截断（保守估算：1 token = 3 字符）
  const estimatedTokens = Math.ceil(content.length / 3);
  let truncated = false;
  
  if (estimatedTokens > MAX_TOKENS) {
    console.warn(`⚠️ [FileUpload] 文件内容超过 token 限制: ${estimatedTokens.toLocaleString()} tokens (限制: ${MAX_TOKENS.toLocaleString()})`);
    const maxChars = MAX_TOKENS * 3; // 约 90KB
    content = content.substring(0, maxChars);
    
    // 添加清晰的截断提示
    const originalSizeKB = (originalLength / 1024).toFixed(1);
    const truncatedSizeKB = (maxChars / 1024).toFixed(1);
    content += `\n\n[⚠️ 文件内容已截断：为控制成本和响应时间，仅显示前 ~${MAX_TOKENS.toLocaleString()} tokens (约 ${truncatedSizeKB}KB)。原文件大小: ${originalSizeKB}KB]\n[提示：如需完整内容，建议分块提问或使用项目中的文件引用（@ 符号）]`;
    truncated = true;
    
    console.log(`✂️ [FileUpload] 内容已截断: ${originalLength.toLocaleString()} → ${maxChars.toLocaleString()} 字符`);
  }

  const finalTokens = Math.min(estimatedTokens, MAX_TOKENS);
  console.log(`✅ [FileUpload] 文本文件处理完成: ${file.name}${language ? ` (${language})` : ''}`);
  console.log(`   📊 统计: ${finalTokens.toLocaleString()} tokens, ${(content.length / 1024).toFixed(1)}KB, truncated: ${truncated}`);

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
