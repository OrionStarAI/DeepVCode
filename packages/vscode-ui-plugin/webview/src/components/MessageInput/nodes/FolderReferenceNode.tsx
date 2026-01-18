/**
 * 文件夹引用节点
 * Lexical 自定义节点，用于在编辑器中显示文件夹引用
 */

import React from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { DecoratorNode, NodeKey, LexicalNode } from 'lexical';
import { getGlobalMessageService } from '../../../services/globalMessageService';

// 🎯 文件夹引用节点的 React 组件
function FolderReferenceComponent({
  folderName,
  folderPath,
  nodeKey
}: {
  folderName: string;
  folderPath: string;
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

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // 🎯 点击标签在文件资源管理器中显示文件夹
    const messageService = getGlobalMessageService();
    messageService.openFile(folderPath);
  };

  return (
    <span
      className="inline-folder-ref-tag"
      contentEditable={false}
      title={folderPath}
      onClick={handleClick}
    >
      <span className="folder-ref-name">{folderName}</span>
      <button
        className="folder-ref-remove-btn"
        onClick={handleRemove}
        onMouseDown={(e) => e.preventDefault()} // 防止编辑器失焦
        title={`移除 ${folderName}`}
      >
        ×
      </button>
    </span>
  );
}

// 🎯 自定义文件夹引用节点
export class FolderReferenceNode extends DecoratorNode<JSX.Element> {
  __folderName: string;
  __folderPath: string;

  static getType(): string {
    return 'folder-reference';
  }

  static clone(node: FolderReferenceNode): FolderReferenceNode {
    return new FolderReferenceNode(node.__folderName, node.__folderPath, node.__key);
  }

  constructor(folderName: string, folderPath: string, key?: NodeKey) {
    super(key);
    this.__folderName = folderName;
    this.__folderPath = folderPath;
  }

  createDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'folder-reference-node';
    span.style.display = 'inline';
    span.style.verticalAlign = 'middle';
    return span;
  }

  updateDOM(): false {
    return false;
  }

  getTextContent(): string {
    return `@[${this.__folderName}]`;
  }

  decorate(): JSX.Element {
    return (
      <FolderReferenceComponent
        folderName={this.__folderName}
        folderPath={this.__folderPath}
        nodeKey={this.__key}
      />
    );
  }

  exportJSON() {
    return {
      folderName: this.__folderName,
      folderPath: this.__folderPath,
      type: 'folder-reference',
      version: 1,
    };
  }

  static importJSON(serializedNode: any): FolderReferenceNode {
    const { folderName, folderPath } = serializedNode;
    return $createFolderReferenceNode(folderName, folderPath);
  }
}

// 🎯 创建文件夹引用节点的工厂函数
export function $createFolderReferenceNode(folderName: string, folderPath: string): FolderReferenceNode {
  return new FolderReferenceNode(folderName, folderPath);
}

// 🎯 检查是否是文件夹引用节点
export function $isFolderReferenceNode(node: LexicalNode | null | undefined): node is FolderReferenceNode {
  return node instanceof FolderReferenceNode;
}
