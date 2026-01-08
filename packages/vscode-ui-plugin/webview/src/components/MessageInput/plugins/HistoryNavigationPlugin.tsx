/**
 * HistoryNavigationPlugin
 *
 * Lexical 插件，用于处理历史消息导航功能
 * 监听键盘事件（↑/↓, Ctrl+P/N），在合适的时机触发历史导航
 */

import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  KEY_ARROW_UP_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  COMMAND_PRIORITY_HIGH,
  $getSelection,
  $isRangeSelection,
  $getRoot,
} from 'lexical';

interface HistoryNavigationPluginProps {
  onNavigateUp: () => void;
  onNavigateDown: () => void;
}

export function HistoryNavigationPlugin({
  onNavigateUp,
  onNavigateDown
}: HistoryNavigationPluginProps) {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // 检查光标是否在编辑器的开头（第一个字符前）
    const isCursorAtStart = (): boolean => {
      return editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;

        // 简单方法：检查整个编辑器的文本内容和光标位置
        const root = $getRoot();
        const textContent = root.getTextContent();

        // 空编辑器，认为在开头
        if (textContent.length === 0) return true;

        // 获取选区的偏移量
        const anchor = selection.anchor;
        const anchorOffset = anchor.offset;
        const anchorNode = anchor.getNode();

        // 如果光标偏移不是0，肯定不在开头
        if (anchorOffset !== 0) return false;

        // 检查是否在第一个节点中
        const firstChild = root.getFirstChild();
        if (!firstChild) return true;

        // 检查当前节点是否是第一个子节点或其后代
        let node: any = anchorNode;
        while (node) {
          if (node === firstChild) return true;
          const parent = node.getParent();
          if (!parent || parent === root) break;
          node = parent;
        }

        return false;
      });
    };

    // 检查光标是否在编辑器的末尾（最后一个字符后）
    const isCursorAtEnd = (): boolean => {
      return editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return false;

        const root = $getRoot();
        const textContent = root.getTextContent();

        // 空编辑器，认为在末尾
        if (textContent.length === 0) return true;

        const focus = selection.focus;
        const focusOffset = focus.offset;
        const focusNode = focus.getNode();

        // 获取当前节点的文本内容
        const nodeText = focusNode.getTextContent();

        // 如果不在节点末尾，肯定不在编辑器末尾
        if (focusOffset < nodeText.length) return false;

        // 检查是否是最后一个节点
        const lastChild = root.getLastChild();
        if (!lastChild) return true;

        // 检查当前节点是否是最后一个子节点或其后代
        let node: any = focusNode;
        while (node) {
          if (node === lastChild) return true;
          const parent = node.getParent();
          if (!parent || parent === root) break;
          node = parent;
        }

        return false;
      });
    };

    // 监听向上箭头键
    const removeUpCommand = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (event: KeyboardEvent) => {
        // 只在光标位于编辑器开头时触发历史导航
        if (isCursorAtStart()) {
          event.preventDefault();
          onNavigateUp();
          return true;  // 阻止默认行为
        }
        return false;  // 允许默认行为（光标上移）
      },
      COMMAND_PRIORITY_HIGH
    );

    // 监听向下箭头键
    const removeDownCommand = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        // 只在光标位于编辑器末尾时触发历史导航
        if (isCursorAtEnd()) {
          event.preventDefault();
          onNavigateDown();
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    // 清理监听器
    return () => {
      removeUpCommand();
      removeDownCommand();
    };
  }, [editor, onNavigateUp, onNavigateDown]);

  return null;  // 这是一个行为插件，不渲染 UI
}