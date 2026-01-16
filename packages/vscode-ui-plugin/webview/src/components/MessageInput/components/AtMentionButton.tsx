/**
 * @ Mention Button Component
 * 点击按钮打开上下文选择菜单（锚定在按钮旁边）
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AtSign } from 'lucide-react';
import type { LexicalEditor } from 'lexical';
import { $getSelection, $isRangeSelection, $createTextNode } from 'lexical';
import { useTranslation } from '../../../hooks/useTranslation';
import { FileSelectionMenu } from './FileSelectionMenu';
import { atSymbolHandler, FileOption } from '../../../services/atSymbolHandler';
import { $createFileReferenceNode } from '../nodes/FileReferenceNode';
import { $createCodeReferenceNode } from '../nodes/CodeReferenceNode';
import { $createTerminalReferenceNode } from '../nodes/TerminalReferenceNode';
import './AtMentionButton.css';

interface AtMentionButtonProps {
  editorRef: React.MutableRefObject<LexicalEditor | null>;
  disabled?: boolean;
  onFileSelect: (fileName: string, filePath: string) => void;
  onTerminalSelect?: (terminalId: number, terminalName: string, terminalOutput: string) => void;
}

// 🎯 默认菜单选项（立即显示）
const DEFAULT_MENU_OPTIONS: FileOption[] = [
  new FileOption('Files & Folders', '__category_files__', 'category', {
    icon: '🗂️',
    hasSubmenu: true
  }),
  new FileOption('Code Symbols', '__category_symbols__', 'category', {
    icon: '🔣',
    hasSubmenu: true
  }),
  new FileOption('Terminals', '__category_terminals__', 'category', {
    icon: '💻',
    hasSubmenu: true
  }),
];

export function AtMentionButton({
  editorRef,
  disabled = false,
  onFileSelect,
  onTerminalSelect
}: AtMentionButtonProps) {
  const { t } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuOptions, setMenuOptions] = useState<FileOption[]>(DEFAULT_MENU_OPTIONS);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  // 🎯 获取菜单位置样式（实时计算）
  const getMenuStyle = (): React.CSSProperties => {
    if (!buttonRef.current) {
      return {
        position: 'fixed',
        bottom: '60px',
        right: '20px',
        zIndex: 2001,
      };
    }

    const buttonRect = buttonRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 🎯 自适应菜单宽度
    const maxMenuWidth = 450;
    const minMenuWidth = 280;
    const padding = 20; // 左右边距

    // 根据可用空间计算菜单宽度
    const availableWidth = viewportWidth - padding * 2;
    const menuWidth = Math.max(minMenuWidth, Math.min(maxMenuWidth, availableWidth));

    // 🎯 计算水平位置
    let right: number | undefined = viewportWidth - buttonRect.right;
    let left: number | undefined;

    // 如果右侧空间不够，尝试左对齐
    if (buttonRect.right < menuWidth + padding) {
      // 右侧空间不够，使用 left 定位
      right = undefined;
      left = padding;
    } else {
      // 右对齐，但确保不超出屏幕
      const maxRight = viewportWidth - menuWidth - padding;
      right = Math.min(right, maxRight);

      // 如果 right 变为负数，改用 left
      if (right < padding) {
        right = undefined;
        left = padding;
      }
    }

    // 🎯 计算垂直位置 - 在按钮上方显示
    const bottom = viewportHeight - buttonRect.top + 8;

    const style: React.CSSProperties = {
      position: 'fixed',
      zIndex: 2001,
      bottom: `${bottom}px`,
      width: `${menuWidth}px`,
      maxWidth: `calc(100vw - ${padding * 2}px)`,
    };

    if (right !== undefined) {
      style.right = `${right}px`;
    } else if (left !== undefined) {
      style.left = `${left}px`;
    }

    return style;
  };

  // 🎯 点击按钮 - 打开菜单
  const handleButtonClick = useCallback(async () => {
    if (disabled) return;

    setIsMenuOpen(true);
    setMenuOptions(DEFAULT_MENU_OPTIONS); // 立即显示默认菜单
    setSelectedIndex(0);

    // 🎯 异步加载完整菜单选项
    try {
      setIsLoading(true);
      const mainOptions = await atSymbolHandler.getMainMenuOptions();
      setMenuOptions(mainOptions.length > 0 ? mainOptions : DEFAULT_MENU_OPTIONS);
    } catch (error) {
      console.error('Failed to load menu options:', error);
      setMenuOptions(DEFAULT_MENU_OPTIONS);
    } finally {
      setIsLoading(false);
    }
  }, [disabled]);

  // 🎯 关闭菜单
  const handleCloseMenu = useCallback(() => {
    setIsMenuOpen(false);
    setMenuOptions(DEFAULT_MENU_OPTIONS);
    setSelectedIndex(0);
    atSymbolHandler.resetView();
  }, []);

  // 🎯 处理文件/符号选择
  const handleSelectOption = useCallback((option: FileOption) => {
    // 分类选项由 FileSelectionMenu 内部处理
    if (option.itemType === 'category') {
      return;
    }

    // 终端选项也由 FileSelectionMenu 内部处理
    if (option.itemType === 'terminal') {
      return;
    }

    // 关闭菜单
    handleCloseMenu();

    // 🎯 先聚焦编辑器，确保有有效的选区
    const editor = editorRef.current;
    if (editor) {
      editor.focus();

      // 等待编辑器聚焦后再插入
      setTimeout(() => {
        // 🎯 通知父组件 - 让 MessageInput 的 handleFileAutoComplete 处理插入
        onFileSelect(option.fileName, option.filePath);
      }, 0);
    } else {
      // 如果编辑器不可用，直接调用
      onFileSelect(option.fileName, option.filePath);
    }
  }, [editorRef, onFileSelect, handleCloseMenu]);

  // 🎯 处理终端选择
  const handleTerminalSelect = useCallback((
    terminalId: number,
    terminalName: string,
    terminalOutput: string
  ) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;

      // 创建终端引用节点
      const terminalReferenceNode = $createTerminalReferenceNode(
        terminalId,
        terminalName,
        terminalOutput
      );

      // 插入节点
      selection.insertNodes([terminalReferenceNode]);

      // 在引用后添加空格
      const spaceNode = $createTextNode(' ');
      terminalReferenceNode.insertAfter(spaceNode);
      spaceNode.selectNext();
    });

    // 关闭菜单
    handleCloseMenu();

    // 通知父组件
    if (onTerminalSelect) {
      onTerminalSelect(terminalId, terminalName, terminalOutput);
    }

    // 聚焦编辑器
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.focus();
      }
    }, 0);
  }, [editorRef, onTerminalSelect, handleCloseMenu]);

  // 🎯 点击外部关闭菜单
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // 如果点击的是按钮或菜单内部，不关闭
      if (
        buttonRef.current?.contains(target) ||
        menuContainerRef.current?.contains(target)
      ) {
        return;
      }

      handleCloseMenu();
    };

    // 延迟添加事件监听，避免立即触发
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen, handleCloseMenu]);

  // 🎯 Esc 键关闭菜单
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        handleCloseMenu();
      }
    };

    document.addEventListener('keydown', handleEscape, true);

    return () => {
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [isMenuOpen, handleCloseMenu]);

  return (
    <>
      {/* 🎯 @ 按钮 */}
      <button
        ref={buttonRef}
        className="at-mention-button"
        onClick={handleButtonClick}
        disabled={disabled}
        title={t('atMention.openContextMenu')}
        aria-label={t('atMention.openContextMenu')}
      >
        <AtSign size={16} />
      </button>

      {/* 🎯 菜单弹窗 (Portal) */}
      {isMenuOpen && createPortal(
        <div
          ref={menuContainerRef}
          className="at-mention-menu-container"
          style={getMenuStyle()}
        >
          <FileSelectionMenu
            anchorElementRef={buttonRef}
            options={menuOptions}
            selectedIndex={selectedIndex}
            setHighlightedIndex={setSelectedIndex}
            onSelectOption={handleSelectOption}
            onClose={handleCloseMenu}
            onTerminalSelect={handleTerminalSelect}
            isLoading={isLoading}
            queryString=""
          />
        </div>,
        document.body
      )}
    </>
  );
}
