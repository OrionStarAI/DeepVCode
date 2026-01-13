/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { MCPServerConfig, GeminiCLIExtension } from 'deepv-code-core';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { glob } from 'glob';

export const EXTENSIONS_DIRECTORY_NAME = path.join('.deepv', 'extensions');
export const EXTENSIONS_CONFIG_FILENAME = 'gemini-extension.json';

export interface Extension {
  config: ExtensionConfig;
  contextFiles: string[];
  path?: string; // Path to the extension directory
}

export interface ExtensionConfig {
  name: string;
  version: string;
  mcpServers?: Record<string, MCPServerConfig>;
  contextFileName?: string | string[];
  excludeTools?: string[];
}

export interface ExtensionInstallMetadata {
  source: string;
  type: 'git' | 'local' | 'link';
  ref?: string;
  autoUpdate?: boolean;
  allowPreRelease?: boolean;
}

export async function loadExtensions(workspaceDir: string): Promise<Extension[]> {
  const workspaceExtensions = await loadExtensionsFromDir(workspaceDir);
  const homeExtensions = await loadExtensionsFromDir(os.homedir());
  const allExtensions = [...workspaceExtensions, ...homeExtensions];

  // Startup log suppressed for clean CLI output
  // Don't log extensions in stream-json mode to keep output clean
  // const isStreamJsonMode = process.argv.includes('--output-format') &&
  //                         process.argv.includes('stream-json');

  // if (allExtensions.length > 0 && !isStreamJsonMode) {
  //   console.log(`[Extensions Loaded] Found ${allExtensions.length} extensions:`,
  //     allExtensions.map(e => `${e.config.name}@${e.config.version}`).join(', '));
  // }

  const uniqueExtensions = new Map<string, Extension>();
  for (const extension of allExtensions) {
    if (!uniqueExtensions.has(extension.config.name)) {
      uniqueExtensions.set(extension.config.name, extension);
    }
  }

  return Array.from(uniqueExtensions.values());
}

async function loadExtensionsFromDir(dir: string): Promise<Extension[]> {
  const extensionsDir = path.join(dir, EXTENSIONS_DIRECTORY_NAME);
  if (!fs.existsSync(extensionsDir)) {
    return [];
  }

  const extensions: Extension[] = [];
  for (const subdir of fs.readdirSync(extensionsDir)) {
    const extensionDir = path.join(extensionsDir, subdir);

    const extension = await loadExtension(extensionDir);
    if (extension != null) {
      extensions.push(extension);
    }
  }
  return extensions;
}

async function findContextFiles(baseDir: string, filePatterns: string[]): Promise<string[]> {
  const foundFiles: string[] = [];

  for (const pattern of filePatterns) {
    if (pattern.includes('*')) {
      // Handle glob patterns
      try {
        const fullPattern = path.join(baseDir, pattern);
        const matches = await glob(fullPattern, {
          cwd: baseDir,
          absolute: true,
          nodir: true
        });
        if (matches.length > 0) {
          foundFiles.push(...matches);
          break; // Use first pattern that has matches
        }
      } catch (error) {
        console.warn(`Warning: failed to glob pattern ${pattern} in ${baseDir}: ${error}`);
      }
    } else {
      // Handle direct file paths
      const filePath = path.join(baseDir, pattern);
      if (fs.existsSync(filePath)) {
        foundFiles.push(filePath);
        break; // Use first existing file
      }
    }
  }

  return foundFiles;
}

async function loadExtension(extensionDir: string): Promise<Extension | null> {
  if (!fs.statSync(extensionDir).isDirectory()) {
    console.error(
      `Warning: unexpected file ${extensionDir} in extensions directory.`,
    );
    return null;
  }

  const configFilePath = path.join(extensionDir, EXTENSIONS_CONFIG_FILENAME);
  if (!fs.existsSync(configFilePath)) {
    console.error(
      `Warning: extension directory ${extensionDir} does not contain a config file ${configFilePath}.`,
    );
    return null;
  }

  try {
    const configContent = fs.readFileSync(configFilePath, 'utf-8');
    const config = JSON.parse(configContent) as ExtensionConfig;
    if (!config.name || !config.version) {
      console.error(
        `Invalid extension config in ${configFilePath}: missing name or version.`,
      );
      return null;
    }

    const contextFiles = await findContextFiles(extensionDir, getContextFileNames(config));

    return {
      config,
      contextFiles,
      path: extensionDir,
    };
  } catch (e) {
    console.error(
      `Warning: error parsing extension config in ${configFilePath}: ${e}`,
    );
    return null;
  }
}

function getContextFileNames(config: ExtensionConfig): string[] {
  if (!config.contextFileName) {
    return getDefaultContextFileNames();
  } else if (!Array.isArray(config.contextFileName)) {
    return [config.contextFileName];
  }
  return config.contextFileName;
}

/**
 * Returns the default context file names in priority order.
 * The first existing file will be used.
 */
function getDefaultContextFileNames(): string[] {
  return [
    'AGENTS.md',
    'DEEPV.md',
    'GEMINI.md',
    'CLAUDE.md',
    '.augement/*.md',
    '.cursor/rules/*.mdc'
  ];
}

export function annotateActiveExtensions(
  extensions: Extension[],
  enabledExtensionNames: string[],
): GeminiCLIExtension[] {
  const annotatedExtensions: GeminiCLIExtension[] = [];

  if (enabledExtensionNames.length === 0) {
    return extensions.map((extension) => ({
      name: extension.config.name,
      version: extension.config.version,
      isActive: true,
    }));
  }

  const lowerCaseEnabledExtensions = new Set(
    enabledExtensionNames.map((e) => e.trim().toLowerCase()),
  );

  if (
    lowerCaseEnabledExtensions.size === 1 &&
    lowerCaseEnabledExtensions.has('none')
  ) {
    return extensions.map((extension) => ({
      name: extension.config.name,
      version: extension.config.version,
      isActive: false,
    }));
  }

  const notFoundNames = new Set(lowerCaseEnabledExtensions);

  for (const extension of extensions) {
    const lowerCaseName = extension.config.name.toLowerCase();
    const isActive = lowerCaseEnabledExtensions.has(lowerCaseName);

    if (isActive) {
      notFoundNames.delete(lowerCaseName);
    }

    annotatedExtensions.push({
      name: extension.config.name,
      version: extension.config.version,
      isActive,
    });
  }

  for (const requestedName of notFoundNames) {
    console.error(`Extension not found: ${requestedName}`);
  }

  return annotatedExtensions;
}

const INSTALL_METADATA_FILENAME = '.dvcode-install-metadata.json';

export function loadInstallMetadata(
  extensionDir: string,
): ExtensionInstallMetadata | undefined {
  const metadataFilePath = path.join(extensionDir, INSTALL_METADATA_FILENAME);
  try {
    const configContent = fs.readFileSync(metadataFilePath, 'utf-8');
    const metadata = JSON.parse(configContent) as ExtensionInstallMetadata;
    return metadata;
  } catch (_e) {
    return undefined;
  }
}
