/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */


import * as fs from 'fs';
import * as path from 'path';
import { homedir, platform } from 'os';
import { MCPServerConfig } from 'deepv-code-core';
import stripJsonComments from 'strip-json-comments';

/**
 * MCP Settings Service - 复用 CLI 的配置文件系统
 *
 * 配置文件位置（优先级从低到高）：
 * 1. 系统级: /etc/deepv-cli/settings.json 或 C:\ProgramData\deepv-cli\settings.json
 * 2. 用户级: ~/.deepv/settings.json
 * 3. 工作区级: <workspace>/.deepvcode/settings.json
 *
 * 与 CLI 完全兼容，用户可以在 CLI 中配置 MCP 服务器，插件自动读取。
 */
export class MCPSettingsService {
  private static readonly SETTINGS_DIRECTORY_NAME = '.deepv';
  private static readonly WORKSPACE_SETTINGS_DIRECTORY_NAME = '.deepvcode'; // 工作区使用不同目录名
  private static readonly SETTINGS_FILE_NAME = 'settings.json';

  /**
   * 获取用户级配置目录路径
   */
  private static getUserSettingsDir(): string {
    return path.join(homedir(), this.SETTINGS_DIRECTORY_NAME);
  }

  /**
   * 获取用户级配置文件路径
   */
  private static getUserSettingsPath(): string {
    return path.join(this.getUserSettingsDir(), this.SETTINGS_FILE_NAME);
  }

  /**
   * 获取工作区级配置文件路径
   * 注意：工作区使用 .deepvcode 目录，与用户级 .deepv 区分
   */
  private static getWorkspaceSettingsPath(workspaceRoot: string): string {
    return path.join(workspaceRoot, this.WORKSPACE_SETTINGS_DIRECTORY_NAME, this.SETTINGS_FILE_NAME);
  }

  /**
   * 获取系统级配置文件路径
   */
  private static getSystemSettingsPath(): string {
    if (process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH) {
      return process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH;
    }
    if (platform() === 'darwin') {
      return '/Library/Application Support/DeepVCli/settings.json';
    } else if (platform() === 'win32') {
      return 'C:\\ProgramData\\deepv-cli\\settings.json';
    } else {
      return '/etc/deepv-cli/settings.json';
    }
  }

