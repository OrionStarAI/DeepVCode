/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['scripts/tests/**/*.test.js'],
    setupFiles: ['scripts/tests/test-setup.ts'],
    // 性能优化：限制并发和资源使用
    pool: 'forks', // 使用 forks 池，比 threads 更稳定且内存隔离更好
    poolOptions: {
      forks: {
        maxForks: 2, // 最大并发进程数（可根据你的 CPU 核心数调整，建议 2-4）
        minForks: 1, // 最小进程数
      },
    },
    maxConcurrency: 5, // 每个进程内最大并发测试数
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});
