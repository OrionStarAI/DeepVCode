/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { isNodeError } from '../utils/errors.js';
import { exec } from 'node:child_process';
import { simpleGit, SimpleGit, CheckRepoActions } from 'simple-git';
import { getProjectHash, GEMINI_DIR } from '../utils/paths.js';

/**
 * Git service initialization result
 */
export interface GitServiceInitResult {
  success: boolean;
  disabled: boolean;
  error?: Error;
  disabledReason?: string;
}

export class GitService {
  private projectRoot: string;
  private isDisabled: boolean = false;
  private disabledReason?: string;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
  }

  /**
   * Check if Git service is disabled due to initialization errors
   */
  public isGitDisabled(): boolean {
    return this.isDisabled;
  }

  /**
   * Get the reason why Git service was disabled
   */
  public getDisabledReason(): string | undefined {
    return this.disabledReason;
  }

  /**
   * Check if the project root is in a sensitive directory where Git operations should be avoided
   */
  private isSensitiveDirectory(projectPath: string): { isSensitive: boolean; reason?: string } {
    const normalizedPath = path.resolve(projectPath);
    const platform = os.platform();

    // Check for root directory
    if (normalizedPath === '/' || normalizedPath === path.parse(normalizedPath).root) {
      return {
        isSensitive: true,
        reason: 'Cannot enable Git service in system root directory'
      };
    }

    // Check for Windows drive root (C:\, D:\, etc.)
    if (platform === 'win32') {
      const parsed = path.parse(normalizedPath);
      if (parsed.dir === '' && parsed.root === normalizedPath) {
        return {
          isSensitive: true,
          reason: `Cannot enable Git service in Windows drive root: ${normalizedPath}`
        };
      }
    }

    // Check for home directories
    const homeDir = os.homedir();
    if (normalizedPath === homeDir) {
      return {
        isSensitive: true,
        reason: 'Cannot enable Git service in user home directory'
      };
    }

    // Check for system directories on Unix-like systems
    if (platform !== 'win32') {
      const systemDirs = ['/bin', '/sbin', '/usr', '/var', '/etc', '/lib', '/lib64', '/opt', '/sys', '/proc', '/dev'];
      if (systemDirs.some(sysDir => normalizedPath === sysDir || normalizedPath.startsWith(sysDir + '/'))) {
        return {
          isSensitive: true,
          reason: `Cannot enable Git service in system directory: ${normalizedPath}`
        };
      }
    }

    // Check for Windows system directories
    if (platform === 'win32') {
      const systemDirs = ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData'];
      if (systemDirs.some(sysDir => {
        const normalizedSysDir = path.resolve(sysDir);
        return normalizedPath === normalizedSysDir || normalizedPath.startsWith(normalizedSysDir + path.sep);
      })) {
        return {
          isSensitive: true,
          reason: `Cannot enable Git service in Windows system directory: ${normalizedPath}`
        };
      }
    }

    return { isSensitive: false };
  }

  /**
   * Display a localized error message for Git initialization failure
   */
  private displayGitError(errorType: 'old-version' | 'not-available' | 'init-failed' | 'sensitive-directory', error?: unknown): void {
    // Note: We can't directly import i18n here due to circular dependencies
    // Instead, we'll use console with structured error info that can be caught by the CLI layer
    const errorInfo = {
      type: errorType,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    };

    console.error(`[GIT_SERVICE_ERROR] ${JSON.stringify(errorInfo)}`);
  }

  private getHistoryDir(): string {
    const hash = getProjectHash(this.projectRoot);
    return path.join(os.homedir(), GEMINI_DIR, 'history', hash);
  }

  async initialize(): Promise<GitServiceInitResult> {
    try {
      // Check if project is in a sensitive directory before any Git operations
      const sensitiveCheck = this.isSensitiveDirectory(this.projectRoot);
      if (sensitiveCheck.isSensitive) {
        console.error(`[CHECKPOINT DEBUG] Project in sensitive directory: ${this.projectRoot}`);
        this.displayGitError('sensitive-directory');
        this.isDisabled = true;
        this.disabledReason = sensitiveCheck.reason || 'Project is in a sensitive directory';
        return {
          success: false,
          disabled: true,
          disabledReason: this.disabledReason
        };
      }

      const gitAvailable = await this.verifyGitAvailability();

      if (!gitAvailable) {
        console.error(`[CHECKPOINT DEBUG] Git not available`);
        this.displayGitError('not-available');
        this.isDisabled = true;
        this.disabledReason = 'Git is not installed or not available in PATH';
        return {
          success: false,
          disabled: true,
          disabledReason: this.disabledReason
        };
      }

      try {
        await this.setupShadowGitRepository();
        return {
          success: true,
          disabled: false
        };
      } catch (error) {
        console.error(`[CHECKPOINT DEBUG] Failed to setup shadow git repository:`, error);
        
        // Check if this is a Git version issue (--initial-branch not supported)
        if (error instanceof Error && error.message.includes('unknown option') && error.message.includes('initial-branch')) {
          this.displayGitError('old-version', error);
          this.isDisabled = true;
          this.disabledReason = 'Git version does not support --initial-branch option (requires Git 2.28+)';
          return {
            success: false,
            disabled: true,
            error,
            disabledReason: this.disabledReason
          };
        }

        // General Git initialization failure
        this.displayGitError('init-failed', error);
        this.isDisabled = true;
        this.disabledReason = `Git initialization failed: ${error instanceof Error ? error.message : String(error)}`;
        return {
          success: false,
          disabled: true,
          error: error instanceof Error ? error : new Error(String(error)),
          disabledReason: this.disabledReason
        };
      }
    } catch (error) {
      // Catch-all for any unexpected errors
      console.error(`[CHECKPOINT DEBUG] Unexpected error during Git service initialization:`, error);
      this.isDisabled = true;
      this.disabledReason = `Unexpected initialization error: ${error instanceof Error ? error.message : String(error)}`;
      return {
        success: false,
        disabled: true,
        error: error instanceof Error ? error : new Error(String(error)),
        disabledReason: this.disabledReason
      };
    }
  }

  verifyGitAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      exec('git --version', (error) => {
        if (error) {
          console.error(`[CHECKPOINT DEBUG] Git verification failed:`, error.message);
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * Creates a hidden git repository in the project root.
   * The Git repository is used to support checkpointing.
   */
  async setupShadowGitRepository() {
    const repoDir = this.getHistoryDir();
    const gitConfigPath = path.join(repoDir, '.gitconfig');

    try {
      await fs.mkdir(repoDir, { recursive: true });
    } catch (error) {
      console.error(`[CHECKPOINT DEBUG] Failed to create repository directory:`, error);
      throw error;
    }

    // We don't want to inherit the user's name, email, or gpg signing
    // preferences for the shadow repository, so we create a dedicated gitconfig.
    const gitConfigContent =
      '[user]\n  name = DvCode CLI\n  email = dvcode-cli@google.com\n[commit]\n  gpgsign = false\n';

    try {
      await fs.writeFile(gitConfigPath, gitConfigContent);
    } catch (error) {
      console.error(`[CHECKPOINT DEBUG] Failed to create git config file:`, error);
      throw error;
    }

    // 更安全的方法：直接检查.git目录是否存在，而不是使用git命令
    const gitDir = path.join(repoDir, '.git');

    let isRepoDefined = false;
    try {
      await fs.access(gitDir);
      isRepoDefined = true;
    } catch (error) {
      isRepoDefined = false;
    }

    if (!isRepoDefined) {
      try {
        // 创建git实例并初始化，使用独立的环境配置
        const gitDir = path.join(repoDir, '.git');
        const repo = simpleGit(repoDir).env({
          GIT_DIR: gitDir,
          GIT_WORK_TREE: this.projectRoot,
          // 使用独立的配置目录，避免继承用户的全局配置
          HOME: repoDir,
          XDG_CONFIG_HOME: repoDir,
          GIT_CONFIG_GLOBAL: path.join(repoDir, '.gitconfig'),
          GIT_CONFIG_SYSTEM: '/dev/null', // 禁用系统级配置
        });

        await repo.init(false, {
          '--initial-branch': 'main',
        });

        // 确保在shadow仓库中设置用户信息
        await repo.addConfig('user.name', 'DeepV CLI', false);
        await repo.addConfig('user.email', 'deepv-cli@deepvlab.ai', false);
        await repo.addConfig('commit.gpgsign', 'false', false);

        await repo.commit('Initial commit', { '--allow-empty': null });
      } catch (error) {
        console.error(`[CHECKPOINT DEBUG] Git initialization failed:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to initialize git repository: ${errorMessage}`);
      }
    }

    const userGitIgnorePath = path.join(this.projectRoot, '.gitignore');
    const shadowGitIgnorePath = path.join(repoDir, '.gitignore');

    let userGitIgnoreContent = '';
    try {
      userGitIgnoreContent = await fs.readFile(userGitIgnorePath, 'utf-8');
    } catch (error) {
      if (isNodeError(error) && error.code !== 'ENOENT') {
        throw error;
      }
    }

    await fs.writeFile(shadowGitIgnorePath, userGitIgnoreContent);
  }

  /**
   * 确保shadow git仓库存在并已正确初始化
   */
  private async ensureShadowGitRepositoryExists(): Promise<void> {
    const repoDir = this.getHistoryDir();
    const gitDir = path.join(repoDir, '.git');

    try {
      await fs.access(gitDir);
    } catch (error) {
      console.log(`[CHECKPOINT DEBUG] Shadow git repository does not exist, creating...`);
      try {
        await this.setupShadowGitRepository();
      } catch (setupError) {
        console.error(`[CHECKPOINT DEBUG] Failed to setup shadow git repository:`, setupError);
        throw setupError;
      }
    }
  }

  private get shadowGitRepository(): SimpleGit {
    const repoDir = this.getHistoryDir();
    const gitDir = path.join(repoDir, '.git');

    // 关键修复：确保从repoDir而不是projectRoot创建git实例
    // 这样可以避免在项目根目录中查找.git目录的问题
    return simpleGit(repoDir).env({
      GIT_DIR: gitDir,
      GIT_WORK_TREE: this.projectRoot,
      // 使用独立的配置目录，避免继承用户的全局配置
      HOME: repoDir,
      XDG_CONFIG_HOME: repoDir,
      GIT_CONFIG_GLOBAL: path.join(repoDir, '.gitconfig'),
      GIT_CONFIG_SYSTEM: '/dev/null', // 禁用系统级配置
    });
  }

  async getCurrentCommitHash(): Promise<string> {
    if (this.isDisabled) {
      throw new Error(`Git service is disabled: ${this.disabledReason}`);
    }

    try {
      // 确保shadow git仓库已经初始化
      await this.ensureShadowGitRepositoryExists();

      const hash = await this.shadowGitRepository.raw('rev-parse', 'HEAD');
      return hash.trim();
    } catch (error) {
      console.error(`[CHECKPOINT DEBUG] Error getting current commit hash:`, error);
      throw error;
    }
  }

  async createFileSnapshot(message: string): Promise<string> {
    if (this.isDisabled) {
      throw new Error(`Git service is disabled: ${this.disabledReason}`);
    }

    try {
      // 确保shadow git仓库已经初始化
      await this.ensureShadowGitRepositoryExists();

      const repo = this.shadowGitRepository;

      // 尝试添加所有文件，如果失败则使用更安全的方法
      await this.safeAddFiles(repo);

      // 检查是否有文件需要提交
      const status = await repo.status();
      const hasChanges = status.files.length > 0;

      if (!hasChanges) {
        return await this.getCurrentCommitHash();
      }

      const commitResult = await repo.commit(message);
      return commitResult.commit;
    } catch (error) {
      console.error(`[CHECKPOINT DEBUG] Git snapshot creation failed:`, error);

      // 如果提交失败，尝试获取当前的commit hash作为备选
      try {
        const currentHash = await this.getCurrentCommitHash();
        console.warn(`[CHECKPOINT DEBUG] Using current commit hash as fallback: ${currentHash}`);
        return currentHash;
      } catch (fallbackError) {
        console.error(`[CHECKPOINT DEBUG] Failed to get fallback commit hash:`, fallbackError);
        throw error;
      }
    }
  }

  /**
   * 安全地添加文件到Git，处理子模块和其他特殊情况
   */
  private async safeAddFiles(repo: SimpleGit): Promise<void> {
    try {
      // 首先检查是否存在子模块
      const hasSubmodules = await this.checkForSubmodules();

      if (hasSubmodules) {
        await this.addFilesWithSubmoduleHandling(repo);
      } else {
        // 没有子模块，使用标准方法
        await repo.add('.');
      }
    } catch (error) {
      console.warn(`[CHECKPOINT DEBUG] Primary git add failed, trying fallback strategies:`, error);
      await this.fallbackAddFiles(repo);
    }
  }

  /**
   * 检查项目是否包含Git子模块
   */
  private async checkForSubmodules(): Promise<boolean> {
    try {
      const gitmodulesPath = path.join(this.projectRoot, '.gitmodules');
      await fs.access(gitmodulesPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 处理包含子模块的项目的文件添加
   */
  private async addFilesWithSubmoduleHandling(repo: SimpleGit): Promise<void> {
    try {
      // 1. 先添加所有已跟踪文件的修改
      await repo.add(['-u']);

      // 2. 获取状态并安全地添加新文件
      const status = await repo.status();
      const untrackedFiles = status.not_added;

      if (untrackedFiles.length > 0) {
        const safeFiles = untrackedFiles.filter(file => !this.isPotentialSubmodule(file));

        if (safeFiles.length > 0) {
          console.log(`[CHECKPOINT DEBUG] Adding ${safeFiles.length} safe untracked files`);
          await repo.add(safeFiles);
        }
      }
    } catch (error) {
      console.warn(`[CHECKPOINT DEBUG] Submodule-aware add failed:`, error);
      throw error;
    }
  }

  /**
   * 备用文件添加策略
   */
  private async fallbackAddFiles(repo: SimpleGit): Promise<void> {
    const strategies = [
      // 策略1: 只添加已跟踪文件的修改
      async () => {
        await repo.add(['-u']);
      },

      // 策略2: 添加常见文件类型
      async () => {
        const patterns = ['*.js', '*.ts', '*.json', '*.md', '*.txt', '*.yml', '*.yaml', '*.css', '*.html'];
        await repo.add(patterns);
      },

      // 策略3: 逐个添加根目录文件
      async () => {
        const status = await repo.status();
        const rootFiles = status.not_added.filter(file => !file.includes('/'));
        if (rootFiles.length > 0) {
          await repo.add(rootFiles);
        }
      }
    ];

    for (let i = 0; i < strategies.length; i++) {
      try {
        await strategies[i]();
        return; // 成功则退出
      } catch (error) {
        if (i === strategies.length - 1) {
          console.warn(`[CHECKPOINT DEBUG] All fallback strategies failed, proceeding with commit anyway`);
        }
      }
    }
  }

  /**
   * 检查路径是否可能是子模块或应该被排除的目录
   */
  private isPotentialSubmodule(filePath: string): boolean {
    // 检查是否包含常见的子模块指示符或应排除的目录
    const excludePatterns = [
      '.git',
      'node_modules',
      '.gitmodules',
      'inspector/auto-web-inspector', // 特定处理报错中的子模块
      '.vscode',
      '.idea',
      'dist',
      'build',
      'coverage'
    ];

    // 检查是否匹配排除模式
    const matchesExcludePattern = excludePatterns.some(pattern =>
      filePath.includes(pattern)
    );

    // 检查是否是目录（以/结尾）且可能是子模块
    const isPotentialSubmoduleDir = filePath.endsWith('/') &&
      (filePath.includes('inspector') || filePath.includes('auto-web'));

    return matchesExcludePattern || isPotentialSubmoduleDir;
  }

  async restoreProjectFromSnapshot(commitHash: string): Promise<void> {
    if (this.isDisabled) {
      throw new Error(`Git service is disabled: ${this.disabledReason}`);
    }

    console.log(`[CHECKPOINT DEBUG] Starting restore from snapshot: ${commitHash}`);

    try {
      // 确保shadow git仓库已经初始化
      await this.ensureShadowGitRepositoryExists();

      const repo = this.shadowGitRepository;

      // 安全地恢复文件，处理子模块问题
      await this.safeRestoreFiles(repo, commitHash);

      console.log(`[CHECKPOINT DEBUG] Successfully restored from snapshot: ${commitHash}`);
    } catch (error) {
      console.error(`[CHECKPOINT DEBUG] Failed to restore from snapshot:`, error);
      throw error;
    }
  }

  /**
   * 安全地恢复文件，处理子模块和其他特殊情况
   */
  private async safeRestoreFiles(repo: SimpleGit, commitHash: string): Promise<void> {
    try {
      // 首先尝试标准的恢复操作
      await repo.raw(['restore', '--source', commitHash, '.']);

      // 清理未跟踪的文件
      await this.safeCleanFiles(repo);

    } catch (error) {
      console.warn(`[CHECKPOINT DEBUG] Standard restore failed, trying alternative approach:`, error);

      try {
        // 备用策略：分步恢复
        await this.fallbackRestoreFiles(repo, commitHash);

      } catch (fallbackError) {
        console.error(`[CHECKPOINT DEBUG] All restore strategies failed:`, fallbackError);
        throw fallbackError;
      }
    }
  }

  /**
   * 安全地清理文件，避免子模块问题
   */
  private async safeCleanFiles(repo: SimpleGit): Promise<void> {
    try {
      // 尝试标准清理
      await repo.clean('f', ['-d']);
    } catch (error) {
      console.warn(`[CHECKPOINT DEBUG] Standard clean failed, using safe clean:`, error);

      try {
        // 更安全的清理方式：只清理非子模块目录
        await repo.clean('f', ['-d', '--exclude=inspector/', '--exclude=node_modules/']);
      } catch (safeCleanError) {
        console.warn(`[CHECKPOINT DEBUG] Safe clean also failed, skipping clean:`, safeCleanError);
        // 清理失败不是致命错误，继续执行
      }
    }
  }

  /**
   * 备用恢复策略
   */
  private async fallbackRestoreFiles(repo: SimpleGit, commitHash: string): Promise<void> {
    const strategies = [
      // 策略1: 只恢复已跟踪的文件
      async () => {
        const status = await repo.status();
        const trackedFiles = status.files
          .filter(file => !this.isPotentialSubmodule(file.path))
          .map(file => file.path);

        if (trackedFiles.length > 0) {
          await repo.raw(['restore', '--source', commitHash, ...trackedFiles]);
          console.log(`[CHECKPOINT DEBUG] Restored ${trackedFiles.length} tracked files`);
        }
      },

      // 策略2: 按文件类型恢复
      async () => {
        const patterns = ['*.js', '*.ts', '*.json', '*.md', '*.txt', '*.yml', '*.yaml', '*.css', '*.html'];
        for (const pattern of patterns) {
          try {
            await repo.raw(['restore', '--source', commitHash, pattern]);
          } catch (patternError) {
            // 某些模式可能不存在文件，这是正常的
            console.debug(`[CHECKPOINT DEBUG] Pattern ${pattern} restore failed:`, patternError);
          }
        }
        console.log(`[CHECKPOINT DEBUG] Restored files by patterns`);
      }
    ];

    for (let i = 0; i < strategies.length; i++) {
      try {
        await strategies[i]();
        return; // 成功则退出
      } catch (error) {
        console.warn(`[CHECKPOINT DEBUG] Restore strategy ${i + 1} failed:`, error);
        if (i === strategies.length - 1) {
          throw new Error(`All restore strategies failed. Last error: ${error}`);
        }
      }
    }
  }
}
