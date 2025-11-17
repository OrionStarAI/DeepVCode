/**
 * File Path Linkifier - 将文本中的文件路径和行号转换为可点击链接
 */

import React from 'react';

// 文件路径+行号的正则模式
// 支持格式：
// 1. /path/to/file.py:931 (VSCode 格式)
// 2. 文件路径：/path/to/file.py (带前缀)
// 3. file.py 第 415 行 (中文格式)
// 4. file.py（第432-491行）(带括号的行号范围)
// 5. src/ai/processor.py:931 (相对路径+行号)
// 6. src/ai/processor.py::method() (带方法名)
// 7. src/web/static/js/poster_editor.js - 主逻辑 (带描述)
// 8. L1280, L332, L403-407 (GitHub 风格行号)
const FILE_PATH_PATTERN = /(?:文件路径?[:：]\s*)?((?:\/[^\s:：()（）\n]+|[a-zA-Z]:[^\s:：()（）\n]+|(?:[a-zA-Z0-9_\-]+\/)+[a-zA-Z0-9_\-]+)\.(?:php|tsx?|jsx?|pyw?|java|kt|go|rs|c(?:pp)?|h(?:pp)?|vue|rb|swift|cs|scala|json|ya?ml|toml|md|html?))(?:::[\w_]+\(\))?(?::(\d+))?(?:\s*(?:第|line|L)?\s*(\d+)(?:\s*[-~]\s*(\d+))?\s*[行]?)?(?:（第\s*(\d+)(?:\s*[-~]\s*(\d+))?\s*行）)?/gi;

// 方法名模式
// 匹配：public function batchClearFreezeEntityAccounts(Request $request)
const METHOD_PATTERN = /((?:public|private|protected|static)\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gi;

// 行号引用模式（需要上下文中有文件路径）
// 匹配：L1280 - _rewrite_content() 方法定义
// 匹配：L403-407 - 并行任务中调用改写
const LINE_REFERENCE_PATTERN = /\bL(\d+)(?:-L?(\d+))?\b(?:\s*[-–—]\s*([^\n]+))?/gi;

// 方法名+行号模式（需要上下文中有文件路径）
// 匹配：get_poster_history() (2202行)
// 匹配：poster_extract_content() (2606行)
const METHOD_WITH_LINE_PATTERN = /\b([a-zA-Z_]\w+)\s*\(\)\s*\((\d+)行\)/gi;

interface FileLinkProps {
  filePath: string;
  line?: number;
  symbol?: string;
  children: React.ReactNode;
}

const FileLink: React.FC<FileLinkProps> = ({ filePath, line, symbol, children }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 发送消息到 VSCode 扩展
    if (window.vscode) {
      window.vscode.postMessage({
        type: 'open_file',
        payload: {
          filePath,
          line,
          symbol
        }
      });
    }
  };

  return (
    <span
      className="file-path-link"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick(e as any);
        }
      }}
      title={`点击打开 ${filePath}${line ? ` (第 ${line} 行)` : ''}${symbol ? ` - 方法 ${symbol}()` : ''}`}
    >
      {children}
    </span>
  );
};

interface LineLinkProps {
  line: number;
  children: React.ReactNode;
}

const LineLink: React.FC<LineLinkProps> = ({ line, children }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 发送消息到 VSCode 扩展
    if (window.vscode) {
      window.vscode.postMessage({
        type: 'goto_line',
        payload: {
          line
        }
      });
    }
  };

  return (
    <span
      className="file-path-link"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick(e as any);
        }
      }}
      title={`点击跳转到第 ${line} 行（当前文件）`}
    >
      {children}
    </span>
  );
};

interface MethodLinkProps {
  methodName: string;
  children: React.ReactNode;
}

const MethodLink: React.FC<MethodLinkProps> = ({ methodName, children }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 发送消息到 VSCode 扩展
    if (window.vscode) {
      window.vscode.postMessage({
        type: 'goto_symbol',
        payload: {
          symbol: methodName
        }
      });
    }
  };

  return (
    <span
      className="method-name-link"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick(e as any);
        }
      }}
      title={`点击跳转到方法 ${methodName}`}
    >
      {children}
    </span>
  );
};

// 全局上下文：记住最近提到的文件路径
let lastMentionedFilePath: string | null = null;

/**
 * 将文本内容转换为带有可点击文件链接的 React 元素
 */
