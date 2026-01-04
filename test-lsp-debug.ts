import { LSPManager } from './packages/core/src/lsp/index.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

async function main() {
  const projectRoot = process.cwd();
  console.log('Project Root:', projectRoot);
  const manager = new LSPManager(projectRoot);

  // Search without opening any file first, trigger probing
  console.log('\n--- Searching for "performAutoLintCheck" (should trigger probe) ---');
  const results = await manager.getWorkspaceSymbols('performAutoLintCheck');
  console.log('Search Results count:', results.flat().length);
  if (results.flat().length > 0) {
      console.log('Sample symbol:', results.flat()[0]);
  }

  await manager.shutdown();
}

main().catch(console.error);