/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ExtensionSetting {
  name: string;
  description: string;
  defaultValue?: string;
  required?: boolean;
}

export async function maybePromptForSettings(): Promise<string> {
  return '';
}

export function promptForSetting(
  setting: ExtensionSetting,
): Promise<string> {
  return Promise.resolve('');
}

export function getEnvContents(): Record<string, string> {
  return {};
}
