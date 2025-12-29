/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Part, FunctionResponse } from '@google/genai';
import { ContentGenerator } from '../core/contentGenerator.js';
import { Config } from '../config/config.js';
import { tokenLimit } from '../core/tokenLimits.js';
import { logger } from '../utils/enhancedLogger.js';
import fs from 'fs';
import path from 'path';

/**
 * MCP响应保护配置
 */
export interface MCPResponseGuardConfig {
  /**
   * 单个MCP响应的最大大小（字节），超过这个值会被截断或存为文件
   * 默认: 100KB (100 * 1024) - 激进的限制，防止单个响应消耗过多上下文
   */
  maxResponseSize?: number;

  /**
   * 上下文剩余百分比低于此阈值时，启用激进截断
   * 默认: 20% (0.2)
   */
  contextLowThreshold?: number;

  /**
   * 上下文严重不足时的百分比阈值
   * 默认: 10% (0.1)
   */
  contextCriticalThreshold?: number;

  /**
   * 临时文件目录
   * 默认: 项目根目录下的 .deepvcode/mcp-tmp
   * 如果未找到项目目录，则使用 HOME/.deepvcode/mcp-tmp
   * 最后降级到系统临时目录
   */
  tempDir?: string;

  /**
   * 是否启用临时文件存储功能（超大响应转为文件）
   * 默认: true
   */
  enableTempFileStorage?: boolean;

  /**
   * 临时文件过期时间（毫秒），超过此时间的文件会被清理
   * 默认: 30分钟
   */
  tempFileTTL?: number;
}

/**
 * MCP响应处理结果
 */
export interface MCPResponseGuardResult {
  /**
   * 处理后的Part数组，可以直接加入历史
   */
  parts: Part[];

  /**
   * 原始响应大小（字节）
   */
  originalSize: number;

  /**
   * 处理后的响应大小（字节）
   */
  processedSize: number;

  /**
   * 是否进行了截断
   */
  wasTruncated: boolean;

  /**
   * 截断原因（如果有）
   */
  truncationReason?: string;

  /**
   * 是否转换为临时文件存储
   */
  wasStoredAsFile?: boolean;

  /**
   * 如果存储为文件，返回指导消息
   */
  guidanceMessage?: string;

  /**
   * 临时文件路径（如果有）
   */
  tempFilePath?: string;

  /**
   * 对上下文的估计Token消耗
   */
  estimatedTokens: number;
}

/**
 * MCP响应保护服务
 * 防止大型MCP响应导致Token计算异常
 */
export class MCPResponseGuard {
  private readonly maxResponseSize: number;
  private readonly contextLowThreshold: number;
  private readonly contextCriticalThreshold: number;
  private readonly tempDir: string;
  private readonly enableTempFileStorage: boolean;
  private readonly tempFileTTL: number;
  private tempFiles: Map<string, number> = new Map(); // 文件路径 -> 创建时间

  constructor(config: MCPResponseGuardConfig = {}) {
    this.maxResponseSize = config.maxResponseSize ?? 100 * 1024; // 100KB - 激进限制
    this.contextLowThreshold = config.contextLowThreshold ?? 0.2; // 20%
    this.contextCriticalThreshold = config.contextCriticalThreshold ?? 0.1; // 10%
    this.tempDir = config.tempDir || this.getProjectTempDir();
    this.enableTempFileStorage = config.enableTempFileStorage ?? true;
    this.tempFileTTL = config.tempFileTTL ?? 30 * 60 * 1000; // 30分钟

    // 确保临时目录存在
    if (this.enableTempFileStorage && !fs.existsSync(this.tempDir)) {
      try {
        fs.mkdirSync(this.tempDir, { recursive: true });
        logger.info(`[MCPResponseGuard] Created temp directory: ${this.tempDir}`);
      } catch (error) {
        logger.warn(`[MCPResponseGuard] Failed to create temp directory: ${error}`);
      }
    }

    // 启动清理任务
    this.startCleanupTask();
  }

