/**
 * 编辑器引用插件
 * 将编辑器实例暴露给父组件
 */

import React from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

interface EditorRefPluginProps {
  editorRef: React.MutableRefObject<any>;
  onEditorReady?: () => void;
}

// 🎯 编辑器引用插件
export function EditorRefPlugin({ editorRef, onEditorReady }: EditorRefPluginProps) {
  const [editor] = useLexicalComposerContext();

  React.useEffect(() => {
    editorRef.current = editor;
    // 通知编辑器已准备就绪
    if (onEditorReady) {
      setTimeout(onEditorReady, 100);
    }
  }, [editor, editorRef, onEditorReady]);

  return null;
}