/**
 * Memory Management Panel Component
 * 全局 Memory 文件管理面板
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { getGlobalMessageService } from '../../services/globalMessageService';
import { getDisplayPath } from '../../utils/pathUtils';
import './MemoryManagementPanel.css';

// =============================================================================
// 类型定义
// =============================================================================

export interface MemoryFileInfo {
  fileName: string;       // 如 "DEEPV.md"
  filePath: string;       // 完整路径
  scope: 'global' | 'project' | 'subdirectory'; // 文件作用域
  isLoaded: boolean;      // 是否已加载到当前 session
  size?: number;          // 文件大小（字节）
  lastModified?: number;  // 最后修改时间（时间戳）
}

export interface MemoryManagementPanelProps {
  /** 已加载的 Memory 文件路径列表（用于标记 isLoaded） */
  loadedMemoryPaths?: string[];
}

// =============================================================================
// 主组件
// =============================================================================

export const MemoryManagementPanel: React.FC<MemoryManagementPanelProps> = ({
  loadedMemoryPaths = []
}) => {
  const { t } = useTranslation();

  // 状态管理
  const [allMemoryFiles, setAllMemoryFiles] = useState<MemoryFileInfo[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ filePath: string; fileName: string } | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['global', 'project']));

  // =============================================================================
  // 事件处理
  // =============================================================================

  /**
   * 扫描所有 Memory 文件
   */
  const handleScanMemoryFiles = async () => {
    setIsScanning(true);
    try {
      console.log('[Memory] Requesting memory files scan');
      getGlobalMessageService().send({
        type: 'scan_memory_files',
        payload: {}
      });
    } catch (error) {
      console.error('[Memory] Failed to request scan:', error);
      setIsScanning(false);
    }
  };

  /**
   * 刷新 Memory（重新加载到 AI）
   */
  const handleRefreshMemory = async () => {
    setIsRefreshing(true);
    try {
      console.log('[Memory] Manually refreshing memory');
      getGlobalMessageService().refreshMemory();
      // 显示成功提示
      setTimeout(() => {
        setIsRefreshing(false);
      }, 1500);
    } catch (error) {
      console.error('[Memory] Failed to refresh memory:', error);
      setIsRefreshing(false);
    }
  };

  /**
   * 打开 Memory 文件编辑
   */
  const handleOpenMemoryFile = (filePath: string) => {
    console.log('[Memory] Opening memory file:', filePath);
    getGlobalMessageService().openFile(filePath);
  };

  /**
   * 删除 Memory 文件（二次确认）
   */
  const handleDeleteMemoryFile = (filePath: string, fileName: string) => {
    setDeleteConfirm({ filePath, fileName });
  };

  /**
   * 确认删除
   */
  const confirmDelete = () => {
    if (!deleteConfirm) return;

    console.log('[Memory] Deleting memory file:', deleteConfirm.filePath);
    getGlobalMessageService().send({
      type: 'delete_memory_file',
      payload: { filePath: deleteConfirm.filePath }
    });

    // 乐观更新：立即从列表中移除
    setAllMemoryFiles(prev => prev.filter(f => f.filePath !== deleteConfirm.filePath));
    setDeleteConfirm(null);
  };

  /**
   * 创建新的 Memory 文件
   */
  const handleCreateMemoryFile = (fileName: string, scope: 'global' | 'project') => {
    console.log('[Memory] Creating new memory file:', fileName, 'scope:', scope);
    getGlobalMessageService().send({
      type: 'create_memory_file',
      payload: { fileName, scope }
    });
  };

  /**
   * 切换分组展开/折叠
   */
  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  // =============================================================================
  // 生命周期
  // =============================================================================

  /**
   * 组件挂载时自动扫描
   */
  useEffect(() => {
    handleScanMemoryFiles();

    // 监听扫描结果
    const messageService = getGlobalMessageService();
    const disposable = messageService.onExtensionMessage('memory_files_list', (payload: any) => {
      console.log('[Memory] Received memory files list:', payload);
      if (payload.files) {
        // 合并已加载状态
        const filesWithLoadedStatus = payload.files.map((file: MemoryFileInfo) => ({
          ...file,
          isLoaded: loadedMemoryPaths.includes(file.filePath)
        }));
        setAllMemoryFiles(filesWithLoadedStatus);
      }
      setIsScanning(false);
    });

    return () => {
      // 清理监听器
      if (disposable && typeof disposable === 'function') {
        disposable();
      }
    };
  }, []);

  /**
   * 当已加载文件列表变化时，更新 isLoaded 状态
   */
  useEffect(() => {
    setAllMemoryFiles(prev => prev.map(file => ({
      ...file,
      isLoaded: loadedMemoryPaths.includes(file.filePath)
    })));
  }, [loadedMemoryPaths]);

  // =============================================================================
  // 渲染辅助函数
  // =============================================================================

  /**
   * 按作用域分组文件
   */
  const filesByScope = {
    global: allMemoryFiles.filter(f => f.scope === 'global'),
    project: allMemoryFiles.filter(f => f.scope === 'project'),
    subdirectory: allMemoryFiles.filter(f => f.scope === 'subdirectory')
  };

  /**
   * 格式化文件大小
   */
  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  /**
   * 格式化最后修改时间
   */
  const formatLastModified = (timestamp?: number): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  /**
   * 渲染文件列表项
   */
  const renderFileItem = (file: MemoryFileInfo) => (
    <li key={file.filePath} className="memory-file-item">
      <div className="memory-file-item__info">
        {/* 文件图标 */}
        <svg className="memory-file-item__icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M10 1H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5l-4-4zm0 2.5V5h2.5L10 3.5z"/>
        </svg>

        {/* 文件名 + 已加载标记 */}
        <div className="memory-file-item__name-container">
          <span className="memory-file-item__name">{file.fileName}</span>
          {file.isLoaded && (
            <span className="memory-file-item__loaded-badge" title={t('settings.memory.loadedToSession', {}, 'Loaded to AI session')}>
              ✓
            </span>
          )}
        </div>

        {/* 文件路径（悬停显示完整路径） */}
        <span className="memory-file-item__path" title={file.filePath}>
          {getDisplayPath(file.filePath, 40)}
        </span>

        {/* 文件元信息 */}
        {(file.size || file.lastModified) && (
          <span className="memory-file-item__meta">
            {file.size && <span>{formatFileSize(file.size)}</span>}
            {file.lastModified && <span>{formatLastModified(file.lastModified)}</span>}
          </span>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="memory-file-item__actions">
        <button
          onClick={() => handleOpenMemoryFile(file.filePath)}
          className="memory-file-item__action-btn"
          title={t('settings.memory.edit', {}, 'Edit')}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 4.854L9.793 1.293 3.293 7.793a.5.5 0 0 0-.121.196l-1 3.5a.5.5 0 0 0 .624.624l3.5-1a.5.5 0 0 0 .196-.121l6.5-6.5z"/>
          </svg>
        </button>
        <button
          onClick={() => handleDeleteMemoryFile(file.filePath, file.fileName)}
          className="memory-file-item__action-btn memory-file-item__action-btn--danger"
          title={t('settings.memory.delete', {}, 'Delete')}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
            <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
          </svg>
        </button>
      </div>
    </li>
  );

  /**
   * 渲染文件分组
   */
  const renderFileSection = (
    title: string,
    sectionKey: string,
    files: MemoryFileInfo[],
    createOptions?: { fileName: string; label: string }[]
  ) => {
    const isExpanded = expandedSections.has(sectionKey);

    return (
      <div className="memory-section">
        {/* 分组标题 */}
        <div className="memory-section__header" onClick={() => toggleSection(sectionKey)}>
          <svg
            className={`memory-section__expand-icon ${isExpanded ? 'memory-section__expand-icon--expanded' : ''}`}
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
          </svg>
          <h3 className="memory-section__title">{title}</h3>
          <span className="memory-section__count">({files.length})</span>
        </div>

        {/* 文件列表 */}
        {isExpanded && (
          <div className="memory-section__content">
            {files.length === 0 ? (
              <div className="memory-section__empty">
                <p>{t('settings.memory.noFilesInSection', {}, 'No memory files in this section')}</p>
                {createOptions && (
                  <div className="memory-section__create-buttons">
                    {createOptions.map(option => (
                      <button
                        key={option.fileName}
                        onClick={() => handleCreateMemoryFile(option.fileName, sectionKey as 'global' | 'project')}
                        className="memory-section__create-btn"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M8 0a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2H9v6a1 1 0 1 1-2 0V9H1a1 1 0 0 1 0-2h6V1a1 1 0 0 1 1-1z"/>
                        </svg>
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <ul className="memory-file-list">
                {files.map(file => renderFileItem(file))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  };

  // =============================================================================
  // 渲染主体
  // =============================================================================

  return (
    <div className="memory-management-panel">
      {/* 面板标题 */}
      <div className="memory-panel__header">
        <h3 className="memory-panel__title">
          {t('settings.memory.globalManagement', {}, 'Global Memory Management')}
        </h3>
        <p className="memory-panel__description">
          {t('settings.memory.globalDescription', {}, 'Manage all memory files in your project and global settings')}
        </p>
      </div>

      {/* 操作栏 */}
      <div className="memory-panel__actions">
        <button
          onClick={handleScanMemoryFiles}
          disabled={isScanning}
          className="memory-panel__action-button"
          title={t('settings.memory.scanFiles', {}, 'Scan Memory Files')}
        >
          <svg
            className={`memory-panel__refresh-icon ${isScanning ? 'memory-panel__refresh-icon--spinning' : ''}`}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M13 2L11 3.99545L11.0592 4.05474M11 18.0001L13 19.9108L12.9703 19.9417M11.0592 4.05474L13 6M11.0592 4.05474C11.3677 4.01859 11.6817 4 12 4C16.4183 4 20 7.58172 20 12C20 14.5264 18.8289 16.7793 17 18.2454M7 5.75463C5.17107 7.22075 4 9.47362 4 12C4 16.4183 7.58172 20 12 20C12.3284 20 12.6523 19.9802 12.9703 19.9417M11 22.0001L12.9703 19.9417"/>
          </svg>
          {isScanning ? t('settings.memory.scanning', {}, 'Scanning...') : t('settings.memory.scan', {}, 'Scan')}
        </button>
        <button
          onClick={handleRefreshMemory}
          disabled={isRefreshing}
          className="memory-panel__action-button"
          title={t('settings.memory.refresh', {}, 'Refresh Memory')}
        >
          <svg
            className={`memory-panel__refresh-icon ${isRefreshing ? 'memory-panel__refresh-icon--spinning' : ''}`}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M13 2L11 3.99545L11.0592 4.05474M11 18.0001L13 19.9108L12.9703 19.9417M11.0592 4.05474L13 6M11.0592 4.05474C11.3677 4.01859 11.6817 4 12 4C16.4183 4 20 7.58172 20 12C20 14.5264 18.8289 16.7793 17 18.2454M7 5.75463C5.17107 7.22075 4 9.47362 4 12C4 16.4183 7.58172 20 12 20C12.3284 20 12.6523 19.9802 12.9703 19.9417M11 22.0001L12.9703 19.9417"/>
          </svg>
          {isRefreshing ? t('settings.memory.refreshing', {}, 'Refreshing...') : t('settings.memory.refresh', {}, 'Refresh')}
        </button>
      </div>

      {/* 文件列表 */}
      <div className="memory-panel__list-container">
        {isScanning && allMemoryFiles.length === 0 ? (
          <div className="memory-panel__loading">
            <p>{t('settings.memory.scanningFiles', {}, 'Scanning memory files...')}</p>
          </div>
        ) : (
          <>
            {/* 全局 Memory */}
            {renderFileSection(
              t('settings.memory.globalMemory', {}, 'Global Memory (~/.deepv/)'),
              'global',
              filesByScope.global,
              [
                { fileName: 'DEEPV.md', label: t('settings.memory.createDeepv', {}, 'Create DEEPV.md') },
                { fileName: 'GEMINI.md', label: t('settings.memory.createGemini', {}, 'Create GEMINI.md') },
                { fileName: 'AGENTS.md', label: t('settings.memory.createAgents', {}, 'Create AGENTS.md') },
                { fileName: 'CLAUDE.md', label: t('settings.memory.createClaude', {}, 'Create CLAUDE.md') }
              ]
            )}

            {/* 项目 Memory */}
            {renderFileSection(
              t('settings.memory.projectMemory', {}, 'Project Memory'),
              'project',
              filesByScope.project,
              [
                { fileName: 'DEEPV.md', label: t('settings.memory.createDeepv', {}, 'Create DEEPV.md') },
                { fileName: 'GEMINI.md', label: t('settings.memory.createGemini', {}, 'Create GEMINI.md') },
                { fileName: 'AGENTS.md', label: t('settings.memory.createAgents', {}, 'Create AGENTS.md') },
                { fileName: 'CLAUDE.md', label: t('settings.memory.createClaude', {}, 'Create CLAUDE.md') }
              ]
            )}

            {/* 子目录 Memory */}
            {filesByScope.subdirectory.length > 0 && renderFileSection(
              t('settings.memory.subdirectoryMemory', {}, 'Subdirectory Memory'),
              'subdirectory',
              filesByScope.subdirectory
            )}
          </>
        )}
      </div>

      {/* 删除确认对话框 */}
      {deleteConfirm && (
        <div className="memory-delete-confirm-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="memory-delete-confirm" onClick={(e) => e.stopPropagation()}>
            <h3>{t('settings.memory.deleteConfirmTitle', {}, 'Confirm Delete')}</h3>
            <p>
              {t('settings.memory.deleteConfirmMessage', { fileName: deleteConfirm.fileName }, `Are you sure you want to delete "${deleteConfirm.fileName}"?`)}
            </p>
            <p className="memory-delete-confirm__path">{deleteConfirm.filePath}</p>
            <div className="memory-delete-confirm__actions">
              <button onClick={() => setDeleteConfirm(null)} className="memory-delete-confirm__cancel">
                {t('common.cancel', {}, 'Cancel')}
              </button>
              <button onClick={confirmDelete} className="memory-delete-confirm__confirm">
                {t('common.delete', {}, 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
