/**
 * i18n Type definitions
 */

export interface Translations {
  common: {
    loading: string;
    ready: string;
    send: string;
    cancel: string;
    confirm: string;
    clear: string;
    search: string;
    read: string;
    success: string;
    failed: string;
    error: string;
    warning: string;
    info: string;
    close: string;
    save: string;
    delete: string;
    edit: string;
    copy: string;
    paste: string;
    cut: string;
    undo: string;
    redo: string;
    yes: string;
    no: string;
    ok: string;
    apply: string;
    reset: string;
    refresh: string;
    back: string;
    next: string;
    previous: string;
    continue: string;
    skip: string;
    finish: string;
  };

  welcome: {
    title: string;
    titleMain: string;
    titleSub: string;
    description: string;
    quickStart: string;
    analyzeFile: string;
    explainCode: string;
    refactorCode: string;
    generateTests: string;
    analyzeFilePrompt: string;
    explainCodePrompt: string;
    refactorCodePrompt: string;
    generateTestsPrompt: string;
    tip: string;
    tipContent: string;
  };

  session: {
    export: string;
    delete: string;
    rename: string;
    duplicate: string;
  };

  chat: {
    thinking: string;
    inputPlaceholder: string;
    sendHint: string;
    multilineHint: string;
    singlelineHint: string;
    toggleSingleLine: string;
    toggleMultiLine: string;
    sendMessage: string;
    clearInput: string;
    scrollToBottom: string;
    stopProcessing: string;
    cannotStop: string;
    sending: string;
    copyMessage: string;
    copied: string;
    regenerate: string;
    tokenUsage: string;
    editMessage: string;
    rollback: string;
    editPlaceholder: string;
    undoneFileHistory: string;
    fileChangesTitle: string;
    undoFileTooltip: string;
    acceptChanges: string;
    viewModifiedFiles: string;
    customProxyServer: string;
    binaryFileWarning: string;
    binaryFileWarningTitle: string;
    dragResizeTooltip: string;
    queue: {
      title: string;
      hint: string;
      drag: string;
      edit: string;
      remove: string;
    };
    editConfirm: {
      title: string;
      content: string;
      warning: string;
      confirm: string;
      cancel: string;
    };
  };

  fileStatus: {
    new: string;
    modified: string;
    deleted: string;
  };

  command: {
    refine: {
      button: {
        empty_text: string;
        tooltip: string;
      };
    };
  };

  plan: {
    mode: {
      label: string;
      off: string;
      activeTooltip: string;
      inactiveTooltip: string;
      indicator: string;
      blockedToolsMessage: string;
      focusOnDesign: string;
      availableToolsInfo: string;
      useHintPrefix: string;
      useHintCommand: string;
      useHintSuffix: string;
    };
  };

  messages: {
    user: string;
    assistant: string;
    system: string;
    toolExecution: string;
    toolCalls: string;
    successful: string;
    failed: string;
  };

  tools: {
    toolbox: string;
    quickActions: string;
    availableTools: string;
    executionHistory: string;
    confirmationRequired: string;
    executeOnce: string;
    executeOnceTooltip: string;
    alwaysAllowType: string;
    alwaysAllowTypeTooltip: string;
    enableYolo: string;
    enableYoloTooltip: string;
    yoloMode: string;
    yoloWarning: string;
    run: string;
    skip: string;
    expandDetails: string;
    collapseDetails: string;
    output: string;
    waitingForOutput: string;
    noParameters: string;
    more: string;
    unknownFile: string;
    noDiffContent: string;
    clickToViewDiff: string;
    viewInEditor: string;
    review: string;
    working: string;
    toolNames: {
      write_file: string;
      read_file: string;
      bash: string;
      terminal: string;
      web_search: string;
      grep: string;
      delete_file: string;
    };
    status: {
      executing: string;
      completed: string;
      failed: string;
      canceled: string;
      processing: string;
      scheduled: string;
      validating: string;
      awaiting_approval: string;
    };
  };

  confirmation: {
    title: string;
    riskLevel: string;
    estimatedTime: string;
    affectedFiles: string;
    showAdvanced: string;
    hideAdvanced: string;
    userNotes: string;
    userNotesPlaceholder: string;
    reversible: string;
    irreversible: string;
    escapeHint: string;
    confirmExecution: string;
    riskLevels: {
      low: string;
      medium: string;
      high: string;
    };
  };

