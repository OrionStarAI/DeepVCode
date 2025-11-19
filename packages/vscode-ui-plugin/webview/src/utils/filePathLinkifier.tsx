/**
 * File Path Linkifier - 将文本中的文件路径转换为可点击链接
 */

import React from 'react';

// 文件路径正则：支持绝对路径、相对路径（必须有至少一级目录）
// 匹配格式：
//   - 绝对路径：/src/app.tsx 或 C:\project\main.py
//   - 相对路径：src/app.tsx 或 utils/helper.ts
const FILE_PATH_PATTERN = /((?:(?:\/|[a-zA-Z]:[\\/])[^\s\/\\]+[\\/][^\s]+|[a-zA-Z_][\w\-]*[\\/][^\s]+)\.(?:php|tsx?|jsx?|pyw?|java|kt|go|rs|c(?:pp)?|h(?:pp)?|vue|rb|swift|cs|scala|json|ya?ml|toml|md|html?))/gi;

interface FileLinkProps {
  filePath: string;
  children: React.ReactNode;
}

const FileLink: React.FC<FileLinkProps> = ({ filePath, children }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (window.vscode) {
      window.vscode.postMessage({
        type: 'open_file',
        payload: { filePath }
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
      title={`点击打开 ${filePath}`}
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

  const regex = new RegExp(FILE_PATH_PATTERN);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // 添加匹配前的普通文本
    if (match.index > lastIndex) {
      elements.push(text.substring(lastIndex, match.index));
    }

    // 添加文件链接
    const filePath = match[1];
    elements.push(
      <FileLink key={`file-${matchIndex++}`} filePath={filePath}>
        {match[0]}
      </FileLink>
    );

    lastIndex = match.index + match[0].length;
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