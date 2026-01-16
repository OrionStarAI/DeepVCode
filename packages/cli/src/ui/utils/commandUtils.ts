/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Checks if a query string potentially represents an '@' command.
 * It triggers if the query starts with '@' or contains '@' preceded by whitespace
 * and followed by a non-whitespace character.
 *
 * @param query The input query string.
 * @returns True if the query looks like an '@' command, false otherwise.
 */
export const isAtCommand = (query: string): boolean =>
  // Check if starts with @ OR has a space, then @
  query.startsWith('@') || /\s@/.test(query);

/**
 * Checks if a query string potentially represents an '/' command.
 * It triggers if the query starts with '/'
 *
 * @param query The input query string.
 * @returns True if the query looks like an '/' command, false otherwise.
 */
export const isSlashCommand = (query: string): boolean => query.startsWith('/');

/**
 * Checks if the current environment is WSL (Windows Subsystem for Linux)
 */
const isWSLEnvironment = (): boolean => {
  return !!(
    process.env.WSL_DISTRO_NAME ||
    process.env.WSL_INTEROP ||
    process.env.WSLENV ||
    (process.platform === 'linux' && process.env.WSLENV)
  );
};

/**
 * Copies text to clipboard on Windows using PowerShell Set-Clipboard
 * Uses Base64 encoding to properly handle Unicode characters (including Chinese)
 * @param text The text to copy to clipboard
 */
async function copyToClipboardWindows(text: string): Promise<void> {
  // Encode the text as Base64 to avoid encoding issues with Unicode characters
  const textBase64 = Buffer.from(text, 'utf8').toString('base64');

  // PowerShell script that decodes Base64 and sets clipboard
  // Using [System.Text.Encoding]::UTF8 to properly handle Unicode
  const script = `
$bytes = [System.Convert]::FromBase64String("${textBase64}")
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
Set-Clipboard -Value $text
`;

  // Encode the PowerShell script as UTF-16LE Base64 for -EncodedCommand
  const encoded = Buffer.from(script, 'utf16le').toString('base64');

  await execAsync(
    `powershell.exe -ExecutionPolicy Bypass -NoProfile -EncodedCommand ${encoded}`,
  );
}

/**
 * Copies text to clipboard on WSL using Windows PowerShell via interop
 * Uses Base64 encoding to properly handle Unicode characters (including Chinese)
 * @param text The text to copy to clipboard
 */
async function copyToClipboardWSL(text: string): Promise<void> {
  // Same approach as Windows - encode text as Base64
  const textBase64 = Buffer.from(text, 'utf8').toString('base64');

  const script = `
$bytes = [System.Convert]::FromBase64String("${textBase64}")
$text = [System.Text.Encoding]::UTF8.GetString($bytes)
Set-Clipboard -Value $text
`;

  // Encode the PowerShell script as UTF-16LE Base64 for -EncodedCommand
  const encoded = Buffer.from(script, 'utf16le').toString('base64');

  await execAsync(
    `powershell.exe -ExecutionPolicy Bypass -NoProfile -EncodedCommand ${encoded}`,
  );
}

//Copies a string snippet to the clipboard for different platforms
export const copyToClipboard = async (text: string): Promise<void> => {
  const run = (cmd: string, args: string[]) =>
    new Promise<void>((resolve, reject) => {
      const child = spawn(cmd, args);
      let stderr = '';
      child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) return resolve();
        const errorMsg = stderr.trim();
        reject(
          new Error(
            `'${cmd}' exited with code ${code}${errorMsg ? `: ${errorMsg}` : ''}`,
          ),
        );
      });
      child.stdin.on('error', reject);
      child.stdin.write(text);
      child.stdin.end();
    });

  // Handle WSL environment specially - use Windows PowerShell via interop
  if (isWSLEnvironment()) {
    return copyToClipboardWSL(text);
  }

  switch (process.platform) {
    case 'win32':
      // Use PowerShell Set-Clipboard with Base64 encoding to properly handle Unicode
      return copyToClipboardWindows(text);
    case 'darwin':
      return run('pbcopy', []);
    case 'linux':
      try {
        await run('xclip', ['-selection', 'clipboard']);
      } catch (primaryError) {
        try {
          // If xclip fails for any reason, try xsel as a fallback.
          await run('xsel', ['--clipboard', '--input']);
        } catch (fallbackError) {
          const primaryMsg =
            primaryError instanceof Error
              ? primaryError.message
              : String(primaryError);
          const fallbackMsg =
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError);
          throw new Error(
            `All copy commands failed. xclip: "${primaryMsg}", xsel: "${fallbackMsg}". Please ensure xclip or xsel is installed and configured.`,
          );
        }
      }
      return;
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
};
