/**
 * MessageContent 工具函数
 * 处理新的原始结构化消息内容，提供不同场景的拼装方法
 */

import { MessageContent, MessageContentPart } from '../types';

// 导入 Lexical 相关类型和函数（用于编辑器恢复）
import type { LexicalEditor } from 'lexical';
import { $getRoot, $createTextNode, $createParagraphNode } from 'lexical';

/**
 * 🎯 新增：用于UI显示的拼装方法
 * 将原始结构拼装成用户可读的文本
 */
export function assembleForDisplay(content: MessageContent): string {
  if (!content || !Array.isArray(content)) {
    console.warn('assembleForDisplay: invalid content:', content);
    return '';
  }

  // 🎯 调试：检查是否有重复的内容
  if (content.length > 1) {
    const textParts = content.filter(part => part.type === 'text');
    if (textParts.length > 1) {
      console.warn('🔍 [DEBUG] Multiple text parts detected:', textParts);
      console.warn('🔍 [DEBUG] Full content:', content);
    }
  }

  return content.map(part => {
    switch(part.type) {
      case 'text':
        return part.value;
      case 'file_reference':
        return `@[${part.value.fileName}]`;
      case 'image_reference':
        return `[IMAGE:${part.value.fileName}]`;
      case 'text_file_content':  // ✨ 新增：显示上传的文本文件
        return `@[${part.value.fileName}]`;
      default:
        return '';
    }
  }).join('');
}

/**
 * 🎯 新增：用于LLM处理的拼装方法
 * 将原始结构拼装成适合AI处理的格式
 */
export function assembleForLLM(content: MessageContent): {
  text: string;
  files: Array<{ fileName: string; filePath: string }>;
  images: Array<any>
} {
  if (!content || !Array.isArray(content)) {
    return { text: '', files: [], images: [] };
  }

  const textParts: string[] = [];
  const files: Array<{ fileName: string; filePath: string }> = [];
  const images: Array<any> = [];

  content.forEach(part => {
    switch(part.type) {
      case 'text':
        textParts.push(part.value);
        break;
      case 'file_reference':
        textParts.push(`@[${part.value.fileName}]`);
        files.push(part.value);
        break;
      case 'image_reference':
        textParts.push(`[IMAGE:${part.value.fileName}]`);
        images.push(part.value);
        break;
      case 'text_file_content':  // ✨ 新增：处理上传的文本文件
        textParts.push(`@[${part.value.fileName}]`);
        break;
    }
  });

  return {
    text: textParts.join(''),
    files,
    images
  };
}

/**
 * 🎯 修改：保持向后兼容的显示方法
 * 现在内部调用 assembleForDisplay
 */
export function messageContentToString(content: MessageContent): string {
  return assembleForDisplay(content);
}

/**
 * 创建纯文本 MessageContent（原始结构）
 */
export function createTextMessageContent(text: string): MessageContent {
  return [{ type: 'text', value: text }];
}

/**
 * 🎯 新增：创建文件引用 MessageContent
 */
export function createFileReferenceContent(fileName: string, filePath: string): MessageContentPart {
  return { type: 'file_reference', value: { fileName, filePath } };
}

/**
 * 🎯 新增：创建图片引用 MessageContent
 */
export function createImageReferenceContent(imageData: any): MessageContentPart {
  return { type: 'image_reference', value: imageData };
}

/**
 * 检查 MessageContent 是否为空
 */
export function isMessageContentEmpty(content: MessageContent): boolean {
  if (!content || content.length === 0) {
    return true;
  }

  return content.every(part => {
    if (part.type === 'text') {
      return !part.value.trim();
    }
    return false; // 文件和图片引用不算空
  });
}

/**
 * 🎯 新增：检查是否包含文件引用
 */
export function hasFileReferences(content: MessageContent): boolean {
  return content.some(part => part.type === 'file_reference');
}

/**
 * 🎯 新增：检查是否包含图片引用
 */
export function hasImageReferences(content: MessageContent): boolean {
  return content.some(part => part.type === 'image_reference');
}

/**
 * 🎯 新增：提取所有文件引用
 */
export function extractFileReferences(content: MessageContent): Array<{ fileName: string; filePath: string }> {
  return content
    .filter(part => part.type === 'file_reference')
    .map(part => part.value as { fileName: string; filePath: string });
}

/**
 * 🎯 新增：提取所有图片引用
 */
export function extractImageReferences(content: MessageContent): Array<any> {
  return content
    .filter(part => part.type === 'image_reference')
    .map(part => part.value);
}

/**
 * 🎯 新增：从原始内容恢复编辑器状态
 * 将原始结构化内容重新构建到 Lexical 编辑器中
 */
export function restoreToEditor(
  content: MessageContent,
  editor: LexicalEditor,
  // 动态导入节点创建函数，避免循环依赖
  createFileReferenceNode: (fileName: string, filePath: string) => any,
  createImageReferenceNode: (imageData: any) => any
): void {
  if (!editor || !content) {
    console.warn('restoreToEditor: invalid parameters', { editor, content });
    return;
  }

  editor.update(() => {
    const root = $getRoot();
    root.clear();

    // 如果没有内容，添加一个空段落
    if (content.length === 0) {
      root.append($createParagraphNode());
      return;
    }

    // 创建一个段落来包含所有内容
    const paragraph = $createParagraphNode();

    content.forEach((part, index) => {
      try {
        switch(part.type) {
          case 'text':
            if (part.value) {
              paragraph.append($createTextNode(part.value));
            }
            break;

          case 'file_reference':
            if (part.value?.fileName && part.value?.filePath) {
              const fileNode = createFileReferenceNode(part.value.fileName, part.value.filePath);
              paragraph.append(fileNode);
            }
            break;

          case 'image_reference':
            if (part.value) {
              const imageNode = createImageReferenceNode(part.value);
              paragraph.append(imageNode);
            }
            break;
        }
      } catch (error) {
        console.error('restoreToEditor: error processing part', part, error);
      }
    });

    root.append(paragraph);

    // 将光标移动到末尾
    paragraph.selectEnd();
  });
}

/**
 * 🎯 新增：检查原始内容是否有效
 */
export function isValidRawContent(content: MessageContent): boolean {
  if (!Array.isArray(content)) {
    return false;
  }

  return content.every(part => {
    if (!part || typeof part !== 'object' || !part.type) {
      return false;
    }

    switch(part.type) {
      case 'text':
        return typeof part.value === 'string';
      case 'file_reference':
        return part.value &&
               typeof part.value.fileName === 'string' &&
               typeof part.value.filePath === 'string';
      case 'image_reference':
        return part.value && typeof part.value === 'object';
      default:
        return false;
    }
  });
}

/**
 * 🎯 新增：为后端API转换MessageContent格式
 * 将新的原始结构转换为后端期望的格式
 */
export function convertForBackend(content: MessageContent): any {
  // 直接返回原始内容，让后端处理新格式
  return content;
}