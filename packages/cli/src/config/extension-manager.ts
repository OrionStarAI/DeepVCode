/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { ExtensionEnablementManager } from './extensions/extensionEnablement.js';
import { type Settings } from './settings.js';
import { createHash, randomUUID } from 'node:crypto';
import { loadInstallMetadata, type ExtensionConfig } from './extension.js';
import {
  cloneFromGit,
  downloadFromGitHubRelease,
  tryParseGithubUrl,
} from './extensions/github.js';
import { maybeRequestConsentOrFail } from './extensions/consent.js';
import { resolveEnvVarsInObject } from '../utils/envVarResolver.js';
import { ExtensionStorage } from './extensions/storage.js';
import {
  EXTENSIONS_CONFIG_FILENAME,
  INSTALL_METADATA_FILENAME,
  recursivelyHydrateStrings,
  type JsonObject,
} from './extensions/variables.js';
import {
  getEnvContents,
  maybePromptForSettings,
  type ExtensionSetting,
} from './extensions/extensionSettings.js';
import { debugLogger, getErrorMessage } from '../utils/errors.js';

interface ExtensionManagerParams {
  enabledExtensionOverrides?: string[];
  settings: Settings;
  requestConsent: (consent: string) => Promise<boolean>;
  requestSetting: ((setting: ExtensionSetting) => Promise<string>) | null;
  workspaceDir: string;
}

interface ExtensionInstallMetadata {
  source: string;
  type: 'git' | 'local' | 'link';
  ref?: string;
  autoUpdate?: boolean;
  allowPreRelease?: boolean;
}

interface DVCodeExtension {
  config: ExtensionConfig;
  contextFiles: string[];
  isActive?: boolean;
  displayVersion?: string;
}

/**
 * Extension Manager for DVCode - handles installation, loading, enabling/disabling of extensions.
 */
export class ExtensionManager {
  private extensionEnablementManager: ExtensionEnablementManager;
  private settings: Settings;
  private requestConsent: (consent: string) => Promise<boolean>;
  private requestSetting:
    | ((setting: ExtensionSetting) => Promise<string>)
    | undefined;
  private workspaceDir: string;
  private loadedExtensions: DVCodeExtension[] | undefined;

  constructor(options: ExtensionManagerParams) {
    this.workspaceDir = options.workspaceDir;
    this.extensionEnablementManager = new ExtensionEnablementManager(
      options.enabledExtensionOverrides,
    );
    this.settings = options.settings;
    this.requestConsent = options.requestConsent;
    this.requestSetting = options.requestSetting ?? undefined;
  }

  setRequestConsent(
    requestConsent: (consent: string) => Promise<boolean>,
  ): void {
    this.requestConsent = requestConsent;
  }

  setRequestSetting(
    requestSetting?: (setting: ExtensionSetting) => Promise<string>,
  ): void {
    this.requestSetting = requestSetting;
  }

  getExtensions(): DVCodeExtension[] {
    if (!this.loadedExtensions) {
      throw new Error(
        'Extensions not yet loaded, must call `loadExtensions` first',
      );
    }
    return this.loadedExtensions!;
  }

