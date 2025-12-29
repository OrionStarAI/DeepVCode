/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode';
import { IDEServer } from './ide-server';
import { createLogger } from './utils/logger';

let ideServer: IDEServer;
let logger: vscode.OutputChannel;
let log: (message: string) => void = () => {};

export async function activate(context: vscode.ExtensionContext) {
  logger = vscode.window.createOutputChannel('DeepV Code IDE Companion');
  log = createLogger(context, logger);
  log('Extension activated');
  ideServer = new IDEServer(log);
  try {
    await ideServer.start(context);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Failed to start IDE server: ${message}`);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('deepv-code.runDeepVCode', () => {
      const deepvCmd = 'dvcode --ide-mode';
      const terminal = vscode.window.createTerminal(`DeepV Code`);
      terminal.show();
      terminal.sendText(deepvCmd);
    }),
  );
}

export async function deactivate(): Promise<void> {
  log('Extension deactivated');
  try {
    if (ideServer) {
      await ideServer.stop();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`Failed to stop IDE server during deactivation: ${message}`);
  } finally {
    if (logger) {
      logger.dispose();
    }
  }
}
