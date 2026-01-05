import { promises as fs } from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { ConsoleMessageItem } from '../ui/types.js';

function revealFile(filePath: string) {
  const platform = process.platform;
  let command = '';

  if (platform === 'darwin') {
    command = 'open -R "' + filePath + '"';
  } else if (platform === 'win32') {
    command = 'explorer.exe /select,"' + filePath + '"';
  } else {
    command = 'xdg-open "' + path.dirname(filePath) + '"';
  }

  exec(command, () => {});
}

export async function exportDebugToMarkdown(
  debugMessages: ConsoleMessageItem[],
  projectRoot: string,
  sessionId: string
): Promise<string> {
  const n = String.fromCharCode(10);
  let markdown = '# Debug Log: ' + sessionId + n + n;
  markdown += '- **Date:** ' + new Date().toLocaleString() + n;
  markdown += '- **Platform:** ' + process.platform + n;
  markdown += '- **Architecture:** ' + process.arch + n + n;
  markdown += '---' + n + n;

  for (const msg of debugMessages) {
    const icon = msg.type === 'error' ? '❌ ' : msg.type === 'warn' ? '⚠️ ' : msg.type === 'debug' ? '🔍 ' : '📝 ';
    markdown += '### ' + icon + msg.type.toUpperCase() + ' (count: ' + msg.count + ')' + n + n;
    markdown += '```' + n + msg.content + n + '```' + n + n;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = 'debug_export_' + sessionId.substring(0, 8) + '_' + timestamp + '.md';
  const exportPath = path.join(projectRoot, fileName);

  await fs.writeFile(exportPath, markdown, 'utf-8');
  revealFile(exportPath);
  return exportPath;
}