  async installOrUpdateExtension(
    installMetadata: ExtensionInstallMetadata,
    previousExtensionConfig?: ExtensionConfig,
  ): Promise<DVCodeExtension> {
    const isUpdate = !!previousExtensionConfig;
    let newExtensionConfig: ExtensionConfig | null = null;
    let localSourcePath: string | undefined;
    let extension: DVCodeExtension | null;
    try {
      // Determine the local path for the extension
      if (installMetadata.type === 'git') {
        localSourcePath = await this.downloadGitExtension(installMetadata);
      } else if (installMetadata.type === 'local') {
        localSourcePath = installMetadata.source;
      } else if (installMetadata.type === 'link') {
        localSourcePath = installMetadata.source;
      }

      if (!localSourcePath) {
        throw new Error('Failed to determine extension source path');
      }

      // Load the extension config
      newExtensionConfig = this.loadExtensionConfig(localSourcePath);

      // Validate the extension
      const validationResult = this.validateExtension(localSourcePath);
      if (!validationResult.valid) {
        throw new Error(`Extension validation failed: ${validationResult.errors.join(', ')}`);
      }

      // If this is a git/download extension, move it to user-level extensions directory
      if (installMetadata.type === 'git') {
        const extensionsDir = path.join(
          os.homedir(),
          '.deepv',
          'extensions',
        );
        if (!fs.existsSync(extensionsDir)) {
          fs.mkdirSync(extensionsDir, { recursive: true });
        }
        const finalPath = path.join(extensionsDir, newExtensionConfig.name);
        if (fs.existsSync(finalPath)) {
          fs.rmSync(finalPath, { recursive: true });
        }
        fs.renameSync(localSourcePath, finalPath);
        localSourcePath = finalPath;
      }

      // Save install metadata
      const metadataPath = path.join(localSourcePath, INSTALL_METADATA_FILENAME);
      fs.writeFileSync(
        metadataPath,
        JSON.stringify(installMetadata, null, 2),
      );

      // Run npm install to execute postinstall scripts (if package.json exists)
      const packageJsonPath = path.join(localSourcePath, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        try {
          debugLogger.log(
            `Installing dependencies for extension "${newExtensionConfig.name}"...`,
          );
          execSync('npm install', {
            cwd: localSourcePath,
            stdio: 'pipe', // Suppress npm output for cleaner logs
          });
          debugLogger.log(
            `Dependencies installed and postinstall scripts executed for "${newExtensionConfig.name}"`,
          );
        } catch (error) {
          debugLogger.log(
            `Warning: Failed to run npm install for extension "${newExtensionConfig.name}": ${getErrorMessage(error)}`,
          );
          // Don't fail the installation, just warn
        }
      }

      // Load the extension with context files
      extension = await this.loadExtensionWithMetadata(localSourcePath);

      if (!extension) {
        throw new Error(
          `Failed to load extension from ${localSourcePath}. Check that gemini-extension.json exists and is valid.`,
        );
      }

      const eventType = isUpdate ? 'update' : 'install';
      debugLogger.log(
        `Successfully ${eventType}ed extension "${newExtensionConfig.name}" v${newExtensionConfig.version}`,
      );

      return extension;
    } catch (error) {
      throw new Error(`Failed to install extension: ${getErrorMessage(error)}`);
    }
  }

