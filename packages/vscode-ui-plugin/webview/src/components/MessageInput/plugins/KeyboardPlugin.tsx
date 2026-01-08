/**
 * 键盘事件处理插件
 * 处理 Enter 发送、Escape 清空等键盘事件
 */

import React from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { KEY_DOWN_COMMAND, COMMAND_PRIORITY_LOW, $getSelection } from 'lexical';
import { $isRangeSelection } from 'lexical';

interface KeyboardPluginProps {
  onSend: () => void;
  onClear: () => void;
}

// 🎯 自定义 Lexical 插件：处理键盘事件
export function KeyboardPlugin({ onSend, onClear }: KeyboardPluginProps) {
  const [editor] = useLexicalComposerContext();

  React.useEffect(() => {
    console.log('KeyboardPlugin: Registering command listener');

    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        console.log('KeyboardPlugin KEY_DOWN_COMMAND called:', event.key, event.isComposing); // 调试日志

        // 🎯 处理中文输入法：如果正在使用输入法组合输入，不处理快捷键
        if (event.isComposing) {
          console.log('Input method composing, skipping');
          return false; // 让其他处理程序处理
        }

        if (event.key === 'Enter') {
          console.log('Enter key pressed, modifiers:', {
            shift: event.shiftKey,
            ctrl: event.ctrlKey,
            meta: event.metaKey,
            alt: event.altKey
          });

          // 🎯 检查是否有活动的 @ 菜单
          let hasActiveAtMenu = false;
          editor.getEditorState().read(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              const anchorNode = selection.anchor.getNode();
              const textContent = anchorNode.getTextContent();
              const offset = selection.anchor.offset;

              // 检查光标前是否有未完成的 @ 触发
              const textBeforeCursor = textContent.slice(0, offset);
              const lastAtIndex = textBeforeCursor.lastIndexOf('@');
              if (lastAtIndex !== -1) {
                const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
                // 如果 @ 后面没有空格且不超过合理长度，认为是活动菜单
                if (!textAfterAt.includes(' ') && textAfterAt.length <= 50) {
                  hasActiveAtMenu = true;
                  console.log('Active @ menu detected, text after @:', textAfterAt);
                }
              }
            }
          });

          if (hasActiveAtMenu) {
            console.log('@ menu is active, letting typeahead handle Enter');
            return false; // 让 typeahead 菜单处理
          }

          // 🎯 多行模式：修饰键+Enter换行，单独Enter发送
          if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
            // Shift+Enter, Ctrl+Enter, Cmd+Enter, Alt+Enter 都是换行
            // 不阻止默认行为，让 Lexical 自然处理换行
            console.log('Modifier key + Enter, allowing line break');
            return false; // 让 Lexical 处理换行
          } else {
            // 🎯 单独的 Enter 发送消息
            console.log('Plain Enter, preventing default and calling onSend');
            event.preventDefault();
            onSend();
            return true; // 阻止进一步处理
          }
        }

        if (event.key === 'Escape') {
          console.log('Escape key pressed');
          onClear();
          return true; // 阻止进一步处理
        }

        return false; // 让其他处理程序处理
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor, onSend, onClear]);

  return null;
}