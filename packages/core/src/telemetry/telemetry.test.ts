/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  initializeTelemetry,
  isTelemetrySdkInitialized,
} from './sdk.js';
import { Config } from '../config/config.js';

vi.mock('../config/config.js');

describe('telemetry (disabled status checks)', () => {
  let mockConfig: Config;

  beforeEach(() => {
    vi.resetAllMocks();

    mockConfig = new Config({
      sessionId: 'test-session-id',
      model: 'test-model',
      targetDir: '/test/dir',
      debugMode: false,
      cwd: '/test/dir',
    });
  });

  it('should mark telemetry as initialized without actually enabling it', () => {
    // 验证初始化函数是否正确设置了状态标志
    initializeTelemetry(mockConfig);
    expect(isTelemetrySdkInitialized()).toBe(true);
  });
});
