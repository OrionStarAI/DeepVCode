/**
 * 文件修改状态相关类型定义
 */

export interface ModifiedFile {
  fileName: string;
  filePath?: string; // 显示路径 (相对路径)
  absolutePath?: string; // 🎯 绝对路径
  isNewFile: boolean;
  isDeletedFile: boolean;
  modificationCount: number;
  firstOriginalContent: string;
  latestNewContent: string;
  latestFileDiff: string;
  // 新增：行数统计
  linesAdded: number;
  linesRemoved: number;
  // 删除文件的原始内容（用于回滚）
  deletedContent?: string;
}

export interface FilesChangedState {
  modifiedFiles: Map<string, ModifiedFile>;
}

export interface FilesChangedBarProps {
  modifiedFiles: Map<string, ModifiedFile>;
  onFileClick: (file: ModifiedFile) => void;
  onUndoFile?: (file: ModifiedFile) => void;
  onAcceptChanges?: () => void;
}