export function linkifyText(text: string): React.ReactNode {
  if (!text) return text;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let globalMatchIndex = 0;

  // 先处理文件路径+行号
  const fileMatches: Array<{ index: number; match: RegExpExecArray }> = [];
  let fileMatch: RegExpExecArray | null;
  const fileRegex = new RegExp(FILE_PATH_PATTERN);

  while ((fileMatch = fileRegex.exec(text)) !== null) {
    fileMatches.push({ index: fileMatch.index, match: fileMatch });
  }

  // 提取上下文文件路径（用于后续的方法名+行号匹配）
  let contextFilePath: string | null = null;
  if (fileMatches.length > 0) {
    // 使用最后一个文件路径作为上下文
    contextFilePath = fileMatches[fileMatches.length - 1].match[1];
  }

  // 再处理方法名
  const methodMatches: Array<{ index: number; match: RegExpExecArray }> = [];
  let methodMatch: RegExpExecArray | null;
  const methodRegex = new RegExp(METHOD_PATTERN);

  while ((methodMatch = methodRegex.exec(text)) !== null) {
    methodMatches.push({ index: methodMatch.index, match: methodMatch });
  }

  // 处理行号引用（L1280, L403-407 等）
  const lineMatches: Array<{ index: number; match: RegExpExecArray }> = [];
  let lineMatch: RegExpExecArray | null;
  const lineRegex = new RegExp(LINE_REFERENCE_PATTERN);

  while ((lineMatch = lineRegex.exec(text)) !== null) {
    lineMatches.push({ index: lineMatch.index, match: lineMatch });
  }

  // 处理方法名+行号（需要上下文文件路径）
  const methodWithLineMatches: Array<{ index: number; match: RegExpExecArray }> = [];
  if (contextFilePath) {
    let methodLineMatch: RegExpExecArray | null;
    const methodLineRegex = new RegExp(METHOD_WITH_LINE_PATTERN);

    while ((methodLineMatch = methodLineRegex.exec(text)) !== null) {
      methodWithLineMatches.push({ index: methodLineMatch.index, match: methodLineMatch });
    }
  }

  // 合并并排序所有匹配
  const allMatches = [
    ...fileMatches.map(m => ({ ...m, type: 'file' as const })),
    ...methodMatches.map(m => ({ ...m, type: 'method' as const })),
    ...lineMatches.map(m => ({ ...m, type: 'line' as const })),
    ...methodWithLineMatches.map(m => ({ ...m, type: 'method-with-line' as const, contextFile: contextFilePath }))
  ].sort((a, b) => a.index - b.index);

  // 处理所有匹配
  for (const item of allMatches) {
    const { index, match, type } = item;
    // 添加匹配前的普通文本
    if (index > lastIndex) {
      elements.push(text.substring(lastIndex, index));
    }

    if (type === 'file') {
      const filePath = match[1];
      const fullMatch = match[0];

      // 提取方法名（如果有 ::method() 格式）
      let symbolName: string | undefined;
      const symbolMatch = /::(\w+)\(\)/.exec(fullMatch);
      if (symbolMatch) {
        symbolName = symbolMatch[1];
      }

      // 提取行号：优先级 :行号 > 第X行 > （第X行）> （第X-Y行）取第一个
      let lineNumber: number | undefined;

      if (match[2]) {
        // :931 格式
        lineNumber = parseInt(match[2], 10);
      } else if (match[3]) {
        // 第 415 行格式
        lineNumber = parseInt(match[3], 10);
      } else if (match[5]) {
        // （第432行）格式
        lineNumber = parseInt(match[5], 10);
      }

      elements.push(
        <FileLink
          key={`file-${globalMatchIndex++}`}
          filePath={filePath}
          line={lineNumber}
          symbol={symbolName}
        >
          {match[0]}
        </FileLink>
      );
    } else if (type === 'method') {
      const methodName = match[2];

      elements.push(
        <MethodLink key={`method-${globalMatchIndex++}`} methodName={methodName}>
          {match[0]}
        </MethodLink>
      );
    } else if (type === 'line') {
      const lineNumber = parseInt(match[1], 10);

      elements.push(
        <LineLink key={`line-${globalMatchIndex++}`} line={lineNumber}>
          {match[0]}
        </LineLink>
      );
    } else if (type === 'method-with-line') {
      // 方法名+行号，使用上下文文件路径
      const methodName = match[1];
      const lineNumber = parseInt(match[2], 10);
      const contextFile = (item as any).contextFile;

      if (contextFile) {
        elements.push(
          <FileLink
            key={`method-line-${globalMatchIndex++}`}
            filePath={contextFile}
            line={lineNumber}
            symbol={methodName}
          >
            {match[0]}
          </FileLink>
        );
      } else {
        // 没有上下文文件，保持原样
        elements.push(match[0]);
      }
    }

    lastIndex = index + match[0].length;
  }

  // 添加剩余的普通文本
  if (lastIndex < text.length) {
    elements.push(text.substring(lastIndex));
  }

  // 如果没有任何匹配，返回原始文本
  if (elements.length === 0) {
    return text;
  }

  // 包裹在 Fragment 中返回
  return <>{elements}</>;
}

/**
 * 处理 React Markdown 的文本节点
 */
export function linkifyTextNode(children: React.ReactNode): React.ReactNode {
  if (typeof children === 'string') {
    return linkifyText(children);
  }

  if (Array.isArray(children)) {
    return children.map((child, index) => {
      if (typeof child === 'string') {
        return <React.Fragment key={index}>{linkifyText(child)}</React.Fragment>;
      }
      return child;
    });
  }

  return children;
}
