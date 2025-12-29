/**
 * Context Service - Manages VS Code context information
 */

import * as vscode from 'vscode';
import { ContextInfo } from '../types/messages';
import { Logger } from '../utils/logger';

export class ContextService {
  private listeners: ((context: ContextInfo) => void)[] = [];
  private currentContext: ContextInfo = {};
  private disposables: vscode.Disposable[] = [];

  constructor(private logger: Logger) {}

  async initialize() {
    this.logger.info('Initializing ContextService');

    // Subscribe to VS Code events
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.updateContext();
      }),
      
      vscode.window.onDidChangeTextEditorSelection(() => {
        this.updateContext();
      }),
      
      vscode.workspace.onDidOpenTextDocument(() => {
        this.updateContext();
      }),
      
      vscode.workspace.onDidCloseTextDocument(() => {
        this.updateContext();
      })
    );

    // Initialize current context
    this.updateContext();
  }

  getCurrentContext(): ContextInfo {
    return { ...this.currentContext };
  }

  onContextChange(listener: (context: ContextInfo) => void): vscode.Disposable {
    this.listeners.push(listener);
    
    // Send current context immediately
    listener(this.getCurrentContext());
    
    return {
      dispose: () => {
        const index = this.listeners.indexOf(listener);
        if (index > -1) {
          this.listeners.splice(index, 1);
        }
      }
    };
  }

  private updateContext() {
    const activeEditor = vscode.window.activeTextEditor;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    
    // Get selected text
    let selectedText: string | undefined;
    let cursorPosition: { line: number; character: number } | undefined;
    
    if (activeEditor) {
      if (!activeEditor.selection.isEmpty) {
        selectedText = activeEditor.document.getText(activeEditor.selection);
      }
      cursorPosition = {
        line: activeEditor.selection.active.line,
        character: activeEditor.selection.active.character
      };
    }

    // Get open files
    const openFiles = vscode.workspace.textDocuments
      .filter(doc => doc.uri.scheme === 'file')
      .map(doc => doc.fileName);

    // Detect project language
    const projectLanguage = this.detectProjectLanguage();

    // Get git branch if available
    const gitBranch = this.getGitBranch();

    const newContext: ContextInfo = {
      activeFile: activeEditor?.document.fileName,
      selectedText,
      cursorPosition,
      workspaceRoot,
      openFiles,
      projectLanguage,
      gitBranch
    };

    // Check if context has changed
    if (this.hasContextChanged(newContext)) {
      this.currentContext = newContext;
      this.notifyListeners();
    }
  }

  private hasContextChanged(newContext: ContextInfo): boolean {
    const current = this.currentContext;
    
    return (
      current.activeFile !== newContext.activeFile ||
      current.selectedText !== newContext.selectedText ||
      current.cursorPosition?.line !== newContext.cursorPosition?.line ||
      current.cursorPosition?.character !== newContext.cursorPosition?.character ||
      current.workspaceRoot !== newContext.workspaceRoot ||
      JSON.stringify(current.openFiles) !== JSON.stringify(newContext.openFiles) ||
      current.projectLanguage !== newContext.projectLanguage ||
      current.gitBranch !== newContext.gitBranch
    );
  }

  private notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.getCurrentContext());
      } catch (error) {
        this.logger.error('Error in context change listener', error instanceof Error ? error : undefined);
      }
    });
  }

  private detectProjectLanguage(): string | undefined {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceRoot) return undefined;


    // This is a simplified synchronous detection
    // In a real implementation, you might want to make this async
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      const languageId = activeEditor.document.languageId;
      return languageId;
    }

    return undefined;
  }

  private getGitBranch(): string | undefined {
    // This would require git extension API or running git command
    // For now, return undefined - can be implemented later
    return undefined;
  }

  async dispose() {
    this.logger.info('Disposing ContextService');
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
    this.listeners = [];
  }
}