/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content } from 'deepv-code-core';
import { HistoryItemWithoutId } from '../types.js';
import { Config, GitService, Logger } from 'deepv-code-core';
import { LoadedSettings } from '../../config/settings.js';
import { UseHistoryManagerReturn } from '../hooks/useHistoryManager.js';
import type { HistoryItem, ConsoleMessageItem } from '../types.js';
import { SessionStatsState } from '../contexts/SessionContext.js';
import type { Suggestion } from '../components/SuggestionsDisplay.js';
import { TokenUsageInfo } from '../components/TokenUsageDisplay.js';

// Interface for session metadata and display information
export interface SessionOption {
  sessionId: string;
  title: string;
  createdAt: string;
  lastActiveAt: string;
  messageCount: number;
  totalTokens: number;
  model?: string;
  hasCheckpoint: boolean;
  firstUserMessage?: string;
  lastAssistantMessage?: string;
}

// Grouped dependencies for clarity and easier mocking
export interface CommandContext {
  // Invocation properties for when commands are called.
  invocation?: {
    /** The raw, untrimmed input string from the user. */
    raw: string;
    /** The primary name of the command that was matched. */
    name: string;
    /** The arguments string that follows the command name. */
    args: string;
  };
  // Core services and configuration
  services: {
    // TODO(abhipatel12): Ensure that config is never null.
    config: Config | null;
    settings: LoadedSettings;
    git: GitService | undefined;
    logger: Logger;
  };
  // UI state and history management
  ui: {
    /** Adds a new item to the history display. */
    addItem: UseHistoryManagerReturn['addItem'];
    /** Clears all history items and the console screen. */
    clear: () => void;
    /**
     * Sets the transient debug message displayed in the application footer in debug mode.
     */
    setDebugMessage: (message: string) => void;
    /** The currently pending history item, if any. */
    pendingItem: HistoryItemWithoutId | null;
    /**
     * Sets a pending item in the history, which is useful for indicating
     * that a long-running operation is in progress.
     *
     * @param item The history item to display as pending, or `null` to clear.
     */
    setPendingItem: (item: HistoryItemWithoutId | null) => void;
    /**
     * Loads a new set of history items, replacing the current history.
     *
     * @param history The array of history items to load.
     */
    loadHistory: UseHistoryManagerReturn['loadHistory'];
    /** Toggles a special display mode. */
    toggleCorgiMode: () => void;
    toggleVimEnabled: () => Promise<boolean>;
    /** Current console/debug messages. */
    debugMessages?: ConsoleMessageItem[];
  };
  // Session-specific data
  session: {
    stats: SessionStatsState;
    cumulativeCredits: number;
    totalSessionCredits: number;
    lastTokenUsage?: TokenUsageInfo | null;
  };
}

/**
 * The return type for a command action that results in scheduling a tool call.
 */
export interface ToolActionReturn {
  type: 'tool';
  toolName: string;
  toolArgs: Record<string, unknown>;
}

/** The return type for a command action that results in the app quitting. */
export interface QuitActionReturn {
  type: 'quit';
  messages: HistoryItem[];
}

/**
 * The return type for a command action that results in a simple message
 * being displayed to the user.
 */
export interface MessageActionReturn {
  type: 'message';
  messageType: 'info' | 'error';
  content: string;
}

/**
 * The return type for a command action that needs to open a dialog.
 */
export interface OpenDialogActionReturn {
  type: 'dialog';
  dialog: 'help' | 'auth' | 'login' | 'theme' | 'editor' | 'privacy' | 'model' | 'customModelWizard' | 'settings-menu' | 'init-choice';
  metadata?: Record<string, unknown>;
}

/**
 * The return type for a command action that results in replacing
 * the entire conversation history.
 */
export interface LoadHistoryActionReturn {
  type: 'load_history';
  history: HistoryItemWithoutId[];
  clientHistory: Content[]; // The history for the generative client
}

/**
 * The return type for a command action that should immediately submit
 * content as a prompt to the Gemini model.
 */
export interface SubmitPromptActionReturn {
  type: 'submit_prompt';
  content: string;
  silent?: boolean; // 🎯 静默模式：不在 UI 上显示用户消息
}

/**
 * The return type for a command action that switches to a different session.
 */
export interface SwitchSessionActionReturn {
  type: 'switch_session';
  sessionId: string;
  history: HistoryItemWithoutId[];
  clientHistory: Content[]; // The history for the generative client
}

/**
 * The return type for refine command that shows result and waits for user confirmation.
 */
export interface RefineResultActionReturn {
  type: 'refine_result';
  original: string;
  refined: string;
  options: {
    tone: string;
    level: string;
    lang: string;
    keepFormat: boolean;
    keepCode: boolean;
    [key: string]: any;
  };
}

export type SlashCommandActionReturn =
  | ToolActionReturn
  | MessageActionReturn
  | QuitActionReturn
  | OpenDialogActionReturn
  | LoadHistoryActionReturn
  | SubmitPromptActionReturn
  | SwitchSessionActionReturn
  | RefineResultActionReturn
  | SelectSessionActionReturn;

/**
 * The return type for a command action that needs to open a session selection dialog.
 */
export interface SelectSessionActionReturn {
  type: 'select_session';
  sessions: SessionOption[];
}

export enum CommandKind {
  BUILT_IN = 'built-in',
  FILE = 'file',
  MCP_PROMPT = 'mcp-prompt',
  INLINE = 'inline',
  PLUGIN = 'plugin',
}

// The standardized contract for any command in the system.
export interface SlashCommand {
  name: string;
  altNames?: string[];
  description: string;

  kind: CommandKind;

  // The action to run. Optional for parent commands that only group sub-commands.
  action?: (
    context: CommandContext,
    args: string, // TODO: Remove args. CommandContext now contains the complete invocation.
  ) =>
    | void
    | SlashCommandActionReturn
    | Promise<void | SlashCommandActionReturn>;

  // Provides argument completion (e.g., completing a tag for `/chat resume <tag>`).
  completion?: (
    context: CommandContext,
    partialArg: string,
  ) => Promise<string[] | Suggestion[]>;

  subCommands?: SlashCommand[];

  // Whether the command should be hidden from the autocomplete list.
  hidden?: boolean;
}
