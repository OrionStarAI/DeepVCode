/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Recursively resolves environment variable references in an object.
 * Supports ${VAR_NAME} syntax.
 */
export function resolveEnvVarsInObject(obj: any): any {
  if (typeof obj === 'string') {
    return resolveEnvVarsInString(obj);
  } else if (Array.isArray(obj)) {
    return obj.map((item) => resolveEnvVarsInObject(item));
  } else if (obj !== null && typeof obj === 'object') {
    const result: any = {};
    for (const key in obj) {
      result[key] = resolveEnvVarsInObject(obj[key]);
    }
    return result;
  }
  return obj;
}

function resolveEnvVarsInString(str: string): string {
  return str.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    return process.env[varName] || match;
  });
}
