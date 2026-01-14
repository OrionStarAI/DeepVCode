/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import stripAnsi from 'strip-ansi';

/**
 * Strips ANSI escape codes from a string, normalizes newlines, and removes trailing whitespace from each line.
 * Useful for testing terminal output where padding might vary.
 */
export function sanitizeOutput(output: string | undefined): string {
  if (!output) return '';
  return stripAnsi(output)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
}
