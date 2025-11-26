/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import process from 'node:process';
import {
  AuthType,
  ContentGeneratorConfig,
  createContentGeneratorConfig,
} from '../core/contentGenerator.js';
import { PromptRegistry } from '../prompts/prompt-registry.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { LSTool } from '../tools/ls.js';
import { ReadFileTool } from '../tools/read-file.js';
import { GrepTool } from '../tools/grep.js';
import { GlobTool } from '../tools/glob.js';
import { EditTool } from '../tools/edit.js';
import { ShellTool } from '../tools/shell.js';
import { WriteFileTool } from '../tools/write-file.js';
import { DeleteFileTool } from '../tools/delete-file.js';
import { WebFetchTool } from '../tools/web-fetch.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import {
  MemoryTool,
  setGeminiMdFilename,
  GEMINI_CONFIG_DIR as GEMINI_DIR,
} from '../tools/memoryTool.js';
import { WebSearchTool } from '../tools/web-search.js';
import { TodoWriteTool } from '../tools/todo-write.js';
import { ReadLintsTool } from '../tools/read-lints.js';
import { LintFixTool } from '../tools/lint-fix.js';
import { TaskTool } from '../tools/task.js';
import { UseSkillTool } from '../tools/use-skill.js';
import { ListSkillsTool } from '../tools/list-skills.js';
import { GetSkillDetailsTool } from '../tools/get-skill-details.js';
import { ProjectSettingsManager } from './projectSettings.js';
import { GeminiClient } from '../core/client.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { GitService } from '../services/gitService.js';
import { getProjectTempDir } from '../utils/paths.js';
import {
  initializeTelemetry,
  DEFAULT_TELEMETRY_TARGET,
  DEFAULT_OTLP_ENDPOINT,
  TelemetryTarget,
  StartSessionEvent,
} from '../telemetry/index.js';
import {
  DEFAULT_GEMINI_EMBEDDING_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
} from './models.js';
import { ClearcutLogger } from '../telemetry/clearcut-logger/clearcut-logger.js';
import { shouldAttemptBrowserLaunch } from '../utils/browser.js';
import { MCPOAuthConfig } from '../mcp/oauth-provider.js';
import { IdeClient } from '../ide/ide-client.js';

// Re-export OAuth config type
export type { MCPOAuthConfig };

export enum ApprovalMode {
  DEFAULT = 'default',
  AUTO_EDIT = 'autoEdit',
  YOLO = 'yolo',
}

export interface AccessibilitySettings {
  disableLoadingPhrases?: boolean;
}

export interface BugCommandSettings {
  urlTemplate: string;
}

export interface SummarizeToolOutputSettings {
  tokenBudget?: number;
}

export interface CloudModelInfo {
  name: string;
  displayName: string;
  creditsPerRequest: number;
  available: boolean;
  maxToken: number;
  highVolumeThreshold: number;
  highVolumeCredits: number;
}

export interface TelemetrySettings {
  enabled?: boolean;
  target?: TelemetryTarget;
  otlpEndpoint?: string;
  logPrompts?: boolean;
  outfile?: string;
}

export interface GeminiCLIExtension {
  name: string;
  version: string;
  isActive: boolean;
}
export interface FileFilteringOptions {
  respectGitIgnore: boolean;
  respectGeminiIgnore: boolean;
}
// For memory files
export const DEFAULT_MEMORY_FILE_FILTERING_OPTIONS: FileFilteringOptions = {
  respectGitIgnore: false,
  respectGeminiIgnore: true,
};
// For all other files
export const DEFAULT_FILE_FILTERING_OPTIONS: FileFilteringOptions = {
  respectGitIgnore: true,
  respectGeminiIgnore: true,
};
export class MCPServerConfig {
  constructor(
    // For stdio transport
    readonly command?: string,
    readonly args?: string[],
    readonly env?: Record<string, string>,
    readonly cwd?: string,
    // For sse transport
    readonly url?: string,
    // For streamable http transport
    readonly httpUrl?: string,
    readonly headers?: Record<string, string>,
    // For websocket transport
    readonly tcp?: string,
    // Common
    readonly timeout?: number,
    readonly trust?: boolean,
    // Metadata
    readonly description?: string,
    readonly includeTools?: string[],
    readonly excludeTools?: string[],
    readonly extensionName?: string,
    // OAuth configuration
    readonly oauth?: MCPOAuthConfig,
    readonly authProviderType?: AuthProviderType,
  ) {}
}

