/**
 * 文件修改状态栏组件
 */

import React, { useState, useRef, useEffect } from 'react';
import { FilesChangedBarProps, ModifiedFile } from '../types/fileChanges';
import { getFileIcon } from '../components/FileIcons';
import { useTranslation } from '../hooks/useTranslation';
import { FileText, ChevronDown, ChevronRight, X, Undo2 } from 'lucide-react';
import './FilesChangedBar.css';

const FilesChangedBar: React.FC<FilesChangedBarProps> = ({
  modifiedFiles,
  onFileClick,
  onUndoFile,
  onAcceptChanges
}) => {
  const { t } = useTranslation();
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

  // 获取文件的显示路径（相对路径或完整路径）
  const getDisplayPath = (file: ModifiedFile): { fullPath: string; displayName: string } => {
    const filePath = file.filePath || file.fileName;
    return { fullPath: filePath, displayName: filePath };
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
          {filesArray.map(file => {
            const { fullPath, displayName } = getDisplayPath(file);
            return (
              <div
                key={file.filePath || file.fileName}
                className="file-item"
                onClick={(e) => handleFileClick(file, e)}
                title={`${file.isDeletedFile ? '删除' : file.isNewFile ? '新建' : '修改'}: ${fullPath}${file.modificationCount > 1 ? ` (${file.modificationCount}次修改)` : ''}`}
              >
                <div className="file-item-left">
                  <span className="file-icon">
                    {getFileIcon(file.fileName)}
                  </span>
                  <div className="file-info">
                    <div className="file-name">{file.fileName}</div>
                    <div className="file-path">{displayName}</div>
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
                  {onUndoFile && (
                    <button
                      className="file-undo-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUndoFile(file);
                      }}
                      title={t('chat.undoFileTooltip', {}, 'Undo changes to this file')}
                      aria-label={t('chat.undoFileTooltip', {}, 'Undo changes to this file')}
                    >
                      <Undo2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 主要的单行栏 */}
      <div
        className={`files-changed-bar ${isExpanded ? 'expanded' : ''}`}
        onClick={handleToggleExpand}
        title={t('chat.viewModifiedFiles', {}, 'Click to view modified files')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggleExpand();
          }
        }}
      >
        <div className="bar-left">
          <span className="bar-title">{t('chat.fileChangesTitle', {}, 'CHANGES')}</span>
          <span className="files-count">
            {(() => {
              const parts = [];
              if (newFilesCount > 0) {
                parts.push(`${newFilesCount} ${t('fileStatus.new', {}, 'new')}`);
              }
              if (modifiedFilesCount > 0) {
                parts.push(`${modifiedFilesCount} ${t('fileStatus.modified', {}, 'modified')}`);
              }
              if (deletedFilesCount > 0) {
                parts.push(`${deletedFilesCount} ${t('fileStatus.deleted', {}, 'deleted')}`);
              }
              return parts.join(', ');
            })()}
          </span>
        </div>

        <div className="bar-right">
          {isExpanded ? (
            <ChevronDown className="expand-indicator" size={14} />
          ) : (
            <ChevronRight className="expand-indicator" size={14} />
          )}

          {/* OK 按钮 */}
          {onAcceptChanges && (
            <button
              className="accept-changes-btn"
              onClick={handleAcceptChanges}
              title={t('chat.acceptChanges', {}, 'Clear this list')}
              aria-label={t('chat.acceptChanges', {}, 'Clear this list')}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FilesChangedBar;