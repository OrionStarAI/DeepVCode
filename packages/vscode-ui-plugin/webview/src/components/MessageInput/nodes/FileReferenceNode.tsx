/**
 * 文件引用节点
 * Lexical 自定义节点，用于在编辑器中显示文件引用
 */

import React from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { DecoratorNode, NodeKey, LexicalNode } from 'lexical';

export interface FileReference {
  id: string;
  fileName: string;
  fullPath: string;
}

// 🎯 文件引用节点的 React 组件
function FileReferenceComponent({
  fileName,
  filePath,
  nodeKey
}: {
  fileName: string;
  filePath: string;
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

  return (
    <span
      className="inline-file-ref-tag"
      contentEditable={false}
      title={filePath}
    >
      <span className="file-ref-icon">@</span>
      <span className="file-ref-name">{fileName}</span>
      <button
        className="file-ref-remove-btn"
        onClick={handleRemove}
        onMouseDown={(e) => e.preventDefault()} // 防止编辑器失焦
        title={`移除 ${fileName}`}
      >
        ×
      </button>
    </span>
  );
}

// 🎯 自定义文件引用节点
export class FileReferenceNode extends DecoratorNode<JSX.Element> {
  __fileName: string;
  __filePath: string;
  __fileContent?: string;      // ✨ 新增：保存文件完整内容
  __language?: string;         // ✨ 新增：保存编程语言

  static getType(): string {
    return 'file-reference';
  }

  static clone(node: FileReferenceNode): FileReferenceNode {
    const cloned = new FileReferenceNode(node.__fileName, node.__filePath, node.__key);
    cloned.__fileContent = node.__fileContent;
    cloned.__language = node.__language;
    return cloned;
  }

  constructor(fileName: string, filePath: string, key?: NodeKey) {
    super(key);
    this.__fileName = fileName;
    this.__filePath = filePath;
  }

  // ✨ 新增：设置文件内容和语言
  setFileContent(content: string, language?: string): void {
    this.__fileContent = content;
    this.__language = language;
  }

  createDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'file-reference-node';
    span.style.display = 'inline';
    span.style.verticalAlign = 'middle';
    return span;
  }

  updateDOM(): false {
    return false;
  }

  getTextContent(): string {
    return `@[${this.__fileName}]`;
  }

  decorate(): JSX.Element {
    return (
      <FileReferenceComponent
        fileName={this.__fileName}
        filePath={this.__filePath}
        nodeKey={this.__key}
      />
    );
  }

  exportJSON() {
    return {
      fileName: this.__fileName,
      filePath: this.__filePath,
      type: 'file-reference',
      version: 1,
    };
  }

  static importJSON(serializedNode: any): FileReferenceNode {
    const { fileName, filePath } = serializedNode;
    return $createFileReferenceNode(fileName, filePath);
  }
}

// 🎯 创建文件引用节点的工厂函数
export function $createFileReferenceNode(fileName: string, filePath: string): FileReferenceNode {
  return new FileReferenceNode(fileName, filePath);
}

// 🎯 检查是否是文件引用节点
export function $isFileReferenceNode(node: LexicalNode | null | undefined): node is FileReferenceNode {
  return node instanceof FileReferenceNode;
}