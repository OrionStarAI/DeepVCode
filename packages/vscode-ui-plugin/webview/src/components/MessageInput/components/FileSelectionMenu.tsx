/**
 * 文件选择菜单组件
 * @ 符号自动完成时显示的文件选择菜单
 *
 * 🎯 增强版：支持最近文件、文件夹分类、终端选择、键盘导航
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FileOption, atSymbolHandler } from '../../../services/atSymbolHandler';
import { useTranslation } from '../../../hooks/useTranslation';
import { FilesIcon, TerminalIcon, SymbolIcon } from '../../MenuIcons';

interface FileSelectionMenuProps {
  anchorElementRef: React.RefObject<HTMLElement>;
  options: FileOption[];
  selectedIndex: number | null;
  setHighlightedIndex: (index: number) => void;
  onSelectOption: (option: FileOption) => void;
  onClose: () => void;
  onTerminalSelect?: (terminalId: number, name: string, output: string) => void;
  onFolderSelect?: (folderName: string, folderPath: string) => void;  // 🎯 新增：文件夹引用回调
  isLoading?: boolean;
  queryString?: string;
}

// 🎯 菜单视图类型
type MenuView = 'main' | 'files' | 'terminals' | 'symbols';

// 🎯 文件选择菜单组件
export function FileSelectionMenu({
  anchorElementRef,
  options,
  selectedIndex,
  setHighlightedIndex,
  onSelectOption,
  onClose,
  onTerminalSelect,
  onFolderSelect,
  isLoading: externalLoading = false,
  queryString = ''
}: FileSelectionMenuProps) {
  const { t } = useTranslation();
  const [currentView, setCurrentView] = useState<MenuView>('main');
  const [subMenuOptions, setSubMenuOptions] = useState<FileOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [localSelectedIndex, setLocalSelectedIndex] = useState<number>(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // 🎯 文件夹导航历史栈（用于返回上一级）
  const [folderHistory, setFolderHistory] = useState<string[]>([]);
  // 🎯 当前浏览的文件夹路径
  const [currentFolderPath, setCurrentFolderPath] = useState<string>('');

  // 🎯 确定当前显示的选项
  const currentOptions = currentView === 'main' ? options : subMenuOptions;

  // 🎯 处理分类点击
  const handleCategoryClick = useCallback(async (option: FileOption) => {
    if (option.filePath === '__category_files__') {
      setIsLoading(true);
      try {
        // 🎯 修改：先显示根目录的文件夹和文件列表，而不是搜索所有文件
        const items = await atSymbolHandler.browseFolder('');
        setSubMenuOptions(items);
        setCurrentView('files');
        atSymbolHandler.setCurrentView('files');
        setCurrentFolderPath('');
        setFolderHistory([]);
        setLocalSelectedIndex(0);
      } catch (error) {
        console.error('Failed to fetch files:', error);
      } finally {
        setIsLoading(false);
      }
    } else if (option.filePath === '__category_symbols__') {
      setIsLoading(true);
      try {
        const symbols = await atSymbolHandler.getSymbolOptions(queryString);
        setSubMenuOptions(symbols);
        setCurrentView('symbols');
        atSymbolHandler.setCurrentView('symbols');
        setLocalSelectedIndex(0);
      } catch (error) {
        console.error('Failed to fetch symbols:', error);
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
  }, [queryString]);

  // 🎯 处理终端点击 - 只记录终端信息，不获取输出（延迟到发送时获取）
  const handleTerminalClick = useCallback((option: FileOption) => {
    if (option.terminalId !== undefined && onTerminalSelect) {
      // 🎯 只传递终端 ID 和名称，output 传空字符串作为占位符
      // 实际输出会在消息发送时获取
      onTerminalSelect(option.terminalId, option.fileName, '');
    }
    onClose();
  }, [onTerminalSelect, onClose]);

  // 🎯 处理进入文件夹浏览其内容（点击箭头时触发）
  const handleEnterFolder = useCallback(async (option: FileOption) => {
    setIsLoading(true);
    try {
      // 保存当前路径到历史
      if (currentFolderPath) {
        setFolderHistory(prev => [...prev, currentFolderPath]);
      }

      // 更新当前文件夹路径
      const folderPath = option.filePath.replace(/\/$/, ''); // 移除尾部斜杠
      setCurrentFolderPath(folderPath);

      // 获取文件夹内容
      const items = await atSymbolHandler.browseFolder(folderPath);
      setSubMenuOptions(items);
      setCurrentView('files');
      atSymbolHandler.setCurrentView('files');
      setLocalSelectedIndex(0);
    } catch (error) {
      console.error('Failed to browse folder:', error);
    } finally {
      setIsLoading(false);
    }
  }, [currentFolderPath]);

  // 🎯 处理文件夹引用（单击文件夹时触发）
  const handleFolderSelect = useCallback((option: FileOption) => {
    if (onFolderSelect) {
      // 🎯 如果提供了 onFolderSelect 回调（来自 AtMentionButton），使用它
      const folderPath = option.filePath.replace(/\/$/, ''); // 移除尾部斜杠
      onFolderSelect(option.fileName, folderPath);
      onClose();
    } else {
      // 🎯 如果没有提供 onFolderSelect（来自 FileAutocompletePlugin），通过 onSelectOption 处理
      onSelectOption(option);
    }
  }, [onFolderSelect, onSelectOption, onClose]);

  // 🎯 处理选项点击/选择
  const handleOptionSelect = useCallback((option: FileOption) => {
    if (option.itemType === 'category') {
      handleCategoryClick(option);
    } else if (option.itemType === 'terminal') {
      handleTerminalClick(option);
    } else if (option.itemType === 'folder') {
      // 🎯 文件夹：单击引用整个文件夹
      handleFolderSelect(option);
    } else {
      // 🎯 文件：直接选择引用
      onSelectOption(option);
    }
  }, [handleCategoryClick, handleTerminalClick, handleFolderSelect, onSelectOption]);

  // 🎯 处理返回
  const handleBack = useCallback(async () => {
    // 如果有文件夹导航历史，返回上一级文件夹
    if (folderHistory.length > 0) {
      const prevPath = folderHistory[folderHistory.length - 1];
      setFolderHistory(prev => prev.slice(0, -1));
      setCurrentFolderPath(prevPath);

      setIsLoading(true);
      try {
        const items = await atSymbolHandler.browseFolder(prevPath);
        setSubMenuOptions(items);
        setLocalSelectedIndex(0);
      } catch (error) {
        console.error('Failed to go back:', error);
      } finally {
        setIsLoading(false);
      }
    } else if (currentFolderPath && currentView === 'files') {
      // 如果在根文件夹列表，返回到文件列表根目录
      setCurrentFolderPath('');
      setIsLoading(true);
      try {
        const files = await atSymbolHandler.searchFiles('');
        setSubMenuOptions(files);
        setLocalSelectedIndex(0);
      } catch (error) {
        console.error('Failed to reset to root:', error);
      } finally {
        setIsLoading(false);
      }
    } else {
      // 返回主菜单
      setCurrentView('main');
      setSubMenuOptions([]);
      setCurrentFolderPath('');
      setFolderHistory([]);
      atSymbolHandler.resetView();
      setLocalSelectedIndex(0);
    }
  }, [folderHistory, currentFolderPath, currentView]);

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
      case 'folder':
        return '📁';
      case 'symbol':
        return <SymbolIcon />;
      case 'category':
        if (option.filePath === '__category_files__') return <FilesIcon />;
        if (option.filePath === '__category_symbols__') return <SymbolIcon />;
        return <TerminalIcon />;
      case 'terminal':
        return <TerminalIcon />;
      default:
        return '📄';
    }
  };

  // 🎯 处理箭头点击（进入文件夹）
  const handleArrowClick = useCallback((e: React.MouseEvent, option: FileOption) => {
    e.preventDefault();
    e.stopPropagation(); // 阻止冒泡，避免触发菜单项点击

    if (option.itemType === 'folder') {
      handleEnterFolder(option);
    } else if (option.itemType === 'category') {
      handleCategoryClick(option);
    }
  }, [handleEnterFolder, handleCategoryClick]);

  // 🎯 渲染菜单项
  const renderMenuItem = (option: FileOption, index: number) => {
    const isSelected = localSelectedIndex === index;
    const icon = getItemIcon(option);
    // 🎯 分类和文件夹显示可点击箭头
    const showArrow = option.hasSubmenu || option.itemType === 'category' || option.itemType === 'folder';
    // 🎯 箭头是否可点击（文件夹和分类的箭头可点击进入）
    const isArrowClickable = option.itemType === 'folder' || option.itemType === 'category';

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
          {(option.itemType === 'file' || option.itemType === 'recent_file' || option.itemType === 'symbol') && option.filePath && (
            <div className="at-menu-item-path">{option.filePath}</div>
          )}
        </div>
        {showArrow && (
          isArrowClickable ? (
            <button
              className={`at-menu-item-arrow-btn ${option.itemType === 'folder' ? 'folder-expand' : ''}`}
              onClick={(e) => handleArrowClick(e, option)}
              onMouseDown={(e) => e.preventDefault()}
              title={option.itemType === 'folder' ? t('atMention.browseTooltip') : t('atMention.expandTooltip')}
            >
              {option.itemType === 'folder' ? t('atMention.browse') : t('atMention.expand')} ›
            </button>
          ) : (
            <span className="at-menu-item-arrow">›</span>
          )
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
    if (currentView === 'symbols') {
      return (
        <div className="at-autocomplete-menu" ref={menuRef}>
          <div className="at-menu-header">
            <button className="at-menu-back" onClick={handleBack}>←</button>
            <span>Code Symbols</span>
          </div>
          <div className="at-menu-empty">No symbols found</div>
        </div>
      );
    }
    return null;
  }

  // 🎯 主视图：分离不同类型的选项
  const recentFiles = options.filter(o => o.itemType === 'recent_file');
  const searchResults = options.filter(o => o.itemType === 'file');
  const symbolResults = options.filter(o => o.itemType === 'symbol');
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
                {queryString ? `Files: "${queryString}"` : t('atMention.filesAndFolders')}
              </div>
              {searchResults.map((option, index) => {
                const actualIndex = indexOffset + index;
                return renderMenuItem(option, actualIndex);
              })}
              {(() => { indexOffset += searchResults.length; return null; })()}
              <div className="at-menu-divider"></div>
            </>
          )}

          {/* 符号结果 */}
          {symbolResults.length > 0 && (
            <>
              <div className="at-menu-section-header">Symbols</div>
              {symbolResults.map((option, index) => {
                const actualIndex = indexOffset + index;
                return renderMenuItem(option, actualIndex);
              })}
              {(() => { indexOffset += symbolResults.length; return null; })()}
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
            <span>
              {currentFolderPath
                ? currentFolderPath.split('/').pop() || currentFolderPath
                : t('atMention.filesAndFolders')}
            </span>
          </div>
          {/* 🎯 显示当前路径（如果在子文件夹中） */}
          {currentFolderPath && (
            <div className="at-menu-breadcrumb" title={currentFolderPath}>
              {currentFolderPath}
            </div>
          )}
          {subMenuOptions.map((option, index) => renderMenuItem(option, index))}
        </>
      )}

      {/* 🎯 符号列表视图 */}
      {currentView === 'symbols' && !isLoading && (
        <>
          <div className="at-menu-header">
            <button className="at-menu-back" onClick={handleBack}>←</button>
            <span>Code Symbols</span>
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