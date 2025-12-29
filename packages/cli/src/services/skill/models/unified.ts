/**
 * DeepV Code Unified Component Model
 *
 * Defines the core types for the refactored skills system that unifies
 * Agents, Commands, Skills, Hooks, and Tools into a single component model.
 */

/**
 * 组件类型枚举
 */
export enum ComponentType {
  AGENT = 'agent',       // Claude Code Agents (.md)
  COMMAND = 'command',   // Claude Code Commands (.md)
  SKILL = 'skill',       // DeepV Code Skills (SKILL.md)
  HOOK = 'hook',         // Lifecycle Hooks
  TOOL = 'tool',         // MCP Tools
  SCRIPT = 'script',     // Executable Scripts
  UNKNOWN = 'unknown'
}

/**
 * 组件来源枚举
 */
export enum ComponentSource {
  MARKETPLACE = 'marketplace', // From Marketplace Plugin
  EXTENSION = 'extension',     // From Extension System
  LOCAL = 'local',             // From Local FileSystem
  BUILTIN = 'builtin',         // Built-in System Component
  GIT = 'git'                  // Direct Git Clone
}

/**
 * 组件加载级别
 */
export enum ComponentLoadLevel {
  NONE = 0,
  METADATA = 1,    // Only ID, Name, Description
  FULL = 2,        // Content loaded
  RESOURCES = 3    // Scripts and resources loaded
}

/**
 * 组件位置信息
 */
export interface ComponentLocation {
  type: 'file' | 'directory' | 'remote' | 'memory';
  path: string;              // Absolute path on disk
  relativePath?: string;     // Path relative to plugin root
  url?: string;              // Remote URL if applicable
}

/**
 * 组件脚本定义
 */
export interface ComponentScript {
  name: string;
  type: 'python' | 'bash' | 'node' | 'unknown';
  path: string;
  content?: string;
}

/**
 * 统一组件接口
 * Represents any executable unit in the system
 */
export interface UnifiedComponent {
  // 标识
  id: string;                // Unique ID (e.g., "marketplace:plugin:name")
  type: ComponentType;

  // 元数据
  name: string;
  description: string;
  version?: string;
  author?: string;

  // 来源与位置
  source: ComponentSource;
  location: ComponentLocation;

  // 内容
  content?: string;          // Raw content (Markdown, Code, etc.)
  metadata?: Record<string, any>; // Parsed frontmatter/metadata

  // 执行相关
  executable: boolean;
  scripts: ComponentScript[];
  references: string[]; // 引用文档路径列表

  // 状态
  installed: boolean;
  enabled: boolean;
  loadLevel: ComponentLoadLevel;

  // 归属关系
  pluginId?: string;         // ID of the parent plugin
  marketplaceId?: string;    // ID of the marketplace

  // 扩展数据
  tags?: string[];
  category?: string;
}

/**
 * 插件结构分析结果
 */
export interface PluginStructure {
  hasMarketplaceJson: boolean;
  hasPluginJson: boolean;
  hasClaudePluginDir: boolean;
  directories: {
    agents: boolean;
    commands: boolean;
    skills: boolean;
    hooks: boolean;
    scripts: boolean;
  };
  detectedFormat: 'claude-code' | 'deepv-code' | 'hybrid' | 'unknown';
}

/**
 * 统一插件接口
 * Represents a collection of components (Plugin)
 */
export interface UnifiedPlugin {
  // 标识
  id: string;                // Unique ID
  name: string;

  // 元数据
  description: string;
  version: string;
  author?: string;

  // 来源
  source: ComponentSource;
  location: ComponentLocation;

  // 包含的组件
  components: UnifiedComponent[];

  // 结构信息
  structure: PluginStructure;

  // 状态
  installed: boolean;
  enabled: boolean;

  // 归属
  marketplace?: {
    id: string;
    name: string;
  };

  // 原始配置 (保留以备参考)
  rawConfig?: Record<string, any>;
}

/**
 * 组件查询参数
 */
export interface ComponentQuery {
  type?: ComponentType | ComponentType[];
  source?: ComponentSource;
  marketplaceId?: string;
  pluginId?: string;
  enabled?: boolean;
  search?: string; // Fuzzy search on name/description
  tags?: string[];
}
