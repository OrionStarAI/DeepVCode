/**
 * 代码引用节点
 * Lexical 自定义节点，用于在编辑器中显示代码片段引用（带文件名和行号）
 */

import React from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { DecoratorNode, NodeKey, LexicalNode } from 'lexical';

export interface CodeReference {
  fileName: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
  code: string;
}

// 🎯 代码引用节点的 React 组件
function CodeReferenceComponent({
  fileName,
  filePath,
  startLine,
  endLine,
  nodeKey
}: {
  fileName: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
  nodeKey: NodeKey;
}) {
  const [editor] = useLexicalComposerContext();

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    editor.update(() => {
      const node = editor.getEditorState()._nodeMap.get(nodeKey);
      if (node) {
        node.remove();
      }
    });
  };

  // 🎯 格式化行号显示
  const getLineDisplay = () => {
    if (startLine && endLine && startLine !== endLine) {
      return `${startLine}-${endLine}`;
    } else if (startLine) {
      return `${startLine}`;
    }
    return '';
  };

  const lineDisplay = getLineDisplay();

  return (
    <span
      className="inline-code-ref-tag"
      contentEditable={false}
      title={filePath}
    >
      <span className="code-ref-icon">📄</span>
      <span className="code-ref-name">
        {fileName}
        {lineDisplay && <span className="code-ref-line"> ({lineDisplay})</span>}
      </span>
      <button
        className="code-ref-remove-btn"
        onClick={handleRemove}
        onMouseDown={(e) => e.preventDefault()}
        title={`移除 ${fileName}`}
      >
        ×
      </button>
    </span>
  );
}

// 🎯 自定义代码引用节点
export class CodeReferenceNode extends DecoratorNode<JSX.Element> {
  __fileName: string;
  __filePath: string;
  __startLine?: number;
  __endLine?: number;
  __code: string;

  static getType(): string {
    return 'code-reference';
  }

  static clone(node: CodeReferenceNode): CodeReferenceNode {
    return new CodeReferenceNode(
      node.__fileName,
      node.__filePath,
      node.__startLine,
      node.__endLine,
      node.__code,
      node.__key
    );
  }

  constructor(
    fileName: string,
    filePath: string,
    startLine?: number,
    endLine?: number,
    code: string = '',
    key?: NodeKey
  ) {
    super(key);
    this.__fileName = fileName;
    this.__filePath = filePath;
    this.__startLine = startLine;
    this.__endLine = endLine;
    this.__code = code;
  }

  createDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'code-reference-node';
    span.style.display = 'inline';
    span.style.verticalAlign = 'middle';
    return span;
  }

  updateDOM(): false {
    return false;
  }

  getTextContent(): string {
    const lineInfo = this.__startLine ? ` (${this.__startLine})` : '';
    return `${this.__fileName}${lineInfo}`;
  }

  decorate(): JSX.Element {
    return (
      <CodeReferenceComponent
        fileName={this.__fileName}
        filePath={this.__filePath}
        startLine={this.__startLine}
        endLine={this.__endLine}
        nodeKey={this.__key}
      />
    );
  }

  exportJSON() {
    return {
      fileName: this.__fileName,
      filePath: this.__filePath,
      startLine: this.__startLine,
      endLine: this.__endLine,
      code: this.__code,
      type: 'code-reference',
      version: 1,
    };
  }

  static importJSON(serializedNode: any): CodeReferenceNode {
    const { fileName, filePath, startLine, endLine, code } = serializedNode;
    return $createCodeReferenceNode(fileName, filePath, startLine, endLine, code);
  }
}

// 🎯 创建代码引用节点的工厂函数
export function $createCodeReferenceNode(
  fileName: string,
  filePath: string,
  startLine?: number,
  endLine?: number,
  code: string = ''
): CodeReferenceNode {
  return new CodeReferenceNode(fileName, filePath, startLine, endLine, code);
}

// 🎯 检查是否是代码引用节点
export function $isCodeReferenceNode(node: LexicalNode | null | undefined): node is CodeReferenceNode {
  return node instanceof CodeReferenceNode;
}

