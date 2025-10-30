/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink';
import { AppWrapper } from './ui/App.js';
import { loadCliConfig, parseArguments, CliArgs } from './config/config.js';
import { readStdin } from './utils/readStdin.js';
import { basename, resolve, normalize } from 'node:path';
import v8 from 'node:v8';
import os from 'node:os';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { start_sandbox } from './utils/sandbox.js';
import {
  LoadedSettings,
  loadSettings,
  SettingScope,
} from './config/settings.js';
import { themeManager } from './ui/themes/theme-manager.js';
import { getStartupWarnings } from './utils/startupWarnings.js';
import { getUserStartupWarnings } from './utils/userStartupWarnings.js';
import { runNonInteractive } from './nonInteractiveCli.js';
import { loadExtensions, Extension } from './config/extension.js';
import { cleanupCheckpoints, registerCleanup, runExitCleanup } from './utils/cleanup.js';
import { getCliVersion } from './utils/version.js';
import { checkForUpdates, executeUpdateCommand } from './ui/utils/updateCheck.js';
import { t, tp } from './ui/utils/i18n.js';
import {
  ApprovalMode,
  Config,
  EditTool,
  ShellTool,
  WriteFileTool,
  sessionId,
  logUserPrompt,
  AuthType,
  SessionManager,
} from 'deepv-code-core';
import { validateAuthMethod } from './config/auth.js';
import { loadEnvironment } from './config/settings.js';
import { setMaxSizedBoxDebugging } from './ui/components/shared/MaxSizedBox.js';
import { validateNonInteractiveAuth } from './validateNonInterActiveAuth.js';
import { enableSilentMode, disableSilentMode, logIfNotSilent } from './utils/silentMode.js';
import { setSilentMode } from 'deepv-code-core';
import { appEvents, AppEvent } from './utils/events.js';
import * as readline from 'node:readline';
import { createConfirmationReadlineInterface } from './ui/utils/readlineOptimized.js';
import { setupGitErrorMonitoring, canDisableCheckpointing } from './utils/gitErrorHandler.js';
import { AudioNotification } from './utils/audioNotification.js';
import { performStartupResize } from './ui/utils/vscodeStartupResize.js';

async function listAvailableSessions(config: Config): Promise<void> {
  try {
    const sessionManager = new SessionManager(config.getProjectRoot());
    const sessions = await sessionManager.listSessions();

    if (sessions.length === 0) {
      console.log('No available sessions found.');
      return;
    }

    console.log('Available sessions:');
    console.log('---');

    // 按最后活跃时间排序（最新的在前）
    const sortedSessions = sessions.sort((a, b) =>
      new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
    );

    for (const session of sortedSessions) {
      const createdAt = new Date(session.createdAt).toLocaleString();
      const lastActiveAt = new Date(session.lastActiveAt).toLocaleString();
      const hasCheckpoint = session.hasCheckpoint ? ' [CP]' : '';

      console.log(`Session ID: ${session.sessionId}${hasCheckpoint}`);
      console.log(`  Title: ${session.title || 'Untitled'}`);
      console.log(`  Created: ${createdAt}`);
      console.log(`  Last Active: ${lastActiveAt}`);
      console.log(`  Messages: ${session.messageCount}`);
      console.log(`  Tokens: ${session.totalTokens}`);
      if (session.model) {
        console.log(`  Model: ${session.model}`);
      }
      if (session.firstUserMessage) {
        console.log(`  First Message: ${session.firstUserMessage}${session.firstUserMessage.length >= 100 ? '...' : ''}`);
      }
      if (session.lastAssistantMessage) {
        console.log(`  Last Response: ${session.lastAssistantMessage}${session.lastAssistantMessage.length >= 100 ? '...' : ''}`);
      }
      console.log('---');
    }

    console.log(`\nTotal: ${sessions.length} sessions`);
    console.log('\nTo continue a session, use: dvcode --session <session-id>');
    console.log('To continue the last active session, use: dvcode --continue');
  } catch (error) {
    console.error('Error listing sessions:', error);
    process.exit(1);
  }
}

