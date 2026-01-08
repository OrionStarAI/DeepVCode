/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

/**
 * Checks if the current environment is WSL (Windows Subsystem for Linux)
 */
function isWSLEnvironment(): boolean {
  return !!(
    process.env.WSL_DISTRO_NAME ||
    process.env.WSL_INTEROP ||
    process.env.WSLENV ||
    (process.platform === 'linux' && process.env.WSLENV)
  );
}

/**
 * Checks if required clipboard utilities are available on Linux
 */
async function checkLinuxClipboardDependencies(): Promise<{
  hasXclip: boolean;
  hasXsel: boolean;
  hasImageMagick: boolean;
  hasBase64: boolean;
}> {
  const checks = {
    hasXclip: false,
    hasXsel: false,
    hasImageMagick: false,
    hasBase64: false,
  };

  try {
    await execAsync('which xclip');
    checks.hasXclip = true;
  } catch {
    // xclip not available
  }

  try {
    await execAsync('which xsel');
    checks.hasXsel = true;
  } catch {
    // xsel not available
  }

  try {
    await execAsync('which convert');
    checks.hasImageMagick = true;
  } catch {
    // ImageMagick not available
  }

  try {
    await execAsync('which base64');
    checks.hasBase64 = true;
  } catch {
    // base64 not available (very unlikely on modern Linux)
  }

  return checks;
}

/**
 * Converts WSL Linux path to Windows path for PowerShell access
 * @param linuxPath The Linux-style path in WSL
 * @returns Windows-style path that PowerShell can access
 */
