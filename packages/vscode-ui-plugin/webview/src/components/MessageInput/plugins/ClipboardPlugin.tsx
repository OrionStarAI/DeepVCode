/**
 * 剪切板处理插件
 * 处理图片粘贴和智能代码引用检测
 * 
 * 功能：
 * 1. 图片粘贴 - 直接处理
 * 2. VSCode代码粘贴 - 请求后端缓存，智能创建代码引用节点
 * 3. 普通文本粘贴 - 默认处理
 */

import React from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, $createTextNode, COMMAND_PRIORITY_HIGH, PASTE_COMMAND } from 'lexical';
import { ImageReference, processClipboardImage } from '../utils/imageProcessor';
import { $createCodeReferenceNode } from '../nodes/CodeReferenceNode';
import { getGlobalMessageService } from '../../../services/globalMessageService';

interface ClipboardPluginProps {
  onImagePaste: (imageData: ImageReference) => void;
}

/**
 * 检测是否是 VSCode 复制的代码
 */
function isVSCodeCode(clipboardData: DataTransfer): boolean {
  return clipboardData.types.includes('vscode-editor-data');
}

// 🎯 剪切板处理插件
export function ClipboardPlugin({ onImagePaste }: ClipboardPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [isProcessing, setIsProcessing] = React.useState(false);

  React.useEffect(() => {
    // 🎯 使用 Lexical 的 PASTE_COMMAND（高优先级）来拦截所有粘贴
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        const clipboardData = event.clipboardData;
        if (!clipboardData || isProcessing) return false;

        // 🎯 优先检查是否有图片
        const items = Array.from(clipboardData.items);
        const imageItem = items.find(item => item.type.startsWith('image/'));

        if (imageItem) {
          event.preventDefault();
          setIsProcessing(true);

          // 🎯 异步处理图片（不阻塞命令返回）
          (async () => {
            try {
              const file = imageItem.getAsFile();
              if (file) {
                const imageData = await processClipboardImage(file);
                if (imageData) {
                  onImagePaste(imageData);
                }
              }
            } catch (error) {
              console.error('Failed to process pasted image:', error);
            } finally {
              setIsProcessing(false);
            }
          })();
          
          return true; // 🎯 已处理，阻止 Lexical 默认粘贴
        }

        // 🎯 检查是否是 VSCode 复制的代码
        if (isVSCodeCode(clipboardData)) {
          const plainText = clipboardData.getData('text/plain');
          if (!plainText.trim()) {
            return false; // 空文本，使用 Lexical 默认处理
          }

          event.preventDefault();
          setIsProcessing(true);

          // 🎯 异步处理代码粘贴（不阻塞命令返回）
          (async () => {
            try {
              const messageService = getGlobalMessageService();
              
              // 🎯 创建一个 Promise 来等待后端响应
              const cachePromise = new Promise<{
                found: boolean;
                fileName?: string;
                filePath?: string;
                code?: string;
                startLine?: number;
                endLine?: number;
              }>((resolve) => {
                let resolved = false;
                
                const timeoutId = setTimeout(() => {
                  if (!resolved) {
                    resolved = true;
                    resolve({ found: false });
                  }
                }, 1000); // 1秒超时

                // 🎯 创建一次性处理器（避免内存泄漏）
                const handler = (data: any) => {
                  if (!resolved) {
                    resolved = true;
                    clearTimeout(timeoutId);
                    resolve(data);
                  }
                };
                
                messageService.onClipboardCacheResponse(handler);
              });

              // 🎯 请求后端缓存
              messageService.requestClipboardCache(plainText);

              // 🎯 等待响应
              const cacheData = await cachePromise;

              // 🎯 根据响应结果插入节点
              editor.update(() => {
                const selection = $getSelection();
                if (!$isRangeSelection(selection)) {
                  return;
                }

                if (cacheData.found && cacheData.fileName && cacheData.filePath) {
                  // ✅ 有文件信息 - 创建代码引用节点
                  const codeNode = $createCodeReferenceNode(
                    cacheData.fileName,
                    cacheData.filePath,
                    cacheData.startLine,
                    cacheData.endLine,
                    plainText
                  );
                  const spaceNode = $createTextNode(' ');
                  selection.insertNodes([codeNode, spaceNode]);
                  spaceNode.selectNext();
                } else {
                  // ❌ 无文件信息 - 插入纯文本
                  const textNode = $createTextNode(plainText);
                  selection.insertNodes([textNode]);
                }
              });

            } catch (error) {
              console.error('Failed to process VSCode code paste:', error);
              // 🎯 失败了就插入纯文本
              editor.update(() => {
                const selection = $getSelection();
                if ($isRangeSelection(selection)) {
                  const textNode = $createTextNode(clipboardData.getData('text/plain'));
                  selection.insertNodes([textNode]);
                }
              });
            } finally {
              setIsProcessing(false);
            }
          })();
          
          return true; // 🎯 已处理，阻止 Lexical 默认粘贴
        }

        // 🎯 对于普通文本粘贴，使用 Lexical 默认处理
        return false;
      },
      COMMAND_PRIORITY_HIGH // 🎯 高优先级，在 Lexical 默认处理之前拦截
    );
  }, [editor, onImagePaste, isProcessing]);

  return null;
}