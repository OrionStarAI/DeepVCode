import {
  UnifiedComponent,
  UnifiedPlugin,
  ComponentQuery,
  ComponentType
} from '../models/unified.js';
import { IUnifiedLoaderService, IComponentLoader, IPluginLoader } from './types.js';

/**
 * 通用组件加载器
 *
 * 系统的核心服务，负责协调从不同来源（Marketplace, Extensions, Local）加载组件。
 * 它维护组件的缓存和索引，并提供统一的查询接口。
 */
export class UniversalComponentLoader implements IUnifiedLoaderService {
  private components: Map<string, UnifiedComponent> = new Map();
  private plugins: Map<string, UnifiedPlugin> = new Map();
  private loaders: (IComponentLoader | IPluginLoader)[] = [];
  private initialized = false;

  constructor() {
    // TODO: Initialize specific loaders here
    // this.loaders.push(new MarketplaceLoader());
    // this.loaders.push(new ExtensionLoader());
  }

  /**
   * 初始化加载器并加载所有组件
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.refresh();
    this.initialized = true;
  }

  /**
   * 刷新所有组件（重新扫描）
   */
  async refresh(): Promise<void> {
    this.components.clear();
    this.plugins.clear();

    // 并行执行所有加载器
    const results = await Promise.all(
      this.loaders.map(async (loader) => {
        try {
          if ('loadPlugins' in loader) {
            return await loader.loadPlugins();
          } else if ('load' in loader) {
            return await loader.load();
          }
          return [];
        } catch (error) {
          console.error('Failed to load from loader:', error);
          return [];
        }
      })
    );

    // 处理结果
    for (const result of results) {
      if (Array.isArray(result)) {
        for (const item of result) {
          if (this.isPlugin(item)) {
            this.registerPlugin(item);
          } else {
            this.registerComponent(item);
          }
        }
      }
    }
  }

  /**
   * 获取组件
   */
  async getComponents(query?: ComponentQuery): Promise<UnifiedComponent[]> {
    if (!this.initialized) await this.initialize();

    let results = Array.from(this.components.values());

    if (!query) return results;

    return results.filter(comp => {
      // Type filter
      if (query.type) {
        const types = Array.isArray(query.type) ? query.type : [query.type];
        if (!types.includes(comp.type)) return false;
      }

      // Source filter
      if (query.source && comp.source !== query.source) return false;

      // ID filters
      if (query.marketplaceId && comp.marketplaceId !== query.marketplaceId) return false;
      if (query.pluginId && comp.pluginId !== query.pluginId) return false;

      // Status filter
      if (query.enabled !== undefined && comp.enabled !== query.enabled) return false;

      // Search filter (fuzzy)
      if (query.search) {
        const searchLower = query.search.toLowerCase();
        return (
          comp.name.toLowerCase().includes(searchLower) ||
          comp.description.toLowerCase().includes(searchLower) ||
          comp.id.toLowerCase().includes(searchLower)
        );
      }

      // Tags filter
      if (query.tags && query.tags.length > 0) {
        if (!comp.tags) return false;
        return query.tags.some(tag => comp.tags!.includes(tag));
      }

      return true;
    });
  }

  /**
   * 获取插件
   */
  async getPlugins(): Promise<UnifiedPlugin[]> {
    if (!this.initialized) await this.initialize();
    return Array.from(this.plugins.values());
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private isPlugin(item: any): item is UnifiedPlugin {
    return 'components' in item && 'structure' in item;
  }

  private registerPlugin(plugin: UnifiedPlugin): void {
    this.plugins.set(plugin.id, plugin);
    // Also register all components within the plugin
    for (const component of plugin.components) {
      this.registerComponent(component);
    }
  }

  private registerComponent(component: UnifiedComponent): void {
    this.components.set(component.id, component);
  }
}
