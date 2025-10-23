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

    console.log('🎯 DragDropPlugin: DROP 事件触发！');
    console.log('🎯 dataTransfer.types:', e.dataTransfer?.types);
    console.log('🎯 dataTransfer.files.length:', e.dataTransfer?.files.length);

    // 🎯 立即重置拖拽状态
    dragCounterRef.current = 0;
    isDraggingRef.current = false;
    setIsDragging(false);

    try {
      const files: string[] = [];

      if (e.dataTransfer) {
        // 🎯 方法1: 尝试从 dataTransfer.items 获取（VSCode 文件树拖拽）
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
          console.log('🎯 Processing dataTransfer.items:', e.dataTransfer.items.length);
          
          for (let i = 0; i < e.dataTransfer.items.length; i++) {
            const item = e.dataTransfer.items[i];
            console.log(`🎯 Item ${i}: kind=${item.kind}, type=${item.type}`);
            
            // 尝试获取字符串数据
            if (item.kind === 'string') {
              try {
                const data = await new Promise<string>((resolve) => {
                  item.getAsString((str) => resolve(str));
                });
                console.log('🎯 String data:', data);
                
                // 处理 vscode-resource URI 或 file:// URI
                if (data) {
                  let filePath = data;
                  
                  // 移除各种 URI 前缀
                  filePath = filePath
                    .replace(/^vscode-resource:\/\//, '')
                    .replace(/^vscode-file:\/\//, '')
                    .replace(/^file:\/\//, '')
                    .trim();
                  
                  // Windows: 修复路径格式 (如 /c:/path -> c:/path)
                  if (filePath.match(/^\/[a-zA-Z]:\//)) {
                    filePath = filePath.substring(1);
                  }
                  
                  if (filePath && !files.includes(filePath)) {
                    console.log('🎯 Adding file from item:', filePath);
                    files.push(filePath);
                  }
                }
              } catch (err) {
                console.error('🎯 Error getting string from item:', err);
              }
            }
            
            // 尝试获取文件对象
            if (item.kind === 'file') {
              const file = item.getAsFile();
              if (file) {
                const filePath = (file as any).path || file.name;
                if (filePath && !files.includes(filePath)) {
                  console.log('🎯 Adding file from File object:', filePath);
                  files.push(filePath);
                }
              }
            }
          }
        }

        // 🎯 方法2: 处理 File 对象（从 Finder/Explorer 拖拽）
        if (files.length === 0 && e.dataTransfer.files.length > 0) {
          console.log('🎯 Processing dataTransfer.files:', e.dataTransfer.files.length);
          
          const fileList = Array.from(e.dataTransfer.files);
          for (const file of fileList) {
            const filePath =
              (file as any).path ||
              (file as any).webkitRelativePath ||
              (file as any).mozFullPath ||
              (file as any).fullPath ||
              file.name;

            if (filePath && !files.includes(filePath)) {
              console.log('🎯 Adding file from files:', filePath);
              files.push(filePath);
            }
          }
        }

        // 🎯 方法3: 处理文本数据
        if (files.length === 0) {
          const textData = e.dataTransfer.getData('text/plain');
          const uriListData = e.dataTransfer.getData('text/uri-list');

          console.log('🎯 text/plain:', textData);
          console.log('🎯 text/uri-list:', uriListData);

          // 处理 URI 列表
          if (uriListData) {
            const uris = uriListData.split('\n').filter(uri => uri.trim() && !uri.startsWith('#'));
            for (const uri of uris) {
              let cleanedPath = uri
                .replace(/^vscode-resource:\/\//, '')
                .replace(/^vscode-file:\/\//, '')
                .replace(/^file:\/\//, '')
                .trim();
              
              // Windows: 修复路径
              if (cleanedPath.match(/^\/[a-zA-Z]:\//)) {
                cleanedPath = cleanedPath.substring(1);
              }
              
              if (cleanedPath && !files.includes(cleanedPath)) {
                console.log('🎯 Adding file from uri-list:', cleanedPath);
                files.push(cleanedPath);
              }
            }
          }

          // 处理纯文本路径
          if (files.length === 0 && textData) {
            let cleanedPath = textData
              .replace(/^vscode-resource:\/\//, '')
              .replace(/^vscode-file:\/\//, '')
              .replace(/^file:\/\//, '')
              .trim();
            
            // Windows: 修复路径
            if (cleanedPath.match(/^\/[a-zA-Z]:\//)) {
              cleanedPath = cleanedPath.substring(1);
            }
            
            if (cleanedPath && (cleanedPath.startsWith('/') || cleanedPath.includes('\\') || cleanedPath.match(/^[A-Za-z]:/))) {
              console.log('🎯 Adding file from text/plain:', cleanedPath);
              files.push(cleanedPath);
            }
          }
        }
      }

      if (files.length > 0) {
        console.log('🎯 ✅ Drop files detected:', files);
        onFilesDrop(files);
      } else {
        console.warn('🎯 ❌ No valid files detected in drop event');
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