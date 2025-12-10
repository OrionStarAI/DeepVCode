/**
 * MessageInput 组件入口文件
 * 导出所有相关的组件和类型
 */

export { MessageInput } from '../MessageInput';
export { FileReferenceNode, $createFileReferenceNode, $isFileReferenceNode } from './nodes/FileReferenceNode';
export { ImageReferenceNode, $createImageReferenceNode, $isImageReferenceNode } from './nodes/ImageReferenceNode';
export { TerminalReferenceNode, $createTerminalReferenceNode, $isTerminalReferenceNode } from './nodes/TerminalReferenceNode';
export { FileSelectionMenu } from './components/FileSelectionMenu';
export type { ImageReference } from './utils/imageProcessor';
export { processClipboardImage, resetImageCounter } from './utils/imageProcessor';