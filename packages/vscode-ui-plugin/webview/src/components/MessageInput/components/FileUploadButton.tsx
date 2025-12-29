/**
 * 图片上传按钮组件（纯前端实现）
 * 只支持图片文件的本地上传
 */

import React, { useRef, useState } from 'react';
import { Image, Loader2 } from 'lucide-react';
import { ImageReference, processClipboardImage } from '../utils/imageProcessor';

interface FileUploadButtonProps {
  onImageSelected: (imageData: ImageReference) => void;
  onBeforeUpload?: () => void; // 上传前的回调（用于聚焦编辑器）
  disabled?: boolean;
  maxSize?: number; // 最大文件大小（字节，默认 10MB）
}

export function FileUploadButton({
  onImageSelected,
  onBeforeUpload,
  disabled = false,
  maxSize = 10 * 1024 * 1024 // 默认 10MB
}: FileUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // 处理图片选择
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    // 在处理文件前，先触发准备工作（如聚焦编辑器）
    if (onBeforeUpload) {
      onBeforeUpload();
      // 给编辑器一点时间完成聚焦
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    setIsProcessing(true);

    try {
      // 处理所有选中的图片文件（串行处理，确保每个都有时间插入）
      for (const file of Array.from(files)) {
        // 检查文件类型
        if (!file.type.startsWith('image/')) {
          console.warn(`跳过非图片文件: ${file.name}`);
          continue;
        }

        // 检查文件大小
        if (file.size > maxSize) {
          console.warn(`图片 ${file.name} 超过大小限制 (${(maxSize / 1024 / 1024).toFixed(1)}MB)`);
          continue;
        }

        try {
          console.log('🖼️ 开始处理图片:', file.name);
          const imageData = await processClipboardImage(file);
          if (imageData) {
            console.log('✅ 图片处理完成，准备插入:', imageData.fileName);
            onImageSelected(imageData);
            // 给一点时间让前一个图片插入完成
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error(`❌ 处理图片失败: ${file.name}`, error);
        }
      }
    } catch (error) {
      console.error('图片上传处理失败:', error);
    } finally {
      setIsProcessing(false);
      // 清空 input，允许重复选择相同文件
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 点击上传按钮
  const handleButtonClick = () => {
    if (!disabled && !isProcessing && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <>
      {/* 隐藏的图片输入框 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* 图片上传按钮 */}
      <button
        className="file-upload-button image-upload-button"
        onClick={handleButtonClick}
        disabled={disabled || isProcessing}
        title={isProcessing ? '正在处理图片...' : '上传图片'}
      >
        {isProcessing ? (
          <Loader2 size={16} className="animate-spin" stroke="currentColor" />
        ) : (
          <Image size={16} stroke="currentColor" />
        )}
      </button>
    </>
  );
}

