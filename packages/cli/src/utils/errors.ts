/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export class FatalConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FatalConfigError';
  }
}

export const debugLogger = {
  log: (message: string) => console.log(message),
  error: (message: string) => console.error(message),
  warn: (message: string) => console.warn(message),
};