  /**
   * 获取项目临时目录
   * 存储在 .deepvcode/mcp-tmp 下，避免系统临时目录问题
   */
  private getProjectTempDir(): string {
    // 尝试获取项目根目录，如果不可用则使用系统临时目录
    try {
      // 从当前工作目录向上查找 .deepvcode 文件夹
      let currentDir = process.cwd();
      let depth = 0;
      const maxDepth = 10; // 最多向上查找10层

      while (depth < maxDepth) {
        const deepvcodePath = path.join(currentDir, '.deepvcode');
        if (fs.existsSync(deepvcodePath)) {
          return path.join(deepvcodePath, 'mcp-tmp');
        }
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) break; // 已到达文件系统根目录
        currentDir = parentDir;
        depth++;
      }
    } catch (error) {
      // 如果查找失败，继续使用备选方案
    }

    // 备选：使用 HOME/.deepvcode/mcp-tmp
    const homeDir = process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH;
    if (homeDir) {
      return path.join(homeDir, '.deepvcode', 'mcp-tmp');
    }

    // 最后的备选：使用系统临时目录
    if (process.platform === 'win32') {
      return path.join(process.env.TEMP || process.env.TMP || 'C:\\Windows\\Temp', 'deepvcode-mcp');
    } else {
      return path.join(process.env.TMPDIR || '/tmp', 'deepvcode-mcp');
    }
  }

  /**
   * 处理MCP工具响应，应用智能截断和文件存储
   * @param parts 原始MCP响应Part数组
   * @param config 配置
   * @param toolName MCP工具名称，用于日志和文件命名
   * @param currentContextUsage 当前上下文使用百分比（0-100），默认50%
   * @param contentGenerator 可选的内容生成器，用于精确token计算，如果不提供则使用启发式
   * @returns 处理结果
   */
  async guardResponse(
    parts: Part[],
    config: Config,
    toolName: string = 'unknown',
    currentContextUsage: number = 50,
    contentGenerator?: ContentGenerator
  ): Promise<MCPResponseGuardResult> {
    // 简化后的参数处理
    const actualToolName = toolName || 'unknown';
    const actualContextUsage = currentContextUsage ?? 50;
    const originalSize = JSON.stringify(parts).length;
    const originalSizeKB = (originalSize / 1024).toFixed(2);

    logger.info(`[MCPResponseGuard] Processing response from tool '${actualToolName}': ${originalSizeKB}KB, context usage: ${actualContextUsage.toFixed(1)}%`);

    // 初始化结果对象
    const result: MCPResponseGuardResult = {
      parts,
      originalSize,
      processedSize: originalSize,
      wasTruncated: false,
      estimatedTokens: 0,
    };

    // 步骤1: 估计响应的Token消耗
    try {
      result.estimatedTokens = await this.estimateTokens(
        parts,
        contentGenerator,
        config
      );
      logger.info(`[MCPResponseGuard] Estimated tokens for response: ${result.estimatedTokens}`);
    } catch (error) {
      logger.warn(`[MCPResponseGuard] Failed to estimate tokens: ${error}`);
      // 使用启发式估计: 1 token ≈ 4字符
      result.estimatedTokens = Math.ceil(originalSize / 4);
    }

    // 步骤2: 根据上下文情况决定处理策略
    const contextRemaining = 100 - actualContextUsage;
    const tokenLimit_ = tokenLimit(config.getModel(), config);
    const estimatedRemainingTokens = Math.floor((contextRemaining / 100) * tokenLimit_);

    if (originalSize <= this.maxResponseSize && result.estimatedTokens <= estimatedRemainingTokens * 0.5) {
      // 响应大小合理，无需处理
      logger.info(`[MCPResponseGuard] Response is within safe limits, no processing needed`);
      return result;
    }

    // 步骤3: 根据上下文紧张程度决定处理方式
    if (contextRemaining < this.contextCriticalThreshold * 100) {
      // 上下文严重不足：激进处理
      logger.warn(`[MCPResponseGuard] Context CRITICAL (${contextRemaining.toFixed(1)}% remaining). Applying aggressive truncation.`);
      return await this.handleCriticalContext(
        parts,
        actualToolName,
        originalSize,
        estimatedRemainingTokens,
        contentGenerator,
        config
      );
    } else if (contextRemaining < this.contextLowThreshold * 100) {
      // 上下文不足：适度处理
      logger.warn(`[MCPResponseGuard] Context low (${contextRemaining.toFixed(1)}% remaining). Applying moderate truncation.`);
      return await this.handleLowContext(
        parts,
        actualToolName,
        originalSize,
        estimatedRemainingTokens,
        contentGenerator,
        config
      );
    } else if (originalSize > this.maxResponseSize) {
      // 响应过大：使用文件存储
      logger.warn(`[MCPResponseGuard] Response exceeds max size (${originalSizeKB}KB > ${(this.maxResponseSize / 1024).toFixed(2)}KB). Using file storage.`);
      return await this.storeAsFile(
        parts,
        actualToolName,
        originalSize,
        estimatedRemainingTokens,
        contentGenerator,
        config
      );
    }

    return result;
  }

  /**
   * 处理上下文严重不足的情况
   */
  private async handleCriticalContext(
    parts: Part[],
    toolName: string,
    originalSize: number,
    estimatedRemainingTokens: number,
    contentGenerator: ContentGenerator | undefined,
    config: Config
  ): Promise<MCPResponseGuardResult> {
    // 立即转为文件存储
    return await this.storeAsFile(
      parts,
      toolName,
      originalSize,
      estimatedRemainingTokens,
      contentGenerator,
      config,
      true // forceTruncateGuidance
    );
  }

  /**
   * 处理上下文不足的情况
   */
  private async handleLowContext(
    parts: Part[],
    toolName: string,
    originalSize: number,
    estimatedRemainingTokens: number,
    contentGenerator: ContentGenerator | undefined,
    config: Config
  ): Promise<MCPResponseGuardResult> {
    // 尝试截断到剩余空间的50%
    const targetSize = estimatedRemainingTokens * 2; // 假设1 token ≈ 2字符（保守估计）

    if (originalSize > targetSize) {
      // 需要截断或转为文件
      if (originalSize > this.maxResponseSize * 2) {
        // 太大，直接转为文件
        return await this.storeAsFile(
          parts,
          toolName,
          originalSize,
          estimatedRemainingTokens,
          contentGenerator,
          config
        );
      } else {
        // 可以截断处理
        return this.truncateResponse(
          parts,
          targetSize,
          '上下文空间不足，响应已被截断。使用搜索工具从文件中获取详细信息。',
          originalSize,
          estimatedRemainingTokens
        );
      }
    }

    return {
      parts,
      originalSize,
      processedSize: originalSize,
      wasTruncated: false,
      estimatedTokens: Math.ceil(originalSize / 2),
    };
  }

  /**
   * 将响应存储为临时文件
   */
  private async storeAsFile(
    parts: Part[],
    toolName: string,
    originalSize: number,
    estimatedRemainingTokens: number,
    contentGenerator: ContentGenerator | undefined,
    config: Config,
    forceTruncateGuidance: boolean = false
  ): Promise<MCPResponseGuardResult> {
    if (!this.enableTempFileStorage) {
      // 如果不支持文件存储，进行激进截断
      return this.truncateResponse(
        parts,
        estimatedRemainingTokens * 2,
        '响应过大且无法存储为临时文件，已被激进截断。建议使用搜索工具获取特定信息。',
        originalSize,
        estimatedRemainingTokens
      );
    }

    try {
      // 检测是否为单行巨大字符串（比如浏览器返回的DOM）
      const isSingleLineMassiveContent = this.isSingleLineMassiveContent(parts);

      let filePath: string;
      let storedAsPlainText = false;
      let storedAsHtml = false;
      const timestamp = Date.now();

      if (isSingleLineMassiveContent) {
        // 检测是否为HTML/DOM内容
        const htmlContent = this.extractHtmlContent(parts);

        if (htmlContent) {
          // HTML内容：格式化后保存为HTML文件
          storedAsHtml = true;
          const filename = `mcp-response-${toolName.replace(/[^a-z0-9-]/gi, '_')}-${timestamp}.html`;
          filePath = path.join(this.tempDir, filename);

          // 格式化HTML使其更易阅读和搜索
          const formattedHtml = this.formatHtml(htmlContent);
          fs.writeFileSync(filePath, formattedHtml, 'utf-8');
          logger.info(`[MCPResponseGuard] Stored HTML/DOM content as formatted HTML file: ${filePath}`);
        } else {
          // 其他单行巨大字符串：保存为plain text文件以便AI使用正则搜索
          storedAsPlainText = true;
          const filename = `mcp-response-${toolName.replace(/[^a-z0-9-]/gi, '_')}-${timestamp}.txt`;
          filePath = path.join(this.tempDir, filename);

          // 提取纯文本内容
          const plainContent = this.extractPlainText(parts);
          fs.writeFileSync(filePath, plainContent, 'utf-8');

          logger.info(`[MCPResponseGuard] Stored single-line massive content as plain text: ${filePath}`);
        }
      } else {
        // 正常情况：保存为formatted JSON便于阅读
        const filename = `mcp-response-${toolName.replace(/[^a-z0-9-]/gi, '_')}-${timestamp}.json`;
        filePath = path.join(this.tempDir, filename);

        const content = JSON.stringify(parts, null, 2);
        fs.writeFileSync(filePath, content, 'utf-8');

        logger.info(`[MCPResponseGuard] Stored response as JSON file: ${filePath}`);
      }

      this.tempFiles.set(filePath, timestamp);

      // 构建指导消息（会根据文件类型调整说明）
      const guidanceMessage = this.buildFileGuidanceMessage(
        filePath,
        originalSize,
        toolName,
        forceTruncateGuidance,
        storedAsPlainText,
        storedAsHtml
      );

      // 返回简化的响应 + 指导
      const simplifiedPart: Part = {
        text: guidanceMessage,
      };

      return {
        parts: [simplifiedPart],
        originalSize,
        processedSize: JSON.stringify([simplifiedPart]).length,
        wasTruncated: true,
        truncationReason: `Response stored as file due to size (${(originalSize / 1024).toFixed(2)}KB)`,
        wasStoredAsFile: true,
        guidanceMessage,
        tempFilePath: filePath,
        estimatedTokens: await this.estimateTokens(
          [simplifiedPart],
          contentGenerator,
          config
        ).catch(() => Math.ceil(guidanceMessage.length / 4)),
      };
    } catch (error) {
      logger.error(`[MCPResponseGuard] Failed to store response as file: ${error}`);
      // 降级到截断处理
      return this.truncateResponse(
        parts,
        estimatedRemainingTokens * 2,
        '响应过大且文件存储失败，已被截断。',
        originalSize,
        estimatedRemainingTokens
      );
    }
  }

  /**
   * 截断响应
   */
  private truncateResponse(
    parts: Part[],
    targetSize: number,
    reason: string,
    originalSize: number,
    estimatedRemainingTokens: number
  ): MCPResponseGuardResult {
    const truncatedParts = this.truncateParts(parts, targetSize);
    const processedSize = JSON.stringify(truncatedParts).length;

    return {
      parts: truncatedParts,
      originalSize,
      processedSize,
      wasTruncated: true,
      truncationReason: reason,
      estimatedTokens: Math.ceil(processedSize / 2),
    };
  }

  /**
   * 构建文件指导消息
   * 提供明确的工具使用指导，帮助AI理解如何访问存储的临时文件
   *
   * @param filePath 临时文件路径
   * @param originalSize 原始大小
   * @param toolName 工具名称
   * @param critical 是否为严重情况
   * @param isPlainText 是否为纯文本文件（而不是JSON）
   */
  private buildFileGuidanceMessage(
    filePath: string,
    originalSize: number,
    toolName: string,
    critical: boolean = false,
    isPlainText: boolean = false,
    isHtml: boolean = false
  ): string {
    const sizeKB = (originalSize / 1024).toFixed(2);
    const urgencyMarker = critical ? '⚠️ [CRITICAL]' : '📋';
    const fileType = isHtml ? 'HTML' : isPlainText ? 'plain text' : 'JSON';

    let searchExamples: string;
    if (isHtml) {
      // 对于HTML文件的搜索示例
      searchExamples = `- Find all div elements: \`pattern: "<div[^>]*>"\`
- Find elements with specific class: \`pattern: "class=\\\"[^\\\"]*button[^\\\"]*\\\""\`
- Find all links: \`pattern: "<a\\s+[^>]*href=\\\"([^\\\"]*)\\\""\`
- Find text content inside tags: \`pattern: ">([^<]+)</"\`
- Find specific attribute values: \`pattern: "data-id=\\\"([^\\\"]*)\\\""\`
- Find style attributes: \`pattern: "style=\\\"([^\\\"]*)\\\""\``;
    } else if (isPlainText) {
      // 对于其他纯文本内容的搜索示例
      searchExamples = `- Find all div elements: \`pattern: "<div[^>]*>"\`
- Find elements with specific class: \`pattern: "class=\\"[^\"]*button[^\"]*\\""\`
- Find all links: \`pattern: "<a\\s+[^>]*href=\\"([^\\"]*)\\""\`
- Find text content: \`pattern: ">([^<]+)</"\`
- Find specific attribute: \`pattern: "data-id=\\"([^\"]*)\\""\``;
    } else {
      // 对于JSON结构化内容的搜索示例
      searchExamples = `- Search for specific filename: \`pattern: "\.ts$"\` or \`pattern: "component"\`
- Search for errors: \`pattern: "error|Error|ERROR"\`
- Search for specific function: \`pattern: "function.*myFunction"\`
- Search for imports: \`pattern: "^import|^from"\``;
    }

    return `${urgencyMarker} **Large response from ${toolName} stored as temporary ${fileType} file**

**File location:** \`${filePath}\`
**Original size:** ${sizeKB}KB (too large to include directly due to context limitations)
**File format:** ${isPlainText ? '📄 Plain text (.txt) - single-line content' : '📋 JSON (.json) - structured data'}

---

## ⚡ **IMPORTANT - How to access the content:**

${isHtml
  ? `The response is stored as an **HTML file** containing the DOM/page structure. **You MUST use the search_file_content tool** with a regex pattern to extract specific HTML elements and attributes.`
  : isPlainText
  ? `The response is stored as a **plain text file** with single-line content (typical for HTML/DOM/large structured output). **You MUST use the search_file_content tool** with a regex pattern to extract specific information.`
  : `The response is stored as a **JSON file**. **You MUST use the search_file_content tool** with appropriate patterns to extract specific information.`}

### 🔍 **Recommended approach: Use search_file_content to find what you need**

**Step 1:** Think about what information you're looking for:
${isHtml
  ? `- HTML tags: \`<div>\`, \`<button>\`, \`<input>\`, etc.
- CSS classes and IDs: \`class="..."\`, \`id="..."\`
- HTML attributes: \`href=\`, \`src=\`, \`data-*\`, \`aria-*\`
- Element text content: \`>some text</\`
- Data attributes: Look for \`data-*\` patterns`
  : isPlainText
  ? `- HTML tags: \`<div>\`, \`<button>\`, \`class="..."\`, \`id="..."\`
- Attributes: \`href=\`, \`src=\`, \`data-*\`
- Text content: Specific words or numbers
- Structural elements: Look for closing tags or patterns`
  : `- Filenames, function names, error messages
- Paths, imports, specific keywords
- Any pattern you're looking for`}