function getNodeMemoryArgs(config: Config): string[] {
  const totalMemoryMB = os.totalmem() / (1024 * 1024);
  const heapStats = v8.getHeapStatistics();
  const currentMaxOldSpaceSizeMb = Math.floor(
    heapStats.heap_size_limit / 1024 / 1024,
  );

  // Set target to 50% of total memory
  const targetMaxOldSpaceSizeInMB = Math.floor(totalMemoryMB * 0.5);
  if (config.getDebugMode()) {
    console.debug(
      `Current heap size ${currentMaxOldSpaceSizeMb.toFixed(2)} MB`,
    );
  }

  if (process.env.GEMINI_CLI_NO_RELAUNCH) {
    return [];
  }

  // Linus fix: 始终启用GC访问，用于强制内存清理
  const args = ['--expose-gc'];

  if (targetMaxOldSpaceSizeInMB > currentMaxOldSpaceSizeMb) {
    if (config.getDebugMode()) {
      console.debug(
        `Need to relaunch with more memory: ${targetMaxOldSpaceSizeInMB.toFixed(2)} MB`,
      );
    }
    args.push(`--max-old-space-size=${targetMaxOldSpaceSizeInMB}`);
  }

  return args;
}

async function relaunchWithAdditionalArgs(additionalArgs: string[]) {
  const nodeArgs = [...additionalArgs, ...process.argv.slice(1)];
  const newEnv = { ...process.env, GEMINI_CLI_NO_RELAUNCH: 'true' };

  const child = spawn(process.execPath, nodeArgs, {
    stdio: 'inherit',
    env: newEnv,
  });

  await new Promise((resolve) => child.on('close', resolve));
  process.exit(0);
}
import { runAcpPeer } from './acp/acpPeer.js';
import { cleanupOldClipboardImages } from './ui/utils/clipboardUtils.js';

export function setupUnhandledRejectionHandler() {
  let unhandledRejectionOccurred = false;
  process.on('unhandledRejection', (reason, _promise) => {
    const errorMessage = `=========================================
This is an unexpected error. Please report this issue.
CRITICAL: Unhandled Promise Rejection!
=========================================
Reason: ${reason}${
      reason instanceof Error && reason.stack
        ? `
Stack trace:
${reason.stack}`
        : ''
    }`;
    appEvents.emit(AppEvent.LogError, errorMessage);
    if (!unhandledRejectionOccurred) {
      unhandledRejectionOccurred = true;
      appEvents.emit(AppEvent.OpenDebugConsole);
    }
  });
}

// 询问用户是否进行强制更新
async function askUserForAutoUpdate(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createConfirmationReadlineInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(`\n${t('update.prompt.auto')}`, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes');
    });
  });
}

// 询问用户是否进行可选更新
async function askUserForUpdate(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createConfirmationReadlineInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(`\n${t('update.prompt.now')}`, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes');
    });
  });
}

/**
 * Handle and validate the --workdir parameter.
 * Supports both Windows and Unix-style paths.
 * Converts paths to absolute and validates they exist.
 */
function processWorkdirParameter(workdirPath: string | undefined): string | null {
  if (!workdirPath) {
    return null;
  }

  try {
    // Normalize the path (handles both Windows and Unix separators)
    // This converts backslashes to forward slashes on Unix and vice versa on Windows
    const normalizedPath = normalize(workdirPath);

    // Resolve to absolute path (relative to current working directory if not absolute)
    const absolutePath = resolve(normalizedPath);

    // Verify the directory exists
    const stats = fs.statSync(absolutePath);

    if (!stats.isDirectory()) {
      console.error(`Error: --workdir path is not a directory: ${absolutePath}`);
      process.exit(1);
    }

    return absolutePath;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      console.error(`Error: --workdir path does not exist: ${workdirPath}`);
    } else {
      console.error(`Error: Invalid --workdir path: ${workdirPath}`);
      if (error instanceof Error) {
        console.error(`Details: ${error.message}`);
      }
    }
    process.exit(1);
  }
}

