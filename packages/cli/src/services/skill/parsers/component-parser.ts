import path from 'path';
import fs from 'fs-extra';
import { UnifiedComponent, ComponentType } from '../models/unified.js';
import { MarkdownParser } from './markdown-parser.js';

/**
 * 通用组件解析器
 * 负责根据组件类型和文件格式选择正确的解析策略
 */
export class ComponentParser {
  private markdownParser: MarkdownParser;

  constructor() {
    this.markdownParser = new MarkdownParser();
  }

  /**
   * 解析组件
   * @param itemPath 组件路径（文件或目录）
   * @param type 组件类型
   * @param pluginId 所属插件 ID
   * @param marketplaceId 所属 Marketplace ID
   * @param pluginRoot 插件根目录（用于计算相对路径）
   */
  async parse(
    itemPath: string,
    type: ComponentType,
    pluginId: string,
    marketplaceId: string,
    pluginRoot: string
  ): Promise<UnifiedComponent | null> {
    try {
      const stat = await fs.stat(itemPath);

      // 1. 处理 Markdown 文件 (Agents, Commands)
      if (stat.isFile() && itemPath.endsWith('.md')) {
        const component = await this.markdownParser.parse(itemPath, type, pluginId, marketplaceId);

        // 修正相对路径
        component.location.relativePath = path.relative(pluginRoot, itemPath);

        return component;
      }

      // 2. 处理 Skill 目录 (DeepV Code Skills)
      if (stat.isDirectory() && type === ComponentType.SKILL) {
        const skillFile = path.join(itemPath, 'SKILL.md');
        if (await fs.pathExists(skillFile)) {
          // 复用 MarkdownParser 解析 SKILL.md
          const component = await this.markdownParser.parse(skillFile, type, pluginId, marketplaceId);

          // 修正位置信息指向目录
          component.location.type = 'directory';
          component.location.path = itemPath;
          component.location.relativePath = path.relative(pluginRoot, itemPath);

          // 修正名称（如果 SKILL.md 中没有 name，MarkdownParser 会用 SKILL 作为名字，这是不对的）
          if (component.name === 'SKILL') {
            component.name = path.basename(itemPath);
            // 更新 ID
            component.id = `${pluginId}:${component.name}`;
          }

          return component;
        }
      }

      // TODO: 处理其他类型 (Hooks, Scripts)

      return null;
    } catch (error) {
      console.warn(`Failed to parse component at ${itemPath}:`, error);
      return null;
    }
  }
}
