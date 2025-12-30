/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChildProcess } from 'node:child_process';

export namespace LSPServer {
  export interface Info {
    id: string;
    displayName: string;
    extensions: string[];
    root: (file: string) => Promise<string>;
    spawn: (root: string) => Promise<{ process: ChildProcess }>;
  }
}

export namespace LSPClient {
  export interface Info {
    serverID: string;
    root: string;
    connection: any; // We'll use vscode-jsonrpc's MessageConnection
    capabilities: any;
  }
}
