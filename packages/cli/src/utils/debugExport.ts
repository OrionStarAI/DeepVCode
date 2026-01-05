import { promises as fs } from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { ConsoleMessageItem } from '../ui/types.js';

function revealFile(filePath: string): Promise<void> {
  return new Promise((resolve) => {
    const platform = process.platform;

    try {
      if (platform === 'darwin') {
        execFile('open', ['-R', filePath], (error) => {
          if (error) {
            console.warn(`Unable to open file in Finder: ${error.message}`);
          }
          resolve();
        });
      } else if (platform === 'win32') {
        // Windows: use explorer.exe /select,"path\to\file"
        // The comma after /select is important for some Windows versions
        // and we ensure the path uses backslashes
        const winPath = path.win32.normalize(filePath);
        execFile('explorer.exe', [`/select,${winPath}`], (error) => {
          if (error) {
            console.warn(`Unable to open file in Explorer: ${error.message}`);
          }
          resolve();
        });
      } else {
        // Linux: use xdg-open with directory path
        execFile('xdg-open', [path.dirname(filePath)], (error) => {
          if (error) {
            console.warn(`Unable to open file browser: ${error.message}`);
          }
          resolve();
        });
      }
    } catch (error) {
      console.warn(`Error opening file browser: ${error instanceof Error ? error.message : String(error)}`);
      resolve();
    }
  });
}

export async function exportDebugToMarkdown(
  debugMessages: ConsoleMessageItem[],
  projectRoot: string,
  sessionId: string
): Promise<string> {
  // Check write permission before processing
  try {
    await fs.access(projectRoot, fs.constants.W_OK);
  } catch (error) {
    throw new Error(
      `No write permission for project root: ${projectRoot}. ` +
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Validate debug messages input
  if (!debugMessages || debugMessages.length === 0) {
    throw new Error('No debug messages to export.');
  }

  // Filter for errors and warnings only, validate each message item
  const validatedMessages = debugMessages.filter((msg) => {
    if (!msg || typeof msg !== 'object') {
      console.warn('Skipping invalid debug message item.');
      return false;
    }
    if (!msg.type || !msg.content) {
      console.warn(`Skipping debug message with missing type or content. Message:`, msg);
      return false;
    }
    // Only include errors and warnings, skip log and debug messages
    return msg.type === 'error' || msg.type === 'warn';
  });

  if (validatedMessages.length === 0) {
    throw new Error('NO_ERRORS_OR_WARNINGS');
  }

  const n = String.fromCharCode(10);
  let markdown = '# Debug Log: ' + sessionId + n + n;
  markdown += '- **Date:** ' + new Date().toLocaleString() + n;
  markdown += '- **Platform:** ' + process.platform + n;
  markdown += '- **Architecture:** ' + process.arch + n;
  markdown += '- **Total Messages:** ' + validatedMessages.length + n + n;
  markdown += '---' + n + n;

  for (const msg of validatedMessages) {
    const icon = msg.type === 'error' ? '❌ ' : msg.type === 'warn' ? '⚠️ ' : msg.type === 'debug' ? '🔍 ' : '📝 ';
    const count = msg.count || 1;
    markdown += '### ' + icon + msg.type.toUpperCase() + ' (count: ' + count + ')' + n + n;
    markdown += '```' + n + msg.content + n + '```' + n + n;
  }

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const fileName = 'debug_export_' + sessionId.substring(0, 8) + '_' + timestamp + '.md';
  const exportPath = path.resolve(projectRoot, fileName);

  try {
    await fs.writeFile(exportPath, markdown, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to write debug export file to ${exportPath}. ` +
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  await revealFile(exportPath);
  return exportPath;
}
