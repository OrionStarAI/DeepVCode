/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';

export enum AppEvent {
  OpenDebugConsole = 'open-debug-console',
  LogError = 'log-error',
  FeishuServerStarted = 'feishu-server-started',
  FeishuServerStopped = 'feishu-server-stopped',
  AuthenticationSuccessful = 'authentication-successful',
  AuthenticationFailed = 'authentication-failed',
  AuthenticationRequired = 'authentication-required',
  UserLoggedOut = 'user-logged-out',
  TokensUpdated = 'tokens-updated',
  TokensCleared = 'tokens-cleared',
  ModelChanged = 'model-changed',
  CreditsConsumed = 'credits-consumed',
  ImagePollingStart = 'image-polling-start',
  ImagePollingProgress = 'image-polling-progress',
  ImagePollingEnd = 'image-polling-end',
}

export const appEvents = new EventEmitter();
