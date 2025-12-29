/**
 * Singleton Registry - 防止重复初始化关键组件
 *
 * @license Apache-2.0
 * Copyright 2025 DeepV Code
 */

interface SingletonInfo {
  instance: any;
  initTime: number;
  initCount: number;
}

class SingletonRegistry {
  private static instance: SingletonRegistry;
  private singletons = new Map<string, SingletonInfo>();

  static getInstance(): SingletonRegistry {
    if (!SingletonRegistry.instance) {
      SingletonRegistry.instance = new SingletonRegistry();
    }
    return SingletonRegistry.instance;
  }

  /**
   * 获取或创建单例实例
   * @param key 单例键名
   * @param factory 工厂函数
   * @returns 单例实例
   */
  getOrCreate<T>(key: string, factory: () => T): T {
    const existing = this.singletons.get(key);

    if (existing) {
      existing.initCount++;
      console.log(`🔄 [Singleton] Reusing ${key} (accessed ${existing.initCount} times, created ${Date.now() - existing.initTime}ms ago)`);
      return existing.instance;
    }

    console.log(`🆕 [Singleton] Creating ${key}`);
    const instance = factory();

    this.singletons.set(key, {
      instance,
      initTime: Date.now(),
      initCount: 1
    });

    return instance;
  }

  /**
   * 检查单例是否存在
   */
  has(key: string): boolean {
    return this.singletons.has(key);
  }

  /**
   * 强制重置单例（谨慎使用）
   */
  reset(key: string): void {
    if (this.singletons.has(key)) {
      console.log(`🔥 [Singleton] Reset ${key}`);
      this.singletons.delete(key);
    }
  }

  /**
   * 获取所有单例统计信息
   */
  getStats(): Array<{key: string; initCount: number; age: number}> {
    const now = Date.now();
    return Array.from(this.singletons.entries()).map(([key, info]) => ({
      key,
      initCount: info.initCount,
      age: now - info.initTime
    }));
  }

  /**
   * 清理所有单例（用于测试或重置）
   */
  clear(): void {
    console.log(`🧹 [Singleton] Clearing ${this.singletons.size} singletons`);
    this.singletons.clear();
  }
}

export const singletonRegistry = SingletonRegistry.getInstance();