export enum AuthProviderType {
  DYNAMIC_DISCOVERY = 'dynamic_discovery',
  GOOGLE_CREDENTIALS = 'google_credentials',
}

export interface SandboxConfig {
  command: 'docker' | 'podman' | 'sandbox-exec';
  image: string;
}

export type FlashFallbackHandler = (
  currentModel: string,
  fallbackModel: string,
  error?: unknown,
) => Promise<boolean | string | null>;

export interface ConfigParameters {
  sessionId: string;
  embeddingModel?: string;
  sandbox?: SandboxConfig;
  targetDir: string;
  debugMode: boolean;
  question?: string;
  fullContext?: boolean;
  coreTools?: string[];
  excludeTools?: string[];
  toolDiscoveryCommand?: string;
  toolCallCommand?: string;
  mcpServerCommand?: string;
  mcpServers?: Record<string, MCPServerConfig>;
  userMemory?: string;
  geminiMdFileCount?: number;
  approvalMode?: ApprovalMode;
  showMemoryUsage?: boolean;
  contextFileName?: string | string[];
  accessibility?: AccessibilitySettings;
  telemetry?: TelemetrySettings;
  usageStatisticsEnabled?: boolean;
  fileFiltering?: {
    respectGitIgnore?: boolean;
    respectGeminiIgnore?: boolean;
    enableRecursiveFileSearch?: boolean;
  };
  checkpointing?: boolean;
  proxy?: string;
  cwd: string;
  fileDiscoveryService?: FileDiscoveryService;
  bugCommand?: BugCommandSettings;
  //model: string;
  extensionContextFilePaths?: string[];
  maxSessionTurns?: number;
  experimentalAcp?: boolean;
  listExtensions?: boolean;
  listSessions?: boolean;
  extensions?: GeminiCLIExtension[];
  blockedMcpServers?: Array<{ name: string; extensionName: string }>;
  noBrowser?: boolean;
  summarizeToolOutput?: Record<string, SummarizeToolOutputSettings>;
  model?: string;
  cloudModels?: CloudModelInfo[];
  ideMode?: boolean;
  ideClient?: IdeClient;
  silentMode?: boolean;
  vsCodePluginMode?: boolean;
}

export class Config {
  private toolRegistry!: ToolRegistry;
  private promptRegistry!: PromptRegistry;
  private sessionId: string;
  private contentGeneratorConfig!: ContentGeneratorConfig;
  private readonly embeddingModel: string;
  private readonly sandbox: SandboxConfig | undefined;
  private readonly targetDir: string;
  private readonly debugMode: boolean;
  private readonly question: string | undefined;
  private readonly fullContext: boolean;
  private readonly coreTools: string[] | undefined;
  private readonly excludeTools: string[] | undefined;
  private readonly toolDiscoveryCommand: string | undefined;
  private readonly toolCallCommand: string | undefined;
  private readonly mcpServerCommand: string | undefined;
  private mcpServers: Record<string, MCPServerConfig> | undefined;
  private userMemory: string;
  private geminiMdFileCount: number;
  private approvalMode: ApprovalMode;
  private readonly showMemoryUsage: boolean;
  private readonly accessibility: AccessibilitySettings;
  private readonly telemetrySettings: TelemetrySettings;
  private readonly usageStatisticsEnabled: boolean;
  private geminiClient!: GeminiClient;
  private readonly fileFiltering: {
    respectGitIgnore: boolean;
    respectGeminiIgnore: boolean;
    enableRecursiveFileSearch: boolean;
  };
  private fileDiscoveryService: FileDiscoveryService | null = null;
  private gitService: GitService | undefined = undefined;
  private readonly checkpointing: boolean;
  private readonly proxy: string | undefined;
  private readonly cwd: string;
  private readonly bugCommand: BugCommandSettings | undefined;
  //private readonly model: string;
  private readonly extensionContextFilePaths: string[];
  private readonly noBrowser: boolean;
  private readonly ideMode: boolean;
  private readonly ideClient: IdeClient | undefined;
  private modelSwitchedDuringSession: boolean = false;
  private readonly maxSessionTurns: number;
  private readonly listExtensions: boolean;
  private readonly listSessions: boolean;
  private readonly _extensions: GeminiCLIExtension[];
  private readonly _blockedMcpServers: Array<{
    name: string;
    extensionName: string;
  }>;
  flashFallbackHandler?: FlashFallbackHandler;
  private quotaErrorOccurred: boolean = false;
  private readonly summarizeToolOutput:
    | Record<string, SummarizeToolOutputSettings>
    | undefined;
  private model: string | undefined;
  private cloudModels: CloudModelInfo[] | undefined;
  private readonly experimentalAcp: boolean = false;
  private readonly silentMode: boolean;
  private readonly vsCodePluginMode: boolean;
  private projectSettingsManager: ProjectSettingsManager;
  private planModeActive: boolean = false;

