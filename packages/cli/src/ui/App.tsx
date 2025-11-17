/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  Box,
  DOMElement,
  measureElement,
  Static,
  Text,
  useStdin,
  useStdout,
  useInput,
  type Key as InkKeyType,
} from 'ink';
import { StreamingState, type HistoryItem, MessageType } from './types.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { useGeminiStream } from './hooks/useGeminiStream.js';
import { t, tp } from './utils/i18n.js';
import { useLoadingIndicator } from './hooks/useLoadingIndicator.js';
import { useTaskCompletionSummary } from './hooks/useTaskCompletionSummary.js';
import { TaskCompletionSummary } from './components/TaskCompletionSummary.js';
import { useThemeCommand } from './hooks/useThemeCommand.js';
import { useModelCommand } from './hooks/useModelCommand.js';
import { useAuthCommand } from './hooks/useAuthCommand.js';
import { useLoginCommand } from './hooks/useLoginCommand.js';
import { useEditorSettings } from './hooks/useEditorSettings.js';
import { useSlashCommandProcessor } from './hooks/slashCommandProcessor.js';
import { useAutoAcceptIndicator } from './hooks/useAutoAcceptIndicator.js';
import { useConsoleMessages } from './hooks/useConsoleMessages.js';
import { Header } from './components/Header.js';
import { WelcomeScreen } from './components/WelcomeScreen.js';
import { LoadingIndicator } from './components/LoadingIndicator.js';
import { AutoAcceptIndicator } from './components/AutoAcceptIndicator.js';
import { ShellModeIndicator } from './components/ShellModeIndicator.js';
import { HelpModeIndicator } from './components/HelpModeIndicator.js';
import { PlanModeIndicator } from './components/PlanModeIndicator.js';
import { InputPrompt } from './components/InputPrompt.js';
import { Footer } from './components/Footer.js';
import { truncateText, getDefaultMaxRows } from './utils/textTruncator.js';
import { ThemeDialog } from './components/ThemeDialog.js';
import { ModelDialog } from './components/ModelDialog.js';
import { AuthDialog } from './components/AuthDialog.js';
import { LoginDialog } from './components/LoginDialog.js';
import { AuthInProgress } from './components/AuthInProgress.js';
import { EditorSettingsDialog } from './components/EditorSettingsDialog.js';
import { Colors } from './colors.js';
import { Help } from './components/Help.js';
import { loadHierarchicalGeminiMemory } from '../config/config.js';
import { LoadedSettings } from '../config/settings.js';
import { Tips } from './components/Tips.js';
import { ConsolePatcher } from './utils/ConsolePatcher.js';
import { registerCleanup } from '../utils/cleanup.js';
import { DetailedMessagesDisplay } from './components/DetailedMessagesDisplay.js';
import { TokenUsageDisplay, type TokenUsageInfo } from './components/TokenUsageDisplay.js';
import { tokenUsageEventManager, IDEConnectionStatus } from 'deepv-code-core';
import { HistoryItemDisplay } from './components/HistoryItemDisplay.js';
import { ContextSummaryDisplay } from './components/ContextSummaryDisplay.js';
import { IDEContextDetailDisplay } from './components/IDEContextDetailDisplay.js';
import { ReasoningDisplay } from './components/ReasoningDisplay.js';
import { useHistory } from './hooks/useHistoryManager.js';
import { useSessionRestore, useSessionAutoSave } from './hooks/useSessionRestore.js';
import process from 'node:process';
import {
  getErrorMessage,
  type Config,
  getAllGeminiMdFilenames,
  ApprovalMode,
  isEditorAvailable,
  EditorType,
  FlashFallbackEvent,
  logFlashFallback,
  AuthType,
  type OpenFiles,
  ideContext,
  addMCPStatusChangeListener,
  removeMCPStatusChangeListener,
} from 'deepv-code-core';
import { validateAuthMethod } from '../config/auth.js';
import { useLogger } from './hooks/useLogger.js';
import { StreamingContext } from './contexts/StreamingContext.js';
import {
  SessionStatsProvider,
  useSessionStats,
} from './contexts/SessionContext.js';
import { useGitBranchName } from './hooks/useGitBranchName.js';
import { useFocus } from './hooks/useFocus.js';
import { useBracketedPaste } from './hooks/useBracketedPaste.js';
import { useTextBuffer } from './components/shared/text-buffer.js';
import { useVimMode, VimModeProvider } from './contexts/VimModeContext.js';
import { KeypressProvider } from './contexts/KeypressContext.js';
import { useVim } from './hooks/vim.js';
import { useSmallWindowOptimization } from './hooks/useSmallWindowOptimization.js';
import * as fs from 'fs';
import { UpdateNotification } from './components/UpdateNotification.js';
import {
  isProQuotaExceededError,
  isGenericQuotaExceededError,
  isDeepXQuotaError,
  getDeepXQuotaErrorMessage,
  UserTierId,
} from 'deepv-code-core';
import { checkForUpdates } from './utils/updateCheck.js';
import ansiEscapes from 'ansi-escapes';
import { OverflowProvider } from './contexts/OverflowContext.js';
import { ShowMoreLines } from './components/ShowMoreLines.js';
import { PaginatedDebugConsole } from './components/PaginatedDebugConsole.js';
import { ScrollingDebugConsole } from './components/ScrollingDebugConsole.js';
import { PrivacyNotice } from './privacy/PrivacyNotice.js';
import { appEvents, AppEvent } from '../utils/events.js';
import { AudioNotification } from '../utils/audioNotification.js';

const CTRL_EXIT_PROMPT_DURATION_MS = 1000;

/**
 * 检测是否是IDEA/IntelliJ环境
 */
const detectIDEAEnvironment = (): boolean => {
  return !!(
    process.env.TERMINAL_EMULATOR && (
      process.env.TERMINAL_EMULATOR.includes('JetBrains') ||
      process.env.TERMINAL_EMULATOR.includes('IntelliJ') ||
      process.env.TERMINAL_EMULATOR.includes('IDEA')
    ) ||
    // 检测IDEA相关的环境变量
    process.env.IDEA_INITIAL_DIRECTORY ||
    process.env.JETBRAINS_IDE ||
    // 检测通过特定的Terminal设置
    (process.env.TERM_PROGRAM && process.env.TERM_PROGRAM.includes('jetbrains'))
  );
};

/**
 * Cross-platform clear screen function that properly clears scroll buffer on Windows
 * 特别优化了IDEA环境下的兼容性
 */
const clearScreenWithScrollBuffer = (stdout: NodeJS.WriteStream) => {
  const isIDEAEnv = detectIDEAEnvironment();

  if (isIDEAEnv) {
    // IDEA环境特殊处理：使用更温和的清屏方式，避免光标位置错乱
    stdout.write(ansiEscapes.clearScreen); // 只清屏，不重置
    stdout.write(ansiEscapes.cursorTo(0, 0)); // 移动光标到顶部
    // 不使用滚动缓冲区清理，避免IDEA终端的兼容性问题
  } else if (process.platform === 'win32') {
    // On Windows, use full reset to properly clear screen and scroll buffer
    stdout.write('\x1Bc'); // Full reset
    stdout.write(ansiEscapes.clearScreen);
    stdout.write(ansiEscapes.cursorTo(0, 0));
  } else {
    // On Unix-like systems, clear screen + scroll buffer + move cursor to top
    stdout.write('\x1B[2J\x1B[3J\x1B[H');
  }
};

interface AppProps {
  config: Config;
  settings: LoadedSettings;
  startupWarnings?: string[];
  version: string;
  promptExtensions?: any[]; // PromptExtension[] - imported from prompt-extensions
}

export const AppWrapper = (props: AppProps) => {
  // 初始化音频通知设置
  AudioNotification.initializeFromSettings(props.settings.merged);

  return (
    <SessionStatsProvider>
      <VimModeProvider settings={props.settings}>
        <KeypressProvider
          config={props.config}
        >
          <App {...props} />
        </KeypressProvider>
      </VimModeProvider>
    </SessionStatsProvider>
  );
};

