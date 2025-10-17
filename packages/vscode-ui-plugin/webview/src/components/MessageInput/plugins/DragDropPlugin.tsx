/**
 * 拖拽处理插件
 * 处理文件拖拽到编辑器的功能
 */

import React, { useState, useRef, useCallback } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

interface DragDropPluginProps {
  onFilesDrop: (files: string[]) => void;
}

// 🎯 自定义插件：处理拖拽 - 稳定版本
export function DragDropPlugin({ onFilesDrop }: DragDropPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [isDragging, setIsDragging] = useState(false);

  // 🎯 使用 ref 跟踪拖拽状态，避免状态竞争
  const dragCounterRef = useRef(0);
  const isDraggingRef = useRef(false);

  // 🎯 稳定的事件处理函数，避免依赖变化
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 🎯 确保拖拽效果为 'copy'
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    console.log('🎯 DragDropPlugin: DRAGENTER 事件触发', e.target);

    // 🎯 检查是否包含文件
    const hasFiles = e.dataTransfer && (
      e.dataTransfer.types.includes('Files') ||
      e.dataTransfer.types.includes('text/plain') ||
      e.dataTransfer.types.includes('text/uri-list')
    );

    if (hasFiles) {
      dragCounterRef.current += 1;
      console.log('🎯 DragDropPlugin: 检测到文件拖拽，计数器:', dragCounterRef.current);

      if (!isDraggingRef.current) {
        isDraggingRef.current = true;
        setIsDragging(true);
        console.log('🎯 DragDropPlugin: 设置拖拽状态为 true');
      }
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounterRef.current -= 1;

    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      isDraggingRef.current = false;
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    console.log('🎯 DragDropPlugin: DROP 事件触发！', e.target);

    // 🎯 立即重置拖拽状态
    dragCounterRef.current = 0;
    isDraggingRef.current = false;
    setIsDragging(false);

    try {
      const files: string[] = [];

      if (e.dataTransfer) {
        // 🎯 优先处理 File 对象（直接拖拽文件）
        const fileList = Array.from(e.dataTransfer.files);
        if (fileList.length > 0) {
          console.log('🎯 Processing dropped files:', fileList.length);

          for (const file of fileList) {
            // 🎯 在VSCode扩展环境中，尝试多种方式获取完整路径
            let filePath =
              (file as any).path ||                    // Electron/VSCode 环境
              (file as any).webkitRelativePath ||      // WebKit 相对路径
              (file as any).mozFullPath ||             // Firefox 完整路径
              (file as any).fullPath ||                // 通用完整路径属性
              file.name;                               // 降级到文件名

            if (filePath && !files.includes(filePath)) {
              files.push(filePath);
            }
          }
        }

        // 🎯 处理文本数据（从外部应用拖拽）
        if (files.length === 0) {
          const textData = e.dataTransfer.getData('text/plain');
          const uriListData = e.dataTransfer.getData('text/uri-list');

          // 处理 URI 列表
          if (uriListData) {
            const uris = uriListData.split('\n').filter(uri => uri.trim() && !uri.startsWith('#'));
            for (const uri of uris) {
              const cleanedPath = uri.replace(/^file:\/\//, '').trim();
              if (cleanedPath && !files.includes(cleanedPath)) {
                files.push(cleanedPath);
              }
            }
          }

          // 处理纯文本路径
          if (files.length === 0 && textData) {
            const cleanedPath = textData.replace(/^file:\/\//, '').trim();
            if (cleanedPath && (cleanedPath.startsWith('/') || cleanedPath.includes('\\') || cleanedPath.match(/^[A-Za-z]:/))) {
              files.push(cleanedPath);
            }
          }
        }
      }

      if (files.length > 0) {
        console.log('🎯 Drop files detected:', files);

        // 🎯 简化处理逻辑：直接传递所有文件给回调
        // 让上层组件处理路径解析
        onFilesDrop(files);
      } else {
        console.warn('🎯 No valid files detected in drop event');
      }
    } catch (error) {
      console.error('🎯 Error processing dropped files:', error);
    }
  }, [onFilesDrop]);

  // 🎯 稳定的容器元素引用
  const containerRef = useRef<HTMLElement | null>(null);
  const eventHandlersRef = useRef({
    dragover: handleDragOver,
    dragenter: handleDragEnter,
    dragleave: handleDragLeave,
    drop: handleDrop
  });

  // 🎯 更新事件处理器引用
  eventHandlersRef.current = {
    dragover: handleDragOver,
    dragenter: handleDragEnter,
    dragleave: handleDragLeave,
    drop: handleDrop
  };

  // 🎯 稳定的事件绑定逻辑
  React.useEffect(() => {
    let container: HTMLElement | null = null;
    let retryCount = 0;
    const maxRetries = 10;

    const findAndBindContainer = () => {
      // 🎯 尝试多种方式查找容器
      container =
        document.querySelector('.message-input-container') ||
        document.querySelector('.lexical-editor-container') ||
        document.querySelector('.input-wrapper') ||
        document.body; // 最后兜底到 body

      if (container && container !== document.body) {
        console.log('🎯 Found drag container:', container.className);
        bindEvents(container);
        return true;
      } else if (retryCount < maxRetries) {
        retryCount++;
        console.log(`🎯 Container not found, retrying... (${retryCount}/${maxRetries})`);
        setTimeout(findAndBindContainer, 100);
        return false;
      } else {
        console.warn('🎯 Using body as fallback drag container');
        container = document.body;
        bindEvents(container);
        return true;
      }
    };

    const bindEvents = (element: HTMLElement) => {
      const handlers = eventHandlersRef.current;
      element.addEventListener('dragover', handlers.dragover, false);
      element.addEventListener('dragenter', handlers.dragenter, false);
      element.addEventListener('dragleave', handlers.dragleave, false);
      element.addEventListener('drop', handlers.drop, false);

      console.log('🎯 DragDropPlugin: 事件监听器已绑定到', element.className);
    };

    const unbindEvents = (element: HTMLElement) => {
      const handlers = eventHandlersRef.current;
      element.removeEventListener('dragover', handlers.dragover);
      element.removeEventListener('dragenter', handlers.dragenter);
      element.removeEventListener('dragleave', handlers.dragleave);
      element.removeEventListener('drop', handlers.drop);
    };

    findAndBindContainer();

    return () => {
      if (container) {
        unbindEvents(container);
      }
    };
  }, []); // 🎯 空依赖数组，只在组件挂载时执行一次

  // 🎯 更新拖拽状态样式 - 更稳定的实现
  React.useEffect(() => {
    // 更新编辑器样式
    editor.update(() => {
      const rootElement = editor.getRootElement();
      if (rootElement) {
        if (isDragging) {
          rootElement.classList.add('dragging');
        } else {
          rootElement.classList.remove('dragging');
        }
      }
    });

    // 更新容器样式
    const updateContainerStyle = () => {
      const container = document.querySelector('.message-input-container') as HTMLElement;
      if (container) {
        if (isDragging) {
          container.classList.add('dragging');
        } else {
          container.classList.remove('dragging');
        }
      }
    };

    // 立即更新样式
    updateContainerStyle();

    // 延迟更新以确保DOM已渲染
    const timer = setTimeout(updateContainerStyle, 10);

    return () => clearTimeout(timer);
  }, [isDragging, editor]);

  return null;
}