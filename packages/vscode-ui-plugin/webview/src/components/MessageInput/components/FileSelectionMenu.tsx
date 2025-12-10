/**
 * 文件选择菜单组件
 * @ 符号自动完成时显示的文件选择菜单
 *
 * 🎯 增强版：支持最近文件、文件夹分类、终端选择、键盘导航
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FileOption, atSymbolHandler } from '../../../services/atSymbolHandler';
import { useTranslation } from '../../../hooks/useTranslation';
import { FilesIcon, TerminalIcon } from '../../MenuIcons';

interface FileSelectionMenuProps {
  anchorElementRef: React.RefObject<HTMLElement>;
  options: FileOption[];
  selectedIndex: number | null;
  setHighlightedIndex: (index: number) => void;
  onSelectOption: (option: FileOption) => void;
  onClose: () => void;
  onTerminalSelect?: (terminalId: number, name: string, output: string) => void;
  isLoading?: boolean;
  queryString?: string;
}

// 🎯 菜单视图类型
type MenuView = 'main' | 'files' | 'terminals';

// 🎯 文件选择菜单组件
export function FileSelectionMenu({
  anchorElementRef,
  options,
  selectedIndex,
  setHighlightedIndex,
  onSelectOption,
  onClose,
  onTerminalSelect,
  isLoading: externalLoading = false,
  queryString = ''
}: FileSelectionMenuProps) {
  const { t } = useTranslation();
  const [currentView, setCurrentView] = useState<MenuView>('main');
  const [subMenuOptions, setSubMenuOptions] = useState<FileOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [localSelectedIndex, setLocalSelectedIndex] = useState<number>(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // 🎯 确定当前显示的选项
  const currentOptions = currentView === 'main' ? options : subMenuOptions;

  // 🎯 处理分类点击
  const handleCategoryClick = useCallback(async (option: FileOption) => {
    if (option.filePath === '__category_files__') {
      setIsLoading(true);
      try {
        const files = await atSymbolHandler.searchFiles('');
        setSubMenuOptions(files);
        setCurrentView('files');
        atSymbolHandler.setCurrentView('files');
        setLocalSelectedIndex(0);
      } catch (error) {
        console.error('Failed to fetch files:', error);
      } finally {
        setIsLoading(false);
      }
    } else if (option.filePath === '__category_terminals__') {
      setIsLoading(true);
      try {
        const terminals = await atSymbolHandler.getTerminalOptions();
        setSubMenuOptions(terminals);
        setCurrentView('terminals');
        atSymbolHandler.setCurrentView('terminals');
        setLocalSelectedIndex(0);
      } catch (error) {
        console.error('Failed to fetch terminals:', error);
      } finally {
        setIsLoading(false);
      }
    }
  }, []);

  // 🎯 处理终端点击 - 只记录终端信息，不获取输出（延迟到发送时获取）
  const handleTerminalClick = useCallback((option: FileOption) => {
    if (option.terminalId !== undefined && onTerminalSelect) {
      // 🎯 只传递终端 ID 和名称，output 传空字符串作为占位符
      // 实际输出会在消息发送时获取
      onTerminalSelect(option.terminalId, option.fileName, '');
    }
    onClose();
  }, [onTerminalSelect, onClose]);

  // 🎯 处理选项点击/选择
  const handleOptionSelect = useCallback((option: FileOption) => {
    if (option.itemType === 'category') {
      handleCategoryClick(option);
    } else if (option.itemType === 'terminal') {
      handleTerminalClick(option);
    } else {
      onSelectOption(option);
    }
  }, [handleCategoryClick, handleTerminalClick, onSelectOption]);

  // 🎯 处理返回
  const handleBack = useCallback(() => {
    setCurrentView('main');
    setSubMenuOptions([]);
    atSymbolHandler.resetView();
    setLocalSelectedIndex(0);
  }, []);

  // 🎯 键盘事件处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!currentOptions.length) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          setLocalSelectedIndex(prev => {
            const next = prev < currentOptions.length - 1 ? prev + 1 : 0;
            setHighlightedIndex(next);
            return next;
          });
          break;

        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          setLocalSelectedIndex(prev => {
            const next = prev > 0 ? prev - 1 : currentOptions.length - 1;
            setHighlightedIndex(next);
            return next;
          });
          break;

        case 'Enter':
          e.preventDefault();
          e.stopPropagation();
          if (localSelectedIndex >= 0 && localSelectedIndex < currentOptions.length) {
            handleOptionSelect(currentOptions[localSelectedIndex]);
          }
          break;

        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          if (currentView !== 'main') {
            handleBack();
          } else {
            onClose();
          }
          break;

        case 'Backspace':
          // 在子菜单中按退格键返回上一级
          if (currentView !== 'main') {
            e.preventDefault();
            e.stopPropagation();
            handleBack();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [currentOptions, localSelectedIndex, currentView, handleOptionSelect, handleBack, onClose, setHighlightedIndex]);

  // 🎯 同步外部 selectedIndex（仅在主视图）
  useEffect(() => {
    if (currentView === 'main' && selectedIndex !== null) {
      setLocalSelectedIndex(selectedIndex);
    }
  }, [selectedIndex, currentView]);

  // 🎯 当视图切换时重置选中索引
  useEffect(() => {
    setLocalSelectedIndex(0);
    // 切换视图时重置滚动位置
    if (menuRef.current) {
      menuRef.current.scrollTop = 0;
    }
  }, [currentView]);

  // 🎯 自动滚动到选中项
  useEffect(() => {
    if (menuRef.current) {
      const menu = menuRef.current;
      // 使用 class 选择器找到当前选中的项
      const selectedItem = menu.querySelector('.at-menu-item.selected') as HTMLElement;

      if (selectedItem) {
        const itemTop = selectedItem.offsetTop;
        const itemHeight = selectedItem.offsetHeight;
        const menuScrollTop = menu.scrollTop;
        const menuHeight = menu.clientHeight;

        // 检查上方：如果项的顶部在滚动窗口上方，滚动到项的顶部
        if (itemTop < menuScrollTop) {
          menu.scrollTop = itemTop;
        }
        // 检查下方：如果项的底部在滚动窗口下方，滚动使项的底部与窗口底部对齐
        else if (itemTop + itemHeight > menuScrollTop + menuHeight) {
          menu.scrollTop = itemTop + itemHeight - menuHeight;
        }
      }
    }
  }, [localSelectedIndex]);

  // 🎯 获取图标
  const getItemIcon = (option: FileOption): string | React.ReactNode => {
    if (option.icon) return option.icon;

    switch (option.itemType) {
      case 'recent_file':
      case 'file':
        return '📄';
      case 'category':
        return option.filePath === '__category_files__' ? <FilesIcon /> : <TerminalIcon />;
      case 'terminal':
        return <TerminalIcon />;
      default:
        return '📄';
    }
  };

  // 🎯 渲染菜单项
  const renderMenuItem = (option: FileOption, index: number) => {
    const isSelected = localSelectedIndex === index;
    const icon = getItemIcon(option);
    const showArrow = option.hasSubmenu || option.itemType === 'category';

    return (
      <div
        key={`${option.filePath}-${index}`}
        className={`at-menu-item ${isSelected ? 'selected' : ''} ${option.itemType}`}
        onClick={() => handleOptionSelect(option)}
        onMouseEnter={() => {
          setLocalSelectedIndex(index);
          setHighlightedIndex(index);
        }}
      >
        <span className="at-menu-item-icon">{icon}</span>
        <div className="at-menu-item-content">
          <div className="at-menu-item-name">{option.fileName}</div>
          {(option.itemType === 'file' || option.itemType === 'recent_file') && option.filePath && (
            <div className="at-menu-item-path">{option.filePath}</div>
          )}
        </div>
        {showArrow && (
          <span className="at-menu-item-arrow">›</span>
        )}
      </div>
    );
  };

  // 🎯 加载指示器
  const loadingIndicator = (isLoading || externalLoading) && (
    <div className="at-menu-loading">
      <span className="at-menu-loading-spinner"></span>
      {t('atMention.loading')}
    </div>
  );

  // 🎯 空状态处理
  if (currentOptions.length === 0 && !isLoading && !externalLoading) {
    if (currentView === 'terminals') {
      return (
        <div className="at-autocomplete-menu" ref={menuRef}>
          <div className="at-menu-header">
            <button className="at-menu-back" onClick={handleBack}>←</button>
            <span>{t('atMention.terminals')}</span>
          </div>
          <div className="at-menu-empty">{t('atMention.noTerminals')}</div>
        </div>
      );
    }
    if (currentView === 'files') {
      return (
        <div className="at-autocomplete-menu" ref={menuRef}>
          <div className="at-menu-header">
            <button className="at-menu-back" onClick={handleBack}>←</button>
            <span>{t('atMention.filesAndFolders')}</span>
          </div>
          <div className="at-menu-empty">{t('atMention.noRecentFiles')}</div>
        </div>
      );
    }
    return null;
  }

  // 🎯 主视图：分离不同类型的选项
  const recentFiles = options.filter(o => o.itemType === 'recent_file');
  const searchResults = options.filter(o => o.itemType === 'file');
  const categories = options.filter(o => o.itemType === 'category');

  // 🎯 计算正确的索引偏移
  let indexOffset = 0;

  return (
    <div className="at-autocomplete-menu" ref={menuRef}>
      {loadingIndicator}

      {/* 🎯 主视图 */}
      {currentView === 'main' && (
        <>
          {/* 搜索结果（当用户输入时显示） */}
          {searchResults.length > 0 && (
            <>
              <div className="at-menu-section-header">
                {queryString ? `Search: "${queryString}"` : t('atMention.filesAndFolders')}
              </div>
              {searchResults.map((option, index) => {
                const actualIndex = indexOffset + index;
                return renderMenuItem(option, actualIndex);
              })}
              {(() => { indexOffset += searchResults.length; return null; })()}
              <div className="at-menu-divider"></div>
            </>
          )}

          {/* 最近文件 */}
          {recentFiles.length > 0 && (
            <>
              <div className="at-menu-section-header">{t('atMention.recentFiles')}</div>
              {recentFiles.map((option, index) => {
                const actualIndex = indexOffset + index;
                return renderMenuItem(option, actualIndex);
              })}
              {(() => { indexOffset += recentFiles.length; return null; })()}
              <div className="at-menu-divider"></div>
            </>
          )}

          {/* 分类选项 */}
          {categories.map((option, index) => {
            const actualIndex = indexOffset + index;
            return renderMenuItem(option, actualIndex);
          })}
        </>
      )}

      {/* 🎯 文件列表视图 */}
      {currentView === 'files' && !isLoading && (
        <>
          <div className="at-menu-header">
            <button className="at-menu-back" onClick={handleBack}>←</button>
            <span>{t('atMention.filesAndFolders')}</span>
          </div>
          {subMenuOptions.map((option, index) => renderMenuItem(option, index))}
        </>
      )}

      {/* 🎯 终端列表视图 */}
      {currentView === 'terminals' && !isLoading && (
        <>
          <div className="at-menu-header">
            <button className="at-menu-back" onClick={handleBack}>←</button>
            <span>{t('atMention.terminals')}</span>
          </div>
          {subMenuOptions.map((option, index) => renderMenuItem(option, index))}
        </>
      )}
    </div>
  );
}