export async function main() {
  setupUnhandledRejectionHandler();

  // Setup Git error monitoring early to catch initialization errors
  setupGitErrorMonitoring();

  // Load environment variables early to ensure Claude configuration works
  loadEnvironment();

  // Parse arguments first to check for --workdir, --update flag and enable silent mode early if needed
  const argv = await parseArguments();

  // Handle --workdir parameter before setting up workspace
  if (argv.workdir) {
    const workdirPath = processWorkdirParameter(argv.workdir);
    if (workdirPath) {
      process.chdir(workdirPath);
    }
  }

  const workspaceRoot = process.cwd();
  const settings = loadSettings(workspaceRoot);

  // Enable silent mode early for -p flag to suppress startup logs


  // Handle --update flag
  if (argv.update) {
    console.log(t('update.force.checking'));
    const updateMessage = await checkForUpdates(true, true);

    if (updateMessage?.startsWith('FORCE_UPDATE:')) {
      // 正确解析：根据消息标记来分割，避免URL中的冒号干扰
      const prefix = 'FORCE_UPDATE:';
      let firstColonIndex = updateMessage.indexOf(':', prefix.length);

      const latestVersion = updateMessage.substring(prefix.length, firstColonIndex);

      // 使用稳定的消息分隔符定位消息开始位置
      const messageMarker = '::MSG::';
      const messageStartIndex = updateMessage.indexOf(messageMarker);

      const updateCommand = updateMessage.substring(firstColonIndex + 1, messageStartIndex);
      const message = updateMessage.substring(messageStartIndex + messageMarker.length);

      console.log('\n' + '='.repeat(60));
      console.log(t('update.forced.title'));
      console.log('='.repeat(60));
      console.log(message);
      console.log('='.repeat(60));

      // 🔧 用户使用 -u 参数已经明确表达更新意图，直接执行更新
      console.log(`\n${t('update.auto.executing')}`);
      const success = await executeUpdateCommand(updateCommand);
      if (success) {
        console.log(`\n${t('update.success.restart')}`);
        process.exit(0);
      } else {
        console.log(`\n${t('update.manual.then.rerun')}`);
        process.exit(1);
      }
    } else if (updateMessage?.startsWith('UPDATE_AVAILABLE:')) {
      // 正确解析：根据消息标记来分割，避免URL中的冒号干扰
      const prefix = 'UPDATE_AVAILABLE:';
      let firstColonIndex = updateMessage.indexOf(':', prefix.length);

      const latestVersion = updateMessage.substring(prefix.length, firstColonIndex);

      // 使用稳定的消息分隔符定位消息开始位置
      const messageMarker = '::MSG::';
      const messageStartIndex = updateMessage.indexOf(messageMarker);

      const updateCommand = updateMessage.substring(firstColonIndex + 1, messageStartIndex);
      const message = updateMessage.substring(messageStartIndex + messageMarker.length);

      console.log('\n' + '='.repeat(60));
      console.log(t('update.available.title'));
      console.log('='.repeat(60));
      console.log(message);
      console.log('='.repeat(60));

      // 询问用户是否更新
      const shouldUpdate = await askUserForUpdate();
      if (shouldUpdate) {
        const success = await executeUpdateCommand(updateCommand);
        if (success) {
          console.log(`\n${t('update.success.restart')}`);
          process.exit(0);
        }
      }
      console.log(`\n${t('update.continue.current')}\n`);
    } else {
      console.log(`${t('update.current.latest.full')}\n`);
    }
  } else {
    // 正常启动时检查强制更新（显示检查状态）
    const updateMessage = await checkForUpdates(true);
    if (updateMessage?.startsWith('FORCE_UPDATE:')) {
      // 正确解析：根据消息标记来分割，避免URL中的冒号干扰
      const prefix = 'FORCE_UPDATE:';
      let firstColonIndex = updateMessage.indexOf(':', prefix.length);

      const latestVersion = updateMessage.substring(prefix.length, firstColonIndex);

      // 使用稳定的消息分隔符定位消息开始位置
      const messageMarker = '::MSG::';
      const messageStartIndex = updateMessage.indexOf(messageMarker);

      const updateCommand = updateMessage.substring(firstColonIndex + 1, messageStartIndex);
      const message = updateMessage.substring(messageStartIndex + messageMarker.length);



      console.error('\n' + '='.repeat(60));
      console.error(t('update.forced.title'));
      console.error('='.repeat(60));
      console.error(message);
      console.error('='.repeat(60));

      // 自动执行强制更新
      console.error(`\n${t('update.auto.exec.start')}`);
      const success = await executeUpdateCommand(updateCommand);
      if (success) {
        console.error(`\n${t('update.success.restart')}`);
        process.exit(0);
      } else {
        console.error(`\n${t('update.manual.then.rerun')}`);
        process.exit(1);
      }
    }
  }

  // Check both CLI args and environment variable for silent mode and enable early
  // This must be before any ProxyAuthManager initialization to prevent logging
  const shouldEnableSilentMode =
    (argv.prompt && !argv.promptInteractive) ||
    process.env.DEEPV_SILENT_MODE === 'true';

  if (shouldEnableSilentMode) {
    enableSilentMode();
    // Also set silent mode in core package
    setSilentMode(true);
  }

  // 初始化ProxyAuthManager，从设置文件中恢复飞书token
  // 调试信息已关闭
  // Skip ProxyAuthManager initialization in non-interactive mode to avoid logging
  if (settings.merged.feishuToken && !shouldEnableSilentMode) {
    try {
      const { ProxyAuthManager } = await import('deepv-code-core');
      const proxyAuthManager = ProxyAuthManager.getInstance();

      // 调试信息已关闭

      proxyAuthManager.configure({
        feishuToken: settings.merged.feishuToken
      });

      // 调试信息已关闭

      // 同时设置环境变量作为备份
      process.env.FEISHU_ACCESS_TOKEN = settings.merged.feishuToken;
      console.log('🔄 从设置文件恢复飞书token');
      // 调试信息已关闭
    } catch (error) {
      console.warn('⚠️ 恢复飞书token失败:', error);
    }
  } else {
    // 调试信息已关闭
  }

  //await cleanupCheckpoints();
  if (settings.errors.length > 0) {
    for (const error of settings.errors) {
      let errorMessage = `Error in ${error.path}: ${error.message}`;
      if (!process.env.NO_COLOR) {
        errorMessage = `\x1b[31m${errorMessage}\x1b[0m`;
      }
      console.error(errorMessage);
      console.error(`Please fix ${error.path} and try again.`);
    }
    process.exit(1);
  }

  const extensions = await loadExtensions(workspaceRoot);

  // Early check for list-sessions to avoid unnecessary session management
  if (argv.listSessions) {
    const tempConfig = await loadCliConfig(
      settings.merged,
      extensions,
      sessionId, // Use default session ID
      argv,
    );
    await listAvailableSessions(tempConfig);
    process.exit(0);
  }

  // Handle --test-audio flag
  if (argv.testAudio) {
    console.log('🎵 Testing audio notifications...');
    console.log('This will test all three notification sounds with a 1-second delay between each.');
    console.log('Make sure your speakers/headphones are on and volume is audible.\n');

    try {
      await AudioNotification.test();
      console.log('\n✅ Audio test completed successfully!');
      console.log('If you didn\'t hear any sounds, check your system audio settings.');
      console.log('You can disable audio notifications in your settings.json file:');
      console.log('  "audioNotifications": { "enabled": false }');
    } catch (error) {
      console.error('\n❌ Audio test failed:', error);
      console.log('Audio notifications may not work on this system.');
    }
    process.exit(0);
  }

  // Initialize session management
  let finalSessionId = sessionId; // Default session ID

  const { SessionManager } = await import('deepv-code-core');
  const sessionManager = new SessionManager(workspaceRoot);

  // 添加进程信号处理器，确保在意外退出时也能清理空会话
  const handleExit = async () => {
    try {
      await runExitCleanup();
    } catch (error) {
      // 忽略清理错误，避免影响正常退出
    }
  };

  process.on('SIGINT', async () => {
    await handleExit();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await handleExit();
    process.exit(0);
  });

  // Perform session cleanup based on settings (runs in background)
  const sessionCleanupConfig = settings.merged.sessionCleanup || {
    enabled: true, // 启用session清理
    maxSessions: 500, // 最大保留会话数
    cleanupOnStartup: true // 启动时清理
  };

  // 启动时清理超出数量限制的会话
  if (sessionCleanupConfig.enabled && sessionCleanupConfig.cleanupOnStartup) {
    sessionManager.performSessionCleanup(sessionCleanupConfig.maxSessions || 500).catch(error => {
      console.warn('[Startup] Session cleanup failed:', error);
    });
  }

  // Handle session selection based on command line arguments
  if (argv.session) {
    logIfNotSilent('log', `🔄 Loading session: ${argv.session}`);
    const sessionData = await sessionManager.loadSession(argv.session);
    if (sessionData) {
      finalSessionId = sessionData.sessionId as any;
      logIfNotSilent('log', `📝 Loaded session: ${finalSessionId}`);
    } else {
      logIfNotSilent('warn', `⚠️  Session ${argv.session} not found, creating new session`);
      const newSession = await sessionManager.createNewSession();
      finalSessionId = newSession.sessionId as any;
      logIfNotSilent('log', `📝 Created new session: ${finalSessionId}`);
    }
  } else if (argv.continue) {
    logIfNotSilent('log', `🔄 Continuing last session...`);
    const sessionData = await sessionManager.initializeSession(true);
    finalSessionId = sessionData.sessionId as any;
    logIfNotSilent('log', `📝 Continuing last session: ${finalSessionId}`);
  } else {
    logIfNotSilent('log', ``);
    const newSession = await sessionManager.createNewSession();
    finalSessionId = newSession.sessionId as any;

  }

  // Perform session cleanup after creating/selecting current session (runs in background)
  if (sessionCleanupConfig.enabled && sessionCleanupConfig.cleanupOnStartup) {
    // 清理时排除当前正在使用的session
    sessionManager.performSessionCleanup(
      sessionCleanupConfig.maxSessions || 500,
      false, // preserveLatestEmpty设为false，因为我们已经有了当前session
      finalSessionId // 传入当前sessionId以避免被清理
    ).catch(error => {
      console.warn('[Startup] Session cleanup failed:', error);
    });
  }

  const config = await loadCliConfig(
    settings.merged,
    extensions,
    finalSessionId,
    argv,
  );

  if (argv.promptInteractive && !process.stdin.isTTY) {
    console.error(
      'Error: The --prompt-interactive flag is not supported when piping input from stdin.',
    );
    process.exit(1);
  }

  if (config.getListExtensions()) {
    logIfNotSilent('log', 'Installed extensions:');
    for (const extension of extensions) {
      logIfNotSilent('log', `- ${extension.config.name}`);
    }
    process.exit(0);
  }



  // Set a default auth type if one isn't set.
  if (!settings.merged.selectedAuthType) {
    // Default to Cheeth OA authentication
    settings.setValue(
      SettingScope.User,
      'selectedAuthType',
      AuthType.USE_CHEETH_OA,
    );
  }

  setMaxSizedBoxDebugging(config.getDebugMode());

  await config.initialize();

  // Check model compatibility and log diagnostics (only in debug mode)
  try {
    if (process.env.DEBUG) {
      const { logModelDiagnostics } = await import('deepv-code-core');
      const modelName = config.getModel();
      logModelDiagnostics(modelName, true);
    }
  } catch (error) {
    // Fallback if model diagnostics fail - don't block startup
    if (process.env.DEBUG) {
      logIfNotSilent('warn', '⚠️  Model compatibility check failed, continuing...\n');
    }
  }

  // Check Git service status after initialization
  if (config.getCheckpointingEnabled()) {
    try {
      const gitService = await config.getGitService();
      if (gitService.isGitDisabled()) {
        // Git is disabled, but we can continue - the error message was already displayed
        logIfNotSilent('log', 'ℹ️  Continuing with Git checkpointing disabled...\n');
      }
    } catch (error) {
      // This shouldn't happen with the new graceful error handling, but just in case
      logIfNotSilent('warn', '⚠️  Git service initialization had issues, continuing anyway...\n');
    }
  }

  // Load custom themes from settings
  themeManager.loadCustomThemes(settings.merged.customThemes);

  if (settings.merged.theme) {
    if (!themeManager.setActiveTheme(settings.merged.theme)) {
      // If the theme is not found during initial load, log a warning and continue.
      // The useThemeCommand hook in App.tsx will handle opening the dialog.
      logIfNotSilent('warn', `Warning: Theme "${settings.merged.theme}" not found.`);
    }
  }

  // hop into sandbox if we are outside and sandboxing is enabled
  if (!process.env.SANDBOX) {
    const memoryArgs = settings.merged.autoConfigureMaxOldSpaceSize
      ? getNodeMemoryArgs(config)
      : [];
    const sandboxConfig = config.getSandbox();
    if (sandboxConfig) {
      if (settings.merged.selectedAuthType) {
        // Validate authentication here because the sandbox will interfere with the Oauth2 web redirect.
        try {
          const err = validateAuthMethod(settings.merged.selectedAuthType);
          if (err) {
            throw new Error(err);
          }
          await config.refreshAuth(settings.merged.selectedAuthType);
        } catch (err) {
          console.error('Error authenticating:', err);
          process.exit(1);
        }
      }
      await start_sandbox(sandboxConfig, memoryArgs);
      process.exit(0);
    } else {
      // Not in a sandbox and not entering one, so relaunch with additional
      // arguments to control memory usage if needed.
      if (memoryArgs.length > 0) {
        await relaunchWithAdditionalArgs(memoryArgs);
        process.exit(0);
      }
    }
  }

  // OAuth pre-authentication removed - only Cheeth OA supported

  if (config.getExperimentalAcp()) {
    return runAcpPeer(config, settings);
  }

  let input = config.getQuestion();
  const startupWarnings = [
    ...(await getStartupWarnings()),
    ...(await getUserStartupWarnings(workspaceRoot)),
  ];

  // Check for cloud mode
  if (argv.cloudMode) {
    const { startCloudMode } = await import('./remote/remoteServer.js');
    const { maskServerUrl } = await import('./utils/urlMask.js');
    const cloudServerUrl = argv.cloudServer || 'https://api-code.deepvlab.ai';

    console.log(t('cloud.mode.starting'));
    console.log(tp('cloud.mode.connecting.to.server', { url: maskServerUrl(cloudServerUrl) }));

    await startCloudMode(config, cloudServerUrl);
    return;
  }

  // 清理剪切板文件
  cleanupOldClipboardImages(config.getProjectSettingsManager().getConfigDirPath()).catch(() => {
    // Ignore cleanup errors
  });

  const shouldBeInteractive =
    !!argv.promptInteractive || (process.stdin.isTTY && input?.length === 0);

  // Render UI, passing necessary config values. Check that there is no command line question.
  if (shouldBeInteractive) {
    // Perform VSCode terminal startup resize calibration before UI renders
    performStartupResize();

    const version = await getCliVersion();
    setWindowTitle(basename(workspaceRoot), settings);
    const instance = render(
      <React.StrictMode>
        <AppWrapper
          config={config}
          settings={settings}
          startupWarnings={startupWarnings}
          version={version}
        />
      </React.StrictMode>,
      { exitOnCtrlC: false },
    );

    registerCleanup(() => instance.unmount());

    // 注册会话清理函数，在程序退出时清理空会话
    registerCleanup(async () => {
      // 使用 config.getSessionId() 获取当前会话ID，而不是闭包中的 finalSessionId
      // 这样可以确保在切换会话后，清理的是正确的会话
      const currentSessionId = config.getSessionId();
      await sessionManager.cleanupCurrentEmptySessionOnExit(currentSessionId);
    });

    return;
  }
  // If not a TTY, read from stdin
  // This is for cases where the user pipes input directly into the command
  if (!process.stdin.isTTY && !input) {
    input += await readStdin();
  }
  if (!input) {
    console.error('No input provided via stdin.');
    process.exit(1);
  }

  const prompt_id = Math.random().toString(16).slice(2);
  logUserPrompt(config, {
    'event.name': 'user_prompt',
    'event.timestamp': new Date().toISOString(),
    prompt: input,
    prompt_id,
    auth_type: config.getContentGeneratorConfig()?.authType,
    prompt_length: input.length,
  });

  // Non-interactive mode handled by runNonInteractive
  const nonInteractiveConfig = await loadNonInteractiveConfig(
    config,
    extensions,
    settings,
    argv,
  );

  await runNonInteractive(nonInteractiveConfig, input, prompt_id);

  // 在非交互模式结束后，运行所有cleanup函数（包括空会话清理）
  await runExitCleanup();

  // Disable silent mode before exit (cleanup)
  if (argv.prompt) {
    disableSilentMode();
  }

  process.exit(0);
}