  constructor(params: ConfigParameters) {
    this.sessionId = params.sessionId;
    this.embeddingModel =
      params.embeddingModel ?? DEFAULT_GEMINI_EMBEDDING_MODEL;
    this.sandbox = params.sandbox;
    this.targetDir = path.resolve(params.targetDir);
    this.debugMode = params.debugMode;
    this.question = params.question;
    this.fullContext = params.fullContext ?? false;
    this.coreTools = params.coreTools;
    this.excludeTools = params.excludeTools;
    this.toolDiscoveryCommand = params.toolDiscoveryCommand;
    this.toolCallCommand = params.toolCallCommand;
    this.mcpServerCommand = params.mcpServerCommand;
    this.mcpServers = params.mcpServers;
    this.userMemory = params.userMemory ?? '';
    this.geminiMdFileCount = params.geminiMdFileCount ?? 0;
    this.cwd = params.cwd ?? process.cwd();

    // 初始化项目配置管理器
    this.projectSettingsManager = new ProjectSettingsManager(this.cwd);
    const projectSettings = this.projectSettingsManager.load();

    // 项目级配置优先于参数配置
    const projectApprovalMode = ProjectSettingsManager.toApprovalMode(projectSettings.yolo);
    this.approvalMode = projectApprovalMode ?? params.approvalMode ?? ApprovalMode.DEFAULT;
    this.showMemoryUsage = params.showMemoryUsage ?? false;
    this.accessibility = params.accessibility ?? {};
    // 硬编码禁用所有遥测功能
    this.telemetrySettings = {
      enabled: false,
      target: params.telemetry?.target ?? DEFAULT_TELEMETRY_TARGET,
      otlpEndpoint: params.telemetry?.otlpEndpoint ?? DEFAULT_OTLP_ENDPOINT,
      logPrompts: false,
      outfile: params.telemetry?.outfile,
    };
    // 硬编码禁用使用统计收集
    this.usageStatisticsEnabled = false;

    this.fileFiltering = {
      respectGitIgnore: params.fileFiltering?.respectGitIgnore ?? true,
      respectGeminiIgnore: params.fileFiltering?.respectGeminiIgnore ?? true,
      enableRecursiveFileSearch:
        params.fileFiltering?.enableRecursiveFileSearch ?? true,
    };
    this.checkpointing = params.checkpointing ?? false;
    this.proxy = params.proxy;
    this.fileDiscoveryService = params.fileDiscoveryService ?? null;
    this.bugCommand = params.bugCommand;
    //this.model = params.model;
    this.extensionContextFilePaths = params.extensionContextFilePaths ?? [];
    this.maxSessionTurns = params.maxSessionTurns ?? -1;
    this.experimentalAcp = params.experimentalAcp ?? false;
    this.silentMode = params.silentMode ?? false;
    this.listExtensions = params.listExtensions ?? false;
    this.listSessions = params.listSessions ?? false;
    this._extensions = params.extensions ?? [];
    this._blockedMcpServers = params.blockedMcpServers ?? [];
    this.noBrowser = params.noBrowser ?? false;
    this.summarizeToolOutput = params.summarizeToolOutput;
    this.model = params.model;
    this.cloudModels = params.cloudModels;
    this.ideMode = params.ideMode ?? false;
    this.ideClient = params.ideClient;
    this.vsCodePluginMode = params.vsCodePluginMode ?? false;

    if (params.contextFileName) {
      setGeminiMdFilename(params.contextFileName);
    }

    if (this.telemetrySettings.enabled) {
      initializeTelemetry(this);
    }

    if (this.getUsageStatisticsEnabled()) {
      ClearcutLogger.getInstance(this)?.logStartSessionEvent(
        new StartSessionEvent(this),
      );
    } else {

    }
  }