  /**
   * 从 JSON 文件读取配置（支持注释）
   */
  private static loadJsonFile(filePath: string): Record<string, any> | null {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const rawContent = fs.readFileSync(filePath, 'utf-8');
      // 使用 strip-json-comments 移除注释（与 CLI 一致）
      const jsonContent = stripJsonComments(rawContent);
      return JSON.parse(jsonContent);
    } catch (error) {
      console.error(`Failed to load settings from ${filePath}:`, error);
      return null;
    }
  }

  /**
   * 合并多个配置对象（后面的覆盖前面的）
   */
  private static mergeSettings(...settingsArray: (Record<string, any> | null)[]): Record<string, any> {
    const merged: Record<string, any> = {};

    for (const settings of settingsArray) {
      if (!settings) continue;

      for (const [key, value] of Object.entries(settings)) {
        if (key === 'mcpServers' && typeof value === 'object' && value !== null) {
          // mcpServers 需要深度合并
          merged.mcpServers = {
            ...(merged.mcpServers || {}),
            ...value,
          };
        } else {
          // 其他属性直接覆盖
          merged[key] = value;
        }
      }
    }

    return merged;
  }

  /**
   * 加载所有层级的配置并合并
   *
   * @param workspaceRoot 工作区根目录（可选）
   * @returns 合并后的配置对象
   */
  public static loadSettings(workspaceRoot?: string): {
    mcpServers: Record<string, MCPServerConfig>;
    allowMCPServers?: string[];
    excludeMCPServers?: string[];
    customProxyServerUrl?: string;
  } {
    // 按优先级加载配置（系统 < 用户 < 工作区）
    const systemSettings = this.loadJsonFile(this.getSystemSettingsPath());
    const userSettings = this.loadJsonFile(this.getUserSettingsPath());
    const workspaceSettings = workspaceRoot
      ? this.loadJsonFile(this.getWorkspaceSettingsPath(workspaceRoot))
      : null;

    // 合并配置
    const mergedSettings = this.mergeSettings(
      systemSettings,
      userSettings,
      workspaceSettings
    );

    return {
      mcpServers: mergedSettings.mcpServers || {},
      allowMCPServers: mergedSettings.allowMCPServers,
      excludeMCPServers: mergedSettings.excludeMCPServers,
      customProxyServerUrl: mergedSettings.customProxyServerUrl,
    };
  }

  /**
   * 加载 MCP 服务器配置（经过白名单/黑名单过滤）
   *
   * @param workspaceRoot 工作区根目录（可选）
   * @returns 过滤后的 MCP 服务器配置
   */
  public static loadMCPServers(workspaceRoot?: string): Record<string, MCPServerConfig> {
    const { mcpServers, allowMCPServers, excludeMCPServers } = this.loadSettings(workspaceRoot);

    let filteredServers = { ...mcpServers };

    // 应用白名单过滤
    if (allowMCPServers && allowMCPServers.length > 0) {
      const allowedNames = new Set(allowMCPServers.filter(Boolean));
      filteredServers = Object.fromEntries(
        Object.entries(filteredServers).filter(([key]) => allowedNames.has(key))
      );
    }

    // 应用黑名单过滤（优先级更高）
    if (excludeMCPServers && excludeMCPServers.length > 0) {
      const excludedNames = new Set(excludeMCPServers.filter(Boolean));
      filteredServers = Object.fromEntries(
        Object.entries(filteredServers).filter(([key]) => !excludedNames.has(key))
      );
    }

    return filteredServers;
  }

  /**
   * 保存 MCP 服务器配置到用户级配置文件
   *
   * @param serverName 服务器名称
   * @param serverConfig 服务器配置
   */
  public static async saveMCPServer(
    serverName: string,
    serverConfig: MCPServerConfig
  ): Promise<void> {
    const userSettingsPath = this.getUserSettingsPath();
    const userSettingsDir = this.getUserSettingsDir();

    // 确保配置目录存在
    if (!fs.existsSync(userSettingsDir)) {
      fs.mkdirSync(userSettingsDir, { recursive: true });
    }

    // 读取现有配置
    let settings = this.loadJsonFile(userSettingsPath) || {};

    // 更新 mcpServers
    if (!settings.mcpServers) {
      settings.mcpServers = {};
    }
    settings.mcpServers[serverName] = serverConfig;

    // 写入文件（格式化为可读的 JSON）
    fs.writeFileSync(
      userSettingsPath,
      JSON.stringify(settings, null, 2),
      'utf-8'
    );
  }

  /**
   * 删除 MCP 服务器配置
   *
   * @param serverName 服务器名称
   */
  public static async removeMCPServer(serverName: string): Promise<void> {
    const userSettingsPath = this.getUserSettingsPath();
    let settings = this.loadJsonFile(userSettingsPath);

    if (!settings || !settings.mcpServers) {
      return;
    }

    delete settings.mcpServers[serverName];

    fs.writeFileSync(
      userSettingsPath,
      JSON.stringify(settings, null, 2),
      'utf-8'
    );
  }

  /**
   * 检查配置文件是否存在
   */
  public static hasSettings(workspaceRoot?: string): {
    system: boolean;
    user: boolean;
    workspace: boolean;
  } {
    return {
      system: fs.existsSync(this.getSystemSettingsPath()),
      user: fs.existsSync(this.getUserSettingsPath()),
      workspace: workspaceRoot
        ? fs.existsSync(this.getWorkspaceSettingsPath(workspaceRoot))
        : false,
    };
  }

  /**
   * 获取所有配置文件路径（用于调试和用户查看）
   */
  public static getSettingsPaths(workspaceRoot?: string): {
    system: string;
    user: string;
    workspace?: string;
  } {
    return {
      system: this.getSystemSettingsPath(),
      user: this.getUserSettingsPath(),
      workspace: workspaceRoot
        ? this.getWorkspaceSettingsPath(workspaceRoot)
        : undefined,
    };
  }
}
