/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)', 'config.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/cypress/**'],
    environment: 'jsdom',
    globals: true,
    reporters: ['default', 'junit'],
    silent: true,
    // 性能优化：限制并发和资源使用
    pool: 'forks', // 使用 forks 池，比 threads 更稳定且内存隔离更好
    poolOptions: {
      forks: {
        maxForks: 2, // 最大并发进程数（可根据你的 CPU 核心数调整，建议 2-4）
        minForks: 1, // 最小进程数
      },
    },
    maxConcurrency: 5, // 每个进程内最大并发测试数
    outputFile: {
      junit: 'junit.xml',
    },
    coverage: {
      enabled: false,
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*'],
      reporter: [
        ['text', { file: 'full-text-summary.txt' }],
        'html',
        'json',
        'lcov',
        'cobertura',
        ['json-summary', { outputFile: 'coverage-summary.json' }],
      ],
    },
  },
});