  context: {
    title: string;
    currentFile: string;
    selectedText: string;
    cursorPosition: string;
    projectInfo: string;
    openFiles: string;
    noActiveFile: string;
    line: string;
    column: string;
    rootDirectory: string;
    language: string;
    gitBranch: string;
    moreFiles: string;
  };

  status: {
    processing: string;
    ready: string;
    messages: string;
    successRate: string;
    version: string;
  };

  app: {
    title: string;
    toggleSidebar: string;
    expandSidebar: string;
    collapseSidebar: string;
    cancelAllTools: string;
    projectSettings: string;
    projectSettingsDialog: string;
  };

  model: {
    selector: {
      title: string;
      selectModel: string;
      currentModel: string;
      changingModel: string;
    };
    categories: {
      claude: string;
      gemini: string;
      gpt: string;
      kimi: string;
      qwen: string;
      grok: string;
    };
    descriptions: {
      'claude-sonnet-4-1M': string;
      'claude-sonnet-4': string;
      'gemini-2.5-flash': string;
      'gemini-2.5-pro': string;
      'kimi-k2-0905': string;
      'gpt-5': string;
      'qwen3-max-preview': string;
      'grok-code-fast-1': string;
    };
  };

  errors: {
    generic: string;
    networkError: string;
    timeoutError: string;
    validationError: string;
    permissionError: string;
    fileNotFound: string;
    operationCanceled: string;
  };

  rules: {
    title: string;
    newRule: string;
    noRules: string;
    createHint: string;
    ruleTitle: string;
    ruleType: string;
    rulePriority: string;
    ruleDescription: string;
    ruleContent: string;
    fileExtensions: string;
    pathPatterns: string;
    languages: string;
    descriptionPlaceholder: string;
    contentPlaceholder: string;
    typeAlwaysApply: string;
    typeManualApply: string;
    typeContextAware: string;
    priorityHigh: string;
    priorityMedium: string;
    priorityLow: string;
    disabled: string;
    confirmDelete: string;
    confirmDeleteTitle: string;
    saveError: string;
    deleteError: string;
    newRuleTitle: string;
    newRuleContent: string;
    infoText: string;
  };

  versionHistory: {
    title: string;
    tooltip: string;
    showTimeline: string;
    revertPrevious: string;
    revertToVersion: string;
    currentVersion: string;
    noHistory: string;
    filesChanged: string;
    linesAdded: string;
    linesRemoved: string;
  };

  tokenUsage: {
    title: string;
    totalTokens: string;
    credits: string;
    creditsSuffix: string;
    input: string;
    output: string;
    cacheRead: string;
    cacheHit: string;
  };

  compression: {
    confirmTitle: string;
    confirmMessage: string;
    currentTokens: string;
    targetLimit: string;
    targetModel: string;
    confirmHint: string;
    cancel: string;
    confirmAndSwitch: string;
    inProgress: string;
  };

  reasoning: {
    title: string;
    expand: string;
    collapse: string;
    lineCount: string;
  };

  nanoBanana: {
    title: string;
    buttonTooltip: string;
    prompt: string;
    promptPlaceholder: string;
    aspectRatio: string;
    imageSize: string;
    referenceImage: string;
    pasteHint: string;
    uploadImage: string;
    removeReference: string;
    generate: string;
    generateAnother: string;
    uploading: string;
    generating: string;
    waitingForResult: string;
    estimatedTime: string;
    generationComplete: string;
    resultsHint: string;
    credits: string;
    openInBrowser: string;
    tryAgain: string;
    remaining: string;
    imageTooLarge: string;
    clickToView: string;
    error: {
      emptyPrompt: string;
      invalidImageType: string;
      imageTooLarge: string;
    };
  };

  pptGenerator: {
    title: string;
    buttonTooltip: string;
    topicLabel: string;  // PPT 主题
    topicPlaceholder: string;
    pageCountLabel: string;
    pages: string;
    customPages: string;
    customPagesPlaceholder: string;
    styleLabel: string;
    colorSchemeLabel: string;
    outlineLabel: string;
    outlinePlaceholder: string;
    outlineHint: string;
    optimizeButton: string;
    optimizing: string;
    optimizeTooltip: string;
    cancelGeneration: string;
    customStylePlaceholder: string;
    customColorPlaceholder: string;
    generateButton: string;
    generating: string;
    generatingHint: string;
    generateAnother: string;
    openEdit: string;
    tryAgain: string;
    style: {
      auto: string;
      business: string;
      flat: string;
      travel: string;
      advertising: string;
      anime: string;
      custom: string;
    };
    colorScheme: {
      auto: string;
      blue: string;
      green: string;
      red: string;
      purple: string;
      orange: string;
      dark: string;
      light: string;
      colorful: string;
      custom: string;
    };
    error: {
      topicRequired: string;
      outlineRequired: string;
      customStyleRequired: string;
      customColorRequired: string;
      generateFailed: string;
    };
    success: {
      generated: string;
      hint: string;
    };
  };

