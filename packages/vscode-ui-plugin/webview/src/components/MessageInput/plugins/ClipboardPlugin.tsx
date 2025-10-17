/**
 * 剪切板处理插件
 * 处理图片粘贴功能
 */

import React from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ImageReference, processClipboardImage } from '../utils/imageProcessor';

interface ClipboardPluginProps {
  onImagePaste: (imageData: ImageReference) => void;
}

// 🎯 剪切板处理插件
export function ClipboardPlugin({ onImagePaste }: ClipboardPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [isProcessing, setIsProcessing] = React.useState(false);

  React.useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData || isProcessing) return;

      // 检查是否有图片
      const items = Array.from(clipboardData.items);
      const imageItem = items.find(item => item.type.startsWith('image/'));

      if (imageItem) {
        event.preventDefault();
        setIsProcessing(true);

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
      }
    };

    const editorElement = editor.getRootElement();
    if (editorElement) {
      editorElement.addEventListener('paste', handlePaste);
      return () => {
        editorElement.removeEventListener('paste', handlePaste);
      };
    }
  }, [editor, onImagePaste, isProcessing]);

  return null;
}