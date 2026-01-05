import { SessionManager } from 'deepv-code-core';
import { promises as fs } from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';

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
        execFile('explorer.exe', ['/select', filePath], (error) => {
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

export async function exportSessionToMarkdown(
  sessionId: string,
  projectRoot: string
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

  // Load session data
  const sessionManager = new SessionManager(projectRoot);
  let sessionData;
  try {
    sessionData = await sessionManager.loadSession(sessionId);
  } catch (error) {
    throw new Error(
      `Failed to load session ${sessionId}. ` +
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Validate session data integrity
  if (!sessionData) {
    throw new Error(`Session ${sessionId} not found or returned null.`);
  }

  if (!sessionData.history) {
    throw new Error(`Session ${sessionId} has no history. Session data may be corrupted.`);
  }

  if (sessionData.history.length === 0) {
    throw new Error(`Session ${sessionId} has empty history.`);
  }

  if (!sessionData.metadata) {
    console.warn(`Session ${sessionId} metadata is missing. Using defaults.`);
    sessionData.metadata = {
      title: sessionId,
      createdAt: new Date().toISOString(),
      model: 'Unknown',
    } as any;
  }

  const n = String.fromCharCode(10);
  let markdown = '# Session Log: ' + (sessionData.metadata.title || sessionId) + n + n;

  markdown += '- **Session ID:** ' + sessionId + n;
  markdown += '- **Date:** ' + new Date(sessionData.metadata.createdAt || new Date()).toLocaleString() + n;
  markdown += '- **Model:** ' + (sessionData.metadata.model || 'Unknown') + n + n;
  markdown += '---' + n + n;

  for (const item of sessionData.history) {
    if (item.type === 'user') {
      markdown += '### 👤 User' + n + n + (item.text || '') + n + n;
    } else if (item.type === 'gemini' || item.type === 'gemini_content') {
      markdown += '### 🤖 Assistant' + n + n + (item.text || '') + n + n;
    } else if (item.type === 'deepv') {
      markdown += '### 🤖 Assistant (System)' + n + n + (item.content || '') + n + n;
    } else if (item.type === 'tool_group') {
      markdown += '#### 🛠️ Tool Calls' + n + n;
      if (item.tools && Array.isArray(item.tools)) {
        for (const tool of item.tools) {
          markdown += '<details>' + n + '<summary>' + tool.name + ' (' + (tool.status || 'Success') + ')</summary>' + n + n;
          markdown += '**Arguments:**' + n + '```json' + n + JSON.stringify(tool.confirmationDetails?.args || {}, null, 2) + n + '```' + n + n;
          if (tool.resultDisplay) {
            markdown += '**Result:**' + n + (tool.resultDisplay.content || '') + n + n;
          }
          markdown += '</details>' + n + n;
        }
      }
    }
  }

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const fileName = 'session_export_' + sessionId.substring(0, 8) + '_' + timestamp + '.md';
  const exportPath = path.join(projectRoot, fileName);

  try {
    await fs.writeFile(exportPath, markdown, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to write session export file to ${exportPath}. ` +
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  await revealFile(exportPath);
  return exportPath;
}