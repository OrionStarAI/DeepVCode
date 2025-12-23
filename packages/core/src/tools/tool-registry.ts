/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionDeclaration, Schema, Type } from '@google/genai';
import { Tool, ToolResult, BaseTool, Icon } from './tools.js';
import { Config } from '../config/config.js';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { discoverMcpTools, syncMcpToolsToRegistry, syncMcpResourcesToRegistry, hasDiscoveredMcpTools, getMCPDiscoveryState, MCPDiscoveryState, waitForMCPDiscoveryComplete, isMCPDiscoveryTriggered } from './mcp-client.js';
import { DiscoveredMCPTool } from './mcp-tool.js';
import { ResourceRegistry } from '../resources/resource-registry.js';
import { parse } from 'shell-quote';
import { shouldUseTolerantMode } from '../config/modelCapabilities.js';
import { createHash } from 'node:crypto';

// Tool name validation pattern: only letters, numbers, underscores, hyphens, length 1-128
const VALID_TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Sanitizes an invalid tool name to make it valid.
 * Strategy:
 * 1. If the name contains only ASCII chars with some invalid ones, replace invalid chars with '-'
 * 2. If the name contains non-ASCII chars, generate a short CRC hash as the name
 * 3. Truncate to 128 chars if needed
 *
 * @param originalName The original tool name
 * @returns Object with sanitized name and whether it was modified
 */
export function sanitizeToolName(originalName: string): { name: string; wasModified: boolean; usedHash: boolean } {
  if (!originalName || originalName.length === 0) {
    return { name: '', wasModified: false, usedHash: false };
  }

  // Already valid
  if (VALID_TOOL_NAME_PATTERN.test(originalName)) {
    return { name: originalName, wasModified: false, usedHash: false };
  }

  // Check if contains non-ASCII characters
  const hasNonAscii = /[^\x00-\x7F]/.test(originalName);

  if (hasNonAscii) {
    // Use CRC32-like short hash for names with non-ASCII chars
    const hash = createHash('md5').update(originalName).digest('hex').substring(0, 16);
    const sanitizedName = `tool_${hash}`;
    return { name: sanitizedName, wasModified: true, usedHash: true };
  }

  // Replace invalid ASCII chars with '-', then clean up
  let sanitized = originalName
    .replace(/[^a-zA-Z0-9_-]/g, '-') // Replace invalid chars with '-'
    .replace(/-+/g, '-')             // Collapse multiple '-' into one
    .replace(/^-+|-+$/g, '');        // Trim leading/trailing '-'

  // Ensure not empty after sanitization
  if (sanitized.length === 0) {
    const hash = createHash('md5').update(originalName).digest('hex').substring(0, 16);
    return { name: `tool_${hash}`, wasModified: true, usedHash: true };
  }

  // Truncate to 128 chars if needed
  if (sanitized.length > 128) {
    sanitized = sanitized.substring(0, 128);
  }

  return { name: sanitized, wasModified: true, usedHash: false };
}

type ToolParams = Record<string, unknown>;

export class DiscoveredTool extends BaseTool<ToolParams, ToolResult> {
  constructor(
    private readonly config: Config,
    name: string,
    readonly description: string,
    readonly parameterSchema: Record<string, unknown>,
  ) {
    const discoveryCmd = config.getToolDiscoveryCommand()!;
    const callCommand = config.getToolCallCommand()!;
    description += `

This tool was discovered from the project by executing the command \`${discoveryCmd}\` on project root.
When called, this tool will execute the command \`${callCommand} ${name}\` on project root.
Tool discovery and call commands can be configured in project or user settings.

When called, the tool call command is executed as a subprocess.
On success, tool output is returned as a json string.
Otherwise, the following information is returned:

Stdout: Output on stdout stream. Can be \`(empty)\` or partial.
Stderr: Output on stderr stream. Can be \`(empty)\` or partial.
Error: Error or \`(none)\` if no error was reported for the subprocess.
Exit Code: Exit code or \`(none)\` if terminated by signal.
Signal: Signal number or \`(none)\` if no signal was received.
`;
    super(
      name,
      name,
      description,
      Icon.Hammer,
      parameterSchema,
      false, // isOutputMarkdown
      false, // canUpdateOutput
    );
  }

