/**
 * @license
 * Copyright 2025 DeepV Code team
 * https://github.com/OrionStarAI/DeepVCode
 * SPDX-License-Identifier: Apache-2.0
 */
import { UnifiedComponent, UnifiedPlugin, ComponentQuery } from '../models/unified.js';

/**
 * 组件加载器接口
 * 负责发现和加载组件
 */
export interface IComponentLoader {
  /**
   * 加载所有组件
   */
  load(): Promise<UnifiedComponent[]>;

  /**
   * 加载特定组件的详细信息
   */
  loadDetails(componentId: string): Promise<UnifiedComponent | null>;
}

/**
 * 插件加载器接口
 * 负责发现和加载插件及其包含的组件
 */
export interface IPluginLoader {
  /**
   * 加载所有插件
   */
  loadPlugins(): Promise<UnifiedPlugin[]>;

  /**
   * 加载特定插件
   */
  loadPlugin(pluginId: string): Promise<UnifiedPlugin | null>;
}

/**
 * 统一加载器服务接口
 * 主入口点
 */
export interface IUnifiedLoaderService {
  /**
   * 初始化加载器
   */
  initialize(): Promise<void>;

  /**
   * 获取所有已加载的组件
   */
  getComponents(query?: ComponentQuery): Promise<UnifiedComponent[]>;

  /**
   * 获取所有已加载的插件
   */
  getPlugins(): Promise<UnifiedPlugin[]>;

  /**
   * 刷新加载（重新扫描）
   */
  refresh(): Promise<void>;
}
