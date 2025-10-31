/**
 * Version Control System Type Definitions
 * 版本控制系统类型定义
 *
 * 实现类似Cursor的对话版本回退功能
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

/**
 * 补丁块信息
 */
export interface PatchHunk {
  /** 块ID */
  id: string;

  /** 原始文件起始行 */
  originalStart: number;

  /** 原始文件行数 */
  originalLines: number;

  /** 新文件起始行 */
  newStart: number;

  /** 新文件行数 */
  newLines: number;

  /** 块内容 */
  content: string;

  /** 块摘要 */
  summary?: string;
}

/**
 * 编辑操作（补丁单元）
 */
export interface EditOperation {
  /** 操作ID */
  opId: string;

  /** 文件URI */
  fileUri: string;

  /** 应用前的文件hash */
  baseHash: string;

  /** 应用后的文件hash */
  resultHash: string;

  /** 正向补丁（统一diff格式） */
  patch: string;

  /** 逆向补丁（用于回退） */
  inversePatch: string;

  /** 补丁块列表（用于局部回滚） */
  hunks: PatchHunk[];

  /** 变更统计 */
  stats: {
    linesAdded: number;
    linesRemoved: number;
  };

  /** 操作类型 */
  operationType: 'create' | 'modify' | 'delete';

  /** 创建时间 */
  createdAt: number;
}

/**
 * 版本节点
 */
export interface VersionNode {
  /** 节点ID */
  nodeId: string;

  /** 父节点ID（形成时间线） */
  parentId: string | null;

  /** 关联的对话回合ID列表 */
  turnRefs: string[];

  /** 编辑操作列表 */
  ops: EditOperation[];

  /** 快照ID（如果有） */
  snapshotId?: string;

  /** 创建时间 */
  createdAt: number;

  /** 节点类型 */
  nodeType: 'ai_edit' | 'manual_edit' | 'revert' | 'merge' | 'snapshot';

  /** 节点描述 */
  description?: string;

  /** 子节点ID列表（分支） */
  childrenIds: string[];
}

/**
 * 快照
 */
export interface Snapshot {
  /** 快照ID */
  snapshotId: string;

  /** 基础版本节点ID */
  baseNodeId: string;

  /** 覆盖范围 */
  scope: 'workspace' | 'files';

  /** 涉及的文件列表（scope为files时使用） */
  files?: string[];

  /** 快照数据blob引用 */
  blobRef: string;

  /** 压缩状态 */
  compressed: boolean;

  /** 快照大小（字节） */
  size: number;

  /** 创建时间 */
  createdAt: number;
}

/**
 * 对话回合版本元数据（增量挂载到Turn）
 */
export interface TurnVersionMetadata {
  /** 是否有内容真正写入工作区 */
  applied: boolean;

  /** 本回合被应用后所生成的版本节点ID */
  versionNodeId?: string;

  /** 影响的文件列表 */
  affectedFiles: FileImpact[];
}

/**
 * 文件影响信息
 */
export interface FileImpact {
  /** 文件路径 */
  filePath: string;

  /** 操作类型 */
  operationType: 'create' | 'modify' | 'delete';

  /** 增加的行数 */
  linesAdded: number;

  /** 删除的行数 */
  linesRemoved: number;
}

/**
 * 版本控制状态
 */
export interface VersionControlState {
  /** 当前游标所在的版本节点ID */
  currentNodeId: string | null;

  /** 所有版本节点映射 */
  nodes: Map<string, VersionNode>;

  /** 快照映射 */
  snapshots: Map<string, Snapshot>;

  /** 版本图的根节点ID */
  rootNodeId: string | null;

  /** 是否正在执行版本操作 */
  isOperating: boolean;
}

/**
 * 回退选项
 */
export interface RevertOptions {
  /** 回退范围 */
  scope: 'workspace' | 'files' | 'hunks';

  /** 文件列表（scope为files时） */
  files?: string[];

  /** 补丁块ID列表（scope为hunks时） */
  hunkIds?: string[];

  /** 是否自动处理冲突 */
  autoMerge?: boolean;

  /** 是否创建快照 */
  createSnapshot?: boolean;
}

/**
 * 回退结果
 */
export interface RevertResult {
  /** 是否成功 */
  success: boolean;

  /** 新生成的版本节点ID */
  newNodeId?: string;

  /** 回退的文件列表 */
  revertedFiles: string[];

  /** 冲突的文件列表 */
  conflictFiles: ConflictInfo[];

  /** 错误信息 */
  error?: string;

  /** 执行时间（毫秒） */
  executionTime: number;
}

/**
 * 冲突信息
 */
export interface ConflictInfo {
  /** 文件路径 */
  filePath: string;

  /** 基础版本内容 */
  baseContent: string;

  /** 当前版本内容 */
  localContent: string;

  /** 目标版本内容 */
  changeContent: string;

  /** 冲突的行范围 */
  conflictRanges: Array<{
    startLine: number;
    endLine: number;
  }>;

  /** 自动合并结果（如果可以） */
  mergedContent?: string;

  /** 是否需要手动解决 */
  requiresManualResolution: boolean;
}

/**
 * 版本路径
 */
export interface VersionPath {
  /** 起始节点ID */
  fromNodeId: string;

  /** 目标节点ID */
  toNodeId: string;

  /** 路径步骤 */
  steps: VersionPathStep[];

  /** 是否向前（true）还是向后（false） */
  isForward: boolean;
}

/**
 * 版本路径步骤
 */
export interface VersionPathStep {
  /** 步骤节点ID */
  nodeId: string;

  /** 方向 */
  direction: 'forward' | 'backward';

  /** 应用的编辑操作 */
  operations: EditOperation[];
}

/**
 * 快照策略
 */
export interface SnapshotPolicy {
  /** 累计补丁体量阈值（字节） */
  patchSizeThreshold: number;

  /** 涉及文件数阈值 */
  fileCountThreshold: number;

  /** 时间间隔阈值（毫秒） */
  timeIntervalThreshold: number;

  /** 是否自动拍快照 */
  autoSnapshot: boolean;
}

/**
 * 版本时间线项
 */
export interface TimelineItem {
  /** 节点ID */
  nodeId: string;

  /** 显示标题 */
  title: string;

  /** 描述 */
  description: string;

  /** 时间戳 */
  timestamp: number;

  /** 节点类型 */
  type: 'ai_edit' | 'manual_edit' | 'revert' | 'merge' | 'snapshot';

  /** 影响的文件数 */
  fileCount: number;

  /** 变更统计 */
  stats: {
    linesAdded: number;
    linesRemoved: number;
  };

  /** 是否为当前节点 */
  isCurrent: boolean;

  /** 是否有子分支 */
  hasBranches: boolean;
}

/**
 * 版本导出数据
 */
export interface VersionExportData {
  /** 导出版本 */
  version: string;

  /** 导出时间 */
  exportedAt: number;

  /** 会话ID */
  sessionId: string;

  /** 版本节点列表 */
  nodes: VersionNode[];

  /** 快照列表 */
  snapshots: Snapshot[];

  /** 当前节点ID */
  currentNodeId: string | null;
}