  async execute(params: ToolParams): Promise<ToolResult> {
    const callCommand = this.config.getToolCallCommand()!;
    const child = spawn(callCommand, [this.name]);
    child.stdin.write(JSON.stringify(params));
    child.stdin.end();

    let stdout = '';
    let stderr = '';
    let error: Error | null = null;
    let code: number | null = null;
    let signal: NodeJS.Signals | null = null;

    await new Promise<void>((resolve) => {
      const onStdout = (data: Buffer) => {
        stdout += data?.toString();
      };

      const onStderr = (data: Buffer) => {
        stderr += data?.toString();
      };

      const onError = (err: Error) => {
        error = err;
      };

      const onClose = (
        _code: number | null,
        _signal: NodeJS.Signals | null,
      ) => {
        code = _code;
        signal = _signal;
        cleanup();
        resolve();
      };

      const cleanup = () => {
        child.stdout.removeListener('data', onStdout);
        child.stderr.removeListener('data', onStderr);
        child.removeListener('error', onError);
        child.removeListener('close', onClose);
        if (child.connected) {
          child.disconnect();
        }
      };

      child.stdout.on('data', onStdout);
      child.stderr.on('data', onStderr);
      child.on('error', onError);
      child.on('close', onClose);
    });

    // if there is any error, non-zero exit code, signal, or stderr, return error details instead of stdout
    if (error || code !== 0 || signal || stderr) {
      const llmContent = [
        `Stdout: ${stdout || '(empty)'}`,
        `Stderr: ${stderr || '(empty)'}`,
        `Error: ${error ?? '(none)'}`,
        `Exit Code: ${code ?? '(none)'}`,
        `Signal: ${signal ?? '(none)'}`,
      ].join('\n');
      return {
        llmContent,
        returnDisplay: llmContent,
      };
    }

    return {
      llmContent: stdout,
      returnDisplay: stdout,
    };
  }
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Registers a tool definition.
   * @param tool - The tool object containing schema and execution logic.
   */
  registerTool(tool: Tool): void {
    // 🎯 验证工具名称是否符合规范（兼容 Gemini 和 Claude）
    const validToolNamePattern = /^[a-zA-Z0-9_-]{1,128}$/;
    if (!tool.name || !validToolNamePattern.test(tool.name)) {
      console.warn(
        `[ToolRegistry] Rejecting tool with invalid name: "${tool.name}" (must match ^[a-zA-Z0-9_-]{1,128}$)`,
      );
      return; // 🎯 拒绝注册无效的工具
    }

    if (this.tools.has(tool.name)) {
      if (tool instanceof DiscoveredMCPTool) {
        tool = tool.asFullyQualifiedTool();
      } else {
        // Decide on behavior: throw error, log warning, or allow overwrite
        console.warn(
          `Tool with name "${tool.name}" is already registered. Overwriting.`,
        );
      }
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Discovers tools from project (if available and configured).
   * Can be called multiple times to update discovered tools.
   * This will discover tools from the command line and from MCP servers.
   */
  async discoverAllTools(): Promise<void> {
    // remove any previously discovered tools
    for (const tool of this.tools.values()) {
      if (tool instanceof DiscoveredTool || tool instanceof DiscoveredMCPTool) {
        this.tools.delete(tool.name);
      }
    }

    await this.discoverAndRegisterToolsFromCommand();

    // discover tools using MCP servers, if configured
    await discoverMcpTools(
      this.config.getMcpServers() ?? {},
      this.config.getMcpServerCommand(),
      this,
      this.config.getPromptRegistry(),
      this.config.getResourceRegistry(),
      this.config.getDebugMode(),
    );
  }

  /**
   * Discovers only command-line tools synchronously.
   * This is used for fast initialization, MCP tools can be discovered later asynchronously.
   */
  async discoverCommandLineTools(): Promise<void> {
    // remove any previously discovered command-line tools
    for (const tool of this.tools.values()) {
      if (tool instanceof DiscoveredTool) {
        this.tools.delete(tool.name);
      }
    }

    await this.discoverAndRegisterToolsFromCommand();
  }

  /**
   * Discovers tools from project (if available and configured).
   * Can be called multiple times to update discovered tools.
   * This will NOT discover tools from the command line, only from MCP servers.
   *
   * 🎯 VSCode Plugin Mode Optimization:
   * If MCP discovery has already completed (by another Config instance),
   * sync tools from the global cache instead of reconnecting to MCP servers.
   * This ensures all AIService instances have access to the same MCP tools.
   *
   * 🎯 防止重复启动 MCP 进程：
   * 如果 MCP 发现正在进行中，等待完成后从 cache 同步，而不是启动新进程
   */
  async discoverMcpTools(): Promise<void> {
    // remove any previously discovered tools
    for (const tool of this.tools.values()) {
      if (tool instanceof DiscoveredMCPTool) {
        this.tools.delete(tool.name);
      }
    }

    // 🎯 Check if MCP discovery has already completed (VSCode plugin mode optimization)
    // If so, sync from global cache instead of reconnecting
    const discoveryState = getMCPDiscoveryState();
    if (discoveryState === MCPDiscoveryState.COMPLETED && hasDiscoveredMcpTools()) {
      const syncedCount = syncMcpToolsToRegistry(this);
      syncMcpResourcesToRegistry(this.config.getResourceRegistry());
      if (syncedCount > 0) {
        console.log(`[ToolRegistry] Synced ${syncedCount} MCP tools from global cache`);
        return;
      }
    }

    // 🎯 如果 MCP 发现正在进行中（另一个 Config 实例正在发现），等待完成后从 cache 同步
    // 这避免了多个 AIService 实例同时启动 MCP 进程
    if (discoveryState === MCPDiscoveryState.IN_PROGRESS && isMCPDiscoveryTriggered()) {
      console.log(`[ToolRegistry] MCP discovery in progress, waiting for completion...`);
      const completed = await waitForMCPDiscoveryComplete(30000);
      if (completed && hasDiscoveredMcpTools()) {
        const syncedCount = syncMcpToolsToRegistry(this);
        syncMcpResourcesToRegistry(this.config.getResourceRegistry());
        console.log(`[ToolRegistry] MCP discovery completed, synced ${syncedCount} tools from global cache`);
        return;
      }
      // 如果等待超时但仍未完成，不启动新进程，直接返回
      console.warn(`[ToolRegistry] MCP discovery wait timeout, skipping to avoid duplicate processes`);
      return;
    }

    // discover tools using MCP servers, if configured
    await discoverMcpTools(
      this.config.getMcpServers() ?? {},
      this.config.getMcpServerCommand(),
      this,
      this.config.getPromptRegistry(),
      this.config.getResourceRegistry(),
      this.config.getDebugMode(),
    );
  }

  /**
   * Discover or re-discover tools for a single MCP server.
   * @param serverName - The name of the server to discover tools from.
   */
  async discoverToolsForServer(serverName: string): Promise<void> {
    // Remove any previously discovered tools from this server
    for (const [name, tool] of this.tools.entries()) {
      if (tool instanceof DiscoveredMCPTool && tool.serverName === serverName) {
        this.tools.delete(name);
      }
    }

    const mcpServers = this.config.getMcpServers() ?? {};
    const serverConfig = mcpServers[serverName];
    if (serverConfig) {
      await discoverMcpTools(
        { [serverName]: serverConfig },
        undefined,
        this,
        this.config.getPromptRegistry(),
        this.config.getResourceRegistry(),
        this.config.getDebugMode(),
      );
    }
  }

  private async discoverAndRegisterToolsFromCommand(): Promise<void> {
    const discoveryCmd = this.config.getToolDiscoveryCommand();
    if (!discoveryCmd) {
      return;
    }

    try {
      const cmdParts = parse(discoveryCmd);
      if (cmdParts.length === 0) {
        throw new Error(
          'Tool discovery command is empty or contains only whitespace.',
        );
      }
      const proc = spawn(cmdParts[0] as string, cmdParts.slice(1) as string[]);
      let stdout = '';
      const stdoutDecoder = new StringDecoder('utf8');
      let stderr = '';
      const stderrDecoder = new StringDecoder('utf8');
      let sizeLimitExceeded = false;
      const MAX_STDOUT_SIZE = 10 * 1024 * 1024; // 10MB limit
      const MAX_STDERR_SIZE = 10 * 1024 * 1024; // 10MB limit

      let stdoutByteLength = 0;
      let stderrByteLength = 0;

      proc.stdout.on('data', (data) => {
        if (sizeLimitExceeded) return;
        if (stdoutByteLength + data.length > MAX_STDOUT_SIZE) {
          sizeLimitExceeded = true;
          proc.kill();
          return;
        }
        stdoutByteLength += data.length;
        stdout += stdoutDecoder.write(data);
      });

      proc.stderr.on('data', (data) => {
        if (sizeLimitExceeded) return;
        if (stderrByteLength + data.length > MAX_STDERR_SIZE) {
          sizeLimitExceeded = true;
          proc.kill();
          return;
        }
        stderrByteLength += data.length;
        stderr += stderrDecoder.write(data);
      });

      await new Promise<void>((resolve, reject) => {
        proc.on('error', reject);
        proc.on('close', (code) => {
          stdout += stdoutDecoder.end();
          stderr += stderrDecoder.end();

          if (sizeLimitExceeded) {
            return reject(
              new Error(
                `Tool discovery command output exceeded size limit of ${MAX_STDOUT_SIZE} bytes.`,
              ),
            );
          }

          if (code !== 0) {
            console.error(`Command failed with code ${code}`);
            console.error(stderr);
            return reject(
              new Error(`Tool discovery command failed with exit code ${code}`),
            );
          }
          resolve();
        });
      });

      // execute discovery command and extract function declarations (w/ or w/o "tool" wrappers)
      const functions: FunctionDeclaration[] = [];
      const discoveredItems = JSON.parse(stdout.trim());

      if (!discoveredItems || !Array.isArray(discoveredItems)) {
        throw new Error(
          'Tool discovery command did not return a JSON array of tools.',
        );
      }

      for (const tool of discoveredItems) {
        if (tool && typeof tool === 'object') {
          if (Array.isArray(tool['function_declarations'])) {
            functions.push(...tool['function_declarations']);
          } else if (Array.isArray(tool['functionDeclarations'])) {
            functions.push(...tool['functionDeclarations']);
          } else if (tool['name']) {
            functions.push(tool as FunctionDeclaration);
          }
        }
      }
      // register each function as a tool
      for (const func of functions) {
        if (!func.name) {
          console.warn('Discovered a tool with no name. Skipping.');
          continue;
        }
        // Sanitize the parameters before registering the tool.
        const parameters =
          func.parameters &&
          typeof func.parameters === 'object' &&
          !Array.isArray(func.parameters)
            ? (func.parameters as Schema)
            : {};

        // Use tolerant mode for small models
        const tolerantMode = shouldUseTolerantMode(this.config.getModel());
        sanitizeParameters(parameters, tolerantMode);
        this.registerTool(
          new DiscoveredTool(
            this.config,
            func.name,
            func.description ?? '',
            parameters as Record<string, unknown>,
          ),
        );
      }
    } catch (e) {
      console.error(`Tool discovery command "${discoveryCmd}" failed:`, e);
      throw e;
    }
  }

  /**
   * Retrieves the list of tool schemas (FunctionDeclaration array).
   * Extracts the declarations from the ToolListUnion structure.
   * Includes discovered (vs registered) tools if configured.
   * @returns An array of FunctionDeclarations.
   */
  getFunctionDeclarations(): FunctionDeclaration[] {
    const declarations: FunctionDeclaration[] = [];
    const tolerantMode = shouldUseTolerantMode(this.config.getModel());

    this.tools.forEach((tool) => {
      try {
        const schema = { ...tool.schema };

        // Validate and sanitize tool name
        if (!schema.name) {
          console.warn(`[ToolRegistry] Skipping tool with empty name`);
          return;
        }

        if (!VALID_TOOL_NAME_PATTERN.test(schema.name)) {
          const { name: sanitizedName, wasModified, usedHash } = sanitizeToolName(schema.name);

          if (sanitizedName.length === 0) {
            console.warn(`[ToolRegistry] Skipping tool with invalid name: "${schema.name}" (cannot be sanitized)`);
            return;
          }

          if (usedHash) {
            console.warn(`[ToolRegistry] Tool name contains non-ASCII characters, using hash: "${schema.name}" -> "${sanitizedName}"`);
          } else if (wasModified) {
            console.warn(`[ToolRegistry] Tool name sanitized: "${schema.name}" -> "${sanitizedName}" (invalid chars replaced with '-')`);
          }

          schema.name = sanitizedName;
        }

        // Apply tolerant sanitization to runtime schemas
        if (schema.parameters) {
          sanitizeParameters(schema.parameters as Schema, tolerantMode);
        }
        declarations.push(schema);
      } catch (error) {
        // Fallback: skip any tool that causes an exception
        console.error(`[ToolRegistry] Error processing tool "${tool.name}":`, error);
      }
    });
    return declarations;
  }

  /**
   * Returns an array of all registered and discovered tool instances.
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
  }

  /**
   * Returns an array of tools registered from a specific MCP server.
   */
  getToolsByServer(serverName: string): Tool[] {
    const serverTools: Tool[] = [];
    for (const tool of this.tools.values()) {
      if ((tool as DiscoveredMCPTool)?.serverName === serverName) {
        serverTools.push(tool);
      }
    }
    return serverTools.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Removes all MCP tools registered from a specific server.
   */
  removeMcpToolsByServer(serverName: string): void {
    for (const [name, tool] of this.tools.entries()) {
      if (tool instanceof DiscoveredMCPTool && tool.serverName === serverName) {
        this.tools.delete(name);
      }
    }
  }

  /**
   * Get the definition of a specific tool.
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }
}

/**
 * Sanitizes a schema object in-place to ensure compatibility with the Gemini API.
 * Enhanced with small model tolerance mode for improved robustness.
 *
 * NOTE: This function mutates the passed schema object.
 *
 * It performs the following actions:
 * - Removes the `default` property when `anyOf` is present.
 * - Removes unsupported `format` values from string properties, keeping only 'enum' and 'date-time'.
 * - Recursively sanitizes nested schemas within `anyOf`, `items`, and `properties`.
 * - Handles circular references within the schema to prevent infinite loops.
 * - Enhanced tolerance for small model parameter variations (when enabled).
 *
 * @param schema The schema object to sanitize. It will be modified directly.
 * @param tolerantMode Enable lenient validation for small models (default: false).
 */
export function sanitizeParameters(schema?: Schema, tolerantMode: boolean = false) {
  _sanitizeParameters(schema, new Set<Schema>(), tolerantMode);
}

/**
 * Internal recursive implementation for sanitizeParameters.
 * @param schema The schema object to sanitize.
 * @param visited A set used to track visited schema objects during recursion.
 * @param tolerantMode Enable lenient validation for small models.
 */
function _sanitizeParameters(schema: Schema | undefined, visited: Set<Schema>, tolerantMode: boolean = false) {
  if (!schema || visited.has(schema)) {
    return;
  }
  visited.add(schema);

  if (schema.anyOf) {
    // Vertex AI gets confused if both anyOf and default are set.
    schema.default = undefined;
    for (const item of schema.anyOf) {
      if (typeof item !== 'boolean') {
        _sanitizeParameters(item, visited, tolerantMode);
      }
    }
  }
  if (schema.items && typeof schema.items !== 'boolean') {
    _sanitizeParameters(schema.items, visited, tolerantMode);
  }
  if (schema.properties) {
    for (const item of Object.values(schema.properties)) {
      if (typeof item !== 'boolean') {
        _sanitizeParameters(item, visited, tolerantMode);
      }
    }
  }

  // Enhanced tolerance mode for small models
  if (tolerantMode) {
    // Make required fields more forgiving
    if (schema.required && Array.isArray(schema.required)) {
      // Keep only truly essential required fields in tolerant mode
      schema.required = schema.required.filter(field => {
        // Keep required fields that are likely essential
        return ['name', 'id', 'path', 'pattern', 'content'].includes(field);
      });
    }

    // Be more forgiving with type constraints
    if (schema.type && schema.properties) {
      // Allow additional properties in tolerant mode
      const schemaWithAdditional = schema as any;
      if (schemaWithAdditional.additionalProperties === false) {
        schemaWithAdditional.additionalProperties = true;
      }
    }
  }

  // Handle enum values - Gemini API only allows enum for STRING type
  if (schema.enum && Array.isArray(schema.enum)) {
    if (schema.type !== Type.STRING) {
      // If enum is present but type is not STRING, convert type to STRING
      schema.type = Type.STRING;
    }
    // Filter out null and undefined values, then convert remaining values to strings for Gemini API compatibility
    schema.enum = schema.enum
      .filter((value: unknown) => value !== null && value !== undefined)
      .map((value: unknown) => String(value));

    // In tolerant mode, be more forgiving with enum validation
    if (tolerantMode && schema.enum.length === 0) {
      // Remove empty enum constraint in tolerant mode
      schema.enum = undefined;
    }
  }

  // Vertex AI only supports 'enum' and 'date-time' for STRING format.
  if (schema.type === Type.STRING) {
    if (
      schema.format &&
      schema.format !== 'enum' &&
      schema.format !== 'date-time'
    ) {
      schema.format = undefined;
    }
  }

  // In tolerant mode, provide default values for commonly problematic types
  if (tolerantMode) {
    if (schema.type === Type.STRING && !schema.default && !schema.enum) {
      // Don't set default for strings as it might interfere with required validation
    }
    if (schema.type === Type.BOOLEAN && schema.default === undefined) {
      schema.default = false;
    }
    if (schema.type === Type.NUMBER && schema.default === undefined) {
      schema.default = 0;
    }
  }
}
