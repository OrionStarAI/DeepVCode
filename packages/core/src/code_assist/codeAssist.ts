/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType, ContentGenerator } from '../core/contentGenerator.js';
import { Config } from '../config/config.js';

export async function createCodeAssistContentGenerator(
  httpOptions: any,
  authType: AuthType,
  config: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  // Code Assist Content Generator is no longer supported
  // Only Cheeth OA authentication with Claude Proxy is supported
  throw new Error(
    'Code Assist Content Generator has been deprecated. Use Cheeth OA authentication with Claude Proxy instead.'
  );
}
