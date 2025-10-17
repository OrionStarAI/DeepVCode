/**
 * 文件修改状态栏组件
 */

import React, { useState, useRef, useEffect } from 'react';
import { FilesChangedBarProps, ModifiedFile } from '../types/fileChanges';
import { getFileIcon } from '../utils/fileChangeExtractor';
import './FilesChangedBar.css';

const FilesChangedBar: React.FC<FilesChangedBarProps> = ({
  modifiedFiles,
  onFileClick,
  onAcceptChanges
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭展开列表
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && event.target && containerRef.current.contains(event.target as Node) === false) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExpanded]);

  const handleToggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const handleFileClick = (file: ModifiedFile, event: React.MouseEvent) => {
    try {
      event.stopPropagation();
      onFileClick(file);
      // 移除自动收起：setIsExpanded(false);
    } catch (error) {
      console.error('Error handling file click:', error);
    }
  };

  const handleAcceptChanges = (event: React.MouseEvent) => {
    try {
      event.stopPropagation();
      onAcceptChanges?.();
    } catch (error) {
      console.error('Error accepting changes:', error);
    }
  };

  // 如果没有修改的文件，不显示组件
  if (modifiedFiles.size === 0) {
    return null;
  }

  const filesArray = Array.from(modifiedFiles.values());
  const newFilesCount = filesArray.filter(f => f.isNewFile && !f.isDeletedFile).length;
  const deletedFilesCount = filesArray.filter(f => f.isDeletedFile).length;
  const modifiedFilesCount = filesArray.filter(f => !f.isNewFile && !f.isDeletedFile).length;

  return (
    <div className="files-changed-container" ref={containerRef}>
      {/* 悬浮文件列表 - 在上方 */}
      {isExpanded && (
        <div className="files-expanded-list">
          {filesArray.map(file => (
            <div
              key={file.fileName}
              className="file-item"
              onClick={(e) => handleFileClick(file, e)}
              title={`${file.isDeletedFile ? '删除' : file.isNewFile ? '新建' : '修改'}: ${file.filePath || file.fileName}${file.modificationCount > 1 ? ` (${file.modificationCount}次修改)` : ''}`}
            >
              <div className="file-item-left">
                <span className="file-icon">
                  {getFileIcon(file.fileName, file.isNewFile, file.isDeletedFile)}
                </span>
                <div className="file-info">
                  <div className="file-name">{file.fileName}</div>
                  <div className="file-path">{file.filePath || file.fileName}</div>
                </div>
              </div>
              <div className="file-item-right">
                <div className="line-stats">
                  {file.isDeletedFile ? (
                    <span className="file-deleted">DELETED</span>
                  ) : (
                    <>
                      {file.linesAdded > 0 && (
                        <span className="lines-added">+{file.linesAdded}</span>
                      )}
                      {file.linesRemoved > 0 && (
                        <span className="lines-removed">-{file.linesRemoved}</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 主要的单行栏 */}
      <div
        className="files-changed-bar"
        onClick={handleToggleExpand}
        title="点击查看修改的文件列表"
      >
        <span className="files-icon">📝</span>
        <span className="files-count">
          {(() => {
            const parts = [];
            if (newFilesCount > 0) {
              parts.push(`${newFilesCount} new files`);
            }
            if (modifiedFilesCount > 0) {
              parts.push(`${modifiedFilesCount} modified`);
            }
            if (deletedFilesCount > 0) {
              parts.push(`${deletedFilesCount} deleted`);
            }
            return parts.join(', ');
          })()}
        </span>

        {/* Keep 按钮 */}
        {onAcceptChanges && (
          <button
            className="accept-changes-btn"
            onClick={handleAcceptChanges}
            title="Keep current changes, only show new file changes afterwards"
          >
            Keep
          </button>
        )}

        <span className={`expand-arrow ${isExpanded ? 'expanded' : ''}`}>
          ▼
        </span>
      </div>
    </div>
  );
};

export default FilesChangedBar;