/**
 * YOLO Mode Settings Types
 * YOLO模式设置相关类型定义
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

// =============================================================================
// 设置类别枚举（仅保留EXECUTION）
// =============================================================================

export enum SettingsCategory {
  EXECUTION = 'execution'    // 执行模式（仅YOLO模式）
}

// =============================================================================
// YOLO模式设置
// =============================================================================

export interface YoloModeSettings {
  /** YOLO模式 - 快速执行，减少确认 */
  yoloMode: boolean;
}

// =============================================================================
// 执行模式设置（兼容性别名）
// =============================================================================

/** @deprecated 使用 YoloModeSettings 替代 */
export interface ExecutionSettings extends YoloModeSettings {}

// =============================================================================
// 完整项目设置（兼容性）
// =============================================================================

/** @deprecated 使用 YoloModeSettings 替代 */
export interface ProjectSettings {
  execution: ExecutionSettings;
}

// =============================================================================
// 设置更新操作（兼容性）
// =============================================================================

/** @deprecated 直接更新YOLO模式状态 */
export type SettingsUpdateAction = {
  category: SettingsCategory.EXECUTION;
  updates: Partial<ExecutionSettings>;
};

// =============================================================================
// 设置项定义
// =============================================================================

export interface SettingItemDefinition {
  key: string;
  label: string;
  description: string;
  type: 'boolean' | 'string' | 'number' | 'select' | 'multiselect' | 'path';
  defaultValue: any;
  options?: { label: string; value: any }[];
  validation?: (value: any) => boolean | string;
  dependency?: string; // 依赖的其他设置项key
}

export interface SettingsCategoryDefinition {
  key: SettingsCategory;
  label: string;
  icon: string;
  description: string;
  items: SettingItemDefinition[];
}

// =============================================================================
// 默认设置
// =============================================================================

export const DEFAULT_YOLO_MODE_SETTINGS: YoloModeSettings = {
  yoloMode: false
};

/** @deprecated 使用 DEFAULT_YOLO_MODE_SETTINGS 替代 */
export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  execution: DEFAULT_YOLO_MODE_SETTINGS
};