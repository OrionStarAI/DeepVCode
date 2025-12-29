/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const EXTENSIONS_CONFIG_FILENAME = 'gemini-extension.json';

export function createExtension({
  extensionsDir,
  name,
  version,
  contextFiles = [],
  contextFileName,
}: {
  extensionsDir: string;
  name: string;
  version: string;
  contextFiles?: string[];
  contextFileName?: string;
}): void {
  const extDir = path.join(extensionsDir, name);
  if (!fs.existsSync(extDir)) {
    fs.mkdirSync(extDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(extDir, EXTENSIONS_CONFIG_FILENAME),
    JSON.stringify({ name, version, contextFileName }),
  );

  for (const file of contextFiles) {
    const filePath = path.join(extDir, file);
    const fileDir = path.dirname(filePath);
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }
    fs.writeFileSync(filePath, 'context content');
  }

  if (contextFileName && !contextFiles.includes(contextFileName)) {
    fs.writeFileSync(path.join(extDir, contextFileName), 'context content');
  }
}
