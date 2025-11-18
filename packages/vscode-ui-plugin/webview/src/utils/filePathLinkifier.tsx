/**
 * File Path Linkifier - 将文本中的文件路径转换为可点击链接
 *
 * 核心策略：只匹配文件路径（必须有目录+扩展名）
 */

import React from 'react';

// 🎯 文件路径模式（严格匹配：必须有目录结构+扩展名）
const FILE_PATH_PATTERNS = [
  // 基础文件路径模式（支持带行号）
  /(?:文件路径?[:：]\s*)?((?:\/[^\s:：()（）\n]+|[a-zA-Z]:[^\s:：()（）\n]+|(?:[a-zA-Z0-9_\-]+\/)+[a-zA-Z0-9_\-]+)\.(?:php|tsx?|jsx?|pyw?|java|kt|go|rs|c(?:pp)?|h(?:pp)?|vue|rb|swift|cs|scala|json|ya?ml|toml|md|html?))(?:::[\w_]+\(\))?(?::(\d+))?(?:\s*(?:第|line|L)?\s*(\d+)(?:\s*[-~]\s*(\d+))?\s*[行]?)?(?:（第\s*(\d+)(?:\s*[-~]\s*(\d+))?\s*行）)?/gi,

  // Cursor 风格：文件路径 + 空格 + 行号
  /((?:\/[a-zA-Z0-9_\-\/]+|(?:[a-zA-Z0-9_\-]+[\/\\])+[a-zA-Z0-9_\-]+)\.(?:php|tsx?|jsx?|pyw?|java|kt|go|rs|c(?:pp)?|h(?:pp)?|vue|rb|swift|cs|scala|json|ya?ml|toml|md|html?))\s+L(\d+)(?:-L?(\d+))?/gi,

  // 括号格式：文件路径 (L行号)
  /((?:\/[a-zA-Z0-9_\-\/]+|(?:[a-zA-Z0-9_\-]+[\/\\])+[a-zA-Z0-9_\-]+)\.(?:php|tsx?|jsx?|pyw?|java|kt|go|rs|c(?:pp)?|h(?:pp)?|vue|rb|swift|cs|scala|json|ya?ml|toml|md|html?))\s*\(L(\d+)(?:-L?(\d+))?\)/gi
];

interface FileLinkProps {
  filePath: string;
  line?: number;
  children: React.ReactNode;
}

const FileLink: React.FC<FileLinkProps> = ({ filePath, line, children }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (window.vscode) {
      window.vscode.postMessage({
        type: 'open_file',
        payload: { filePath, lineNumber: line }
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
      title={`点击打开 ${filePath}${line ? ` (第 ${line} 行)` : ''}`}
    >
      {children}
    </span>
  );
};

/**
 * 将文本内容转换为带有可点击文件链接的 React 元素
 */
export function linkifyText(text: string): React.ReactNode {
  if (!text) return text;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let globalMatchIndex = 0;

  // 使用所有文件路径模式匹配
  const fileMatches: Array<{ index: number; match: RegExpExecArray; patternIndex: number }> = [];
  FILE_PATH_PATTERNS.forEach((pattern, patternIndex) => {
    const regex = new RegExp(pattern);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      fileMatches.push({ index: match.index, match, patternIndex });
    }
  });

  // 按位置排序
  fileMatches.sort((a, b) => a.index - b.index);

  // 处理所有匹配
  for (const item of fileMatches) {
    const { index, match, patternIndex } = item;

    // 添加匹配前的普通文本
    if (index > lastIndex) {
      elements.push(text.substring(lastIndex, index));
    }

    let filePath: string;
    let lineNumber: number | undefined;

    if (patternIndex === 0) {
      // 基础文件路径模式
      filePath = match[1];

      // 提取行号（如果有）
      if (match[2]) {
        lineNumber = parseInt(match[2], 10);
      } else if (match[3]) {
        lineNumber = parseInt(match[3], 10);
      } else if (match[5]) {
        lineNumber = parseInt(match[5], 10);
      }
    } else if (patternIndex === 1) {
      // Cursor 风格：文件路径 + 空格 + 行号
      filePath = match[1];
      lineNumber = parseInt(match[2], 10);
    } else if (patternIndex === 2) {
      // 括号格式：文件路径 (L行号)
      filePath = match[1];
      lineNumber = parseInt(match[2], 10);
    } else {
      filePath = match[1];
    }

    // 渲染文件链接
    elements.push(
      <FileLink
        key={`file-${globalMatchIndex++}`}
        filePath={filePath}
        line={lineNumber}
      >
        {match[0]}
      </FileLink>
    );

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