  async downloadGitExtension(
    installMetadata: ExtensionInstallMetadata,
  ): Promise<string> {
    const tempDir = path.join(os.tmpdir(), `dvcode-ext-${randomUUID()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      const { source, ref } = installMetadata;

      // Try to parse as GitHub URL and download release
      const githubMatch = tryParseGithubUrl(source);
      if (githubMatch && installMetadata.allowPreRelease === false) {
        try {
          const releaseDir = await downloadFromGitHubRelease(
            githubMatch.owner,
            githubMatch.repo,
            tempDir,
            installMetadata.allowPreRelease,
          );
          return releaseDir;
        } catch (e) {
          // Fall back to git clone
          debugLogger.log('Falling back to git clone...');
        }
      }

      // Clone from git
      await cloneFromGit(source, tempDir, ref);
      return tempDir;
    } catch (error) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      throw error;
    }
  }

  async uninstallExtension(nameOrSource: string): Promise<void> {
    // Find extension by name or path
    const extension = this.loadedExtensions?.find(
      (ext) => ext.config.name === nameOrSource,
    );

    if (!extension) {
      throw new Error(`Extension "${nameOrSource}" not found`);
    }

    // Find the physical directory
    const extensionDir = this.findExtensionDir(extension.config.name);
    if (!extensionDir) {
      throw new Error(`Extension directory for "${nameOrSource}" not found`);
    }

    // Check if it's a linked extension
    const metadata = loadInstallMetadata(extensionDir);
    if (metadata?.type !== 'link') {
      // Only allow uninstall of non-linked extensions
      fs.rmSync(extensionDir, { recursive: true });
      debugLogger.log(
        `Successfully uninstalled extension "${extension.config.name}"`,
      );
    } else {
      throw new Error('Cannot uninstall linked extensions');
    }
  }

  async loadExtensions(): Promise<DVCodeExtension[]> {
    const allExtensions = await this.loadExtensionsFromDir(os.homedir());

    this.loadedExtensions = allExtensions;
    return this.loadedExtensions;
  }

  private async loadExtensionsFromDir(dir: string): Promise<DVCodeExtension[]> {
    const extensionsDir = path.join(dir, '.deepv', 'extensions');
    if (!fs.existsSync(extensionsDir)) {
      return [];
    }

    const extensions: DVCodeExtension[] = [];
    try {
      for (const subdir of fs.readdirSync(extensionsDir)) {
        const extensionDir = path.join(extensionsDir, subdir);
        const extension = await this.loadExtensionWithMetadata(extensionDir);
        if (extension != null) {
          extensions.push(extension);
        }
      }
    } catch (error) {
      debugLogger.log(`Warning: failed to load extensions from ${extensionsDir}`);
    }
    return extensions;
  }

  private async loadExtensionWithMetadata(
    extensionDir: string,
  ): Promise<DVCodeExtension | null> {
    if (!fs.statSync(extensionDir).isDirectory()) {
      return null;
    }

    const configFilePath = path.join(
      extensionDir,
      EXTENSIONS_CONFIG_FILENAME,
    );
    if (!fs.existsSync(configFilePath)) {
      return null;
    }

    try {
      const config = this.loadExtensionConfig(extensionDir);
      const contextFiles = await this.findContextFiles(extensionDir, config);

      return {
        config,
        contextFiles,
      };
    } catch (e) {
      debugLogger.log(`Warning: error loading extension from ${extensionDir}: ${e}`);
      return null;
    }
  }

  loadExtensionConfig(extensionDir: string): ExtensionConfig {
    const configFilePath = path.join(
      extensionDir,
      'gemini-extension.json',
    );
    const configContent = fs.readFileSync(configFilePath, 'utf-8');
    const config = JSON.parse(configContent) as ExtensionConfig;

    if (!config.name || !config.version) {
      throw new Error('Extension config must have name and version');
    }

    return config;
  }

  private async findContextFiles(
    extensionDir: string,
    config: ExtensionConfig,
  ): Promise<string[]> {
    const filePatterns = config.contextFileName
      ? Array.isArray(config.contextFileName)
        ? config.contextFileName
        : [config.contextFileName]
      : ['AGENTS.md', 'DEEPV.md', 'GEMINI.md', 'CLAUDE.md'];

    for (const pattern of filePatterns) {
      const filePath = path.join(extensionDir, pattern);
      if (fs.existsSync(filePath)) {
        return [filePath];
      }
    }

    return [];
  }

  private findExtensionDir(name: string): string | undefined {
    const homeExtDir = path.join(os.homedir(), '.deepv', 'extensions', name);
    if (fs.existsSync(homeExtDir)) {
      return homeExtDir;
    }

    return undefined;
  }

  validateExtension(extensionPath: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const config = this.loadExtensionConfig(extensionPath);

      // Validate name format
      if (!/^[a-z0-9-]+$/.test(config.name)) {
        errors.push(
          `Invalid extension name: "${config.name}". Only lowercase letters, numbers, and dashes allowed.`,
        );
      }

      // Validate version is semver
      if (!this.isValidSemver(config.version)) {
        errors.push(`Invalid version "${config.version}". Must be valid semver.`);
      }

      // Validate context files exist (optional warning, not blocking)
      // If contextFileName is specified but not found, that's just a warning
      // If contextFileName is not specified, we'll auto-discover during loadExtensionWithMetadata
      if (config.contextFileName) {
        const filePatterns = Array.isArray(config.contextFileName)
          ? config.contextFileName
          : [config.contextFileName];

        let foundAtLeastOne = false;
        for (const pattern of filePatterns) {
          const filePath = path.join(extensionPath, pattern);
          if (fs.existsSync(filePath)) {
            foundAtLeastOne = true;
            break;
          }
        }

        if (!foundAtLeastOne) {
          debugLogger.log(
            `⚠ Warning: Context files specified in extension config not found: ${filePatterns.join(', ')}`,
          );
        }
      }
    } catch (error) {
      errors.push(`Failed to validate extension: ${getErrorMessage(error)}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private isValidSemver(version: string): boolean {
    const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/;
    return semverRegex.test(version);
  }

  toOutputString(extension: DVCodeExtension): string {
    let output = `✓ ${extension.config.name} (${extension.config.version})`;

    if (extension.contextFiles.length > 0) {
      output += `\n  Context Files:`;
      extension.contextFiles.forEach((contextFile) => {
        output += `\n    ${path.basename(contextFile)}`;
      });
    }

    if (extension.config.mcpServers && Object.keys(extension.config.mcpServers).length > 0) {
      output += `\n  MCP Servers:`;
      Object.keys(extension.config.mcpServers).forEach((key) => {
        output += `\n    ${key}`;
      });
    }

    if (extension.config.excludeTools && extension.config.excludeTools.length > 0) {
      output += `\n  Excluded Tools:`;
      extension.config.excludeTools.forEach((tool) => {
        output += `\n    ${tool}`;
      });
    }

    return output;
  }
}