// 全局变量保存标题信息
let currentWindowTitle: string | null = null;
let titleRestoreInterval: NodeJS.Timeout | null = null;

function setWindowTitle(title: string, settings: LoadedSettings) {
  if (!settings.merged.hideWindowTitle) {
    const windowTitle = (process.env.CLI_TITLE || `🚀 DeepV Code - ${title}`).replace(
      // eslint-disable-next-line no-control-regex
      /[\x00-\x1F\x7F]/g,
      '',
    );

    // 确保CLI_TITLE环境变量被设置，以便shell命令执行后能正确恢复标题
    if (!process.env.CLI_TITLE) {
      process.env.CLI_TITLE = windowTitle;
    }

    // 保存当前标题供后续恢复使用
    currentWindowTitle = windowTitle;

    // 设置标题
    process.stdout.write(`\x1b]2;${windowTitle}\x07`);

    // 检查标题保护设置
    const titleProtection = settings.merged.titleProtection;
    const protectionEnabled = titleProtection?.enabled !== false; // 默认启用
    const restoreInterval = (titleProtection?.restoreInterval || 30) * 1000; // 默认30秒

    // 启动定期标题恢复机制
    if (protectionEnabled && !titleRestoreInterval) {
      titleRestoreInterval = setInterval(() => {
        if (currentWindowTitle) {
          process.stdout.write(`\x1b]2;${currentWindowTitle}\x07`);
        }
      }, restoreInterval);
    }

    process.on('exit', () => {
      if (titleRestoreInterval) {
        clearInterval(titleRestoreInterval);
      }
      process.stdout.write(`\x1b]2;\x07`);
    });
  }
}