  atMention: {
    recentFiles: string;
    filesAndFolders: string;
    terminals: string;
    noRecentFiles: string;
    noTerminals: string;
    selectFile: string;
    selectTerminal: string;
    terminalOutput: string;
    loading: string;
    openContextMenu: string;
    expand: string;
    browse: string;
    expandTooltip: string;
    browseTooltip: string;
    filterPlaceholder: string;
    noMatches: string;
  };

  systemNotifications: {
    'loop.consecutive.tool.calls.title': string;
    'loop.consecutive.tool.calls.description': string;
    'loop.consecutive.tool.calls.reason': string;
    'loop.consecutive.tool.calls.action': string;
    'loop.chanting.identical.sentences.title': string;
    'loop.chanting.identical.sentences.description': string;
    'loop.chanting.identical.sentences.reason': string;
    'loop.chanting.identical.sentences.action': string;
    'loop.llm.detected.title': string;
    'loop.llm.detected.description': string;
    'loop.llm.detected.reason': string;
    'loop.llm.detected.action': string;
    'chat.compression.title': string;
    'chat.compression.description': string;
    'chat.compression.info': string;
  };

  mcp: {
    title: string;
    loading: string;
    discovering: string;
    noServers: string;
    noServersDesc: string;
    openSettings: string;
    status: {
      connected: string;
      connecting: string;
      disconnected: string;
      unknown: string;
    };
    discovery: {
      notStarted: string;
      discovering: string;
      completed: string;
    };
    tools: string;
    disabled: string;
    enableServer: string;
    disableServer: string;
    editConfig: string;
    settings: string;
  };

  settings: {
    title: string;
    close: string;
    tabs: {
      general: string;
      mcp: string;
      memory: string;
      more: string;
    };
    general: {
      yoloLabel: string;
      yoloDesc: string;
      modelLabel: string;
      modelDesc: string;
      autoModel: string;
      autoModelDesc: string;
      healthyUseLabel: string;
      healthyUseDesc: string;
    };
    memory: {
      title: string;
      description: string;
      none: string;
      refresh: string;
      refreshing: string;
    };
    more: {
      title: string;
      description: string;
      open: string;
    };
  };

  stats: {
    title: string;
    totalConsumption: string;
    totalTokens: string;
    modelStats: string;
    modelName: string;
    callCount: string;
    avgTokens: string;
    consumption: string;
    noData: string;
    // Tab switching
    sessionTab: string;
    creditsTab: string;
    tabHint: string;
    // Credits overview
    creditsOverviewTitle: string;
    localEstimate: string;
    viewDetails: string;
    totalQuota: string;
    usedCredits: string;
    remainingCredits: string;
    totalRequests: string;
    expiration: string;
    alwaysValid: string;
    activeQuotas: string;
    dailyUsage: string;
    estimateLabel: string;
    localDataHint: string;
    // States
    loading: string;
    loadError: string;
    retry: string;
    noPointsData: string;
  };

  // 🎯 后台任务相关
  backgroundTasks: {
    title: string;
    running: string;
    completed: string;
    failed: string;
    statusRunning: string;
    statusCompleted: string;
    statusFailed: string;
    statusCancelled: string;
    killTask: string;
    clearCompleted: string;
    closeTasksBar: string;
    viewTasks: string;
    moveToBackground: string;
    runningInBackground: string;
    noTasks: string;
    outputTitle: string;
  };

  healthy: {
    reminderTitle: string;
    reminderContent: string;
    reminderSuggestion: string;
    agentRunning: string;
    waiting: string;
    dismiss: string;
    countdown: string;
  };

  streamRecovery: {
    jitter: string;
    resuming: string;
  };
}

export type SupportedLocale = 'zh-CN' | 'en-US';

export interface LocaleConfig {
  code: SupportedLocale;
  name: string;
  flag: string;
  rtl?: boolean;
}