**Step 2:** Use \`search_file_content\` with a regex pattern:

\`\`\`
search_file_content(
  pattern: "your_search_keyword_or_regex",
  path: "${filePath}"
)
\`\`\`

**Examples of useful searches:**
${searchExamples}

### 📖 **Alternative: Read the entire file (not recommended for large files)**

If you absolutely need to read the entire file:

\`\`\`
read_file(
  absolute_path: "${filePath}"
)
\`\`\`

---

**⚠️ Remember:**
- **Always use \`search_file_content\` with a specific pattern first** to avoid loading the entire large file into context
- This temporary file will be automatically deleted after 30 minutes
- ${isPlainText ? 'Since this is a single-line file, regex patterns are very important to extract meaningful substrings' : ''}
- If the search returns too much data, refine your pattern to be more specific`;
  }

  /**
   * 检测是否为单行巨大字符串内容或压缩JSON（如浏览器返回的DOM、大型评估脚本结果）
   * 这类内容的特点：
   * 1. 虽然看起来多行，但包含超长的单行字符串（如JSON中的"text"字段）
   * 2. 或者就是单行或少数几行的超长字符串
   * 3. 或者总体很大但行数很少（高密度内容）
   */
  private isSingleLineMassiveContent(parts: Part[]): boolean {
    if (!parts || parts.length === 0) return false;

    // 收集所有可能的文本内容（包括嵌套的functionResponse）
    const allTextContents: string[] = [];

    for (const part of parts) {
      // 直接的text字段
      if (part.text) {
        allTextContents.push(part.text);
      }

      // 嵌套的functionResponse.response.content[]
      if (part.functionResponse?.response?.content && Array.isArray(part.functionResponse.response.content)) {
        for (const contentItem of part.functionResponse.response.content) {
          if (typeof contentItem === 'string') {
            allTextContents.push(contentItem);
          } else if (contentItem && typeof contentItem === 'object' && 'text' in contentItem) {
            const text = (contentItem as any).text;
            if (text) {
              allTextContents.push(text);
            }
          }
        }
      }
    }

    if (allTextContents.length === 0) return false;

    // 计算文本行数、最长行、以及是否包含超长行
    let totalChars = 0;
    let totalLines = 0;
    let maxLineLength = 0;
    let hasExtremelyLongLine = false; // 是否有极长的单行

    for (const text of allTextContents) {
      const lines = text.split('\n');
      totalLines += lines.length;
      totalChars += text.length;

      for (const line of lines) {
        const lineLength = line.length;
        if (lineLength > maxLineLength) {
          maxLineLength = lineLength;
        }

        // 检测是否有极长的行（表示内部包含压缩的数据）
        if (lineLength > 50000) {
          hasExtremelyLongLine = true;
        }
      }
    }

    // 判断条件：满足以下任一条件即可
    const avgLineLength = totalLines > 0 ? totalChars / totalLines : 0;

    // 条件1: 完全单行或少数行 + 超长
    const isSingleLineMassive = totalLines <= 3 && (maxLineLength > 1000 || avgLineLength > 5000);

    // 条件2: 包含极长的单行（表示内部有压缩内容，如JSON中的超长字符串）
    const hasInternallyMassiveContent = hasExtremelyLongLine;

    // 条件3: 总体很大但行数少（文件大小/行数比很高）- 这是关键条件，适用于600KB的JSON
    const hasHighDensityContent = totalLines > 0 && totalLines < 100 && totalChars > 100000;

    const shouldStoreAsPlainText = isSingleLineMassive || hasInternallyMassiveContent || hasHighDensityContent;

    if (shouldStoreAsPlainText) {
      logger.info(
        `[MCPResponseGuard] Detected massive content needing plain text storage: ${totalLines} lines, max line: ${maxLineLength}chars, ` +
        `total: ${(totalChars / 1024).toFixed(2)}KB (single-line: ${isSingleLineMassive}, internally-massive: ${hasInternallyMassiveContent}, high-density: ${hasHighDensityContent})`,
      );
    }

    return shouldStoreAsPlainText;
  }

  /**
   * 检测并提取HTML内容（未转义的HTML或被转义的HTML字符串）
   * 返回提取的HTML，如果不是HTML内容则返回null
   *
   * 策略：
   * 1. 深度查找所有text内容（包括嵌套的functionResponse）
   * 2. 在原始text中查找HTML标签（可能被转义）
   * 3. 尝试解转义
   * 4. 验证解转义后是否为有效HTML
   */
  private extractHtmlContent(parts: Part[]): string | null {
    if (!parts || parts.length === 0) return null;

    for (const part of parts) {
      // 直接的text字段
      if (part.text && part.text.length > 0) {
        const htmlContent = this.checkAndUnescapeHtml(part.text);
        if (htmlContent) {
          logger.info('[MCPResponseGuard] Detected HTML content in part.text, extracting and saving as HTML file');
          return htmlContent;
        }
      }

      // 嵌套的functionResponse.response.content
      if (part.functionResponse?.response?.content && Array.isArray(part.functionResponse.response.content)) {
        for (const contentItem of part.functionResponse.response.content) {
          // 处理不同的content格式
          let textToCheck = '';

          if (typeof contentItem === 'string') {
            textToCheck = contentItem;
          } else if (contentItem && typeof contentItem === 'object' && 'text' in contentItem) {
            textToCheck = (contentItem as any).text;
          }

          if (textToCheck) {
            const htmlContent = this.checkAndUnescapeHtml(textToCheck);
            if (htmlContent) {
              logger.info('[MCPResponseGuard] Detected HTML content in functionResponse.response.content, extracting and saving as HTML file');
              return htmlContent;
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * 检查文本是否包含HTML，并尝试解转义
   * 返回解转义后的HTML或null
   */
  private checkAndUnescapeHtml(text: string): string | null {
    if (!text || text.length === 0) return null;

    // 检查是否包含HTML标签迹象（可能被转义）
    const hasHtmlIndicators =
      /\\+["']?<(html|head|body|div|section|main|article|span|p|form|input|button|a|img|ul|li|table|tr|td|th|script|style)\b/i.test(text) ||
      /<(html|head|body|div|section|main|article|span|p|form|input|button|a|img|ul|li|table|tr|td|th|script|style)\b/i.test(text);

    if (!hasHtmlIndicators) {
      return null;
    }

    // 尝试解转义
    const unescaped = this.unescapeHtml(text);

    // 检查解转义后是否包含有效的HTML标签
    if (/<(html|head|body|div|section|main|article)\b/i.test(unescaped)) {
      return unescaped;
    }

    return null;
  }

  /**
   * 对HTML字符串进行解转义
   * JSON中的转义规则：
   * - \\\" becomes "
   * - \\\\ becomes \
   * - \\n becomes newline
   * - \\t becomes tab
   * - \\r becomes carriage return
   */
  private unescapeHtml(text: string): string {
    // 使用简单的JSON.parse技巧来处理转义
    // 如果直接parse失败，使用手动处理

    try {
      // 尝试将文本作为JSON字符串解析
      // 用引号包装使其成为有效的JSON字符串
      const jsonStr = '"' + text + '"';
      return JSON.parse(jsonStr);
    } catch (e) {
      // 如果JSON.parse失败，使用手动转义处理
      let result = text;

      // 处理转义序列（顺序很重要）
      // 先处理双反斜杠
      result = result.replace(/\\\\/g, '__DOUBLE_BACKSLASH__');

      // 处理其他转义
      result = result.replace(/\\"/g, '"');
      result = result.replace(/\\n/g, '\n');
      result = result.replace(/\\t/g, '\t');
      result = result.replace(/\\r/g, '\r');
      result = result.replace(/\\\//g, '/');
      result = result.replace(/\\b/g, '\u0008');  // 退格字符
      result = result.replace(/\\f/g, '\u000c');  // 换页字符

      // 恢复双反斜杠
      result = result.replace(/__DOUBLE_BACKSLASH__/g, '\\');

      return result;
    }
  }

  /**
   * 格式化HTML，使其变成多行易读的格式
   * 主要用于处理被压缩成一行的HTML
   */
  private formatHtml(html: string): string {
    if (!html) return html;

    let formatted = html;

    // 1. 在标签前添加换行（但保留内联元素）
    // 块级元素：html, head, body, div, section, main, article, header, footer, nav,
    // p, h1-h6, ul, ol, li, table, tr, td, th, form, fieldset, etc.
    const blockElements = [
      'html', 'head', 'body', 'div', 'section', 'main', 'article',
      'header', 'footer', 'nav', 'aside', 'figure', 'figcaption',
      'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'col', 'colgroup',
      'form', 'fieldset', 'legend', 'label',
      'pre', 'code', 'blockquote', 'hr', 'br',
      'script', 'style', 'meta', 'link', 'title'
    ];

    // 为块级元素的开标签和闭标签前添加换行
    for (const tag of blockElements) {
      // 开标签前添加换行：</div> -> \n</div>
      formatted = formatted.replace(new RegExp(`</${tag}>`, 'gi'), `\n</${tag}>`);
      // 闭标签后添加换行：<div> -> <div>\n
      formatted = formatted.replace(new RegExp(`<${tag}(\\s|>)`, 'gi'), `\n<${tag}$1`);
    }

    // 2. 在某些自闭合标签后添加换行
    const selfClosingTags = ['br', 'hr', 'img', 'input', 'meta', 'link'];
    for (const tag of selfClosingTags) {
      formatted = formatted.replace(new RegExp(`<${tag}[^>]*>`, 'gi'), `/**
   * 从Part数组中提取纯文本内容
   */
  private extractPlainText(parts: Part[]): string {\n`);
    }

    // 3. 清理多余的空行
    formatted = formatted.replace(/\n\s*\n/g, '\n');

    // 4. 添加缩进（简单的缩进策略）
    const lines = formatted.split('\n');
    let indentLevel = 0;
    const indentedLines: string[] = [];

    for (let line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        // 跳过空行
        continue;
      }

      // 如果是闭标签，先减少缩进
      if (trimmed.startsWith('</')) {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      // 添加缩进
      const indentedLine = '  '.repeat(indentLevel) + trimmed;
      indentedLines.push(indentedLine);

      // 如果是开标签（但不是自闭合或闭标签），增加缩进
      if (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.endsWith('/>')) {
        // 检查是否是自闭合标签或这行同时有开闭标签
        const hasClosingTag = trimmed.includes(`</${trimmed.match(/<(\w+)/)?.[1]}>`) ||
                             trimmed.endsWith('/>');
        if (!hasClosingTag) {
          indentLevel++;
        }
      }
    }

    return indentedLines.join('\n');
  }

  /**
   * 从Part数组中提取纯文本内容
   */
  private extractPlainText(parts: Part[]): string {
    if (!parts || parts.length === 0) return '';

    const textContent: string[] = [];
    for (const part of parts) {
      if (part.text) {
        textContent.push(part.text);
      } else if (part.functionResponse?.response?.content) {
        // 如果有嵌套的content，也提取
        const content = part.functionResponse.response.content;
        if (Array.isArray(content)) {
          for (const item of content) {
            if (typeof item === 'string') {
              textContent.push(item);
            } else if (item && typeof item === 'object' && 'text' in item) {
              textContent.push((item as any).text);
            }
          }
        }
      }
    }

    return textContent.join('\n');
  }

  /**
   * 截断Part数组到目标大小
   */
  private truncateParts(parts: Part[], targetSize: number): Part[] {
    let currentSize = 0;
    const result: Part[] = [];

    for (const part of parts) {
      const partSize = JSON.stringify(part).length;

      if (currentSize + partSize <= targetSize) {
        result.push(part);
        currentSize += partSize;
      } else if (currentSize < targetSize) {
        // 部分加入这个part
        if (part.text) {
          const remainingSize = targetSize - currentSize;
          const truncatedText = part.text.substring(
            0,
            Math.max(50, remainingSize - 20) // 保留至少50个字符
          );
          result.push({
            text: truncatedText + '\n... [TRUNCATED - use search_file_content to find specific information]',
          });
        }
        break;
      } else {
        // 已经超过目标大小
        break;
      }
    }

    if (result.length === 0 && parts.length > 0) {
      // 至少保留第一个part的简化版本
      result.push({
        text: '... [Response too large, use search tools to find specific information]',
      });
    }

    return result;
  }

  /**
   * 估计Part数组的Token数量
   */
  private async estimateTokens(
    parts: Part[],
    contentGenerator: ContentGenerator | undefined,
    config: Config
  ): Promise<number> {
    // 如果有ContentGenerator，使用精确计算
    if (contentGenerator) {
      try {
        const result = await contentGenerator.countTokens({
          model: config.getModel(),
          contents: [
            {
              role: 'user',
              parts,
            },
          ],
        });
        return result.totalTokens || 0;
      } catch (error) {
        logger.warn(`[MCPResponseGuard] Token estimation failed: ${error}`);
      }
    }

    // 降级到启发式估计：1 token ≈ 4字符
    const contentSize = JSON.stringify(parts).length;
    return Math.ceil(contentSize / 4);
  }

  /**
   * 启动定期清理任务
   */
  private startCleanupTask(): void {
    // 每5分钟检查一次并清理过期的临时文件
    setInterval(() => {
      this.cleanupExpiredTempFiles();
    }, 5 * 60 * 1000);
  }

  /**
   * 清理过期的临时文件
   */
  private cleanupExpiredTempFiles(): void {
    const now = Date.now();
    const filesToDelete: string[] = [];

    for (const [filePath, createdTime] of this.tempFiles.entries()) {
      if (now - createdTime > this.tempFileTTL) {
        filesToDelete.push(filePath);
      }
    }

    for (const filePath of filesToDelete) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          logger.info(`[MCPResponseGuard] Cleaned up expired temp file: ${filePath}`);
        }
        this.tempFiles.delete(filePath);
      } catch (error) {
        logger.warn(`[MCPResponseGuard] Failed to delete temp file ${filePath}: ${error}`);
      }
    }
  }

  /**
   * 手动清理所有临时文件
   */
  async cleanup(): Promise<void> {
    for (const filePath of this.tempFiles.keys()) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        logger.warn(`[MCPResponseGuard] Failed to cleanup temp file ${filePath}: ${error}`);
      }
    }
    this.tempFiles.clear();
  }

  /**
   * 获取当前临时文件列表（用于测试）
   */
  getTempFiles(): string[] {
    return Array.from(this.tempFiles.keys());
  }
}

// 导出单例
export const globalMCPResponseGuard = new MCPResponseGuard();
