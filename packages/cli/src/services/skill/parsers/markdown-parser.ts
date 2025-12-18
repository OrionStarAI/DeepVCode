import fs from 'fs-extra';
import path from 'path';
import matter from 'gray-matter';
import { UnifiedComponent, ComponentType, ComponentSource, ComponentLoadLevel } from '../models/unified.js';

/**
 * Markdown 组件解析器
 * 负责解析 Claude Code 风格的 Markdown 组件定义 (Agents, Commands)
 */
export class MarkdownParser {
  /**
   * 解析 Markdown 文件为组件
   */
  async parse(
    filePath: string,
    type: ComponentType,
    pluginId: string,
    marketplaceId: string
  ): Promise<UnifiedComponent> {
    const content = await fs.readFile(filePath, 'utf-8');

    let data: any = {};
    let body = content;

    try {
      const result = matter(content);
      data = result.data;
      body = result.content;
    } catch (error) {
      const fallback = this.parseFallback(content);
      data = fallback.data;
      body = fallback.content;
    }

    // 确定名称：优先使用 frontmatter 中的 name，否则使用文件名
    let name = data.name;
    if (!name) {
      name = path.basename(filePath, '.md');
    }

    // 确定 ID
    const id = `${pluginId}:${name}`;

    return {
      id,
      type,
      name,
      description: data.description || '',
      version: data.version,
      author: data.author,

      source: ComponentSource.MARKETPLACE, // 默认为 Marketplace，调用者可覆盖
      location: {
        type: 'file',
        path: filePath,
        relativePath: path.basename(filePath) // 调用者应修正此路径
      },

      content: body,
      metadata: data,

      executable: true,
      scripts: [], // Markdown 组件通常没有关联脚本，或者是自包含的

      installed: true,
      enabled: true,
      loadLevel: ComponentLoadLevel.FULL, // Markdown 文件通常很小，直接加载全部

      pluginId,
      marketplaceId,

      category: data.category,
      tags: data.tags
    };
  }

  /**
   * 简单的 Frontmatter 解析回退方案
   * 用于处理格式不规范的 YAML (如 description 中包含未转义的冒号)
   */
  private parseFallback(content: string): { data: any, content: string } {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

    if (!match) {
      return { data: {}, content };
    }

    const frontmatterRaw = match[1];
    const body = match[2];
    const data: any = {};

    // 简单的行解析
    const lines = frontmatterRaw.split(/\r?\n/);
    let currentKey = '';
    let currentValue = '';

    for (const line of lines) {
      // 匹配 key: value
      const keyMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);

      if (keyMatch) {
        // 保存上一个键值对
        if (currentKey) {
          data[currentKey] = currentValue.trim();
        }

        currentKey = keyMatch[1];
        currentValue = keyMatch[2];
      } else {
        // 延续上一行 (处理多行 description)
        if (currentKey) {
          currentValue += '\n' + line;
        }
      }
    }

    // 保存最后一个键值对
    if (currentKey) {
      data[currentKey] = currentValue.trim();
    }

    return { data, content: body };
  }
}