// 手动恢复标题的函数
function restoreWindowTitle() {
  if (currentWindowTitle) {
    process.stdout.write(`\x1b]2;${currentWindowTitle}\x07`);
  }
}

/**
 * 🎯 使用 Checkpoint Summary 更新窗口标题
 * 格式：🚀 <summary> - DeepV Code - <工作目录名>
 * @param summary 生成的摘要（10字以内）
 * @param settings 用户配置
 * @param workspaceName 工作目录名（可选，默认使用当前工作目录）
 */
export function updateWindowTitleWithSummary(
  summary: string,
  settings: LoadedSettings,
  workspaceName?: string
): void {
  // 1. 参数校验
  if (!summary || summary.trim().length === 0) {
    console.log('[Title] Summary is empty, skipping title update');
    return;
  }

  // 2. 检查用户是否禁用标题
  if (settings.merged.hideWindowTitle) {
    return;
  }

  // 3. 获取工作目录名
  const workspace = workspaceName || basename(process.cwd());

  // 4. 构造新标题：🚀 <summary> - DeepV Code - <工作目录名>
  const cleanSummary = summary.trim();
  const newTitle = `🚀 ${cleanSummary} - DeepV Code - ${workspace}`;

  // 5. 更新全局变量（标题保护机制会自动使用这个值）
  currentWindowTitle = newTitle;
  process.env.CLI_TITLE = newTitle;  // 同步环境变量，防止音频播放完成后被旧值覆盖

  // 6. 立即设置标题到终端
  process.stdout.write(`\x1b]2;${newTitle}\x07`);

  console.log(`[Title] Updated to: ${newTitle}`);
}

// 导出恢复函数供其他模块使用
export { restoreWindowTitle };

async function loadNonInteractiveConfig(
  config: Config,
  extensions: Extension[],
  settings: LoadedSettings,
  argv: CliArgs,
) {
  let finalConfig = config;
  if (config.getApprovalMode() !== ApprovalMode.YOLO) {
    // Everything is not allowed, ensure that only read-only tools are configured.
    const existingExcludeTools = settings.merged.excludeTools || [];
    const interactiveTools = [
      ShellTool.Name,
      EditTool.Name,
      WriteFileTool.Name,
    ];

    const newExcludeTools = [
      ...new Set([...existingExcludeTools, ...interactiveTools]),
    ];

    const nonInteractiveSettings = {
      ...settings.merged,
      excludeTools: newExcludeTools,
    };
    finalConfig = await loadCliConfig(
      nonInteractiveSettings,
      extensions,
      config.getSessionId(),
      argv,
    );
    await finalConfig.initialize();
  }

  return await validateNonInteractiveAuth(
    settings.merged.selectedAuthType,
    finalConfig,
  );
}
