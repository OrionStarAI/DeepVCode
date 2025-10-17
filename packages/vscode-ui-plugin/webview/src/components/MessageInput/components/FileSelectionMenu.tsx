/**
 * 文件选择菜单组件
 * @ 符号自动完成时显示的文件选择菜单
 */

import React from 'react';
import { FileOption } from '../../../services/atSymbolHandler';

interface FileSelectionMenuProps {
  anchorElementRef: React.RefObject<HTMLElement>;
  options: FileOption[];
  selectedIndex: number | null;
  onSelectOption: (option: FileOption) => void;
  onClose: () => void;
}

// 🎯 文件自动完成菜单组件
export function FileSelectionMenu({
  anchorElementRef,
  options,
  selectedIndex,
  onSelectOption,
  onClose
}: FileSelectionMenuProps) {
  if (!options.length) return null;

  return (
    <div className="file-autocomplete-menu">
      <div className="file-menu-header">选择文件:</div>
      {options.map((option, index) => (
        <div
          key={option.filePath}
          className={`file-menu-item ${selectedIndex === index ? 'selected' : ''}`}
          onClick={() => onSelectOption(option)}
          onMouseEnter={() => {
            // 可以在这里更新 selectedIndex，但由于我们不能直接控制，先保持简单
          }}
        >
          <span className="file-icon">📎</span>
          <div className="file-info">
            <div className="file-name">{option.fileName}</div>
            <div className="file-path">{option.filePath}</div>
          </div>
        </div>
      ))}
    </div>
  );
}