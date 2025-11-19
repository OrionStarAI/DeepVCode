/**
 * File Path Linkifier - 将文本中的文件路径转换为可点击链接
 * 支持多种行号格式，点击可跳转到指定行
 */

import React from 'react';

// 文件扩展名列表
const FILE_EXTENSIONS = 'php|tsx?|jsx?|pyw?|java|kt|go|rs|c(?:pp)?|h(?:pp)?|vue|rb|swift|cs|scala|json|ya?ml|toml|md|html?';

// 路径匹配部分（支持绝对路径和相对路径，必须有至少一级目录）
// Unix 绝对路径: /path/to/file
// Windows 绝对路径: C:\path\to\file 或 C:/path/to/file
// 相对路径: path/to/file 或 path\to\file
const PATH_PART = '(?:(?:\/|[a-zA-Z]:[\\\/])[^\\s:]+|(?:[a-zA-Z][a-zA-Z0-9_\\-]*[\\/])+[^\\s:\/\\\\]+)';

// 文件路径模式（按优先级排序，带行号的优先匹配）
const FILE_PATH_PATTERNS = [
  // 1. 冒号 + 行号范围：src/main.py:100-200
  new RegExp(`(${PATH_PART}\\.(?:${FILE_EXTENSIONS})):(\\d+)-(\\d+)`, 'gi'),

  // 2. 冒号 + 单行号：src/main.py:655
  new RegExp(`(${PATH_PART}\\.(?:${FILE_EXTENSIONS})):(\\d+)`, 'gi'),

  // 3. 空格 + L + 行号范围：src/main.py L100-200 或 L100-L200
  new RegExp(`(${PATH_PART}\\.(?:${FILE_EXTENSIONS}))\\s+L(\\d+)-L?(\\d+)`, 'gi'),

  // 4. 空格 + L + 单行号：src/main.py L100
  new RegExp(`(${PATH_PART}\\.(?:${FILE_EXTENSIONS}))\\s+L(\\d+)`, 'gi'),

  // 5. 粘连 L + 行号：src/main.pyL100（无空格）
  new RegExp(`(${PATH_PART}\\.(?:${FILE_EXTENSIONS}))L(\\d+)`, 'gi'),

  // 6. 括号 + L + 行号范围：src/main.py (L100-200)
  new RegExp(`(${PATH_PART}\\.(?:${FILE_EXTENSIONS}))\\s*\\(L(\\d+)-L?(\\d+)\\)`, 'gi'),

  // 7. 括号 + L + 单行号：src/main.py (L655)
  new RegExp(`(${PATH_PART}\\.(?:${FILE_EXTENSIONS}))\\s*\\(L(\\d+)\\)`, 'gi'),

  // 8. 括号 + 中文行：src/main.py (158行)
  new RegExp(`(${PATH_PART}\\.(?:${FILE_EXTENSIONS}))\\s*\\((\\d+)行\\)`, 'gi'),

  // 9. 中文格式：src/main.py 第 128 行
  new RegExp(`(${PATH_PART}\\.(?:${FILE_EXTENSIONS}))\\s+第\\s*(\\d+)\\s*行`, 'gi'),

  // 10. 纯路径（最低优先级，不带行号）
  new RegExp(`(${PATH_PART}\\.(?:${FILE_EXTENSIONS}))(?=\\s|$|[,;:.!?)])`, 'gi')
];

interface FileLinkProps {
  filePath: string;
  lineNumber?: number;
  children: React.ReactNode;
}

const FileLink: React.FC<FileLinkProps> = ({ filePath, lineNumber, children }) => {
  const triggerOpen = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 调试日志
    console.log('🔍 FileLink 点击:', { filePath, lineNumber });

    if (window.vscode) {
      const message = {
        type: 'open_file' as const,
        payload: { filePath, line: lineNumber }
      };
      console.log('📤 发送消息给 VSCode:', message);
      window.vscode.postMessage(message);
    } else {
      console.warn('❌ window.vscode 不存在');
    }
  };

  return (
    <span
      className="file-path-link"
      onClick={triggerOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          triggerOpen(e);
        }
      }}
      title={`点击打开 ${filePath}${lineNumber ? ` (第 ${lineNumber} 行)` : ''}`}
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
  let matchIndex = 0;

  // 收集所有匹配（带优先级）
  const allMatches: Array<{
    index: number;
    length: number;
    filePath: string;
    lineNumber?: number;
    fullMatch: string;
    priority: number;
  }> = [];

  FILE_PATH_PATTERNS.forEach((regex, priority) => {
    // 重置正则的 lastIndex，确保从头开始匹配
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const filePath = match[1];
      const startLine = match[2] ? parseInt(match[2], 10) : undefined;
      const endLine = match[3] ? parseInt(match[3], 10) : undefined;

      // 如果有范围，使用起始行号
      const lineNumber = startLine;

      allMatches.push({
        index: match.index,
        length: match[0].length,
        filePath,
        lineNumber,
        fullMatch: match[0],
        priority
      });
    }
  });

  // 按位置排序，同一位置时优先级小的优先
  allMatches.sort((a, b) => {
    if (a.index !== b.index) {
      return a.index - b.index;
    }
    // 同一个 index 时，优先级小的（数组前面的）先处理
    return a.priority - b.priority;
  });

  // 处理所有匹配，跳过重叠的
  for (const item of allMatches) {
    // 跳过重叠的匹配
    if (item.index < lastIndex) {
      continue;
    }

    // 添加匹配前的普通文本
    if (item.index > lastIndex) {
      elements.push(text.substring(lastIndex, item.index));
    }

    // 添加文件链接
    elements.push(
      <FileLink
        key={`file-${matchIndex++}`}
        filePath={item.filePath}
        lineNumber={item.lineNumber}
      >
        {item.fullMatch}
      </FileLink>
    );

    lastIndex = item.index + item.length;
  }

  // 添加剩余文本
  if (lastIndex < text.length) {
    elements.push(text.substring(lastIndex));
  }

  return elements.length > 0 ? <>{elements}</> : text;
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