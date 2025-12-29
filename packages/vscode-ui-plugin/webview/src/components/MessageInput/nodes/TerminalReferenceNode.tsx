/**
 * 终端引用节点
 * Lexical 自定义节点，用于在编辑器中显示终端引用
 */

import React from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { DecoratorNode, NodeKey, LexicalNode } from 'lexical';
import { TerminalIcon } from '../../MenuIcons';

// 🎯 终端引用节点的 React 组件
function TerminalReferenceComponent({
  terminalName,
  nodeKey
}: {
  terminalName: string;
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
      className="inline-terminal-ref-tag"
      contentEditable={false}
      title={`Terminal: ${terminalName}`}
    >
      <span className="terminal-ref-icon"><TerminalIcon /></span>
      <span className="terminal-ref-name">{terminalName}</span>
      <button
        className="terminal-ref-remove-btn"
        onClick={handleRemove}
        onMouseDown={(e) => e.preventDefault()}
        title={`Remove ${terminalName}`}
      >
        ×
      </button>
    </span>
  );
}

// 🎯 自定义终端引用节点
export class TerminalReferenceNode extends DecoratorNode<JSX.Element> {
  __terminalId: number;
  __terminalName: string;
  __terminalOutput: string;

  static getType(): string {
    return 'terminal-reference';
  }

  static clone(node: TerminalReferenceNode): TerminalReferenceNode {
    const cloned = new TerminalReferenceNode(
      node.__terminalId,
      node.__terminalName,
      node.__terminalOutput,
      node.__key
    );
    return cloned;
  }

  constructor(terminalId: number, terminalName: string, terminalOutput: string, key?: NodeKey) {
    super(key);
    this.__terminalId = terminalId;
    this.__terminalName = terminalName;
    this.__terminalOutput = terminalOutput;
  }

  getTerminalOutput(): string {
    return this.__terminalOutput;
  }

  getTerminalName(): string {
    return this.__terminalName;
  }

  getTerminalId(): number {
    return this.__terminalId;
  }

  createDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'terminal-reference-node';
    span.style.display = 'inline';
    span.style.verticalAlign = 'middle';
    return span;
  }

  updateDOM(): false {
    return false;
  }

  getTextContent(): string {
    return `@[Terminal: ${this.__terminalName}]`;
  }

  decorate(): JSX.Element {
    return (
      <TerminalReferenceComponent
        terminalName={this.__terminalName}
        nodeKey={this.__key}
      />
    );
  }

  exportJSON() {
    return {
      terminalId: this.__terminalId,
      terminalName: this.__terminalName,
      terminalOutput: this.__terminalOutput,
      type: 'terminal-reference',
      version: 1,
    };
  }

  static importJSON(serializedNode: any): TerminalReferenceNode {
    const { terminalId, terminalName, terminalOutput } = serializedNode;
    return $createTerminalReferenceNode(terminalId, terminalName, terminalOutput);
  }
}

// 🎯 创建终端引用节点的工厂函数
export function $createTerminalReferenceNode(
  terminalId: number,
  terminalName: string,
  terminalOutput: string
): TerminalReferenceNode {
  return new TerminalReferenceNode(terminalId, terminalName, terminalOutput);
}

// 🎯 检查是否是终端引用节点
export function $isTerminalReferenceNode(node: LexicalNode | null | undefined): node is TerminalReferenceNode {
  return node instanceof TerminalReferenceNode;
}
