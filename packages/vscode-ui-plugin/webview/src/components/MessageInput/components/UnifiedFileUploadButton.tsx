/**
 * 统一的文件上传按钮
 * 支持：图片、代码文件、Markdown 文件
 */

import React, { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { processFile } from '../utils/fileProcessor';
import { FileUploadResult } from '../utils/fileTypes';
import { isSupportedFile } from '../utils/fileTypeDetector';

interface UnifiedFileUploadButtonProps {
  onFileSelected: (result: FileUploadResult) => void;
  onBeforeUpload?: () => void;
  disabled?: boolean;
}

export function UnifiedFileUploadButton({
  onFileSelected,
  onBeforeUpload,
  disabled = false,
}: UnifiedFileUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    // 触发上传前的准备工作（如聚焦编辑器）
    if (onBeforeUpload) {
      onBeforeUpload();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    setIsProcessing(true);

    try {
      // 串行处理所有选中的文件，确保每个文件有时间插入到编辑器
      for (const file of Array.from(files)) {
        // 检查文件是否支持
        if (!isSupportedFile(file.name)) {
          console.warn(`⏭️  跳过不支持的文件: ${file.name}`);
          alert(`⏭️ 跳过不支持的文件类型：${file.name}`);
          continue;
        }

        try {
          console.log(`📤 处理文件: ${file.name}`);
          const result = await processFile(file);
          onFileSelected(result);
          // 给前一个文件插入完成留些时间
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`❌ 处理失败: ${file.name}`, error);
          // 🎯 显示友好的错误消息给用户
          const errorMessage = error instanceof Error ? error.message : '未知错误';
          alert(errorMessage);
          // 继续处理下一个文件，不中断流程
        }
      }
    } catch (error) {
      console.error('文件处理失败:', error);
      const errorMessage = error instanceof Error ? error.message : '文件处理失败';
      alert(`文件上传失败：${errorMessage}`);
    } finally {
      setIsProcessing(false);
      // 清空 input，允许重复选择相同文件
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 点击按钮打开文件选择对话框
  const handleButtonClick = () => {
    if (!disabled && !isProcessing && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <>
      {/* 隐藏的文件输入框 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".ts,.tsx,.js,.jsx,.py,.pyw,.java,.kt,.scala,.go,.rs,.cpp,.c,.h,.hpp,.php,.rb,.swift,.cs,.sh,.bash,.zsh,.fish,.json,.yaml,.yml,.xml,.toml,.html,.css,.scss,.less,.vue,.sql,.md,.markdown,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* 文件上传按钮 */}
      <button
        className="file-upload-button unified-file-upload-button"
        onClick={handleButtonClick}
        disabled={disabled || isProcessing}
        title={isProcessing ? '正在处理文件...' : '上传文件（图片、代码、Markdown）'}
      >
        {isProcessing ? (
          <Loader2 size={16} className="animate-spin" stroke="currentColor" />
        ) : (
          <Upload size={16} stroke="currentColor" />
        )}
      </button>
    </>
  );
}