  async initialize(): Promise<void> {
    // Set silent mode for core logging if configured
    if (this.silentMode) {
      const { setSilentMode } = await import('../utils/logging.js');
      setSilentMode(true);
    }

    // Initialize centralized FileDiscoveryService
    this.getFileService();
    if (this.getCheckpointingEnabled()) {
      await this.getGitService();
    }
    this.promptRegistry = new PromptRegistry();
    // 快速初始化：只加载核心工具和命令行工具，不等待MCP服务器
    this.toolRegistry = await this.createToolRegistry();

    // MCP服务器异步后台加载，不阻塞初始化
    // 改进: 移除 300ms 延迟，让 MCP 服务器尽快启动
    // 但仍在异步后台进行，不阻塞 initialize() 方法返回
    setImmediate(() => {
      this.discoverMcpToolsAsync();
    });
  }

  /**
   * Asynchronously discover MCP tools in the background.
   * This doesn't block CLI initialization.
   */
  private async discoverMcpToolsAsync(): Promise<void> {
    try {
      await this.toolRegistry.discoverMcpTools();
      // 更新AI模型的工具列表，使其能够感知到新加载的MCP工具
      if (this.geminiClient && this.geminiClient.isInitialized()) {
        await this.geminiClient.setTools();
      }
    } catch (error) {
      // MCP discovery errors are already logged in mcp-client.ts
      // We don't want to crash the CLI if MCP servers fail to connect
    }
  }

  async refreshAuth(authMethod: AuthType) {
    // BUG修复: 保存当前模型设置，防止在重新配置时丢失
    // 修复策略: 在refreshAuth前保存模型，重新配置后恢复
    // 影响范围: packages/core/src/config/config.ts:refreshAuth方法
    // 修复日期: 2025-01-09
    // const currentModel = this.getModel();
    // const wasModelSwitched = this.modelSwitchedDuringSession;

    this.contentGeneratorConfig = createContentGeneratorConfig(
      this,
      authMethod,
    );

    // 恢复之前设置的模型（特别是Claude模型）
    // if (currentModel && this.contentGeneratorConfig) {
    //   this.contentGeneratorConfig.model = currentModel;
    //   this.modelSwitchedDuringSession = wasModelSwitched;
    // }

    this.geminiClient = new GeminiClient(this);
    await this.geminiClient.initialize(this.contentGeneratorConfig);
  }

