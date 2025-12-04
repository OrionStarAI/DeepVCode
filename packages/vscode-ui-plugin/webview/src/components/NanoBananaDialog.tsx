/**
 * NanoBanana Image Generation Dialog
 * 图像生成对话框 - 独立的生图界面，不占用聊天对话session历史
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Upload, ExternalLink, Image as ImageIcon, Sparkles, RefreshCw } from 'lucide-react';

// 图片生成动画图标 - 彩色风车/花朵
const GeneratingImageIcon: React.FC<{ size?: number }> = ({ size = 120 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg"
    style={{ display: 'block' }}
  >
    <path fill="#FFB74D" d="M24.449,22.978c-0.157-0.18-0.317-0.357-0.449-0.55c-0.132,0.193-0.292,0.371-0.449,0.55C23.7,22.988,23.848,23,24,23S24.3,22.988,24.449,22.978z"/>
    <path fill="#FFB74D" d="M23.293,14.808c0.27,0.27,0.5,0.563,0.707,0.866c0.208-0.303,0.438-0.596,0.707-0.866l4.949-4.95c0.102-0.101,0.218-0.172,0.322-0.264C29.77,6.471,27.177,4,24,4s-5.77,2.471-5.979,5.594c0.105,0.092,0.222,0.163,0.323,0.264L23.293,14.808z"/>
    <path fill="#64B5F6" d="M23.551,25.021c0.157,0.181,0.317,0.357,0.449,0.551c0.132-0.192,0.292-0.37,0.449-0.551C24.3,25.012,24.152,25,24,25S23.7,25.012,23.551,25.021z"/>
    <path fill="#64B5F6" d="M24.707,33.191c-0.27-0.27-0.5-0.562-0.707-0.865c-0.208,0.305-0.438,0.597-0.707,0.865l-4.95,4.951c-0.101,0.1-0.217,0.172-0.323,0.264C18.23,41.529,20.823,44,24,44s5.77-2.471,5.979-5.594c-0.104-0.092-0.222-0.164-0.322-0.264L24.707,33.191z"/>
    <path fill="#F48FB1" d="M14.808,24.707c0.27-0.27,0.562-0.5,0.866-0.707c-0.303-0.208-0.596-0.438-0.866-0.707l-4.95-4.95c-0.101-0.101-0.172-0.217-0.264-0.323C6.471,18.23,4,20.823,4,24s2.471,5.77,5.594,5.979c0.092-0.104,0.163-0.222,0.264-0.322L14.808,24.707z"/>
    <path fill="#F48FB1" d="M22.978,23.551c-0.18,0.157-0.357,0.317-0.55,0.449c0.193,0.132,0.371,0.292,0.55,0.449C22.988,24.3,23,24.152,23,24S22.988,23.7,22.978,23.551z"/>
    <path fill="#8BC34A" d="M25,24c0,0.152,0.012,0.3,0.021,0.449c0.181-0.157,0.357-0.317,0.551-0.449c-0.192-0.132-0.37-0.292-0.551-0.449C25.012,23.7,25,23.848,25,24z"/>
    <path fill="#8BC34A" d="M44,24c0-3.177-2.471-5.77-5.594-5.979c-0.092,0.105-0.164,0.222-0.264,0.323l-4.951,4.95c-0.27,0.27-0.563,0.5-0.865,0.707c0.305,0.208,0.597,0.438,0.865,0.707l4.951,4.949c0.1,0.102,0.172,0.218,0.264,0.323C41.529,29.77,44,27.177,44,24z"/>
    <path fill="#C0CA33" d="M30,17c0,0.378-0.039,0.747-0.105,1.106C30.253,18.039,30.621,18,31,18h7c0.137,0,0.271,0.012,0.406,0.021c2.05-2.357,1.979-5.92-0.264-8.163c-2.244-2.242-5.807-2.314-8.164-0.264C29.988,9.729,30,9.863,30,10V17z"/>
    <path fill="#C0CA33" d="M25.021,23.551c0.018-0.223,0.045-0.442,0.084-0.657c-0.215,0.041-0.435,0.067-0.656,0.084c0.09,0.103,0.16,0.217,0.258,0.315S24.919,23.461,25.021,23.551z"/>
    <path fill="#F9A825" d="M24.707,14.808c-0.27,0.27-0.5,0.563-0.707,0.866c1.389,2.033,1.389,4.722,0,6.754c0.132,0.193,0.292,0.371,0.449,0.55c0.223-0.017,0.441-0.043,0.656-0.084c0.453-2.425,2.362-4.335,4.787-4.787C29.961,17.747,30,17.378,30,17v-7c0-0.137-0.012-0.271-0.021-0.406c-0.104,0.092-0.222,0.163-0.322,0.264L24.707,14.808z"/>
    <path fill="#689F38" d="M31,18c-0.379,0-0.747,0.039-1.105,0.106c-0.453,2.425-2.362,4.335-4.787,4.787c-0.041,0.215-0.067,0.435-0.084,0.657c0.18,0.157,0.356,0.317,0.55,0.449c2.032-1.389,4.723-1.389,6.754,0c0.304-0.208,0.597-0.438,0.866-0.707l4.949-4.95c0.101-0.101,0.172-0.217,0.265-0.323C38.271,18.012,38.137,18,38,18H31z"/>
    <path fill="#827717" d="M29.895,18.106c-2.426,0.452-4.336,2.362-4.787,4.787C27.531,22.441,29.441,20.532,29.895,18.106z"/>
    <path fill="#BA68C8" d="M18,31c0-0.379,0.039-0.747,0.106-1.105C17.747,29.961,17.378,30,17,30h-7c-0.137,0-0.271-0.012-0.406-0.021c-2.05,2.357-1.979,5.922,0.264,8.164c2.242,2.241,5.805,2.313,8.163,0.264C18.012,38.271,18,38.137,18,38V31z"/>
    <path fill="#BA68C8" d="M22.978,24.449c-0.017,0.223-0.043,0.441-0.084,0.656c0.215-0.039,0.435-0.066,0.657-0.084c-0.09-0.103-0.16-0.217-0.258-0.314S23.081,24.539,22.978,24.449z"/>
    <path fill="#5C6BC0" d="M23.293,33.191c0.27-0.27,0.5-0.562,0.707-0.865c-1.389-2.031-1.389-4.721,0-6.754c-0.132-0.192-0.292-0.37-0.449-0.551c-0.223,0.018-0.442,0.045-0.657,0.084c-0.452,2.426-2.362,4.336-4.787,4.787C18.039,30.253,18,30.621,18,31v7c0,0.137,0.012,0.271,0.021,0.406c0.105-0.092,0.222-0.164,0.323-0.264L23.293,33.191z"/>
    <path fill="#D81B60" d="M17,30c0.378,0,0.747-0.039,1.106-0.105c0.452-2.426,2.362-4.336,4.787-4.787c0.041-0.215,0.067-0.436,0.084-0.657c-0.18-0.157-0.357-0.317-0.55-0.449c-2.032,1.39-4.721,1.39-6.754,0c-0.304,0.208-0.596,0.438-0.866,0.707l-4.95,4.949c-0.101,0.102-0.172,0.218-0.264,0.323C9.729,29.988,9.863,30,10,30H17z"/>
    <path fill="#880E4F" d="M18.106,29.895c2.425-0.453,4.335-2.362,4.787-4.787C20.468,25.559,18.559,27.469,18.106,29.895z"/>
    <path fill="#FF5252" d="M23.551,22.978c-0.223-0.017-0.442-0.043-0.657-0.084c0.041,0.215,0.067,0.435,0.084,0.657c0.103-0.09,0.217-0.16,0.315-0.258S23.461,23.081,23.551,22.978z"/>
    <path fill="#FF5252" d="M17,18c0.378,0,0.747,0.039,1.106,0.106C18.039,17.747,18,17.378,18,17v-7c0-0.137,0.012-0.271,0.021-0.406c-2.357-2.05-5.92-1.979-8.163,0.264c-2.243,2.243-2.314,5.805-0.264,8.163C9.729,18.012,9.863,18,10,18H17z"/>
    <path fill="#EF6C00" d="M18,17c0,0.378,0.039,0.747,0.106,1.106c2.425,0.452,4.335,2.362,4.787,4.787c0.215,0.041,0.435,0.067,0.657,0.084c0.157-0.18,0.317-0.357,0.449-0.55c-1.389-2.032-1.389-4.721,0-6.754c-0.208-0.303-0.438-0.596-0.707-0.866l-4.95-4.95c-0.101-0.101-0.217-0.172-0.323-0.264C18.012,9.729,18,9.863,18,10V17z"/>
    <path fill="#F44336" d="M14.808,23.293c0.27,0.27,0.563,0.5,0.866,0.707c2.032-1.389,4.721-1.389,6.754,0c0.193-0.132,0.371-0.292,0.55-0.449c-0.017-0.223-0.043-0.442-0.084-0.657c-2.425-0.452-4.335-2.362-4.787-4.787C17.747,18.039,17.378,18,17,18h-7c-0.137,0-0.271,0.012-0.406,0.021c0.092,0.105,0.163,0.222,0.264,0.323L14.808,23.293z"/>
    <path fill="#DD2C00" d="M18.106,18.106c0.452,2.425,2.362,4.335,4.787,4.787C22.441,20.468,20.532,18.559,18.106,18.106z"/>
    <path fill="#E65100" d="M24,15.673c-1.389,2.033-1.389,4.722,0,6.754C25.389,20.395,25.389,17.706,24,15.673z"/>
    <path fill="#B71C1C" d="M15.673,24c2.033,1.389,4.722,1.389,6.754,0C20.395,22.611,17.706,22.611,15.673,24z"/>
    <path fill="#00ACC1" d="M31,30c-0.379,0-0.747-0.039-1.105-0.105C29.961,30.253,30,30.621,30,31v7c0,0.137-0.012,0.271-0.021,0.406c2.357,2.05,5.922,1.979,8.164-0.264c2.241-2.244,2.313-5.807,0.264-8.164C38.271,29.988,38.137,30,38,30H31z"/>
    <path fill="#00ACC1" d="M24.449,25.021c0.223,0.018,0.441,0.045,0.656,0.084c-0.039-0.215-0.066-0.435-0.084-0.656c-0.103,0.09-0.217,0.16-0.314,0.258S24.539,24.919,24.449,25.021z"/>
    <path fill="#0277BD" d="M30,31c0-0.379-0.039-0.747-0.105-1.105c-2.426-0.453-4.336-2.362-4.787-4.787c-0.215-0.041-0.436-0.067-0.657-0.084c-0.157,0.18-0.317,0.356-0.449,0.55c1.39,2.032,1.39,4.723,0,6.754c0.208,0.305,0.438,0.597,0.707,0.866l4.949,4.949c0.102,0.101,0.218,0.172,0.323,0.265C29.988,38.271,30,38.137,30,38V31z"/>
    <path fill="#00796B" d="M33.191,24.707c-0.27-0.27-0.562-0.5-0.865-0.707c-2.032,1.389-4.721,1.389-6.754,0c-0.192,0.132-0.37,0.292-0.551,0.449c0.018,0.223,0.045,0.441,0.084,0.656c2.426,0.453,4.336,2.362,4.787,4.787C30.253,29.961,30.621,30,31,30h7c0.137,0,0.271-0.012,0.406-0.021c-0.092-0.104-0.164-0.222-0.264-0.322L33.191,24.707z"/>
    <path fill="#006064" d="M29.895,29.895c-0.453-2.426-2.362-4.336-4.787-4.787C25.559,27.531,27.469,29.441,29.895,29.895z"/>
    <path fill="#1B5E20" d="M25.572,24c2.033,1.389,4.722,1.389,6.754,0C30.295,22.611,27.605,22.611,25.572,24z"/>
    <path fill="#0D47A1" d="M24,32.326c1.389-2.031,1.389-4.721,0-6.754C22.611,27.605,22.611,30.295,24,32.326z"/>
  </svg>
);
import { useTranslation } from '../hooks/useTranslation';
import { NanoBananaIcon } from './NanoBananaIcon';
import { getGlobalMessageService } from '../services/globalMessageService';
import './NanoBananaDialog.css';

// 🎯 宽高比选项
const ASPECT_RATIOS = [
  { value: 'auto', label: 'Auto' },
  { value: '1:1', label: '1:1' },
  { value: '2:3', label: '2:3' },
  { value: '3:2', label: '3:2' },
  { value: '3:4', label: '3:4' },
  { value: '4:3', label: '4:3' },
  { value: '4:5', label: '4:5' },
  { value: '5:4', label: '5:4' },
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: '21:9', label: '21:9' },
];

// 🎯 图片尺寸选项
const IMAGE_SIZES = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
];

// 🎯 生成状态
type GenerationStatus = 'idle' | 'uploading' | 'generating' | 'polling' | 'completed' | 'error';

interface GenerationTask {
  taskId: string;
  status: GenerationStatus;
  progress: number;
  estimatedTime: number;
  elapsedTime: number;
  resultUrls: string[];       // base64 data URLs for display in webview
  originalUrls: string[];     // original URLs for opening in browser
  errorMessage?: string;
  creditsDeducted?: number;
}

interface NanoBananaDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NanoBananaDialog: React.FC<NanoBananaDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();

  // 表单状态
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('auto');
  const [imageSize, setImageSize] = useState('1K');
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);

  // 生成任务状态
  const [task, setTask] = useState<GenerationTask | null>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentTaskIdRef = useRef<string | null>(null);

  // 🎯 清理所有定时器
  const clearAllIntervals = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  // 🎯 组件卸载时清理
  useEffect(() => {
    return () => {
      clearAllIntervals();
    };
  }, [clearAllIntervals]);

  // 🎯 监听状态更新 - 使用 useEffect 确保只注册一次
  useEffect(() => {
    const messageService = getGlobalMessageService();

    const handleStatusUpdate = (data: {
      taskId: string;
      status: 'pending' | 'processing' | 'completed' | 'failed';
      progress?: number;
      resultUrls?: string[];
      originalUrls?: string[];
      errorMessage?: string;
      creditsDeducted?: number;
    }) => {
      // 只处理当前任务的更新
      if (!currentTaskIdRef.current || data.taskId !== currentTaskIdRef.current) {
        return;
      }

      console.log('📊 [NanoBanana] Status update received:', data);

      if (data.status === 'completed' && data.resultUrls) {
        clearAllIntervals();
        currentTaskIdRef.current = null;
        setTask(prev => prev ? {
          ...prev,
          status: 'completed',
          progress: 100,
          resultUrls: data.resultUrls || [],
          originalUrls: data.originalUrls || data.resultUrls || [],
          creditsDeducted: data.creditsDeducted,
        } : null);
      } else if (data.status === 'failed') {
        clearAllIntervals();
        currentTaskIdRef.current = null;
        setTask(prev => prev ? {
          ...prev,
          status: 'error',
          errorMessage: data.errorMessage || 'Generation failed',
        } : null);
      } else {
        // pending/processing 状态下，不更新进度
        // 进度由本地的 countdownInterval 基于时间计算，避免 API 返回的固定值覆盖
      }
    };

    messageService.onNanoBananaStatusUpdate(handleStatusUpdate);

    // 注意：messageService 的监听器没有返回取消函数，所以这里不需要清理
  }, [clearAllIntervals]);

  // 处理ESC键关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && task?.status !== 'generating' && task?.status !== 'polling') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, task?.status]);

  // 自动聚焦输入框
  useEffect(() => {
    if (isOpen && textareaRef.current && !task) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen, task]);

  // 🎯 处理图片文件（上传或粘贴共用逻辑）
  const processImageFile = useCallback((file: File) => {
    // 验证文件类型
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];
    if (!validTypes.includes(file.type)) {
      setTask({
        taskId: '',
        status: 'error',
        progress: 0,
        estimatedTime: 0,
        elapsedTime: 0,
        resultUrls: [],
        originalUrls: [],
        errorMessage: t('nanoBanana.error.invalidImageType', {}, 'Invalid image type. Please use JPG, PNG, WebP, GIF, or BMP.'),
      });
      return false;
    }

    // 验证文件大小 (最大10MB)
    if (file.size > 10 * 1024 * 1024) {
      setTask({
        taskId: '',
        status: 'error',
        progress: 0,
        estimatedTime: 0,
        elapsedTime: 0,
        resultUrls: [],
        originalUrls: [],
        errorMessage: t('nanoBanana.error.imageTooLarge', {}, 'Image too large. Maximum size is 10MB.'),
      });
      return false;
    }

    setReferenceImage(file);

    // 创建预览
    const reader = new FileReader();
    reader.onload = (event) => {
      setReferencePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
    return true;
  }, [t]);

  // 处理参考图片上传
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processImageFile(file);
  }, [processImageFile]);

  // 🎯 处理粘贴图片
  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          processImageFile(file);
        }
        break;
      }
    }
  }, [processImageFile]);

  // 🎯 注册粘贴事件监听
  useEffect(() => {
    if (!isOpen || task) return;

    const handler = (e: Event) => handlePaste(e as ClipboardEvent);
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [isOpen, task, handlePaste]);

  // 清除参考图片
  const clearReferenceImage = useCallback(() => {
    setReferenceImage(null);
    setReferencePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // 开始图像生成
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setTask({
        taskId: '',
        status: 'error',
        progress: 0,
        estimatedTime: 0,
        elapsedTime: 0,
        resultUrls: [],
        originalUrls: [],
        errorMessage: t('nanoBanana.error.emptyPrompt', {}, 'Please enter a prompt to generate an image.'),
      });
      return;
    }

    // 清理之前的定时器
    clearAllIntervals();

    // 重置状态
    setTask({
      taskId: '',
      status: referenceImage ? 'uploading' : 'generating',
      progress: 0,
      estimatedTime: 60,
      elapsedTime: 0,
      resultUrls: [],
      originalUrls: [],
    });

    try {
      const messageService = getGlobalMessageService();

      // 如果有参考图片，先上传
      let referenceImageUrl: string | undefined;
      if (referenceImage) {
        // 读取文件为base64
        const reader = new FileReader();
        const fileData = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(referenceImage);
        });

        // 发送上传请求到extension
        messageService.sendNanoBananaUpload({
          filename: referenceImage.name,
          contentType: referenceImage.type,
          fileData: fileData,
        });

        // 等待上传完成响应
        referenceImageUrl = await new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Upload timeout')), 30000);

          const handleUploadResponse = (data: { success: boolean; publicUrl?: string; error?: string }) => {
            clearTimeout(timeout);
            if (data.success && data.publicUrl) {
              resolve(data.publicUrl);
            } else {
              reject(new Error(data.error || 'Upload failed'));
            }
          };

          messageService.onNanoBananaUploadResponse(handleUploadResponse);
        });
      }

      // 更新状态为生成中
      setTask(prev => prev ? { ...prev, status: 'generating' } : null);

      // 发送生成请求
      messageService.sendNanoBananaGenerate({
        prompt: prompt.trim(),
        aspectRatio,
        imageSize,
        referenceImageUrl,
      });

      // 等待生成任务创建响应
      const taskResponse = await new Promise<{ taskId: string; estimatedTime: number }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Generation request timeout')), 30000);

        const handleGenerateResponse = (data: { success: boolean; taskId?: string; estimatedTime?: number; error?: string }) => {
          clearTimeout(timeout);
          if (data.success && data.taskId) {
            resolve({ taskId: data.taskId, estimatedTime: data.estimatedTime || 60 });
          } else {
            reject(new Error(data.error || 'Failed to start generation'));
          }
        };

        messageService.onNanoBananaGenerateResponse(handleGenerateResponse);
      });

      // 保存当前任务ID
      currentTaskIdRef.current = taskResponse.taskId;

      // 更新状态为轮询中
      setTask(prev => prev ? {
        ...prev,
        taskId: taskResponse.taskId,
        status: 'polling',
        estimatedTime: taskResponse.estimatedTime,
        elapsedTime: 0,
      } : null);

      // 🎯 开始轮询任务状态
      pollingIntervalRef.current = setInterval(() => {
        messageService.sendNanoBananaStatus({ taskId: taskResponse.taskId });
      }, 1000);

      // 🎯 开始倒计时/计时器
      countdownIntervalRef.current = setInterval(() => {
        setTask(prev => {
          if (!prev || prev.status !== 'polling') return prev;
          const newElapsed = prev.elapsedTime + 1;
          // 如果超过预估时间，动态增加预估时间
          const newEstimated = newElapsed >= prev.estimatedTime
            ? prev.estimatedTime + 10
            : prev.estimatedTime;
          // 基于时间计算进度百分比（最大99%，完成时由状态更新设为100%）
          const newProgress = Math.min(99, Math.round((newElapsed / newEstimated) * 100));
          return {
            ...prev,
            elapsedTime: newElapsed,
            estimatedTime: newEstimated,
            progress: newProgress,
          };
        });
      }, 1000);

    } catch (error) {
      clearAllIntervals();
      currentTaskIdRef.current = null;
      setTask({
        taskId: '',
        status: 'error',
        progress: 0,
        estimatedTime: 0,
        elapsedTime: 0,
        resultUrls: [],
        originalUrls: [],
        errorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  }, [prompt, aspectRatio, imageSize, referenceImage, t, clearAllIntervals]);

  // 打开生成的图片
  const openImage = useCallback((url: string) => {
    // 如果是data URL，需要特殊处理
    if (url.startsWith('data:')) {
      // 在新窗口打开data URL
      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(`<img src="${url}" style="max-width:100%;height:auto;" />`);
      }
    } else {
      const messageService = getGlobalMessageService();
      messageService.openExternalUrl(url);
    }
  }, []);

  // 新建生成
  const handleNewGeneration = useCallback(() => {
    clearAllIntervals();
    currentTaskIdRef.current = null;
    setTask(null);
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, [clearAllIntervals]);

  if (!isOpen) return null;

  const isGenerating = task?.status === 'uploading' || task?.status === 'generating' || task?.status === 'polling';
  const showResults = task?.status === 'completed' && task.resultUrls.length > 0;
  const showError = task?.status === 'error';

  // 计算剩余时间
  const remainingTime = task ? Math.max(0, task.estimatedTime - task.elapsedTime) : 0;

  return (
    <div className="nanobanana-dialog__backdrop" onClick={isGenerating ? undefined : onClose}>
      <div className="nanobanana-dialog__container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="nanobanana-dialog__header">
          <div className="nanobanana-dialog__title">
            <NanoBananaIcon size={24} />
            <span>{t('nanoBanana.title', {}, 'NanoBanana Image Generator')}</span>
          </div>
          <button
            className="nanobanana-dialog__close-btn"
            onClick={onClose}
            disabled={isGenerating}
            title={t('common.close', {}, 'Close')}
          >
            <X size={18} />
          </button>
        </header>

        {/* Body */}
        <div className="nanobanana-dialog__body">
          {/* 生成结果展示 */}
          {showResults && (
            <div className="nanobanana-dialog__results">
              <div className="nanobanana-dialog__results-header">
                <Sparkles size={16} />
                <span>{t('nanoBanana.generationComplete', {}, 'Generation Complete!')}</span>
                {task?.creditsDeducted && (
                  <span className="nanobanana-dialog__credits">
                    -{task.creditsDeducted} {t('nanoBanana.credits', {}, 'credits')}
                  </span>
                )}
              </div>
              <div className="nanobanana-dialog__images">
                {task?.resultUrls.map((url, index) => {
                  // 使用原始URL打开浏览器，使用resultUrl（base64）显示预览
                  const originalUrl = task.originalUrls?.[index] || url;
                  return (
                    <div key={index} className="nanobanana-dialog__image-wrapper">
                      <img
                        src={url}
                        alt={`Generated ${index + 1}`}
                        className="nanobanana-dialog__result-image"
                        onClick={() => openImage(originalUrl)}
                      />
                      <button
                        className="nanobanana-dialog__open-btn"
                        onClick={() => openImage(originalUrl)}
                        title={t('nanoBanana.openInBrowser', {}, 'Open in browser')}
                      >
                        <ExternalLink size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="nanobanana-dialog__results-hint">
                {t('nanoBanana.resultsHint', {}, 'Not satisfied? Generate another. Like it? Save it soon - we don\'t store images permanently.')}
              </p>
              <button
                className="nanobanana-dialog__new-btn"
                onClick={handleNewGeneration}
              >
                <RefreshCw size={14} />
                {t('nanoBanana.generateAnother', {}, 'Generate Another')}
              </button>
            </div>
          )}

          {/* 错误展示 */}
          {showError && (
            <div className="nanobanana-dialog__error">
              <span className="nanobanana-dialog__error-icon">❌</span>
              <span className="nanobanana-dialog__error-text">{task?.errorMessage}</span>
              <button
                className="nanobanana-dialog__retry-btn"
                onClick={handleNewGeneration}
              >
                {t('nanoBanana.tryAgain', {}, 'Try Again')}
              </button>
            </div>
          )}

          {/* 生成中状态 */}
          {isGenerating && (() => {
            const progress = task?.progress || 0;
            // 计算滤镜效果：马赛克(0-16%) -> 模糊(16-50%) -> 清晰(50-100%)
            let filterStyle: string;
            let opacity: number;

            if (progress <= 16) {
              // 阶段1: 像素化马赛克效果 (使用SVG filter)
              // 像素大小从 12px 渐变到 4px
              const pixelSize = Math.max(4, 12 - (progress / 16) * 8);
              filterStyle = `url(#pixelate-${Math.round(pixelSize)})`;
              opacity = 0.7 + (progress / 16) * 0.1;
            } else if (progress <= 50) {
              // 阶段2: 高斯模糊逐渐减少
              // blur从 8px 渐变到 2px
              const blurAmount = 8 - ((progress - 16) / 34) * 6;
              filterStyle = `blur(${blurAmount}px)`;
              opacity = 0.8 + ((progress - 16) / 34) * 0.1;
            } else {
              // 阶段3: 清晰化 + 轻微发光
              // blur从 2px 渐变到 0px
              const blurAmount = Math.max(0, 2 - ((progress - 50) / 50) * 2);
              const glowIntensity = ((progress - 50) / 50) * 8;
              filterStyle = blurAmount > 0
                ? `blur(${blurAmount}px) drop-shadow(0 0 ${glowIntensity}px rgba(255, 184, 3, 0.6))`
                : `drop-shadow(0 0 ${glowIntensity}px rgba(255, 184, 3, 0.6))`;
              opacity = 0.9 + ((progress - 50) / 50) * 0.1;
            }

            return (
              <div className="nanobanana-dialog__generating">
                {/* SVG 像素化滤镜定义 */}
                <svg width="0" height="0" style={{ position: 'absolute' }}>
                  <defs>
                    {[12, 11, 10, 9, 8, 7, 6, 5, 4].map(size => (
                      <filter key={size} id={`pixelate-${size}`} x="0" y="0" width="100%" height="100%">
                        <feFlood x="4" y="4" height="1" width="1" />
                        <feComposite width={size} height={size} />
                        <feTile result="a" />
                        <feComposite in="SourceGraphic" in2="a" operator="in" />
                        <feMorphology operator="dilate" radius={size / 2} />
                      </filter>
                    ))}
                  </defs>
                </svg>

                {/* 图片生成动画：马赛克 -> 模糊 -> 清晰 */}
                <div
                  className="nanobanana-dialog__progressive-reveal"
                  style={{
                    filter: filterStyle,
                    opacity: opacity,
                    transition: 'filter 0.3s ease-out, opacity 0.3s ease-out',
                  }}
                >
                  <GeneratingImageIcon size={120} />
                </div>
                <div className="nanobanana-dialog__generating-text">
                  {task?.status === 'uploading' && t('nanoBanana.uploading', {}, 'Uploading reference image...')}
                  {task?.status === 'generating' && t('nanoBanana.generating', {}, 'Starting image generation...')}
                  {task?.status === 'polling' && t('nanoBanana.waitingForResult', {}, 'Generating your image...')}
                </div>
                <div className="nanobanana-dialog__progress">
                  <div
                    className="nanobanana-dialog__progress-bar"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="nanobanana-dialog__progress-text">
                  {progress}% - {task?.elapsedTime || 0}s / ~{remainingTime}s {t('nanoBanana.remaining', {}, 'remaining')}
                </div>
              </div>
            );
          })()}

          {/* 输入表单 */}
          {!isGenerating && !showResults && !showError && (
            <>
              {/* Prompt输入 */}
              <div className="nanobanana-dialog__field">
                <label className="nanobanana-dialog__label">
                  {t('nanoBanana.prompt', {}, 'Prompt')}
                </label>
                <textarea
                  ref={textareaRef}
                  className="nanobanana-dialog__textarea"
                  placeholder={t('nanoBanana.promptPlaceholder', {}, 'Describe the image you want to generate...')}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                />
              </div>

              {/* 参数选择区 */}
              <div className="nanobanana-dialog__params">
                {/* 宽高比 */}
                <div className="nanobanana-dialog__param">
                  <label className="nanobanana-dialog__label">
                    {t('nanoBanana.aspectRatio', {}, 'Aspect Ratio')}
                  </label>
                  <select
                    className="nanobanana-dialog__select"
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                  >
                    {ASPECT_RATIOS.map((ratio) => (
                      <option key={ratio.value} value={ratio.value}>
                        {ratio.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 图片尺寸 */}
                <div className="nanobanana-dialog__param">
                  <label className="nanobanana-dialog__label">
                    {t('nanoBanana.imageSize', {}, 'Size')}
                  </label>
                  <select
                    className="nanobanana-dialog__select"
                    value={imageSize}
                    onChange={(e) => setImageSize(e.target.value)}
                  >
                    {IMAGE_SIZES.map((size) => (
                      <option key={size.value} value={size.value}>
                        {size.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 参考图片上传 */}
              <div className="nanobanana-dialog__field">
                <label className="nanobanana-dialog__label">
                  {t('nanoBanana.referenceImage', {}, 'Reference Image (Optional)')}
                  <span className="nanobanana-dialog__label-hint">
                    {t('nanoBanana.pasteHint', {}, 'You can also paste an image with Ctrl+V')}
                  </span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                />

                {referencePreview ? (
                  <div className="nanobanana-dialog__reference-preview">
                    <img src={referencePreview} alt="Reference" />
                    <button
                      className="nanobanana-dialog__remove-reference"
                      onClick={clearReferenceImage}
                      title={t('nanoBanana.removeReference', {}, 'Remove reference image')}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    className="nanobanana-dialog__upload-btn"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={16} />
                    <span>{t('nanoBanana.uploadImage', {}, 'Upload Image')}</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!isGenerating && !showResults && !showError && (
          <footer className="nanobanana-dialog__footer">
            <button
              className="nanobanana-dialog__cancel-btn"
              onClick={onClose}
            >
              {t('common.cancel', {}, 'Cancel')}
            </button>
            <button
              className="nanobanana-dialog__generate-btn"
              onClick={handleGenerate}
              disabled={!prompt.trim()}
            >
              <ImageIcon size={14} />
              {t('nanoBanana.generate', {}, 'Generate Image')}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
};

export default NanoBananaDialog;