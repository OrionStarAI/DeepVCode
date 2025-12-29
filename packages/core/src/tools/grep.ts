/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { rgPath } from '@vscode/ripgrep';
import { BaseTool, Icon, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { getErrorMessage, isNodeError } from '../utils/errors.js';
import { Config } from '../config/config.js';
import { logger } from '../utils/enhancedLogger.js';
import { isVSCodeEnvironment } from '../utils/environment/index.js';

// --- Constants ---

/**
 * Maximum number of result lines to return (to prevent oversized responses)
 */
const MAX_RESULT_LINES = 500;

/**
 * Maximum character length per line in output (to prevent oversized lines)
 */
const MAX_LINE_LENGTH = 256;

// --- Path Resolution ---

/**
 * Get the correct ripgrep binary path based on environment
 * - VSCode environment: Use VSCode's built-in ripgrep from installation directory
 * - CLI environment: Use bundled @vscode/ripgrep package
 */
function getRipgrepPath(): string {
  // Check if we're in VSCode environment
  const isVSCode = isVSCodeEnvironment();

  if (isVSCode) {
    logger.info('[GrepTool] VSCode environment detected - locating VSCode built-in ripgrep');
    return findVSCodeRipgrep();
  } else {
    logger.info('[GrepTool] CLI environment detected - using bundled ripgrep');
    return rgPath;
  }
}



/**
 * Find VSCode's built-in ripgrep binary
 */
function findVSCodeRipgrep(): string {
  const platform = process.platform;
  const binaryName = platform === 'win32' ? 'rg.exe' : 'rg';

  // Get VSCode app root from environment variable set by extension
  const appRoot = process.env.VSCODE_APP_ROOT;
  if (!appRoot) {
    throw new Error('VSCODE_APP_ROOT environment variable not set. VSCode extension may not be properly initialized.');
  }

  logger.info(`[GrepTool] Using VSCode app root: ${appRoot}`);

  // Common relative paths where VSCode stores ripgrep
  const commonPaths = [
    // VSCode standard locations
    path.join(appRoot, 'node_modules.asar.unpacked', '@vscode', 'ripgrep', 'bin', binaryName),
    path.join(appRoot, 'node_modules', '@vscode', 'ripgrep', 'bin', binaryName),
  ];

  for (const rgPath of commonPaths) {
    if (fs.existsSync(rgPath)) {
      logger.info(`[GrepTool] Found VSCode ripgrep at: ${rgPath}`);
      return rgPath;
    }
  }

  throw new Error(`Could not find VSCode's built-in ripgrep binary in app root: ${appRoot}`);
}



// --- Interfaces ---

/**
 * Parameters for the GrepTool (enhanced for ripgrep)
 */
export interface GrepToolParams {
  pattern: string;
  path?: string;
  include?: string;
  glob?: string;
  type?: string;
  case_sensitive?: boolean;
  context?: number;
  max_count?: number;
  hidden?: boolean;
  word?: boolean;
}

/**
 * Result object for a single grep match
 */
interface GrepMatch {
  filePath: string;
  lineNumber: number;
  line: string;
}



// --- GrepLogic Class ---

/**
 * Implementation of the Grep tool logic (moved from CLI)
 */
export class GrepTool extends BaseTool<GrepToolParams, ToolResult> {
  static readonly Name = 'search_file_content'; // Keep static name

  constructor(private readonly config: Config) {
    super(
      GrepTool.Name,
      'SearchText',
      'Searches for a regular expression pattern within the content of files or directories using ripgrep. Supports searching individual files or entire directories with advanced filtering by file type, glob patterns, and various search options. Returns matching lines with file paths and line numbers. High performance search with smart defaults.',
      Icon.Regex,
      {
        properties: {
          pattern: {
            description:
              "The regular expression (regex) pattern to search for within file contents (e.g., 'function\\s+myFunction', 'import\\s+\\{.*\\}\\s+from\\s+.*').",
            type: Type.STRING,
          },
          path: {
            description:
              'Optional: The absolute path to the file or directory to search within. Can be a single file or a directory. If omitted, searches the current working directory.',
            type: Type.STRING,
          },
          include: {
            description:
              "Optional: A glob pattern to filter which files are searched (e.g., '*.js', '*.{ts,tsx}', 'src/**'). Deprecated - use 'glob' instead.",
            type: Type.STRING,
          },
          glob: {
            description:
              "Optional: A glob pattern to filter files (e.g., '*.js', 'src/**/*.ts'). More flexible than 'include'.",
            type: Type.STRING,
          },
          type: {
            description:
              "Optional: File type filter (e.g., 'js', 'ts', 'py', 'md'). More efficient than glob for common file types.",
            type: Type.STRING,
          },
          case_sensitive: {
            description:
              'Optional: Enable case-sensitive search. Default is false (case-insensitive).',
            type: Type.BOOLEAN,
          },
          context: {
            description:
              'Optional: Number of context lines to show around each match (0-10).',
            type: Type.NUMBER,
          },
          max_count: {
            description:
              'Optional: Maximum number of matches to return. Useful for limiting large result sets.',
            type: Type.NUMBER,
          },
          hidden: {
            description:
              'Optional: Search hidden files (files starting with dot). Default is false.',
            type: Type.BOOLEAN,
          },
          word: {
            description:
              'Optional: Match whole words only. Default is false.',
            type: Type.BOOLEAN,
          },
        },
        required: ['pattern'],
        type: Type.OBJECT,
      },
    );
  }

  // --- Validation Methods ---

  /**
   * Checks if a path is within the root directory and resolves it.
   * @param relativePath Path relative to the root directory (or undefined for root).
   * @returns The absolute path if valid and exists.
   * @throws {Error} If path is outside root or doesn't exist.
   */
  private resolveAndValidatePath(relativePath?: string): string {
    // Handle both absolute and relative paths correctly
    const targetPath = relativePath && path.isAbsolute(relativePath)
      ? relativePath
      : path.resolve(this.config.getTargetDir(), relativePath || '.');

    // Security Check: Ensure the resolved path is still within the root directory.
    if (
      !targetPath.startsWith(this.config.getTargetDir()) &&
      targetPath !== this.config.getTargetDir()
    ) {
      throw new Error(
        `Path validation failed: Attempted path "${relativePath || '.'}" resolves outside the allowed root directory "${this.config.getTargetDir()}".`,
      );
    }

    // Check existence after resolving (now supports both files and directories)
    try {
      fs.statSync(targetPath);
      // Remove directory-only restriction - now supports both files and directories
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        throw new Error(`Path does not exist: ${targetPath}`);
      }
      throw new Error(
        `Failed to access path stats for ${targetPath}: ${getErrorMessage(error)}`,
      );
    }

    return targetPath;
  }

  /**
   * Validates the parameters for the tool
   * @param params Parameters to validate
   * @returns An error message string if invalid, null otherwise
   */
  validateToolParams(params: GrepToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    try {
      new RegExp(params.pattern);
    } catch (error) {
      return `Invalid regular expression pattern provided: ${params.pattern}. Error: ${getErrorMessage(error)}`;
    }

    try {
      this.resolveAndValidatePath(params.path);
    } catch (error) {
      return getErrorMessage(error);
    }

    return null; // Parameters are valid
  }

  // --- Core Execution ---

  /**
   * Executes the grep search with the given parameters using ripgrep
   * @param params Parameters for the grep search
   * @returns Result of the grep search
   */
  async execute(
    params: GrepToolParams,
    signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: `Model provided invalid parameters. Error: ${validationError}`,
      };
    }

    let searchDirAbs: string;
    try {
      searchDirAbs = this.resolveAndValidatePath(params.path);
      const searchDirDisplay = params.path || '.';

      const allMatches: GrepMatch[] = await this.executeRipgrep(params, searchDirAbs, signal);

      logger.debug('[GrepTool] allMatches', { allMatches: allMatches.length });
      if (allMatches.length === 0) {
        const filterInfo = this.getFilterDescription(params);
        const noMatchMsg = `No matches found for pattern "${params.pattern}" in path "${searchDirDisplay}"${filterInfo}.`;
        return { llmContent: noMatchMsg, returnDisplay: `No matches found` };
      }

      // Apply max_count if specified
      const effectiveMaxCount = params.max_count || MAX_RESULT_LINES;
      const matches = allMatches.slice(0, effectiveMaxCount);
      const wasTruncated = allMatches.length > effectiveMaxCount;

      // Standard content format
      return this.formatContentResults(matches, allMatches.length, params, searchDirDisplay, wasTruncated, effectiveMaxCount);

    } catch (error) {
      console.error(`Error during ripgrep execution: ${error}`);
      const errorMessage = getErrorMessage(error);
      return {
        llmContent: `Error during search operation: ${errorMessage}`,
        returnDisplay: `Error: ${errorMessage}`,
      };
    }
  }

  // --- Ripgrep Implementation ---

  /**
   * Executes ripgrep with the given parameters
   * @param params Search parameters
   * @param searchPath Absolute search path
   * @param signal Abort signal
   * @returns Promise resolving to array of matches
   */
  private async executeRipgrep(
    params: GrepToolParams,
    searchPath: string,
    signal: AbortSignal
  ): Promise<GrepMatch[]> {
    const args = this.buildRipgrepArgs(params, searchPath);

    // Get the correct ripgrep path based on environment
    const ripgrepPath = getRipgrepPath();

    logger.debug('[GrepTool] executeRipgrep', { args, searchPath, ripgrepPath });

    return new Promise((resolve, reject) => {
      // Always use project root as working directory for consistency
      const workingDirectory = this.config.getTargetDir();

      const process = spawn(ripgrepPath, args, {
        cwd: workingDirectory,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'], // Explicitly close stdin
      });

      let stdout = '';
      let stderr = '';
      let isResolved = false;

      // Timeout after 30 seconds
      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          logger.warn('[GrepTool] Process timeout after 30s');
          cleanup();
          reject(new Error('Ripgrep process timeout after 30 seconds'));
        }
      }, 30000);

      const cleanup = () => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);

        if (!process.killed) {
          try {
            process.kill('SIGTERM');
          } catch (e) {
            logger.debug('[GrepTool] Error killing process:', e);
          }
        }
      };

      const onAbort = () => {
        if (!isResolved) {
          isResolved = true;
          logger.debug('[GrepTool] Process aborted by signal');
          cleanup();
          reject(new Error('Search was aborted'));
        }
      };

      // Handle abort signal
      signal.addEventListener('abort', onAbort);

      process.stdout.on('data', (data) => {
        stdout += data.toString();
        logger.debug('[GrepTool] stdout chunk received:', data.length);
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
        logger.debug('[GrepTool] stderr chunk received:', data.toString());
      });

      process.on('error', (error) => {
        logger.error('[GrepTool] Process error:', error);
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(new Error(`Failed to execute ripgrep: ${error.message}`));
        }
      });

      process.on('close', (code, signal) => {
        logger.debug('[GrepTool] Process closed:', { code, signal, stdoutLength: stdout.length, stderrLength: stderr.length });

        if (isResolved) return;
        isResolved = true;

        cleanup();

        if (code === 0) {
          // Success with matches
          // Since we now use project root as working directory, basePath should be project root
          resolve(this.parseRipgrepOutput(stdout, this.config.getTargetDir(), searchPath));
        } else if (code === 1) {
          // No matches found (normal exit)
          resolve([]);
        } else {
          // Error occurred
          const errorMsg = `Ripgrep failed with code ${code}${stderr ? ': ' + stderr : ''}`;
          logger.error('[GrepTool] Process failed:', errorMsg);
          reject(new Error(errorMsg));
        }
      });

      // Log process start
      logger.debug('[GrepTool] Process started with PID:', process.pid);
    });
  }

  /**
   * Builds ripgrep command arguments from parameters
   * @param params Search parameters
   * @param searchPath Absolute search path (file or directory)
   * @returns Array of command line arguments
   */
  private buildRipgrepArgs(params: GrepToolParams, searchPath: string): string[] {
    const args: string[] = [];

    // Standard format with line numbers
    args.push('--line-number');

    // Add sorting by modification time (newest first) - only for directories
    const isFile = fs.statSync(searchPath).isFile();
    if (!isFile) {
      args.push('--sort', 'modified');
    }

    // Search behavior options
    if (!params.case_sensitive) {
      args.push('--ignore-case');
    }

    if (params.word) {
      args.push('--word-regexp');
    }

    // Context options
    if (params.context && params.context > 0) {
      args.push('--context', Math.min(params.context, 10).toString());
    }

    // Output limiting
    if (params.max_count) {
      args.push('--max-count', params.max_count.toString());
    }

    // File filtering (only apply to directory searches)
    if (!isFile) {
      const globPattern = params.glob || params.include; // Support deprecated 'include'
      if (globPattern) {
        args.push('--glob', globPattern);
      }

      if (params.type) {
        // Handle custom file types that ripgrep doesn't recognize natively
        // This includes modern web, mobile, and other common development file types
        const customTypeToGlob: Record<string, string> = {
          // React/JSX/TSX
          'tsx': '*.tsx',
          'jsx': '*.jsx',

          // Vue.js
          'vue': '*.vue',

          // Svelte
          'svelte': '*.svelte',

          // Angular
          'ng': '*.component.ts',

          // Modern JavaScript/TypeScript variants
          'mjs': '*.mjs',
          'cjs': '*.cjs',
          'mts': '*.mts',
          'cts': '*.cts',

          // Mobile Development
          'dart': '*.dart',
          'swift': '*.swift',
          'kotlin': '*.kt',
          'ktm': '*.ktm',
          'kts': '*.kts',

          // Web Assembly
          'wasm': '*.wasm',
          'wat': '*.wat',

          // Markup & Styling
          'sass': '*.sass',
          'scss': '*.scss',
          'less': '*.less',
          'styl': '*.styl',
          'stylus': '*.stylus',

          // Configuration & Data
          'toml': '*.toml',
          'yaml': '*.{yml,yaml}',
          'yml': '*.yml',
          'ini': '*.ini',
          'env': '*.env',
          'dotenv': '.env*',

          // Shell Scripts
          'bash': '*.{sh,bash}',
          'zsh': '*.zsh',
          'fish': '*.fish',
          'powershell': '*.{ps1,psm1,psd1}',
          'bat': '*.{bat,cmd}',

          // Document formats
          'mdx': '*.mdx',
          'tex': '*.tex',
          'rst': '*.rst',
          'adoc': '*.adoc',
          'asciidoc': '*.{adoc,asciidoc}',

          // Programming Languages
          'groovy': '*.{groovy,gradle}',
          'scala': '*.scala',
          'clojure': '*.{clj,cljs,cljc}',
          'elixir': '*.{ex,exs}',
          'erlang': '*.{erl,hrl}',
          'haskell': '*.hs',
          'ocaml': '*.ml',
          'fsharp': '*.fs',
          'nim': '*.nim',
          'crystal': '*.cr',
          'zig': '*.zig',

          // Data Science & ML
          'ipynb': '*.ipynb',
          'rmd': '*.rmd',
          'jl': '*.jl',

          // Game Development
          'gdscript': '*.gd',
          'shader': '*.{shader,cginc,hlsl,glsl,vert,frag}',

          // Templating
          'ejs': '*.ejs',
          'pug': '*.pug',
          'jade': '*.jade',
          'handlebars': '*.{hbs,handlebars}',
          'mustache': '*.mustache',
          'twig': '*.twig',
          'jinja': '*.{jinja,jinja2,j2}',

          // Protocol Buffers & GraphQL
          'proto': '*.proto',
          'graphql': '*.{graphql,gql}',

          // Infrastructure as Code
          'terraform': '*.tf',
          'dockerfile': '*Dockerfile*',
          'dockerignore': '*.dockerignore',

          // CI/CD
          'gitlab-ci': '*.gitlab-ci.yml',
          'github-workflow': '*.github/workflows/*.yml',
        };

        if (customTypeToGlob[params.type]) {
          // Convert custom types to glob patterns
          args.push('--glob', customTypeToGlob[params.type]);
        } else {
          // Use native ripgrep type for standard types (js, ts, py, etc.)
          args.push('--type', params.type);
        }
      }

      // Hidden files
      if (params.hidden) {
        args.push('--hidden');
      }
    }

    // Add the search pattern
    args.push('--regexp', params.pattern);

    // Add search target
    if (isFile) {
      // For files, use path relative to project root
      const relativePath = path.relative(this.config.getTargetDir(), searchPath);
      args.push(relativePath);
    } else {
      // For directories, use path relative to project root
      const relativePath = path.relative(this.config.getTargetDir(), searchPath);
      args.push(relativePath || '.');
    }

    return args;
  }

  /**
   * Parses ripgrep standard output format
   * @param output Raw stdout from ripgrep
   * @param basePath Base search path for relative file paths
   * @returns Array of parsed matches
   */
  private parseRipgrepOutput(output: string, basePath: string, searchPath?: string): GrepMatch[] {
    if (!output.trim()) return [];

    logger.debug('[GrepTool] parseRipgrepOutput:', { outputLength: output.length });

    return this.parseStandardOutput(output, basePath, searchPath);
  }

  /**
   * Parses standard ripgrep output format (file:line:content)
   * Results are already sorted by modification time due to --sort modified
   */
  private parseStandardOutput(output: string, basePath: string, searchPath?: string): GrepMatch[] {
    const results: GrepMatch[] = [];
    const lines = output.split('\n').filter(line => line.trim());

    // Determine if this is a single file search
    const isSearchingFile = searchPath && fs.statSync(searchPath).isFile();

    for (const line of lines) {
      const firstColonIndex = line.indexOf(':');
      if (firstColonIndex === -1) continue;

      let filePath: string;
      let lineNumberStr: string;
      let content: string;

      if (isSearchingFile) {
        // Single file format: line_number:content
        lineNumberStr = line.substring(0, firstColonIndex);
        content = line.substring(firstColonIndex + 1);
        // Use the relative path of the search target
        filePath = path.relative(basePath, searchPath);
      } else {
        // Multi file format: filename:line_number:content
        const secondColonIndex = line.indexOf(':', firstColonIndex + 1);
        if (secondColonIndex === -1) {
          // Malformed line, skip
          continue;
        }
        filePath = line.substring(0, firstColonIndex);
        lineNumberStr = line.substring(firstColonIndex + 1, secondColonIndex);
        content = line.substring(secondColonIndex + 1);
      }

      const lineNumber = parseInt(lineNumberStr, 10);
      if (isNaN(lineNumber)) continue;

      const match = {
        filePath: filePath,
        lineNumber,
        line: content,
      };

      results.push(match);
    }

    return results;
  }



  /**
   * Gets filter description for display
   */
  private getFilterDescription(params: GrepToolParams): string {
    const filters: string[] = [];

    if (params.glob) filters.push(`glob: ${params.glob}`);
    else if (params.include) filters.push(`filter: ${params.include}`);

    if (params.type) filters.push(`type: ${params.type}`);
    if (params.case_sensitive) filters.push('case-sensitive');
    if (params.word) filters.push('whole-word');
    if (params.hidden) filters.push('include-hidden');

    return filters.length > 0 ? ` (${filters.join(', ')})` : '';
  }



  /**
   * Formats results in content mode (default)
   */
  private formatContentResults(
    matches: GrepMatch[],
    totalMatches: number,
    params: GrepToolParams,
    searchDirDisplay: string,
    wasTruncated: boolean,
    maxCount: number
  ): ToolResult {
    const matchesByFile = matches.reduce((acc, match) => {
      if (!acc[match.filePath]) {
        acc[match.filePath] = [];
      }
      acc[match.filePath].push(match);
      acc[match.filePath].sort((a, b) => a.lineNumber - b.lineNumber);
      return acc;
    }, {} as Record<string, GrepMatch[]>);

    const filterInfo = this.getFilterDescription(params);
    let llmContent = `Found ${totalMatches} ${totalMatches === 1 ? 'match' : 'matches'} for pattern "${params.pattern}" in path "${searchDirDisplay}"${filterInfo}`;

    if (wasTruncated) {
      llmContent += ` (showing first ${maxCount} matches)`;
    }

    llmContent += `\n📅 Results sorted by file modification time (newest first):\n---\n`;

    for (const filePath in matchesByFile) {
      llmContent += `File: ${filePath}\n`;
      matchesByFile[filePath].forEach((match) => {
        const trimmedLine = match.line.trim();
        const truncatedLine = trimmedLine.length > MAX_LINE_LENGTH
          ? trimmedLine.substring(0, MAX_LINE_LENGTH) + '...'
          : trimmedLine;
        llmContent += `L${match.lineNumber}: ${truncatedLine}\n`;
      });
      llmContent += '---\n';
    }

    const displayCount = matches.length;
    const returnDisplayMsg = wasTruncated
      ? `Found ${totalMatches} ${totalMatches === 1 ? 'match' : 'matches'} (showing first ${maxCount})`
      : `Found ${displayCount} ${displayCount === 1 ? 'match' : 'matches'}`;

    return {
      llmContent: llmContent.trim(),
      returnDisplay: returnDisplayMsg,
    };
  }

  /**
   * Gets a description of the grep operation
   * @param params Parameters for the grep operation
   * @returns A string describing the grep
   */
  getDescription(params: GrepToolParams): string {
    let description = `'${params.pattern}'`;

    const globPattern = params.glob || params.include;
    if (globPattern) {
      description += ` in ${globPattern}`;
    }
    if (params.type) {
      description += ` (${params.type} files)`;
    }

    if (params.path) {
      const resolvedPath = path.resolve(
        this.config.getTargetDir(),
        params.path,
      );
      if (resolvedPath === this.config.getTargetDir() || params.path === '.') {
        description += ` within ./`;
      } else {
        const relativePath = makeRelative(
          resolvedPath,
          this.config.getTargetDir(),
        );
        description += ` within ${shortenPath(relativePath)}`;
      }
    }
    return description;
  }

}