function convertWSLPathToWindows(linuxPath: string): string {
  // Convert /mnt/c/... to C:\...
  if (linuxPath.startsWith('/mnt/')) {
    const match = linuxPath.match(/^\/mnt\/([a-z])\/(.*)$/);
    if (match) {
      const drive = match[1].toUpperCase();
      const windowsPath = match[2].replace(/\//g, '\\');
      return `${drive}:\\${windowsPath}`;
    }
  }

  // If it's already a Windows path or doesn't match WSL pattern, return as is
  return linuxPath.replace(/\//g, '\\');
}

/**
 * Checks if the system clipboard contains an image or image-related content
 * @returns true if clipboard contains an image or image URL/data
 */
export async function clipboardHasImage(): Promise<boolean> {
  try {
    if (process.platform === 'darwin') {
      return await clipboardHasImageMac();
    } else if (process.platform === 'win32') {
      return await clipboardHasImageWindows();
    } else if (isWSLEnvironment()) {
      return await clipboardHasImageWSL();
    } else if (process.platform === 'linux') {
      return await clipboardHasImageLinux();
    }
    return false;
  } catch (error) {
    console.error('剪贴板检测失败:', error);
    return false;
  }
}

// Import and re-export from pathUtils for consistency
import { CLIPBOARD_DIR as CLIPBOARD_DIR_CONST, isClipboardPath } from 'deepv-code-core';
export const CLIPBOARD_DIR = CLIPBOARD_DIR_CONST;
export { isClipboardPath };

/**
 * Checks Linux clipboard dependencies and provides installation instructions
 * @returns Object with dependency status and installation instructions
 */
export async function checkLinuxClipboardSupport(): Promise<{
  supported: boolean;
  missingDependencies: string[];
  installInstructions: string[];
}> {
  if (process.platform !== 'linux' || isWSLEnvironment()) {
    return {
      supported: true,
      missingDependencies: [],
      installInstructions: []
    };
  }

  const deps = await checkLinuxClipboardDependencies();
  const missing: string[] = [];
  const instructions: string[] = [];

  if (!deps.hasXclip && !deps.hasXsel) {
    missing.push('xclip 或 xsel');
    instructions.push('安装剪切板工具: sudo apt install xclip  # 或 sudo apt install xsel');
  }

  if (!deps.hasImageMagick) {
    missing.push('ImageMagick');
    instructions.push('安装图片处理工具: sudo apt install imagemagick');
  }

  return {
    supported: missing.length === 0,
    missingDependencies: missing,
    installInstructions: instructions
  };
}

/**
 * Checks if the system clipboard contains an image on macOS
 */
async function clipboardHasImageMac(): Promise<boolean> {
  try {
    // Use osascript to check clipboard type
    const { stdout } = await execAsync(
      `osascript -e 'clipboard info' 2>/dev/null | grep -qE "«class PNGf»|TIFF picture|JPEG picture|GIF picture|«class JPEG»|«class TIFF»" && echo "true" || echo "false"`,
      { shell: '/bin/bash' },
    );
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * Checks if the system clipboard contains an image on Windows
 * Uses Base64 encoded PowerShell commands to avoid file creation and quoting issues
 */
async function clipboardHasImageWindows(): Promise<boolean> {
  try {
    console.log('🔍 [Windows剪贴板] 开始检测');

    // Use Base64 encoded command to avoid all quoting issues - elegant and secure!
    const script = `Add-Type -AssemblyName System.Windows.Forms
if ([Windows.Forms.Clipboard]::ContainsImage()) {
    Write-Output "image"
} elseif ([Windows.Forms.Clipboard]::ContainsText()) {
    $text = [Windows.Forms.Clipboard]::GetText()
    if ($text -match "^data:image/[^;]+;base64,") {
        Write-Output "base64"
    } elseif ($text -match "\\.(png|jpg|jpeg|gif|bmp|webp|svg)(\\s*$|\\?)") {
        Write-Output "url"
    } else {
        Write-Output "text"
    }
} else {
    Write-Output "none"
}`;

    console.log('🔍 [Windows剪贴板] 执行PowerShell脚本');

    // Encode script as UTF-16LE Base64 for PowerShell -EncodedCommand
    const encoded = Buffer.from(script, 'utf16le').toString('base64');

    const { stdout } = await execAsync(
      `powershell.exe -ExecutionPolicy Bypass -NoProfile -EncodedCommand ${encoded}`
    );

    const result = stdout.trim();
    console.log('🔍 [Windows剪贴板] PowerShell返回:', result);

    const hasImageContent = result === 'image' || result === 'base64' || result === 'url';
    console.log('🔍 [Windows剪贴板] 检测结果:', hasImageContent);

    return hasImageContent;
  } catch {
    return false;
  }
}

/**
 * Checks if the system clipboard contains an image on WSL
 * Uses Windows PowerShell via WSL interop to access Windows clipboard
 */
async function clipboardHasImageWSL(): Promise<boolean> {
  try {
    // Use the same script as Windows but via WSL interop
    const script = `Add-Type -AssemblyName System.Windows.Forms
if ([Windows.Forms.Clipboard]::ContainsImage()) {
    Write-Output "image"
} elseif ([Windows.Forms.Clipboard]::ContainsText()) {
    $text = [Windows.Forms.Clipboard]::GetText()
    if ($text -match "^data:image/[^;]+;base64,") {
        Write-Output "base64"
    } elseif ($text -match "\\.(png|jpg|jpeg|gif|bmp|webp|svg)(\\s*$|\\?)") {
        Write-Output "url"
    } else {
        Write-Output "text"
    }
} else {
    Write-Output "none"
}`;

    // Encode script as UTF-16LE Base64 for PowerShell -EncodedCommand
    const encoded = Buffer.from(script, 'utf16le').toString('base64');

    // Use powershell.exe via WSL interop
    const { stdout } = await execAsync(
      `powershell.exe -ExecutionPolicy Bypass -NoProfile -EncodedCommand ${encoded}`
    );

    const result = stdout.trim();
    return result === 'image' || result === 'base64' || result === 'url';
  } catch (error: unknown) {
    console.error('WSL clipboard detection error:', error);
    return false;
  }
}

/**
 * Checks if the system clipboard contains an image on Linux
 * Uses xclip or xsel to access X11 clipboard system
 */
async function clipboardHasImageLinux(): Promise<boolean> {
  try {
    const deps = await checkLinuxClipboardDependencies();

    if (!deps.hasXclip && !deps.hasXsel) {
      console.warn('❌ 缺少剪切板工具: 请安装 xclip 或 xsel\n   Ubuntu: sudo apt install xclip\n   或: sudo apt install xsel');
      return false;
    }

    // Check for image data using xclip (preferred) or xsel
    const clipTool = deps.hasXclip ? 'xclip' : 'xsel';
    const clipArgs = deps.hasXclip ?
      '-selection clipboard -t TARGETS -o' :
      '--clipboard --output';

    try {
      // Get available MIME types in clipboard
      const { stdout } = await execAsync(`${clipTool} ${clipArgs} 2>/dev/null || echo ""`);
      const targets = stdout.toLowerCase();

      // Check for image MIME types
      const hasImageData = /image\//.test(targets) ||
                          /png/.test(targets) ||
                          /jpeg/.test(targets) ||
                          /gif/.test(targets) ||
                          /bmp/.test(targets) ||
                          /webp/.test(targets) ||
                          /svg/.test(targets);

      if (hasImageData) {
        return true;
      }

      // Check for text that might contain base64 image data or URLs
      const textArgs = deps.hasXclip ?
        '-selection clipboard -o' :
        '--clipboard --output';

      const { stdout: textContent } = await execAsync(`${clipTool} ${textArgs} 2>/dev/null || echo ""`);
      const text = textContent.trim();

      if (text) {
        // Check for base64 image data
        if (/^data:image\/[^;]+;base64,/.test(text)) {
          return true;
        }

        // Check for image URLs
        if (/\.(png|jpg|jpeg|gif|bmp|webp|svg)(\s*$|\?)/i.test(text)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  } catch (error: unknown) {
    console.error('Linux clipboard detection error:', error);
    return false;
  }
}

/**
 * Saves the image from clipboard to a temporary file
 * @param targetDir The target directory to create temp files within
 * @returns The path to the saved image file, or null if no image or error
 */
export async function saveClipboardImage(
  targetDir?: string,
): Promise<string | null> {
  if (process.platform === 'darwin') {
    return saveClipboardImageMac(targetDir);
  } else if (process.platform === 'win32') {
    return saveClipboardImageWindows(targetDir);
  } else if (isWSLEnvironment()) {
    return saveClipboardImageWSL(targetDir);
  } else if (process.platform === 'linux') {
    return saveClipboardImageLinux(targetDir);
  }
  return null;
}

/**
 * Saves the image from clipboard to a temporary file on macOS
 */
async function saveClipboardImageMac(
  targetDir?: string,
): Promise<string | null> {
  try {
    // Create a temporary directory for clipboard images within the target directory
    // This avoids security restrictions on paths outside the target directory
    const baseDir = targetDir || process.cwd();
    const tempDir = path.join(baseDir, CLIPBOARD_DIR);
    await fs.mkdir(tempDir, { recursive: true });

    // Generate a unique filename with timestamp
    const timestamp = new Date().getTime();

    // Try different image formats in order of preference
    const formats = [
      { class: 'PNGf', extension: 'png' },
      { class: 'JPEG', extension: 'jpg' },
      { class: 'TIFF', extension: 'tiff' },
      { class: 'GIFf', extension: 'gif' },
    ];

    for (const format of formats) {
      const tempFilePath = path.join(
        tempDir,
        `clipboard-${timestamp}.${format.extension}`,
      );

      // Try to save clipboard as this format
      const script = `
        try
          set imageData to the clipboard as «class ${format.class}»
          set fileRef to open for access POSIX file "${tempFilePath}" with write permission
          write imageData to fileRef
          close access fileRef
          return "success"
        on error errMsg
          try
            close access POSIX file "${tempFilePath}"
          end try
          return "error"
        end try
      `;

      const { stdout } = await execAsync(`osascript -e '${script}'`);

      if (stdout.trim() === 'success') {
        // Verify the file was created and has content
        try {
          const stats = await fs.stat(tempFilePath);
          if (stats.size > 0) {
            return tempFilePath;
          }
        } catch {
          // File doesn't exist, continue to next format
        }
      }

      // Clean up failed attempt
      try {
        await fs.unlink(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }
    }

    // No format worked
    return null;
  } catch (error: unknown) {
    console.error('Error saving clipboard image:', error);
    return null;
  }
}

/**
 * Saves the image from clipboard to a temporary file on Windows
 * Uses Base64 encoded PowerShell commands to avoid file creation for scripts
 */
async function saveClipboardImageWindows(
  targetDir?: string,
): Promise<string | null> {
  try {
    // Create a temporary directory for clipboard images within the target directory
    const baseDir = targetDir || process.cwd();
    const tempDir = path.join(baseDir, CLIPBOARD_DIR);
    await fs.mkdir(tempDir, { recursive: true });

    // Generate a unique filename with timestamp
    const timestamp = new Date().getTime();

    // First, determine what type of content we have using Base64 encoded command
    const checkScript = `Add-Type -AssemblyName System.Windows.Forms
if ([Windows.Forms.Clipboard]::ContainsImage()) {
    Write-Output "image"
} elseif ([Windows.Forms.Clipboard]::ContainsText()) {
    $text = [Windows.Forms.Clipboard]::GetText()
    if ($text -match "^data:image/[^;]+;base64,") {
        Write-Output "base64"
    } elseif ($text -match "\\.(png|jpg|jpeg|gif|bmp|webp|svg)(\\s*$|\\?)") {
        Write-Output "url"
    } else {
        Write-Output "text"
    }
} else {
    Write-Output "none"
}`;

    const checkEncoded = Buffer.from(checkScript, 'utf16le').toString('base64');
    const { stdout: checkResult } = await execAsync(
      `powershell.exe -ExecutionPolicy Bypass -NoProfile -EncodedCommand ${checkEncoded}`
    );

    const contentType = checkResult.trim();

    if (contentType === 'image') {
      // Handle actual image data using Base64 encoded command
      const tempFilePath = path.join(tempDir, `clipboard-${timestamp}.png`);
      const normalizedPath = tempFilePath.replace(/\\/g, '/');

      const saveScript = `Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

try {
    $img = [Windows.Forms.Clipboard]::GetImage()
    $img.Save("${normalizedPath}", [System.Drawing.Imaging.ImageFormat]::Png)
    $img.Dispose()
    Write-Output "success"
} catch {
    Write-Output "error"
}`;

      const saveEncoded = Buffer.from(saveScript, 'utf16le').toString('base64');
      const { stdout: saveResult } = await execAsync(
        `powershell.exe -ExecutionPolicy Bypass -NoProfile -EncodedCommand ${saveEncoded}`
      );

      if (saveResult.trim() === 'success') {
        try {
          const stats = await fs.stat(tempFilePath);
          if (stats.size > 0) {
            return tempFilePath;
          }
        } catch {
          // File doesn't exist
        }
      }
    } else if (contentType === 'base64') {
      // Handle base64 image data using Base64 encoded command
      const getTextScript = `Add-Type -AssemblyName System.Windows.Forms
Write-Output ([Windows.Forms.Clipboard]::GetText())`;

      const getTextEncoded = Buffer.from(getTextScript, 'utf16le').toString('base64');
      const { stdout: base64Text } = await execAsync(
        `powershell.exe -ExecutionPolicy Bypass -NoProfile -EncodedCommand ${getTextEncoded}`
      );

      const base64Data = base64Text.trim();
      const match = base64Data.match(/^data:image\/([^;]+);base64,(.+)$/);

      if (match) {
        const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
        const imageData = match[2];
        const tempFilePath = path.join(tempDir, `clipboard-${timestamp}.${extension}`);

        try {
          await fs.writeFile(tempFilePath, Buffer.from(imageData, 'base64'));
          const stats = await fs.stat(tempFilePath);
          if (stats.size > 0) {
            return tempFilePath;
          }
        } catch {
          // Failed to save
        }
      }
    } else if (contentType === 'url') {
      // For image URLs, we could potentially download them, but for now just return the URL as text
      // This could be enhanced in the future to download and save the image
      return null; // Let the caller handle the URL as text
    }

    return null;
  } catch (error: unknown) {
    console.error('Error saving clipboard image:', error);
    return null;
  }
}

/**
 * Saves the image from clipboard to a temporary file on WSL
 * Uses Windows PowerShell via WSL interop to access Windows clipboard
 */
async function saveClipboardImageWSL(
  targetDir?: string,
): Promise<string | null> {
  try {
    // Create a temporary directory for clipboard images within the target directory
    const baseDir = targetDir || process.cwd();
    const tempDir = path.join(baseDir, CLIPBOARD_DIR);
    await fs.mkdir(tempDir, { recursive: true });

    console.log('🔍 [WSL剪贴板] 基础目录:', baseDir);
    console.log('🔍 [WSL剪贴板] 临时目录:', tempDir);

    // Generate a unique filename with timestamp
    const timestamp = new Date().getTime();

    // First, determine what type of content we have using Base64 encoded command
    const checkScript = `Add-Type -AssemblyName System.Windows.Forms
if ([Windows.Forms.Clipboard]::ContainsImage()) {
    Write-Output "image"
} elseif ([Windows.Forms.Clipboard]::ContainsText()) {
    $text = [Windows.Forms.Clipboard]::GetText()
    if ($text -match "^data:image/[^;]+;base64,") {
        Write-Output "base64"
    } elseif ($text -match "\\.(png|jpg|jpeg|gif|bmp|webp|svg)(\\s*$|\\?)") {
        Write-Output "url"
    } else {
        Write-Output "text"
    }
} else {
    Write-Output "none"
}`;

    const checkEncoded = Buffer.from(checkScript, 'utf16le').toString('base64');
    const { stdout: checkResult } = await execAsync(
      `powershell.exe -ExecutionPolicy Bypass -NoProfile -EncodedCommand ${checkEncoded}`
    );

    const contentType = checkResult.trim();
    console.log('🔍 [WSL剪贴板] 内容类型:', contentType);

    if (contentType === 'image') {
      // Handle actual image data using Base64 encoded command
      const tempFilePath = path.join(tempDir, `clipboard-${timestamp}.png`);
      // Convert WSL Linux path to Windows path for PowerShell
      const windowsPath = convertWSLPathToWindows(tempFilePath);

      console.log('🔍 [WSL剪贴板] Linux路径:', tempFilePath);
      console.log('🔍 [WSL剪贴板] Windows路径:', windowsPath);

      const saveScript = `Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

try {
    $img = [Windows.Forms.Clipboard]::GetImage()
    $img.Save("${windowsPath}", [System.Drawing.Imaging.ImageFormat]::Png)
    $img.Dispose()
    Write-Output "success"
} catch {
    Write-Output "error: $($_.Exception.Message)"
}`;

      const saveEncoded = Buffer.from(saveScript, 'utf16le').toString('base64');
      const { stdout: saveResult } = await execAsync(
        `powershell.exe -ExecutionPolicy Bypass -NoProfile -EncodedCommand ${saveEncoded}`
      );

      if (saveResult.trim() === 'success') {
        try {
          const stats = await fs.stat(tempFilePath);
          if (stats.size > 0) {
            return tempFilePath;
          }
        } catch {
          // File doesn't exist
        }
      } else {
        console.error('PowerShell save error:', saveResult.trim());
      }
    } else if (contentType === 'base64') {
      // Handle base64 image data using Base64 encoded command
      const getTextScript = `Add-Type -AssemblyName System.Windows.Forms
Write-Output ([Windows.Forms.Clipboard]::GetText())`;

      const getTextEncoded = Buffer.from(getTextScript, 'utf16le').toString('base64');
      const { stdout: base64Text } = await execAsync(
        `powershell.exe -ExecutionPolicy Bypass -NoProfile -EncodedCommand ${getTextEncoded}`
      );

      const base64Data = base64Text.trim();
      const match = base64Data.match(/^data:image\/([^;]+);base64,(.+)$/);

      if (match) {
        const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
        const imageData = match[2];
        const tempFilePath = path.join(tempDir, `clipboard-${timestamp}.${extension}`);

        try {
          await fs.writeFile(tempFilePath, Buffer.from(imageData, 'base64'));
          const stats = await fs.stat(tempFilePath);
          if (stats.size > 0) {
            return tempFilePath;
          }
        } catch {
          // Failed to save
        }
      }
    } else if (contentType === 'url') {
      // For image URLs, we could potentially download them, but for now just return the URL as text
      // This could be enhanced in the future to download and save the image
      return null; // Let the caller handle the URL as text
    }

    return null;
  } catch (error: unknown) {
    console.error('Error saving WSL clipboard image:', error);
    return null;
  }
}

/**
 * Saves the image from clipboard to a temporary file on Linux
 * Uses xclip or xsel to access X11 clipboard system
 */
async function saveClipboardImageLinux(
  targetDir?: string,
): Promise<string | null> {
  try {
    const deps = await checkLinuxClipboardDependencies();

    if (!deps.hasXclip && !deps.hasXsel) {
      console.warn('❌ 缺少剪切板工具: 请安装 xclip 或 xsel\n   Ubuntu: sudo apt install xclip\n   或: sudo apt install xsel');
      return null;
    }

    // Create a temporary directory for clipboard images within the target directory
    const baseDir = targetDir || process.cwd();
    const tempDir = path.join(baseDir, CLIPBOARD_DIR);
    await fs.mkdir(tempDir, { recursive: true });

    // Generate a unique filename with timestamp
    const timestamp = new Date().getTime();
    const clipTool = deps.hasXclip ? 'xclip' : 'xsel';

    console.log('🔍 [Linux剪贴板] 使用工具:', clipTool);
    console.log('🔍 [Linux剪贴板] 临时目录:', tempDir);

    // First, determine what type of content we have
    const targetsArgs = deps.hasXclip ?
      '-selection clipboard -t TARGETS -o' :
      '--clipboard --output';

    const { stdout: targets } = await execAsync(`${clipTool} ${targetsArgs} 2>/dev/null || echo ""`);
    const availableTypes = targets.toLowerCase();

    console.log('🔍 [Linux剪贴板] 可用类型:', availableTypes);

    // Try to save different image formats in order of preference
    const imageFormats = [
      { mime: 'image/png', ext: 'png' },
      { mime: 'image/jpeg', ext: 'jpg' },
      { mime: 'image/gif', ext: 'gif' },
      { mime: 'image/bmp', ext: 'bmp' },
      { mime: 'image/webp', ext: 'webp' },
      { mime: 'image/svg+xml', ext: 'svg' }
    ];

    // Try to get image data directly
    for (const format of imageFormats) {
      if (availableTypes.includes(format.mime) || availableTypes.includes(format.ext)) {
        const tempFilePath = path.join(tempDir, `clipboard-${timestamp}.${format.ext}`);

        try {
          const getImageArgs = deps.hasXclip ?
            `-selection clipboard -t ${format.mime} -o` :
            `--clipboard --output`;

          // For xclip, we can specify the MIME type; for xsel, we get whatever is available
          const command = deps.hasXclip ?
            `${clipTool} ${getImageArgs}` :
            `${clipTool} ${getImageArgs}`;

          await execAsync(`${command} > "${tempFilePath}" 2>/dev/null`);

          // Check if file was created and has content
          const stats = await fs.stat(tempFilePath);
          if (stats.size > 0) {
            console.log('✅ [Linux剪贴板] 成功保存图片:', tempFilePath);
            return tempFilePath;
          } else {
            // Remove empty file
            await fs.unlink(tempFilePath);
          }
        } catch (error: unknown) {
          console.log(`🔍 [Linux剪贴板] 尝试 ${format.mime} 失败:`, error instanceof Error ? error.message : String(error));
          // Clean up failed attempt
          try {
            await fs.unlink(tempFilePath);
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    }

    // If no direct image data, check for text content (base64 or URLs)
    const textArgs = deps.hasXclip ?
      '-selection clipboard -o' :
      '--clipboard --output';

    const { stdout: textContent } = await execAsync(`${clipTool} ${textArgs} 2>/dev/null || echo ""`);
    const text = textContent.trim();

    if (text) {
      // Handle base64 image data
      const base64Match = text.match(/^data:image\/([^;]+);base64,(.+)$/);
      if (base64Match) {
        const extension = base64Match[1] === 'jpeg' ? 'jpg' : base64Match[1];
        const imageData = base64Match[2];
        const tempFilePath = path.join(tempDir, `clipboard-${timestamp}.${extension}`);

        try {
          await fs.writeFile(tempFilePath, Buffer.from(imageData, 'base64'));
          const stats = await fs.stat(tempFilePath);
          if (stats.size > 0) {
            console.log('✅ [Linux剪贴板] 成功保存Base64图片:', tempFilePath);
            return tempFilePath;
          }
        } catch (error: unknown) {
          console.error('保存Base64图片失败:', error);
        }
      }

      // Handle image URLs - we could download them, but for now return null
      // to let the caller handle the URL as text
      if (/\.(png|jpg|jpeg|gif|bmp|webp|svg)(\s*$|\?)/i.test(text)) {
        console.log('🔍 [Linux剪贴板] 检测到图片URL，但暂不支持下载');
        return null; // Let the caller handle the URL as text
      }
    }

    console.log('❌ [Linux剪贴板] 未找到可用的图片数据');
    return null;
  } catch (error: unknown) {
    console.error('Linux clipboard save error:', error);
    return null;
  }
}

/**
 * Cleans up old temporary clipboard image files
 * Removes files older than specified time (default: 1 hour)
 * @param targetDir The target directory where temp files are stored
 * @param maxAgeMs Maximum age in milliseconds (default: 1 hour)
 */
export async function cleanupOldClipboardImages(
  targetDir?: string,
  maxAgeMs: number = 60 * 60 * 1000, // 1 hour instead of 24 hours
): Promise<void> {
  try {
    const baseDir = targetDir || process.cwd();
    const tempDir = path.join(baseDir, CLIPBOARD_DIR);
    const files = await fs.readdir(tempDir);
    const cutoffTime = Date.now() - maxAgeMs;

    let cleanedCount = 0;
    for (const file of files) {
      // 只清理系统生成的剪切板文件：clipboard-{timestamp}.{ext} 格式
      const isSystemClipboardFile = /^clipboard-\d+\.(png|jpg|jpeg|tiff|gif|bmp|webp|svg)$/i.test(file);

      if (isSystemClipboardFile) {
        const filePath = path.join(tempDir, file);
        try {
          const stats = await fs.stat(filePath);
          if (stats.mtimeMs < cutoffTime) {
            await fs.unlink(filePath);
            cleanedCount++;
          }
        } catch {
          // File might have been deleted already, ignore
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 清理了 ${cleanedCount} 个旧的剪切板图片文件`);
    }
  } catch {
    // Ignore errors in cleanup
  }
}

/**
 * Cleans up specific clipboard image files immediately
 * @param imagePaths Array of image paths to clean up
 * @param targetDir The target directory where temp files are stored
 */
export async function cleanupSpecificClipboardImages(
  imagePaths: string[],
  targetDir?: string,
): Promise<void> {
  try {
    const baseDir = targetDir || process.cwd();

    let cleanedCount = 0;
    for (const imagePath of imagePaths) {
      // Only clean files in the clipboard directory AND with system-generated names
      if (isClipboardPath(imagePath, baseDir, '.deepvcode')) {
        const filename = path.basename(imagePath);
        const isSystemClipboardFile = /^clipboard-\d+\.(png|jpg|jpeg|gif|bmp|webp|svg)$/i.test(filename);

        if (isSystemClipboardFile) {
          try {
            await fs.unlink(imagePath);
            cleanedCount++;
          } catch {
            // File might not exist or permission issue, ignore
          }
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 清理了 ${cleanedCount} 个使用完毕的剪切板图片文件`);
    }
  } catch {
    // Ignore errors in cleanup
  }
}

/**
 * Aggressive cleanup - removes all clipboard images immediately
 * Use with caution, only when user explicitly requests or app shutdown
 * @param targetDir The target directory where temp files are stored
 */
export async function cleanupAllClipboardImages(
  targetDir?: string,
): Promise<void> {
  return cleanupOldClipboardImages(targetDir, 0); // maxAge = 0 means clean all
}

/**
 * Gets text content from the system clipboard
 * @returns Promise<string | null> - The clipboard text or null if empty/error
 */
export async function getClipboardText(): Promise<string | null> {
  try {
    if (process.platform === 'darwin') {
      return await getClipboardTextMac();
    } else if (process.platform === 'win32') {
      return await getClipboardTextWindows();
    } else if (isWSLEnvironment()) {
      return await getClipboardTextWSL();
    } else if (process.platform === 'linux') {
      return await getClipboardTextLinux();
    }
    return null;
  } catch (error) {
    console.error('获取剪贴板文本失败:', error);
    return null;
  }
}

/**
 * Gets text from clipboard on macOS
 */
async function getClipboardTextMac(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('pbpaste');
    const text = stdout.trim();
    return text || null;
  } catch (error) {
    console.error('macOS clipboard text access error:', error);
    return null;
  }
}

/**
 * Gets text from clipboard on Windows
 */
async function getClipboardTextWindows(): Promise<string | null> {
  try {
    const script = `Add-Type -AssemblyName System.Windows.Forms
if ([Windows.Forms.Clipboard]::ContainsText()) {
  Write-Output ([Windows.Forms.Clipboard]::GetText())
}`;

    // 使用与检测函数相同的 Base64 编码方式，确保一致性
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const { stdout } = await execAsync(
      `powershell.exe -ExecutionPolicy Bypass -NoProfile -EncodedCommand ${encoded}`
    );

    const text = stdout.trim();
    return text || null;
  } catch (error) {
    console.error('Windows clipboard text access error:', error);
    return null;
  }
}

/**
 * Gets text from clipboard on WSL
 * Uses Windows PowerShell via WSL interop to access Windows clipboard
 */
async function getClipboardTextWSL(): Promise<string | null> {
  try {
    const script = `Add-Type -AssemblyName System.Windows.Forms
if ([Windows.Forms.Clipboard]::ContainsText()) {
  Write-Output ([Windows.Forms.Clipboard]::GetText())
}`;

    // 使用与检测函数相同的 Base64 编码方式，确保一致性
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const { stdout } = await execAsync(
      `powershell.exe -ExecutionPolicy Bypass -NoProfile -EncodedCommand ${encoded}`
    );

    const text = stdout.trim();
    return text || null;
  } catch (error) {
    console.error('WSL clipboard text access error:', error);
    return null;
  }
}

/**
 * Gets text from clipboard on Linux
 * Uses xclip or xsel to access X11 clipboard system
 */
async function getClipboardTextLinux(): Promise<string | null> {
  try {
    const deps = await checkLinuxClipboardDependencies();

    if (!deps.hasXclip && !deps.hasXsel) {
      console.log('❌ [Linux剪贴板] 缺少必要依赖');
      return null;
    }

    const clipTool = deps.hasXclip ? 'xclip' : 'xsel';
    const getTextArgs = deps.hasXclip
      ? ['-selection', 'clipboard', '-o']
      : ['--clipboard', '--output'];

    const { stdout } = await execAsync(`${clipTool} ${getTextArgs.join(' ')}`);
    const text = stdout.trim();
    return text || null;
  } catch (error) {
    console.error('Linux clipboard text access error:', error);
    return null;
  }
}