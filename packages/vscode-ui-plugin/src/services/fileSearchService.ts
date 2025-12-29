/**
 * @license
 * Copyright 2025 DeepV Code
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { glob } from 'glob';
import { 
  FileDiscoveryService, 
  FilterFilesOptions,
  escapePath,
  unescapePath,
  isNodeError,
  DEFAULT_FILE_FILTERING_OPTIONS
} from 'deepv-code-core';
import { Logger } from '../utils/logger';

// 直接复用CLI中的Suggestion接口
export interface Suggestion {
  label: string;
  value: string;
  description?: string;
}

export interface FileSearchOptions {
  /** 搜索前缀 */
  prefix: string;
  /** 最大结果数量 */
  maxResults?: number;
  /** 最大搜索深度 */
  maxDepth?: number;
  /** 是否包含隐藏文件 */
  includeDotfiles?: boolean;
  /** 是否遵守Git ignore */
  respectGitIgnore?: boolean;
  /** 是否遵守DeepV ignore */
  respectDeepVIgnore?: boolean;
}

export class FileSearchService {
  private fileDiscoveryService: FileDiscoveryService | null = null;
  private workspaceRoot: string | null = null;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.initializeWorkspace();
  }

  private initializeWorkspace() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      this.workspaceRoot = workspaceFolder.uri.fsPath;
      this.fileDiscoveryService = new FileDiscoveryService(this.workspaceRoot);
      this.logger.info(`FileSearchService initialized with workspace: ${this.workspaceRoot}`);
    } else {
      this.logger.warn('No workspace folder found for FileSearchService');
    }
  }

  /**
   * 完全模拟CLI中的@补全搜索逻辑
   * 
   * 平台兼容性说明：
   * - 统一使用 / 作为路径分隔符（跨平台标准）
   * - Windows 路径 C:\Users\file 会被规范化为 C:/Users/file
   * - 内部使用 Node.js path 模块进行实际文件操作
   */
  async searchFiles(partialPath: string): Promise<Suggestion[]> {
    if (!this.workspaceRoot || !this.fileDiscoveryService) {
      this.logger.warn('FileSearchService not properly initialized');
      return [];
    }

    const cwd = this.workspaceRoot;
    
    // 🎯 平台兼容性：将路径分隔符统一为 / (适用于 Mac/Linux/Windows)
    // Windows 也支持 / 作为路径分隔符
    const normalizedPath = partialPath.replace(/\\/g, '/');
    
    // 直接复用CLI中的路径解析逻辑
    const lastSlashIndex = normalizedPath.lastIndexOf('/');
    const baseDirRelative = lastSlashIndex === -1 ? '.' : normalizedPath.substring(0, lastSlashIndex + 1);
    const prefix = unescapePath(
      lastSlashIndex === -1 ? normalizedPath : normalizedPath.substring(lastSlashIndex + 1)
    );

    // 🎯 使用 path.resolve 自动处理平台差异
    const baseDirAbsolute = path.resolve(cwd, baseDirRelative);
    
    const filterOptions = DEFAULT_FILE_FILTERING_OPTIONS;

    try {
      let fetchedSuggestions: Suggestion[] = [];

      // 直接复用CLI的搜索策略：递归搜索 vs 目录内搜索
      if (normalizedPath.indexOf('/') === -1 && prefix) {
        // 递归搜索（复用CLI的findFilesWithGlob逻辑）
        fetchedSuggestions = await this.findFilesWithGlob(prefix, this.fileDiscoveryService, filterOptions);
      } else {
        // 目录内搜索（复用CLI的目录遍历逻辑）
        fetchedSuggestions = await this.findFilesInDirectory(baseDirAbsolute, prefix, this.fileDiscoveryService, filterOptions, cwd);
      }

      // 复用CLI的排序逻辑
      return this.applyCLISorting(fetchedSuggestions);
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return [];
      }
      this.logger.error('Error searching files', error instanceof Error ? error : undefined);
      return [];
    }
  }

  /**
   * 直接复用CLI中的findFilesWithGlob函数
   */
  private async findFilesWithGlob(
    searchPrefix: string,
    fileDiscoveryService: FileDiscoveryService,
    filterOptions: FilterFilesOptions,
    maxResults = 50,
  ): Promise<Suggestion[]> {
    const globPattern = `**/*${searchPrefix}*`;
    const files = await glob(globPattern, {
      cwd: this.workspaceRoot!,
      dot: searchPrefix.startsWith('.'),
      nocase: true,
    });

    const suggestions: Suggestion[] = files
      .map((file: string) => {
        // 🎯 生成完整的绝对路径
        const absolutePath = path.resolve(this.workspaceRoot!, file);
        return {
          relativePath: file,  // 保留相对路径用于过滤
          label: absolutePath,  // 使用绝对路径
          value: escapePath(absolutePath),
        };
      })
      .filter((s) => {
        // 🎯 过滤时使用相对路径
        return !fileDiscoveryService.shouldIgnoreFile(s.relativePath, filterOptions);
      })
      .map(s => ({ label: s.label, value: s.value }))  // 移除临时的relativePath字段
      .slice(0, maxResults);

    return suggestions;
  }

  /**
   * 直接复用CLI中的目录搜索逻辑
   */
  private async findFilesInDirectory(
    baseDirAbsolute: string,
    prefix: string,
    fileDiscoveryService: FileDiscoveryService,
    filterOptions: FilterFilesOptions,
    cwd: string
  ): Promise<Suggestion[]> {
    const lowerPrefix = prefix.toLowerCase();
    const entries = await fs.readdir(baseDirAbsolute, { withFileTypes: true });

    // 过滤条目（完全复用CLI逻辑）
    const filteredEntries = [];
    for (const entry of entries) {
      // 条件性忽略dotfiles
      if (!prefix.startsWith('.') && entry.name.startsWith('.')) {
        continue;
      }
      if (!entry.name.toLowerCase().startsWith(lowerPrefix)) continue;

      const relativePath = path.relative(cwd, path.join(baseDirAbsolute, entry.name));
      if (fileDiscoveryService.shouldIgnoreFile(relativePath, filterOptions)) {
        continue;
      }

      filteredEntries.push(entry);
    }

    return filteredEntries.map((entry) => {
      // 🎯 生成完整的绝对路径  
      const absolutePath = path.join(baseDirAbsolute, entry.name);
      const label = entry.isDirectory() ? absolutePath + '/' : absolutePath;
      return {
        label,  // 使用绝对路径
        value: escapePath(label),
      };
    });
  }

  /**
   * 直接复用CLI中的排序逻辑
   */
  private applyCLISorting(suggestions: Suggestion[]): Suggestion[] {
    // 统一使用正斜杠（复用CLI逻辑）
    const normalizedSuggestions = suggestions.map((suggestion) => ({
      ...suggestion,
      label: suggestion.label.replace(/\\/g, '/'),
      value: suggestion.value.replace(/\\/g, '/'),
    }));

    // 复用CLI的排序逻辑：深度、目录优先、字母序
    normalizedSuggestions.sort((a, b) => {
      const depthA = (a.label.match(/\//g) || []).length;
      const depthB = (b.label.match(/\//g) || []).length;

      if (depthA !== depthB) {
        return depthA - depthB;
      }

      const aIsDir = a.label.endsWith('/');
      const bIsDir = b.label.endsWith('/');
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;

      // 排除扩展名比较
      const filenameA = a.label.substring(0, a.label.length - path.extname(a.label).length);
      const filenameB = b.label.substring(0, b.label.length - path.extname(b.label).length);

      return filenameA.localeCompare(filenameB) || a.label.localeCompare(b.label);
    });

    return normalizedSuggestions;
  }

  /**
   * 监听工作区变化
   */
  onWorkspaceChanged(callback: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.initializeWorkspace();
      callback();
    });
  }
}