  getSessionId(): string {
    return this.sessionId;
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  getContentGeneratorConfig(): ContentGeneratorConfig {
    return this.contentGeneratorConfig;
  }

  getModel(): string {
    return this.model || 'auto';
  }

  getCloudModels(): CloudModelInfo[] | undefined {
    return this.cloudModels;
  }

  getCloudModelInfo(modelName: string): CloudModelInfo | undefined {
    return this.cloudModels?.find(model => model.name === modelName);
  }

  setCloudModels(models: CloudModelInfo[]): void {
    this.cloudModels = models;
  }

  setModel(newModel: string): void {
    if (this.contentGeneratorConfig) {
      //this.contentGeneratorConfig.model = newModel;
      this.modelSwitchedDuringSession = true;
    }
    this.model = newModel;
  }

  isModelSwitchedDuringSession(): boolean {
    return this.modelSwitchedDuringSession;
  }

  resetModelToDefault(): void {
    if (this.contentGeneratorConfig) {
      //this.contentGeneratorConfig.model = this.preferredModel; // Reset to preferred model or original default
      this.modelSwitchedDuringSession = false;
    }
  }

  setFlashFallbackHandler(handler: FlashFallbackHandler): void {
    this.flashFallbackHandler = handler;
  }

  getMaxSessionTurns(): number {
    return this.maxSessionTurns;
  }

  setQuotaErrorOccurred(value: boolean): void {
    this.quotaErrorOccurred = value;
  }

  getQuotaErrorOccurred(): boolean {
    return this.quotaErrorOccurred;
  }

  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  getSandbox(): SandboxConfig | undefined {
    return this.sandbox;
  }

  getTargetDir(): string {
    return this.targetDir;
  }

  getProjectRoot(): string {
    return this.targetDir;
  }

  getToolRegistry(): Promise<ToolRegistry> {
    return Promise.resolve(this.toolRegistry);
  }

  getPromptRegistry(): PromptRegistry {
    return this.promptRegistry;
  }

  getDebugMode(): boolean {
    return this.debugMode;
  }
  getQuestion(): string | undefined {
    return this.question;
  }

  getFullContext(): boolean {
    return this.fullContext;
  }

  getCoreTools(): string[] | undefined {
    return this.coreTools;
  }

  getExcludeTools(): string[] | undefined {
    return this.excludeTools;
  }

  getToolDiscoveryCommand(): string | undefined {
    return this.toolDiscoveryCommand;
  }

  getToolCallCommand(): string | undefined {
    return this.toolCallCommand;
  }

  getMcpServerCommand(): string | undefined {
    return this.mcpServerCommand;
  }

  getMcpServers(): Record<string, MCPServerConfig> | undefined {
    return this.mcpServers;
  }

  getUserMemory(): string {
    return this.userMemory;
  }

  setUserMemory(newUserMemory: string): void {
    this.userMemory = newUserMemory;
  }

  getGeminiMdFileCount(): number {
    return this.geminiMdFileCount;
  }

  setGeminiMdFileCount(count: number): void {
    this.geminiMdFileCount = count;
  }

  updateMcpServers(servers: Record<string, MCPServerConfig> | undefined): void {
    this.mcpServers = servers;
  }

  getApprovalMode(): ApprovalMode {
    return this.approvalMode;
  }

  setApprovalMode(mode: ApprovalMode): void {
    this.approvalMode = mode;
  }

  /**
   * 设置YOLO模式并同步到项目配置文件
   * @param mode - 要设置的批准模式
   * @param saveToProject - 是否保存到项目配置文件
   */
  setApprovalModeWithProjectSync(mode: ApprovalMode, saveToProject: boolean = false): void {
    this.approvalMode = mode;

    if (saveToProject) {
      const yoloEnabled = mode === ApprovalMode.YOLO;
      this.projectSettingsManager.setYoloMode(yoloEnabled);
    }
  }

  /**
   * 获取项目配置管理器
   */
  getProjectSettingsManager(): ProjectSettingsManager {
    return this.projectSettingsManager;
  }

  /**
   * 获取Plan模式状态
   * @returns 当前是否处于Plan模式
   */
  getPlanModeActive(): boolean {
    return this.planModeActive;
  }

  /**
   * 设置Plan模式状态
   * @param active - 是否启用Plan模式
   */
  setPlanModeActive(active: boolean): void {
    this.planModeActive = active;
  }

  getShowMemoryUsage(): boolean {
    return this.showMemoryUsage;
  }

  getAccessibility(): AccessibilitySettings {
    return this.accessibility;
  }

  getTelemetryEnabled(): boolean {
    // 硬编码禁用遥测数据收集
    return false;
  }

  getTelemetryLogPromptsEnabled(): boolean {
    return this.telemetrySettings.logPrompts ?? true;
  }

  getTelemetryOtlpEndpoint(): string {
    return this.telemetrySettings.otlpEndpoint ?? DEFAULT_OTLP_ENDPOINT;
  }

  getTelemetryTarget(): TelemetryTarget {
    return this.telemetrySettings.target ?? DEFAULT_TELEMETRY_TARGET;
  }

  getTelemetryOutfile(): string | undefined {
    return this.telemetrySettings.outfile;
  }

  getGeminiClient(): GeminiClient {
    return this.geminiClient;
  }

  getGeminiDir(): string {
    return path.join(this.targetDir, GEMINI_DIR);
  }

  getProjectTempDir(): string {
    return getProjectTempDir(this.getProjectRoot());
  }

  getEnableRecursiveFileSearch(): boolean {
    return this.fileFiltering.enableRecursiveFileSearch;
  }

  getFileFilteringRespectGitIgnore(): boolean {
    return this.fileFiltering.respectGitIgnore;
  }
  getFileFilteringRespectGeminiIgnore(): boolean {
    return this.fileFiltering.respectGeminiIgnore;
  }

  getFileFilteringOptions(): FileFilteringOptions {
    return {
      respectGitIgnore: this.fileFiltering.respectGitIgnore,
      respectGeminiIgnore: this.fileFiltering.respectGeminiIgnore,
    };
  }

  getCheckpointingEnabled(): boolean {
    return this.checkpointing;
  }

  getProxy(): string | undefined {
    return this.proxy;
  }

  getWorkingDir(): string {
    return this.cwd;
  }

  getBugCommand(): BugCommandSettings | undefined {
    return this.bugCommand;
  }

  getFileService(): FileDiscoveryService {
    if (!this.fileDiscoveryService) {
      this.fileDiscoveryService = new FileDiscoveryService(this.targetDir);
    }
    return this.fileDiscoveryService;
  }

  getUsageStatisticsEnabled(): boolean {
    // 硬编码禁用使用统计收集
    return false;
  }

  getExtensionContextFilePaths(): string[] {
    return this.extensionContextFilePaths;
  }

  getExperimentalAcp(): boolean {
    return this.experimentalAcp;
  }

  getSilentMode(): boolean {
    return this.silentMode;
  }

  getListExtensions(): boolean {
    return this.listExtensions;
  }

  getListSessions(): boolean {
    return this.listSessions;
  }

  getExtensions(): GeminiCLIExtension[] {
    return this._extensions;
  }

  getBlockedMcpServers(): Array<{ name: string; extensionName: string }> {
    return this._blockedMcpServers;
  }

  getNoBrowser(): boolean {
    return this.noBrowser;
  }

  isBrowserLaunchSuppressed(): boolean {
    return this.getNoBrowser() || !shouldAttemptBrowserLaunch();
  }

  getSummarizeToolOutputConfig():
    | Record<string, SummarizeToolOutputSettings>
    | undefined {
    return this.summarizeToolOutput;
  }

  getPreferredModel(): string | undefined {
    return this.model;
  }

  getIdeMode(): boolean {
    return this.ideMode;
  }

  getIdeClient(): IdeClient | undefined {
    return this.ideClient;
  }

  getVsCodePluginMode(): boolean {
    return this.vsCodePluginMode;
  }

  async getGitService(): Promise<GitService> {
    if (!this.gitService) {
      this.gitService = new GitService(this.targetDir);
      const initResult = await this.gitService.initialize();

      // Log the initialization result but don't throw errors
      if (!initResult.success) {
        console.warn(`[CONFIG] Git service initialization failed but continuing: ${initResult.disabledReason}`);
      }
    }
    return this.gitService;
  }

  async createToolRegistry(): Promise<ToolRegistry> {
    const registry = new ToolRegistry(this);

    // helper to create & register core tools that are enabled
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registerCoreTool = (ToolClass: any, ...args: unknown[]) => {
      const className = ToolClass.name;
      const toolName = ToolClass.Name || className;
      const coreTools = this.getCoreTools();
      const excludeTools = this.getExcludeTools();

      let isEnabled = false;
      if (coreTools === undefined) {
        isEnabled = true;
      } else {
        isEnabled = coreTools.some(
          (tool) =>
            tool === className ||
            tool === toolName ||
            tool.startsWith(`${className}(`) ||
            tool.startsWith(`${toolName}(`),
        );
      }

      if (
        excludeTools?.includes(className) ||
        excludeTools?.includes(toolName)
      ) {
        isEnabled = false;
      }

      if (isEnabled) {
        registry.registerTool(new ToolClass(...args));
      }
    };

    registerCoreTool(LSTool, this);
    registerCoreTool(ReadFileTool, this);
    registerCoreTool(GrepTool, this);
    registerCoreTool(GlobTool, this);
    registerCoreTool(EditTool, this);
    registerCoreTool(WriteFileTool, this);
    registerCoreTool(DeleteFileTool, this);
    registerCoreTool(WebFetchTool, this);
    registerCoreTool(ReadManyFilesTool, this);
    registerCoreTool(ShellTool, this);
    registerCoreTool(MemoryTool, this);
    registerCoreTool(WebSearchTool, this);
    registerCoreTool(TodoWriteTool, this);
    registerCoreTool(ReadLintsTool, this);
    registerCoreTool(LintFixTool, this);
    registerCoreTool(UseSkillTool, this);
    registerCoreTool(ListSkillsTool, this);
    registerCoreTool(GetSkillDetailsTool, this);

    // TaskTool (SubAgent) is disabled in VSCode plugin mode
    // but remains available in CLI mode and other IDE environments
    if (!this.getVsCodePluginMode()) {
      registerCoreTool(TaskTool, this, registry);
    }

    // 快速启动优化：只发现命令行工具，MCP工具将在后台异步加载
    // 这样可以让CLI界面立即显示，不用等待所有MCP服务器连接完成
    await registry.discoverCommandLineTools();
    return registry;
  }
}
// Export model constants for use in CLI
export { DEFAULT_GEMINI_FLASH_MODEL };