const App = ({ config, settings, startupWarnings = [], version, promptExtensions = [] }: AppProps) => {
  const isFocused = useFocus();
  useBracketedPaste();

  // Token usage tracking
  const [lastTokenUsage, setLastTokenUsage] = useState<TokenUsageInfo | null>(null);
  const [estimatedInputTokens, setEstimatedInputTokens] = useState<number | undefined>(undefined);

  // Credits accumulation tracking for current turn/session
  const [cumulativeCredits, setCumulativeCredits] = useState<number>(0);

  // Callback to update token usage from API responses
  const handleTokenUsageUpdate = useCallback((tokenUsage: any) => {
    if (tokenUsage) {
      const currentCredits = tokenUsage.credits_usage || 0;

      // 累加credits到当前回合总计
      setCumulativeCredits(prev => prev + currentCredits);

      setLastTokenUsage({
        cache_creation_input_tokens: tokenUsage.cache_creation_input_tokens || 0,
        cache_read_input_tokens: tokenUsage.cache_read_input_tokens || 0,
        input_tokens: tokenUsage.input_token_count || tokenUsage.input_tokens || 0,
        output_tokens: tokenUsage.output_token_count || tokenUsage.output_tokens || 0,
        credits_usage: currentCredits, // 单次请求的credits
        model: config.getModel(),
        timestamp: Date.now(),
      });
    }
  }, [config]);

  // 监听token使用事件
  useEffect(() => {
    const handleTokenUpdate = (tokenData: any) => {
      handleTokenUsageUpdate(tokenData);
    };

    tokenUsageEventManager.onTokenUsage(handleTokenUpdate);

    return () => {
      tokenUsageEventManager.offTokenUsage(handleTokenUpdate);
    };
  }, [handleTokenUsageUpdate]);

  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const { stdout } = useStdout();
  const nightly = version.includes('nightly');

  // 飞书服务器端口状态
  const [feishuServerPort, setFeishuServerPort] = useState<number | undefined>(undefined);

  // 监听飞书服务器事件
  useEffect(() => {
    const handleFeishuServerStarted = (port: number) => {
      setFeishuServerPort(port);
    };

    const handleFeishuServerStopped = () => {
      setFeishuServerPort(undefined);
    };

    appEvents.on(AppEvent.FeishuServerStarted, handleFeishuServerStarted);
    appEvents.on(AppEvent.FeishuServerStopped, handleFeishuServerStopped);

    return () => {
      appEvents.off(AppEvent.FeishuServerStarted, handleFeishuServerStarted);
      appEvents.off(AppEvent.FeishuServerStopped, handleFeishuServerStopped);
    };
  }, []);

  // 监听模型变化事件
  useEffect(() => {
    const handleModelChanged = (newModel: string) => {
      setCurrentModel(newModel);
    };

    appEvents.on(AppEvent.ModelChanged, handleModelChanged);

    return () => {
      appEvents.off(AppEvent.ModelChanged, handleModelChanged);
    };
  }, []);

  // MCP服务器状态变化时强制重新渲染
  const [mcpStatusUpdateTrigger, setMcpStatusUpdateTrigger] = useState(0);

  useEffect(() => {
    const handleMCPStatusChange = () => {
      // 触发重新渲染以更新MCP服务器计数
      setMcpStatusUpdateTrigger(prev => prev + 1);
    };

    addMCPStatusChangeListener(handleMCPStatusChange);

    return () => {
      removeMCPStatusChangeListener(handleMCPStatusChange);
    };
  }, []);

  // MCP tools are now discovered during Config.initialize() via setImmediate()
  // We removed the duplicate discovery call here to avoid redundant initialization
  // The tools will be available shortly after app startup
  // Monitor status changes to detect when tools become available
  useEffect(() => {
    // This effect just monitors MCP status changes, actual discovery happens in Config
    if (config.getDebugMode()) {
      console.log('[MCP] Config initialized, MCP tools discovery in progress');
    }
  }, [config]);

  useEffect(() => {
    checkForUpdates().then(setUpdateMessage);
  }, []);

  const { history, addItem, clearItems, loadHistory } = useHistory();
  const {
    consoleMessages,
    handleNewMessage,
    clearConsoleMessages: clearConsoleMessagesState,
  } = useConsoleMessages();

  // Session restoration
  useSessionRestore({ config, loadHistory });


  useEffect(() => {
    const consolePatcher = new ConsolePatcher({
      onNewMessage: handleNewMessage,
      debugMode: config.getDebugMode(),
    });
    consolePatcher.patch();
    registerCleanup(consolePatcher.cleanup);
  }, [handleNewMessage, config]);

  const { stats: sessionStats } = useSessionStats();
  const [staticNeedsRefresh, setStaticNeedsRefresh] = useState(false);
  const [staticKey, setStaticKey] = useState(0);

  // 🎯 小窗口优化 - 根据窗口大小调整渲染策略
  const smallWindowConfig = useSmallWindowOptimization();

  const refreshStatic = useCallback(() => {
    // 🎯 小窗口优化 - 在极小窗口下减少清屏操作
    if (smallWindowConfig.sizeLevel !== 'tiny') {
      clearScreenWithScrollBuffer(stdout);
    }
    setStaticKey((prev) => prev + 1);
  }, [setStaticKey, stdout, smallWindowConfig.sizeLevel]);

  // 🚀 防抖优化：避免频繁的 refreshStatic 调用导致重复渲染
  const debouncedRefreshStatic = useCallback(() => {
    const timeoutId = setTimeout(() => {
      refreshStatic();
    }, 50); // 50ms 防抖延迟，平衡响应性和性能
    return () => clearTimeout(timeoutId);
  }, [refreshStatic]);

  const [geminiMdFileCount, setGeminiMdFileCount] = useState<number>(0);
  const [debugMessage, setDebugMessage] = useState<string>('');
  const [showHelp, setShowHelp] = useState<boolean>(false);

  const [themeError, setThemeError] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [footerHeight, setFooterHeight] = useState<number>(0);
  const [corgiMode, setCorgiMode] = useState(false);
  const [currentModel, setCurrentModel] = useState(config.getModel());
  const [shellModeActive, setShellModeActive] = useState(false);
  const [helpModeActive, setHelpModeActive] = useState(false);
  const [planModeActive, setPlanModeActive] = useState(config.getPlanModeActive());
  const [showErrorDetails, setShowErrorDetails] = useState<boolean>(false);
  const [showToolDescriptions, setShowToolDescriptions] =
    useState<boolean>(false);
  const [showIDEContextDetail, setShowIDEContextDetail] =
    useState<boolean>(false);
  const [ctrlCPressedOnce, setCtrlCPressedOnce] = useState(false);
  const [quittingMessages, setQuittingMessages] = useState<
    HistoryItem[] | null
  >(null);
  const ctrlCTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [ctrlDPressedOnce, setCtrlDPressedOnce] = useState(false);
  const ctrlDTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [constrainHeight, setConstrainHeight] = useState<boolean>(true);
  const [ideConnectionStatus, setIdeConnectionStatus] = useState<IDEConnectionStatus>(
    IDEConnectionStatus.Disconnected
  );
  const [showPrivacyNotice, setShowPrivacyNotice] = useState<boolean>(false);
  const [modelSwitchedFromQuotaError, setModelSwitchedFromQuotaError] =
    useState<boolean>(false);
  const [userTier, setUserTier] = useState<UserTierId | undefined>(undefined);
  const [openFiles, setOpenFiles] = useState<OpenFiles | undefined>();
  const [logoShows, setLogoShows] = useState<boolean>(true);
  const [refineResult, setRefineResult] = useState<{
    original: string; // 完整原文（用于再次润色）
    refined: string; // 完整润色结果（用于发送给 AI）
    displayOriginal: string; // 显示用原文（可能被截断）
    displayRefined: string; // 显示用润色结果（可能被截断）
    omittedPlaceholder?: string; // 省略提示的占位符
    omittedLines?: number; // 省略的行数
    options: Record<string, any>;
  } | null>(null);
  const [refineLoading, setRefineLoading] = useState<boolean>(false);
  const [queuedPrompts, setQueuedPrompts] = useState<string[]>([]);
  const [queuePaused, setQueuePaused] = useState<boolean>(false); // 队列暂停标志
  const [queueEditMode, setQueueEditMode] = useState<boolean>(false); // 队列编辑模式
  const [queueEditIndex, setQueueEditIndex] = useState<number>(0); // 当前编辑的队列索引

  // 调试：监听 refineResult 变化
  useEffect(() => {
    console.log('[App] refineResult 状态变化:', refineResult ? '有值' : 'null', refineResult ? { originalLength: refineResult.original.length, refinedLength: refineResult.refined.length } : null);
  }, [refineResult]);

  /**
   * 渲染带有黄色省略提示的文本
   * 只有省略提示部分显示为黄色，其他文字保持原色
   */
  const renderTextWithHighlightedOmission = (text: string, placeholder?: string, omittedLines?: number) => {
    if (!placeholder || !text.includes(placeholder)) {
      // 没有省略提示，直接渲染原文
      return <Text wrap="wrap" italic>{text}</Text>;
    }

    // 分割文本，将占位符替换为实际的省略提示
    const parts = text.split(placeholder);
    const omittedNotice = tp('text_truncator.omitted_lines', {
      count: omittedLines || 0,
    });

    return (
      <Text wrap="wrap" italic>
        {parts[0]}
        <Text color={Colors.AccentYellow}>{omittedNotice}</Text>
        {parts[1]}
      </Text>
    );
  };

  // 监听Plan模式变化
  useEffect(() => {
    const intervalId = setInterval(() => {
      const currentPlanMode = config.getPlanModeActive();
      if (currentPlanMode !== planModeActive) {
        setPlanModeActive(currentPlanMode);
      }
    }, 100); // 每100ms检查一次

    return () => clearInterval(intervalId);
  }, [config, planModeActive]);

  useEffect(() => {
    const unsubscribe = ideContext.subscribeToOpenFiles(setOpenFiles);
    // Set the initial value
    setOpenFiles(ideContext.getOpenFilesContext());
    return unsubscribe;
  }, []);

  useEffect(() => {
    const openDebugConsole = () => {
      setShowErrorDetails(true);
      setConstrainHeight(false); // Make sure the user sees the full message.
    };
    appEvents.on(AppEvent.OpenDebugConsole, openDebugConsole);

    const logErrorHandler = (errorMessage: unknown) => {
      handleNewMessage({
        type: 'error',
        content: String(errorMessage),
        count: 1,
      });
    };
    appEvents.on(AppEvent.LogError, logErrorHandler);

    return () => {
      appEvents.off(AppEvent.OpenDebugConsole, openDebugConsole);
      appEvents.off(AppEvent.LogError, logErrorHandler);
    };
  }, [handleNewMessage]);

  const openPrivacyNotice = useCallback(() => {
    setShowPrivacyNotice(true);
  }, []);
  const initialPromptSubmitted = useRef(false);

  const errorCount = useMemo(
    () =>
      consoleMessages
        .filter((msg) => msg.type === 'error')
        .reduce((total, msg) => total + msg.count, 0),
    [consoleMessages],
  );

  const {
    isThemeDialogOpen,
    openThemeDialog,
    handleThemeSelect,
    handleThemeHighlight,
  } = useThemeCommand(settings, setThemeError, addItem);

  const {
    isModelDialogOpen,
    openModelDialog,
    handleModelSelect,
    handleModelHighlight,
  } = useModelCommand(settings, config, setModelError, addItem);

  const {
    isAuthDialogOpen,
    openAuthDialog,
    handleAuthSelect,
    isAuthenticating,
    isPreparingEnvironment,
    cancelAuthentication,
  } = useAuthCommand(settings, setAuthError, config, setCurrentModel);

  const {
    isLoginDialogOpen,
    openLoginDialog,
    handleLoginSelect,
    isAuthenticating: isLoginAuthenticating,
    cancelAuthentication: cancelLoginAuthentication,
  } = useLoginCommand(settings, setLoginError, config, setCurrentModel);

  // BUG修复: 避免在初始化时显示认证错误，只在用户主动选择后验证
  // 修复策略: 移除自动验证逻辑，让用户在选择时才进行验证
  // 影响范围: packages/cli/src/ui/App.tsx:230-238
  // 修复日期: 2025-01-08
  // 注释掉自动验证逻辑，避免在应用启动时显示"Invalid auth method selected"错误
  // useEffect(() => {
  //   if (settings.merged.selectedAuthType) {
  //     const error = validateAuthMethod(settings.merged.selectedAuthType);
  //     if (error) {
  //       setAuthError(error);
  //       openAuthDialog();
  //     }
  //   }
  // }, [settings.merged.selectedAuthType, openAuthDialog, setAuthError]);

  // Sync user tier from config when authentication changes
  useEffect(() => {
    // Only sync when not currently authenticating
    if (!isAuthenticating) {
      setUserTier(config.getGeminiClient()?.getUserTier());
    }
  }, [config, isAuthenticating]);

  // Monitor IDE connection status
  useEffect(() => {
    const updateIdeStatus = () => {
      const ideClient = config.getIdeClient();
      if (ideClient) {
        const connectionInfo = ideClient.getConnectionStatus();
        setIdeConnectionStatus(connectionInfo.status);
      } else {
        setIdeConnectionStatus(IDEConnectionStatus.Disconnected);
      }
    };

    // Initial status check
    updateIdeStatus();

    // Set up polling to check IDE connection status
    const intervalId = setInterval(updateIdeStatus, 5000); // Check every 5 seconds

    return () => clearInterval(intervalId);
  }, [config]);

  const {
    isEditorDialogOpen,
    openEditorDialog,
    handleEditorSelect,
    exitEditorDialog,
  } = useEditorSettings(settings, setEditorError, addItem);

  const toggleCorgiMode = useCallback(() => {
    setCorgiMode((prev) => !prev);
  }, []);

  const performMemoryRefresh = useCallback(async () => {
    addItem(
      {
        type: MessageType.INFO,
        text: 'Refreshing hierarchical memory (DEEPV.md or other context files)...',
      },
      Date.now(),
    );
    try {
      const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(
        process.cwd(),
        config.getDebugMode(),
        config.getFileService(),
        settings.merged,
        config.getExtensionContextFilePaths(),
        config.getFileFilteringOptions(),
      );

      config.setUserMemory(memoryContent);
      config.setGeminiMdFileCount(fileCount);
      setGeminiMdFileCount(fileCount);

      addItem(
        {
          type: MessageType.INFO,
          text: `Memory refreshed successfully. ${memoryContent.length > 0 ? `Loaded ${memoryContent.length} characters from ${fileCount} file(s).` : 'No memory content found.'}`,
        },
        Date.now(),
      );
      if (config.getDebugMode()) {
        console.log(
          `[DEBUG] Refreshed memory content in config: ${memoryContent.substring(0, 200)}...`,
        );
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      addItem(
        {
          type: MessageType.ERROR,
          text: `Error refreshing memory: ${errorMessage}`,
        },
        Date.now(),
      );
      console.error('Error refreshing memory:', error);
    }
  }, [config, addItem, settings.merged]);

  // Watch for model changes (e.g., from Flash fallback)
  // Model state is now updated via ModelChanged events
  // Initial model setup on component mount
  useEffect(() => {
    const initialModel = config.getModel();
    if (initialModel !== currentModel) {
      setCurrentModel(initialModel);
    }
  }, []); // Only run once on mount

  // Set up Flash fallback handler
  useEffect(() => {
    const flashFallbackHandler = async (
      currentModel: string,
      fallbackModel: string,
      error?: unknown,
    ): Promise<boolean> => {
      let message: string;

      if (
        config.getContentGeneratorConfig().authType ===
        AuthType.USE_CHEETH_OA
      ) {
        // Use actual user tier if available; otherwise, default to FREE tier behavior (safe default)
        const isPaidTier =
          userTier === UserTierId.LEGACY || userTier === UserTierId.STANDARD;

        // 🆕 优先检查DeepX服务端的配额错误
        if (error && isDeepXQuotaError(error)) {
          const deepxMessage = getDeepXQuotaErrorMessage(error);
          message = deepxMessage || `🚫 服务不可用
💡 请联系管理员检查账户配置`;
        // Check if this is a Pro quota exceeded error
        } else if (error && isProQuotaExceededError(error)) {
          if (isPaidTier) {
            message = `⚡ You have reached your daily ${currentModel} quota limit.
⚡ Automatically switching from ${currentModel} to ${fallbackModel} for the remainder of this session.
⚡ To continue accessing the ${currentModel} model today, consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`;
          } else {
            message = `⚡ You have reached your daily ${currentModel} quota limit.
⚡ Automatically switching from ${currentModel} to ${fallbackModel} for the remainder of this session.
⚡ To increase your limits, upgrade to a Gemini Code Assist Standard or Enterprise plan with higher limits at https://goo.gle/set-up-gemini-code-assist
⚡ Or you can utilize a Gemini API Key. See: https://goo.gle/gemini-cli-docs-auth#gemini-api-key
⚡ You can switch authentication methods by typing /auth`;
          }
        } else if (error && isGenericQuotaExceededError(error)) {
          if (isPaidTier) {
            message = `⚡ You have reached your daily quota limit.
⚡ Automatically switching from ${currentModel} to ${fallbackModel} for the remainder of this session.
⚡ To continue accessing the ${currentModel} model today, consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`;
          } else {
            message = `⚡ You have reached your daily quota limit.
⚡ Automatically switching from ${currentModel} to ${fallbackModel} for the remainder of this session.
⚡ To increase your limits, upgrade to a Gemini Code Assist Standard or Enterprise plan with higher limits at https://goo.gle/set-up-gemini-code-assist
⚡ Or you can utilize a Gemini API Key. See: https://goo.gle/gemini-cli-docs-auth#gemini-api-key
⚡ You can switch authentication methods by typing /auth`;
          }
        } else {
          if (isPaidTier) {
            // Default fallback message for other cases (like consecutive 429s)
            message = `⚡ Automatically switching from ${currentModel} to ${fallbackModel} for faster responses for the remainder of this session.
⚡ Possible reasons for this are that you have received multiple consecutive capacity errors or you have reached your daily ${currentModel} quota limit
⚡ To continue accessing the ${currentModel} model today, consider using /auth to switch to using a paid API key from AI Studio at https://aistudio.google.com/apikey`;
          } else {
            // Default fallback message for other cases (like consecutive 429s)
            message = `⚡ Automatically switching from ${currentModel} to ${fallbackModel} for faster responses for the remainder of this session.
⚡ Possible reasons for this are that you have received multiple consecutive capacity errors or you have reached your daily ${currentModel} quota limit
⚡ To increase your limits, upgrade to a Gemini Code Assist Standard or Enterprise plan with higher limits at https://goo.gle/set-up-gemini-code-assist
⚡ Or you can utilize a Gemini API Key. See: https://goo.gle/gemini-cli-docs-auth#gemini-api-key
⚡ You can switch authentication methods by typing /auth`;
          }
        }

        // Add message to UI history
        addItem(
          {
            type: MessageType.INFO,
            text: message,
          },
          Date.now(),
        );

        // Set the flag to prevent tool continuation
        setModelSwitchedFromQuotaError(true);
        // Set global quota error flag to prevent Flash model calls
        config.setQuotaErrorOccurred(true);
      }

      // Switch model for future use but return false to stop current retry
      config.setModel(fallbackModel);
      logFlashFallback(
        config,
        new FlashFallbackEvent(config.getContentGeneratorConfig().authType!),
      );
      return false; // Don't continue with current prompt
    };

    config.setFlashFallbackHandler(flashFallbackHandler);
  }, [config, addItem, userTier]);

  // Terminal and UI setup
  const { rows: terminalHeight, columns: terminalWidth } = useTerminalSize();
  const { stdin, setRawMode } = useStdin();
  const isInitialMount = useRef(true);
  const completionSummaryCounterRef = useRef(0);

  const widthFraction = 0.9;
  const inputWidth = Math.max(
    20,
    Math.floor(terminalWidth * widthFraction) - 3,
  );
  const suggestionsWidth = Math.max(60, Math.floor(terminalWidth * 0.8));

  // Utility callbacks
  const isValidPath = useCallback((filePath: string): boolean => {
    try {
      return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    } catch (_e) {
      return false;
    }
  }, []);

  const getPreferredEditor = useCallback(() => {
    const editorType = settings.merged.preferredEditor;
    const isValidEditor = isEditorAvailable(editorType);
    if (!isValidEditor) {
      openEditorDialog();
      return;
    }
    return editorType as EditorType;
  }, [settings, openEditorDialog]);

  const onAuthError = useCallback(() => {
    setAuthError('reauth required');
    openAuthDialog();
  }, [openAuthDialog, setAuthError]);

  // Core hooks and processors
  const {
    vimEnabled: vimModeEnabled,
    vimMode,
    toggleVimEnabled,
  } = useVimMode();

  const {
    handleSlashCommand,
    slashCommands,
    pendingHistoryItems: pendingSlashCommandHistoryItems,
    commandContext,
  } = useSlashCommandProcessor(
    config,
    settings,
    addItem,
    clearItems,
    loadHistory,
    refreshStatic,
    setShowHelp,
    setDebugMessage,
    openThemeDialog,
    openModelDialog,
    openAuthDialog,
    openLoginDialog,
    openEditorDialog,
    toggleCorgiMode,
    setQuittingMessages,
    openPrivacyNotice,
    toggleVimEnabled,
  );

  const {
    streamingState,
    submitQuery,
    initError,
    pendingHistoryItems: pendingGeminiHistoryItems,
    thought,
    reasoning, // 🆕 接收 reasoning 状态
    hasContentStarted, // 🆕 接收内容开始标志
    isCreatingCheckpoint, // 🎯 接收checkpoint创建状态
    isExecutingTools, // 🎯 接收工具执行状态
  } = useGeminiStream(
    config.getGeminiClient(),
    history,
    addItem,
    setShowHelp,
    config,
    setDebugMessage,
    handleSlashCommand,
    shellModeActive,
    helpModeActive,
    getPreferredEditor,
    onAuthError,
    performMemoryRefresh,
    modelSwitchedFromQuotaError,
    setModelSwitchedFromQuotaError,
    setEstimatedInputTokens, // 传递预估token设置函数
    settings, // 传递设置对象以支持异步模型配置更新
  );

  const sendPromptImmediately = useCallback(
    (promptText: string, pauseQueueUntilResponse = false) => {
      if (logoShows) {
        clearScreenWithScrollBuffer(stdout);
        setLogoShows(false);
      }
      setCumulativeCredits(0);

      // 如果需要暂停队列直到响应开始
      if (pauseQueueUntilResponse) {
        setQueuePaused(true);
      }

      submitQuery(promptText);
    },
    [logoShows, stdout, submitQuery],
  );

  const queuePrompt = useCallback((promptText: string) => {
    setQueuedPrompts((prev) => [...prev, promptText]);
  }, []);

  const updateQueueItem = useCallback((index: number, newContent: string) => {
    const trimmed = newContent.trim();
    if (trimmed === '') {
      // 空内容 = 删除该项
      setQueuedPrompts((prev) => prev.filter((_, i) => i !== index));
      addItem(
        {
          type: MessageType.INFO,
          text: tp('input.queue.item.deleted', { position: index + 1 }),
        },
        Date.now(),
      );
      // 如果删除后队列为空，退出编辑模式
      setQueuedPrompts((prev) => {
        if (prev.length === 0) {
          setQueueEditMode(false);
          setQueuePaused(false);
        }
        return prev;
      });
    } else {
      // 更新内容
      setQueuedPrompts((prev) =>
        prev.map((item, i) => (i === index ? trimmed : item)),
      );
      addItem(
        {
          type: MessageType.INFO,
          text: tp('input.queue.item.updated', { position: index + 1 }),
        },
        Date.now(),
      );
    }
  }, [addItem, tp]);

  const handlePromptOrQueue = useCallback(
    (promptText: string, pauseQueueUntilResponse = false) => {
      const sanitizedPrompt = promptText.trim();
      if (!sanitizedPrompt) {
        return;
      }

      if (streamingState !== StreamingState.Idle) {
        queuePrompt(sanitizedPrompt);
        // 不再显示 "ℹ️Queued #X:" 的 INFO 消息，队列在输入框上方显示
        return;
      }

      sendPromptImmediately(sanitizedPrompt, pauseQueueUntilResponse);
    },
    [addItem, queuePrompt, queuedPrompts.length, sendPromptImmediately, streamingState],
  );

  // Session自动保存 - 监听streaming状态变化
  useSessionAutoSave(config, history, streamingState);

  // 队列自动执行逻辑
  useEffect(() => {
    if (
      streamingState !== StreamingState.Idle ||
      queuedPrompts.length === 0 ||
      refineResult ||
      queuePaused || // 队列暂停时不执行
      queueEditMode // 编辑模式下不执行
    ) {
      return;
    }

    const [nextPrompt] = queuedPrompts;
    if (!nextPrompt) {
      return;
    }

    setQueuedPrompts((prev) => prev.slice(1));
    sendPromptImmediately(nextPrompt);
  }, [queuedPrompts, refineResult, sendPromptImmediately, streamingState, queuePaused, queueEditMode]);

  // 当 AI 开始响应时，解除队列暂停
  useEffect(() => {
    if (queuePaused && streamingState !== StreamingState.Idle) {
      setQueuePaused(false);
    }
  }, [queuePaused, streamingState]);



  // Input handling
  const handleFinalSubmit = useCallback(
    async (submittedValue: string) => {
      const trimmedValue = submittedValue.trim();
      if (trimmedValue.length > 0) {
        // Clear screen once when user first submits message after logo is shown
        if (logoShows) {
          clearScreenWithScrollBuffer(stdout);
          setLogoShows(false);
        }

        // 首先检查是否是slash命令
        if (trimmedValue.startsWith('/')) {
          // 特殊处理：/queue clear 命令
          if (trimmedValue === '/queue clear') {
            if (queuedPrompts.length > 0) {
              const clearedCount = queuedPrompts.length;
              setQueuedPrompts([]);
              addItem(
                {
                  type: MessageType.INFO,
                  text: tp('input.queue.cleared', { count: clearedCount }),
                },
                Date.now(),
              );
            } else {
              addItem(
                {
                  type: MessageType.INFO,
                  text: t('input.queue.empty'),
                },
                Date.now(),
              );
            }
            return;
          }

          // 如果是润色命令，显示 loading 状态
          const isRefineCommand = trimmedValue.startsWith('/refine');
          if (isRefineCommand) {
            setRefineLoading(true);
          }

          try {
            const slashCommandResult = await handleSlashCommand(trimmedValue);
            if (slashCommandResult !== false) {
              // 检查是否是 /help-ask 命令，激活 help 模式
              if (trimmedValue.trim() === '/help-ask') {
                setHelpModeActive(true);
                return;
              }

            if (slashCommandResult.type === 'handled') {
              // Slash命令已处理，不需要继续
              return;
            } else if (slashCommandResult.type === 'submit_prompt') {
              // Slash命令返回需要提交的内容
              handlePromptOrQueue(slashCommandResult.content);
              return;
            } else if (slashCommandResult.type === 'schedule_tool') {
              // Slash命令要求执行工具，这里可以扩展处理
              return;
            } else if (slashCommandResult.type === 'refine_result') {
              // 润色结果，显示确认界面
              console.log('[App] 收到 refine_result，设置 refineResult 状态');

              // 计算截断阈值
              const maxRowsSent = getDefaultMaxRows('sent', terminalHeight);
              const maxRowsRefined = getDefaultMaxRows('refined', terminalHeight);

              // 截断原文（发送场景：更严格）
              const truncatedOriginal = truncateText(slashCommandResult.original, {
                maxRows: maxRowsSent,
                terminalWidth: terminalWidth,
              });

              // 截断润色结果（Refine 场景：更宽松）
              const truncatedRefined = truncateText(slashCommandResult.refined, {
                maxRows: maxRowsRefined,
                terminalWidth: terminalWidth,
              });

              setRefineResult({
                original: slashCommandResult.original, // 完整原文
                refined: slashCommandResult.refined, // 完整润色结果
                displayOriginal: truncatedOriginal.displayText, // 显示用原文
                displayRefined: truncatedRefined.displayText, // 显示用润色结果
                omittedPlaceholder: truncatedRefined.omittedPlaceholder, // 省略提示占位符
                omittedLines: truncatedRefined.omittedLines, // 省略的行数
                options: slashCommandResult.options,
              });
              return;
            }
            }
          } finally {
            // 润色完成，隐藏 loading 状态
            if (isRefineCommand) {
              setRefineLoading(false);
            }
          }
          // 如果slashCommandResult为false，说明不是有效的slash命令，继续正常处理
        }

        handlePromptOrQueue(trimmedValue);
      }
    },
    [handlePromptOrQueue, logoShows, stdout, handleSlashCommand],
  );

  const buffer = useTextBuffer({
    initialText: '',
    viewport: { height: 50, width: inputWidth }, // Increased from 10 to 50 to support large pastes
    stdin,
    setRawMode,
    isValidPath,
    shellModeActive,
  });

  const { handleInput: vimHandleInput } = useVim(buffer, handleFinalSubmit);
  const pendingHistoryItems = [...pendingSlashCommandHistoryItems];
  pendingHistoryItems.push(...pendingGeminiHistoryItems);

  const { elapsedTime, currentLoadingPhrase, estimatedInputTokens: loadingEstimatedTokens } =
    useLoadingIndicator(streamingState, estimatedInputTokens);

  // When transitioning from Responding to Idle, capture the elapsed time for printing
  const lastElapsedTimeBeforeIdleRef = useRef<number>(0);
  useEffect(() => {
    if (streamingState === StreamingState.Responding) {
      lastElapsedTimeBeforeIdleRef.current = elapsedTime;
    }
  }, [elapsedTime, streamingState]);

  const { shouldShowSummary, completionElapsedTime } = useTaskCompletionSummary(
    streamingState,
    lastElapsedTimeBeforeIdleRef.current
  );

  // Track completion summary counter for unique keys
  useEffect(() => {
    if (shouldShowSummary) {
      completionSummaryCounterRef.current += 1;
    }
  }, [shouldShowSummary]);

  const showAutoAcceptIndicator = useAutoAcceptIndicator({ config });

  const handleExit = useCallback(
    (
      pressedOnce: boolean,
      setPressedOnce: (value: boolean) => void,
      timerRef: React.MutableRefObject<NodeJS.Timeout | null>,
    ) => {
      if (pressedOnce) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        // Directly invoke the central command handler.
        handleSlashCommand('/quit');
      } else {
        setPressedOnce(true);
        timerRef.current = setTimeout(() => {
          setPressedOnce(false);
          timerRef.current = null;
        }, CTRL_EXIT_PROMPT_DURATION_MS);
      }
    },
    [handleSlashCommand],
  );

  useInput((input: string, key: InkKeyType) => {
    // 🔍 App级别按键调试（仅在DEBUG模式下启用）
    // if (key.ctrl || input === '\r' || input === '\n') {
    //   console.log('🌍 [App级别] 按键拦截:', {
    //     input: JSON.stringify(input),
    //     ctrl: key.ctrl,
    //     shift: key.shift,
    //     meta: key.meta
    //   });
    // }

    // 检测IDEA环境下的替代取消键
    const isIDEATerminal = detectIDEAEnvironment();
    const isCancelKey = key.escape ||
                       (isIDEATerminal && key.ctrl && input === 'q') ||
                       (process.platform === 'darwin' && key.meta && input === 'q');

    // 处理队列编辑模式
    if (queueEditMode) {
      if (key.return) {
        // Enter: 保存编辑
        const newContent = buffer.text;
        updateQueueItem(queueEditIndex, newContent);
        setQueueEditMode(false);
        setQueuePaused(false);
        buffer.setText('');
        return;
      } else if (isCancelKey) {
        // Esc: 取消编辑
        setQueueEditMode(false);
        setQueuePaused(false);
        buffer.setText('');
        return;
      } else if (key.ctrl && key.upArrow) {
        // Ctrl+↑: 保存当前并切换到下一条
        const currentContent = buffer.text;
        const originalContent = queuedPrompts[queueEditIndex];

        // 只有内容改变时才更新
        if (currentContent.trim() !== originalContent) {
          updateQueueItem(queueEditIndex, currentContent);
        }

        // 切换到下一条（需要在更新后重新获取队列长度）
        setQueuedPrompts((currentQueue) => {
          if (currentQueue.length === 0) {
            // 队列已空，退出编辑模式
            setQueueEditMode(false);
            setQueuePaused(false);
            buffer.setText('');
            return currentQueue;
          }

          const nextIndex = (queueEditIndex + 1) % currentQueue.length;
          setQueueEditIndex(nextIndex);
          buffer.setText(currentQueue[nextIndex] || '');
          return currentQueue;
        });
        return;
      }
      // 其他按键继续正常的输入处理
    } else {
      // 非编辑模式下，Ctrl+↑ 进入队列编辑模式
      if (key.ctrl && key.upArrow && queuedPrompts.length > 0) {
        setQueueEditMode(true);
        setQueuePaused(true); // 暂停队列执行
        setQueueEditIndex(0);
        buffer.setText(queuedPrompts[0]);
        return;
      }
    }

    // 处理润色结果的确认
    if (refineResult) {
      console.log('[App useInput] refineResult存在，处理按键:', { input, return: key.return });
      if (key.return) {
        // 回车：发送润色后的文本给 AI
        console.log('[App useInput] 按回车，发送润色后的文本给 AI');
        const refinedText = refineResult.refined;
        setRefineResult(null);
        buffer.setText('');
        // 润色发送后暂停队列，直到 AI 开始响应
        handlePromptOrQueue(refinedText, true);
        return;
      } else if (input.toLowerCase() === 'r') {
        // R：再次润色
        const originalText = refineResult.original;
        setRefineResult(null);
        buffer.setText('');
        setRefineLoading(true);

        // 异步处理润色命令
        (async () => {
          try {
            const slashCommandResult = await handleSlashCommand(`/refine ${originalText}`);
            if (slashCommandResult !== false && slashCommandResult.type === 'refine_result') {
              // 计算截断阈值
              const maxRowsSent = getDefaultMaxRows('sent', terminalHeight);
              const maxRowsRefined = getDefaultMaxRows('refined', terminalHeight);

              // 截断原文（发送场景：更严格）
              const truncatedOriginal = truncateText(slashCommandResult.original, {
                maxRows: maxRowsSent,
                terminalWidth: terminalWidth,
              });

              // 截断润色结果（Refine 场景：更宽松）
              const truncatedRefined = truncateText(slashCommandResult.refined, {
                maxRows: maxRowsRefined,
                terminalWidth: terminalWidth,
              });

              setRefineResult({
                original: slashCommandResult.original, // 完整原文
                refined: slashCommandResult.refined, // 完整润色结果
                displayOriginal: truncatedOriginal.displayText, // 显示用原文
                displayRefined: truncatedRefined.displayText, // 显示用润色结果
                omittedPlaceholder: truncatedRefined.omittedPlaceholder, // 省略提示占位符
                omittedLines: truncatedRefined.omittedLines, // 省略的行数
                options: slashCommandResult.options,
              });
            }
          } catch (_error) {
            // 错误已经由 handleSlashCommand 处理
          } finally {
            setRefineLoading(false);
          }
        })();
        return;
      } else if (isCancelKey) {
        // Esc：取消润色
        setRefineResult(null);
        buffer.setText('');
        return;
      }
    }

    // 处理取消键（主要用于非流响应状态下的取消操作）
    if (isCancelKey) {
      // 如果帮助面板正在显示，按 ESC 关闭它
      if (showHelp) {
        setShowHelp(false);
        return; // 阻止其他处理
      }
      // 这里可以添加其他需要取消的操作，比如退出确认对话框等
      // 流响应的取消由useGeminiStream处理
      // console.log('🌍 [App级别] 检测到取消键');
    }

    let enteringConstrainHeightMode = false;
    if (!constrainHeight) {
      // Automatically re-enter constrain height mode if the user types
      // anything. When constrainHeight==false, the user will experience
      // significant flickering so it is best to disable it immediately when
      // the user starts interacting with the app.
      enteringConstrainHeightMode = true;
      setConstrainHeight(true);
    }

    if (key.ctrl && input === 'o') {
      // Toggle small console panel open/closed
      setShowErrorDetails((prev) => !prev);
    } else if (key.ctrl && input === 's') {
      // Toggle between small and large panel (only when open)
      if (showErrorDetails) {
        // If already open, toggle between constrained and full height
        setConstrainHeight((prev) => !prev);
      }
    } else if (key.ctrl && input === 't') {
      const newValue = !showToolDescriptions;
      setShowToolDescriptions(newValue);

      const mcpServers = config.getMcpServers();
      if (Object.keys(mcpServers || {}).length > 0) {
        handleSlashCommand(newValue ? '/mcp desc' : '/mcp nodesc');
      }
    } else if (key.ctrl && input === 'e' && ideContext) {
      setShowIDEContextDetail((prev) => !prev);
    } else if (key.ctrl && (input === 'c' || input === 'C')) {
      handleExit(ctrlCPressedOnce, setCtrlCPressedOnce, ctrlCTimerRef);
    } else if (key.ctrl && (input === 'd' || input === 'D')) {
      if (buffer.text.length > 0) {
        // Do nothing if there is text in the input.
        return;
      }
      handleExit(ctrlDPressedOnce, setCtrlDPressedOnce, ctrlDTimerRef);
    }
  });

  useEffect(() => {
    if (config) {
      setGeminiMdFileCount(config.getGeminiMdFileCount());
    }
  }, [config]);

  const logger = useLogger();
  const [userMessages, setUserMessages] = useState<string[]>([]);

  useEffect(() => {
    const fetchUserMessages = async () => {
      const pastMessagesRaw = (await logger?.getPreviousUserMessages()) || []; // Newest first

      const currentSessionUserMessages = history
        .filter(
          (item): item is HistoryItem & { type: 'user'; text: string } =>
            item.type === 'user' &&
            typeof item.text === 'string' &&
            item.text.trim() !== '',
        )
        .map((item) => item.text)
        .reverse(); // Newest first, to match pastMessagesRaw sorting

      // Combine, with current session messages being more recent
      const combinedMessages = [
        ...currentSessionUserMessages,
        ...pastMessagesRaw,
      ];

      // Deduplicate consecutive identical messages from the combined list (still newest first)
      const deduplicatedMessages: string[] = [];
      if (combinedMessages.length > 0) {
        deduplicatedMessages.push(combinedMessages[0]); // Add the newest one unconditionally
        for (let i = 1; i < combinedMessages.length; i++) {
          if (combinedMessages[i] !== combinedMessages[i - 1]) {
            deduplicatedMessages.push(combinedMessages[i]);
          }
        }
      }
      // Reverse to oldest first for useInputHistory
      setUserMessages(deduplicatedMessages.reverse());
    };
    fetchUserMessages();
  }, [history, logger]);

  const shouldRenderInputPrompt = !refineResult && !initError;

  const handleClearScreen = useCallback(() => {
    clearItems();
    clearConsoleMessagesState();
    clearScreenWithScrollBuffer(stdout);
    refreshStatic();
  }, [clearItems, clearConsoleMessagesState, stdout, refreshStatic]);

  const mainControlsRef = useRef<DOMElement>(null);
  const pendingHistoryItemRef = useRef<DOMElement>(null);

  useEffect(() => {
    if (mainControlsRef.current) {
      const fullFooterMeasurement = measureElement(mainControlsRef.current);
      setFooterHeight(fullFooterMeasurement.height);
    }
  }, [terminalHeight, consoleMessages, showErrorDetails]);

  const staticExtraHeight = /* margins and padding */ 3;
  const availableTerminalHeight = useMemo(
    () => terminalHeight - footerHeight - staticExtraHeight,
    [terminalHeight, footerHeight],
  );

  // Linus fix: 移动变量定义到useMemo之前，避免使用未定义变量的错误
  const mainAreaWidth = Math.floor(terminalWidth * 0.9);

  // 🔧 优化：根据终端大小智能调整最大高度
  // - 小窗口（≤30 行）：使用 60% 可用高度，避免撑破布局
  // - 中窗口（31-50 行）：使用 80% 可用高度
  // - 大窗口（>50 行）：使用 terminalHeight * 4（保持原逻辑）
  const staticAreaMaxItemHeight = useMemo(() => {
    if (terminalHeight <= 30) {
      // 小窗口：保守策略，使用 60% 可用高度
      return Math.max(Math.floor(availableTerminalHeight * 0.6), 10);
    } else if (terminalHeight <= 50) {
      // 中窗口：适度策略，使用 80% 可用高度
      return Math.max(Math.floor(availableTerminalHeight * 0.8), 20);
    } else {
      // 大窗口：保持原逻辑，允许更多内容
      return Math.max(terminalHeight * 4, 100);
    }
  }, [terminalHeight, availableTerminalHeight]);

  // Linus fix: 将useMemo移到组件顶层，避免在JSX属性中使用hooks导致的"fewer hooks"错误
  const staticItems = useMemo(() => {
    const items = [
      <Box flexDirection="column" key="header">
        {!settings.merged.hideBanner && logoShows && (
          <WelcomeScreen
            config={config}
            version={version}
          />
        )}
      </Box>
    ];

    // Linus fix: 显示完整历史，移除虚拟化复杂性
    // 现代终端和计算机完全可以处理几百条消息的渲染

    // 添加所有历史项，使用staticKey确保/chat resume后强制重新渲染
    items.push(...history.map((h) => (
      <HistoryItemDisplay
        terminalWidth={mainAreaWidth}
        availableTerminalHeight={staticAreaMaxItemHeight}
        key={`${staticKey}-${h.id}`} // 使用 staticKey 和 item ID 确保稳定的组件复用
        item={h}
        isPending={false}
        config={config}
      />
    )));

    // Add task completion summary to static area when it should be shown
    // The hook manages the display duration to prevent overlap with queued prompts
    if (shouldShowSummary && completionElapsedTime > 0) {
      items.push(
        <TaskCompletionSummary
          key={`completion-${completionSummaryCounterRef.current}`}
          elapsedTime={completionElapsedTime}
          isVisible={true}
        />
      );
    }

    return items;
  }, [history, mainAreaWidth, staticAreaMaxItemHeight, staticKey, terminalWidth, settings.merged.hideBanner, settings.merged.hideTips, config, shouldShowSummary, completionElapsedTime, completionSummaryCounterRef]); // 🚀 保留关键依赖：terminalWidth 对响应式布局重要

  useEffect(() => {
    // skip refreshing Static during first mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // 🎯 小窗口优化 - 使用自适应防抖延迟
    const debounceMs = smallWindowConfig.refreshDebounceMs;
    const handler = setTimeout(() => {
      setStaticNeedsRefresh(false);
      refreshStatic();
    }, debounceMs);

    return () => {
      clearTimeout(handler);
    };
  }, [terminalWidth, terminalHeight, refreshStatic, smallWindowConfig.refreshDebounceMs]);

  useEffect(() => {
    if (streamingState === StreamingState.Idle && staticNeedsRefresh) {
      setStaticNeedsRefresh(false);
      // 🚀 使用防抖版本避免频繁刷新
      const cleanup = debouncedRefreshStatic();
      return cleanup;
    }
  }, [streamingState, debouncedRefreshStatic, staticNeedsRefresh]);

  // Linus fix: 移除频繁刷新，Ink的Static组件会自动处理新内容
  // 原问题：用户消息不立即显示
  // 错误方案：每次新消息都清空终端重绘
  // 正确方案：让Ink自然处理，只在staticKey变化时重绘

  const filteredConsoleMessages = useMemo(() => {
    if (config.getDebugMode()) {
      return consoleMessages;
    }
    return consoleMessages.filter((msg) => msg.type !== 'debug');
  }, [consoleMessages, config]);

  const branchName = useGitBranchName(config.getTargetDir());

  const contextFileNames = useMemo(() => {
    const fromSettings = settings.merged.contextFileName;
    if (fromSettings) {
      return Array.isArray(fromSettings) ? fromSettings : [fromSettings];
    }
    return getAllGeminiMdFilenames();
  }, [settings.merged.contextFileName]);

  const initialPrompt = useMemo(() => config.getQuestion(), [config]);
  const geminiClient = config.getGeminiClient();
  const queuedPromptPreview = useMemo(() => {
    if (queuedPrompts.length === 0) {
      return '';
    }
    const normalized = queuedPrompts[0].replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return '';
    }
    return normalized.length > 80 ? `${normalized.slice(0, 80)}...` : normalized;
  }, [queuedPrompts]);

  useEffect(() => {
    if (
      initialPrompt &&
      !initialPromptSubmitted.current &&
      !isAuthenticating &&
      !isPreparingEnvironment &&
      !isAuthDialogOpen &&
      !isLoginDialogOpen &&
      !isThemeDialogOpen &&
      !isModelDialogOpen &&
      !isEditorDialogOpen &&
      !showPrivacyNotice &&
      geminiClient?.isInitialized?.()
    ) {
      sendPromptImmediately(initialPrompt);
      initialPromptSubmitted.current = true;
    }
  }, [
    initialPrompt,
    isAuthenticating,
    isPreparingEnvironment,
    isAuthDialogOpen,
    isLoginDialogOpen,
    isThemeDialogOpen,
    isModelDialogOpen,
    isEditorDialogOpen,
    showPrivacyNotice,
    geminiClient,
    sendPromptImmediately,
  ]);

  // Store quitting render content but don't return early to avoid hooks order issues
  const quittingRender = quittingMessages ? (
    <Box flexDirection="column" marginBottom={1}>
      {quittingMessages.map((item) => (
        <HistoryItemDisplay
          key={item.id}
          availableTerminalHeight={
            constrainHeight ? availableTerminalHeight : undefined
          }
          terminalWidth={terminalWidth}
          item={item}
          isPending={false}
          config={config}
        />
      ))}
    </Box>
  ) : null;
  const debugConsoleMaxHeight = Math.floor(Math.max(terminalHeight * 0.2, 5));
  const debugPanelPageSize = Math.floor(Math.max(terminalHeight * 0.6, 10)); // 60% of terminal height for paged mode
  // Calculate debug panel height based on constrainHeight state
  const debugPanelHeight = constrainHeight ? debugConsoleMaxHeight : debugPanelPageSize;
  const placeholder = planModeActive
    ? "  计划模式：可读取代码分析，禁止修改 (/plan off 退出)"
    : vimModeEnabled
      ? "  按 'i' 进入插入模式，按 'Esc' 进入普通模式。"
      : '  输入您的消息或 @文件路径';



  // Helper function to render debug panel with scrolling display
  const renderDebugPanel = () => {
    if (!showErrorDetails) {
      return null;
    }
    return (
      <Box flexDirection="column">
        <ScrollingDebugConsole
          messages={filteredConsoleMessages}
          height={debugPanelHeight}
          width={inputWidth}
        />
      </Box>
    );
  };

  // If quitting, render the quitting messages instead of the full UI
  if (quittingRender) {
    return quittingRender;
  }

  return (
    <StreamingContext.Provider value={streamingState}>
      <Box flexDirection="column" width="90%">
        {/* Move UpdateNotification outside Static so it can re-render when updateMessage changes */}
        {updateMessage && <UpdateNotification message={updateMessage} />}

        {/*
         * The Static component is an Ink intrinsic in which there can only be 1 per application.
         * Because of this restriction we're hacking it slightly by having a 'header' item here to
         * ensure that it's statically rendered.
         *
         * Background on the Static Item: Anything in the Static component is written a single time
         * to the console. Think of it like doing a console.log and then never using ANSI codes to
         * clear that content ever again. Effectively it has a moving frame that every time new static
         * content is set it'll flush content to the terminal and move the area which it's "clearing"
         * down a notch. Without Static the area which gets erased and redrawn continuously grows.
         */}
        <Static
          key={staticKey}
          items={staticItems}
        >
          {(item) => item}
        </Static>
        <OverflowProvider>
          <Box ref={pendingHistoryItemRef} flexDirection="column">
            {pendingHistoryItems.map((item, i) => (
              <HistoryItemDisplay
                key={i}
                availableTerminalHeight={
                  constrainHeight ? availableTerminalHeight : undefined
                }
                terminalWidth={mainAreaWidth}
                // TODO(taehykim): It seems like references to ids aren't necessary in
                // HistoryItemDisplay. Refactor later. Use a fake id for now.
                item={{ ...item, id: 0 }}
                isPending={true}
                config={config}
                isFocused={!isEditorDialogOpen}
              />
            ))}
            <ShowMoreLines constrainHeight={constrainHeight} />
          </Box>
        </OverflowProvider>

        {showHelp && <Help commands={slashCommands} />}

        {/* 🆕 显示思考过程框（在pending内容后，一旦开始内容就隐藏） */}
        {reasoning && !hasContentStarted && (
          <ReasoningDisplay
            reasoning={reasoning}
            terminalHeight={terminalHeight}
            terminalWidth={terminalWidth}
          />
        )}

        <Box flexDirection="column" ref={mainControlsRef}>
          {startupWarnings.length > 0 && (
            <Box
              borderStyle="round"
              borderColor={Colors.AccentYellow}
              paddingX={1}
              marginY={1}
              flexDirection="column"
            >
              {startupWarnings.map((warning, index) => (
                <Text key={index} color={Colors.AccentYellow}>
                  {warning}
                </Text>
              ))}
            </Box>
          )}

          {isThemeDialogOpen ? (
            <Box flexDirection="column">
              {themeError && (
                <Box marginBottom={1}>
                  <Text color={Colors.AccentRed}>{themeError}</Text>
                </Box>
              )}
              <ThemeDialog
                onSelect={handleThemeSelect}
                onHighlight={handleThemeHighlight}
                settings={settings}
                availableTerminalHeight={
                  constrainHeight
                    ? terminalHeight - staticExtraHeight
                    : undefined
                }
                terminalWidth={mainAreaWidth}
              />
            </Box>
          ) : isModelDialogOpen ? (
            <Box flexDirection="column">
              {modelError && (
                <Box marginBottom={1}>
                  <Text color={Colors.AccentRed}>{modelError}</Text>
                </Box>
              )}
              <ModelDialog
                onSelect={handleModelSelect}
                onHighlight={handleModelHighlight}
                settings={settings}
                config={config}
                availableTerminalHeight={
                  constrainHeight
                    ? terminalHeight - staticExtraHeight
                    : undefined
                }
                terminalWidth={mainAreaWidth}
              />
            </Box>
          ) : isAuthenticating ? (
            <>
              <AuthInProgress
                stage="auth"
                onTimeout={() => {
                  setAuthError('Authentication timed out. Please try again.');
                  cancelAuthentication();
                  openAuthDialog();
                }}
              />
            </>
          ) : isPreparingEnvironment ? (
            <>
              <AuthInProgress
                stage="environment"
                onTimeout={() => {
                  setAuthError('Environment preparation timed out. Please try again.');
                  cancelAuthentication();
                  openAuthDialog();
                }}
              />
            </>
          ) : isAuthDialogOpen ? (
            <Box flexDirection="column">
              <AuthDialog
                onSelect={handleAuthSelect}
                settings={settings}
                initialErrorMessage={authError}
              />
            </Box>
          ) : isLoginDialogOpen ? (
            <Box flexDirection="column">
              <LoginDialog
                onSelect={handleLoginSelect}
                settings={settings}
                initialErrorMessage={loginError}
              />
            </Box>
          ) : isEditorDialogOpen ? (
            <Box flexDirection="column">
              {editorError && (
                <Box marginBottom={1}>
                  <Text color={Colors.AccentRed}>{editorError}</Text>
                </Box>
              )}
              <EditorSettingsDialog
                onSelect={handleEditorSelect}
                settings={settings}
                onExit={exitEditorDialog}
              />
            </Box>
          ) : showPrivacyNotice ? (
            <PrivacyNotice
              onExit={() => setShowPrivacyNotice(false)}
              config={config}
            />
          ) : (
            <>
              {/* 🎯 Checkpoint创建中提示 */}
              {isCreatingCheckpoint && (
                <Box marginBottom={1}>
                  <Text color={Colors.AccentBlue}>🔄 {t('checkpoint.creating')}</Text>
                </Box>
              )}

              <LoadingIndicator
                thought={
                  streamingState === StreamingState.WaitingForConfirmation ||
                  config.getAccessibility()?.disableLoadingPhrases
                    ? undefined
                    : thought
                }
                currentLoadingPhrase={
                  streamingState === StreamingState.WaitingForConfirmation ||
                  config.getAccessibility()?.disableLoadingPhrases
                    ? undefined
                    : currentLoadingPhrase
                }
                elapsedTime={elapsedTime}
              />



              <Box
                marginTop={1}
                marginBottom={1}
                display="flex"
                justifyContent="space-between"
                width="100%"
              >
                <Box>
                  {process.env.GEMINI_SYSTEM_MD && (
                    <Text color={Colors.AccentRed}>|⌐■_■| </Text>
                  )}
                  {ctrlCPressedOnce ? (
                    <Text color={Colors.AccentYellow}>
                      {t('exit.confirm.ctrl.c')}
                    </Text>
                  ) : ctrlDPressedOnce ? (
                    <Text color={Colors.AccentYellow}>
                      {t('exit.confirm.ctrl.d')}
                    </Text>
                  ) : (
                    <ContextSummaryDisplay
                      openFiles={openFiles}
                      geminiMdFileCount={geminiMdFileCount}
                      contextFileNames={contextFileNames}
                      mcpServers={config.getMcpServers()}
                      blockedMcpServers={config.getBlockedMcpServers()}
                      showToolDescriptions={showToolDescriptions}
                    />
                  )}
                </Box>
                <Box>
                  {planModeActive && <PlanModeIndicator />}
                  {showAutoAcceptIndicator !== ApprovalMode.DEFAULT &&
                    !shellModeActive && !helpModeActive && !planModeActive && (
                      <AutoAcceptIndicator
                        approvalMode={showAutoAcceptIndicator}
                      />
                    )}
                  {shellModeActive && <ShellModeIndicator />}
                  {helpModeActive && <HelpModeIndicator />}
                </Box>
              </Box>
              {showIDEContextDetail && (
                <IDEContextDetailDisplay openFiles={openFiles} />
              )}

              {/* Token Usage Display - 显示在输入框上方 */}
              {lastTokenUsage && streamingState !== StreamingState.Responding && (
                <TokenUsageDisplay
                  tokenUsage={lastTokenUsage}
                  inputWidth={inputWidth}
                  cumulativeCredits={cumulativeCredits}
                />
              )}

              {/* 队列消息显示 - 简洁模式（无Queued标签） */}
              {queuedPrompts.length > 0 && !initError && (
                <Box marginY={1} flexDirection="column" gap={0}>
                  {queuedPrompts.map((prompt, index) => {
                    const preview = prompt.length > 60 ? `${prompt.slice(0, 60)}...` : prompt;
                    return (
                      <Text key={index} dimColor>
                        {index === 0 ? '↓' : ' '} {preview}
                      </Text>
                    );
                  })}
                  {queuedPrompts.length > 0 && (
                    <Text dimColor>
                      {t('input.queue.edit.hint')}
                    </Text>
                  )}
                </Box>
              )}

              {/* 队列编辑模式界面 */}
              {queueEditMode && (
                <Box marginY={1}>
                  <Text color={Colors.AccentBlue}>
                    🔄 {tp('input.queue.edit.mode', {
                      current: queueEditIndex + 1,
                      total: queuedPrompts.length
                    })} • {t('input.queue.edit.actions')}
                  </Text>
                </Box>
              )}

              {/* 润色 Loading 界面 */}
              {refineLoading && (
                <Box
                  flexDirection="column"
                  borderStyle="round"
                  borderColor={Colors.AccentBlue}
                  paddingX={1}
                  paddingY={1}
                  marginY={1}
                >
                  <Box>
                    <Text bold color={Colors.AccentBlue}>✨ {t('command.refine.loading.title')}</Text>
                  </Box>
                  <Box marginTop={1}>
                    <Text color={Colors.Gray}>{t('command.refine.loading.message')}</Text>
                  </Box>
                </Box>
              )}

              {/* 润色结果确认界面 */}
              {refineResult && !refineLoading && (
                <Box
                  flexDirection="column"
                  borderStyle="round"
                  borderColor={Colors.AccentGreen}
                  paddingX={1}
                  paddingY={1}
                  marginY={1}
                >
                  <Box marginBottom={1}>
                    <Text bold color={Colors.AccentGreen}>{t('command.refine.confirm.title')}</Text>
                  </Box>
                  <Box marginBottom={1}>
                    {renderTextWithHighlightedOmission(refineResult.displayRefined, refineResult.omittedPlaceholder, refineResult.omittedLines)}
                  </Box>
                  <Box>
                    <Text color={Colors.Gray}>{'─'.repeat(50)}</Text>
                  </Box>
                  <Box marginTop={1}>
                    <Text>
                      <Text bold color={Colors.AccentGreen}>{t('command.refine.confirm.hint.send')}</Text>
                      <Text color={Colors.Gray}>   |   </Text>
                      <Text bold color={Colors.AccentYellow}>{t('command.refine.confirm.hint.refine-again')}</Text>
                      <Text color={Colors.Gray}>   |   </Text>
                      <Text bold color={Colors.AccentRed}>{t('command.refine.confirm.hint.cancel')}</Text>
                    </Text>
                  </Box>
                </Box>
              )}

              {shouldRenderInputPrompt && (
                <InputPrompt
                  buffer={buffer}
                  inputWidth={inputWidth}
                  suggestionsWidth={suggestionsWidth}
                  onSubmit={handleFinalSubmit}
                  userMessages={userMessages}
                  onClearScreen={handleClearScreen}
                  openModelDialog={openModelDialog}
                  config={config}
                  slashCommands={slashCommands}
                  commandContext={commandContext}
                  shellModeActive={shellModeActive}
                  setShellModeActive={setShellModeActive}
                  helpModeActive={helpModeActive}
                  setHelpModeActive={setHelpModeActive}
                  focus={isFocused}
                  vimHandleInput={vimHandleInput}
                  placeholder={placeholder}
                  isModalOpen={isModelDialogOpen || isAuthDialogOpen || isThemeDialogOpen || isEditorDialogOpen}
                  isExecutingTools={isExecutingTools}
                  isBusy={streamingState !== StreamingState.Idle || queuedPrompts.length > 0}
                  isInSpecialMode={!!refineResult || queueEditMode}
                />
              )}
            </>
          )}

          {initError && streamingState !== StreamingState.Responding && (
            <Box
              borderStyle="round"
              borderColor={Colors.AccentRed}
              paddingX={1}
              marginBottom={1}
            >
              {history.find(
                (item) =>
                  item.type === 'error' && item.text?.includes(initError),
              )?.text ? (
                <Text color={Colors.AccentRed}>
                  {
                    history.find(
                      (item) =>
                        item.type === 'error' && item.text?.includes(initError),
                    )?.text
                  }
                </Text>
              ) : (
                <>
                  <Text color={Colors.AccentRed}>
                    初始化错误：{initError}
                  </Text>
                  <Text color={Colors.AccentRed}>
                    {' '}
                    请检查 API 密钥和配置。
                  </Text>
                </>
              )}
            </Box>
          )}
          {/* Debug Console - Fixed at bottom before Footer */}
          {renderDebugPanel()}
          <Footer
            model={currentModel}
            targetDir={config.getTargetDir()}
            debugMode={config.getDebugMode()}
            branchName={branchName}
            debugMessage={debugMessage}
            corgiMode={corgiMode}
            errorCount={errorCount}
            showErrorDetails={showErrorDetails}
            showMemoryUsage={
              config.getDebugMode() || config.getShowMemoryUsage()
            }
            promptTokenCount={sessionStats.lastPromptTokenCount}
            nightly={nightly}
            vimMode={vimModeEnabled ? vimMode : undefined}
            version={version}
            ideConnectionStatus={ideConnectionStatus}
            config={config}
            terminalWidth={terminalWidth}
          />
        </Box>
      </Box>
    </StreamingContext.Provider>
  );
};
