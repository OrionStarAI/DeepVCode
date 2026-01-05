import { SessionManager } from 'deepv-code-core';
import { promises as fs } from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

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

export async function exportSessionToMarkdown(
  sessionId: string,
  projectRoot: string
): Promise<string> {
  const sessionManager = new SessionManager(projectRoot);
  const sessionData = await sessionManager.loadSession(sessionId);
  if (!sessionData || !sessionData.history) {
    throw new Error('Failed to load session history.');
  }

  const n = String.fromCharCode(10);
  let markdown = '# Session Log: ' + (sessionData.metadata.title || sessionId) + n + n;

  markdown += '- **Session ID:** ' + sessionId + n;
  markdown += '- **Date:** ' + new Date(sessionData.metadata.createdAt).toLocaleString() + n;
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

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = 'session_export_' + sessionId.substring(0, 8) + '_' + timestamp + '.md';
  const exportPath = path.join(projectRoot, fileName);

  await fs.writeFile(exportPath, markdown, 'utf-8');
  revealFile(exportPath);
  return exportPath;
}