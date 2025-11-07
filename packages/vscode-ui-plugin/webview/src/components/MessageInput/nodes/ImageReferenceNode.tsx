/**
 * 图片引用节点
 * Lexical 自定义节点，用于在编辑器中显示图片引用
 */

import React, { useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { DecoratorNode, NodeKey, LexicalNode } from 'lexical';
import { ImageReference } from '../utils/imageProcessor';
import ImagePreviewModal from '../../ImagePreviewModal';

// 🎯 图片引用节点的 React 组件
function ImageReferenceComponent({
  fileName,
  imageData,
  nodeKey
}: {
  fileName: string;
  imageData: string; // base64 数据
  nodeKey: NodeKey;
}) {
  const [editor] = useLexicalComposerContext();
  const [showPreview, setShowPreview] = useState(false);

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

  const handleImageClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowPreview(true);
  };

  const handleTagClick = (e: React.MouseEvent) => {
    // 不处理删除按钮的点击
    if ((e.target as HTMLElement).closest('.image-ref-remove-btn')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setShowPreview(true);
  };

  return (
    <>
      <span
        className="inline-image-ref-tag"
        contentEditable={false}
        title={fileName}
        onClick={handleTagClick}
        style={{ cursor: 'pointer' }}
      >
        <img
          src={`data:image/jpeg;base64,${imageData}`}
          alt={fileName}
          className="image-ref-preview"
        />
        <span className="image-ref-name">{fileName}</span>
        <button
          className="image-ref-remove-btn"
          onClick={handleRemove}
          onMouseDown={(e) => e.preventDefault()}
          title={`移除 ${fileName}`}
        >
          ×
        </button>
      </span>
      {showPreview && (
        <ImagePreviewModal
          fileName={fileName}
          imageData={imageData}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}

// 🎯 自定义图片引用节点
export class ImageReferenceNode extends DecoratorNode<JSX.Element> {
  __imageData: ImageReference;

  static getType(): string {
    return 'image-reference';
  }

  constructor(imageData: ImageReference, key?: string) {
    super(key);
    this.__imageData = imageData;
  }

  static clone(node: ImageReferenceNode): ImageReferenceNode {
    return new ImageReferenceNode(node.__imageData, node.__key);
  }

  createDOM(): HTMLElement {
    return document.createElement('span');
  }

  updateDOM(): false {
    return false;
  }

  decorate(): JSX.Element {
    return (
      <ImageReferenceComponent
        fileName={this.__imageData.fileName}
        imageData={this.__imageData.data}
        nodeKey={this.__key}
      />
    );
  }

  getImageData(): ImageReference {
    return this.__imageData;
  }

  exportJSON() {
    return {
      ...this.__imageData,
      type: 'image-reference',
      version: 1,
    };
  }

  static importJSON(serializedNode: any): ImageReferenceNode {
    const imageData = { ...serializedNode };
    delete imageData.type;
    delete imageData.version;
    return $createImageReferenceNode(imageData);
  }
}

// 🎯 创建图片引用节点的工厂函数
export function $createImageReferenceNode(imageData: ImageReference): ImageReferenceNode {
  return new ImageReferenceNode(imageData);
}

// 🎯 检查是否是图片引用节点
export function $isImageReferenceNode(node: LexicalNode | null | undefined): node is ImageReferenceNode {
  return node instanceof ImageReferenceNode;
}