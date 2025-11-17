/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const EXTENSIONS_CONFIG_FILENAME = 'gemini-extension.json';
export const INSTALL_METADATA_FILENAME = '.dvcode-install-metadata.json';

export type JsonObject = Record<string, any>;

export function recursivelyHydrateStrings(
  obj: any,
  hydrator: (str: string) => string,
): any {
  if (typeof obj === 'string') {
    return hydrator(obj);
  } else if (Array.isArray(obj)) {
    return obj.map((item) => recursivelyHydrateStrings(item, hydrator));
  } else if (obj !== null && typeof obj === 'object') {
    const result: JsonObject = {};
    for (const key in obj) {
      result[key] = recursivelyHydrateStrings(obj[key], hydrator);
    }
    return result;
  }
  return obj;
}
