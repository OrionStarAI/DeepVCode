import { vi } from 'vitest';

/**
 * VS Code Extension Test Setup
 * Mocks VS Code API for testing extension services
 */

// Mock vscode module
vi.mock('vscode', () => ({
  window: {
    createOutputChannel: vi.fn(() => ({
      appendLine: vi.fn(),
      appendRaw: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    })),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showQuickPick: vi.fn(),
    createWebviewPanel: vi.fn(),
    registerTextEditorCommand: vi.fn(),
    registerCommand: vi.fn(),
    onDidChangeActiveTextEditor: {
      event: null,
    },
    createStatusBarItem: vi.fn(() => ({
      text: '',
      command: '',
      show: vi.fn(),
      hide: vi.fn(),
      dispose: vi.fn(),
    })),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn(),
      update: vi.fn(),
    })),
    onDidChangeConfiguration: {
      event: null,
    },
    workspaceFolders: undefined,
    onDidChangeWorkspaceFolders: {
      event: null,
    },
  },
  commands: {
    registerCommand: vi.fn(),
    executeCommand: vi.fn(),
  },
  Uri: {
    file: (p: string) => ({ fsPath: p }),
    joinPath: (uri: any, ...paths: string[]) => ({
      fsPath: uri.fsPath + '/' + paths.join('/'),
    }),
  },
  ViewColumn: {
    One: 1,
    Two: 2,
  },
  env: {
    appRoot: '/test/app/root',
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
  },
  EventEmitter: class EventEmitter {
    fire() {}
    dispose() {}
  },
  ExtensionMode: {
    Production: 1,
    Development: 2,
    Test: 3,
  },
}));

// Mock deepv-code-core module
vi.mock('deepv-code-core', () => ({
  getAllMCPServerToolCounts: vi.fn(() => ({})),
  getAllMCPServerToolNames: vi.fn(() => ({})),
  MCPServerStatus: {},
}));
