/**
 * 文件自动完成插件
 * 处理 @ 符号触发的文件自动完成功能
 */

import React from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalTypeaheadMenuPlugin, MenuTextMatch } from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { TextNode } from 'lexical';
import { $createTextNode } from 'lexical';
import { atSymbolHandler, FileOption } from '../../../services/atSymbolHandler';
import { FileSelectionMenu } from '../components/FileSelectionMenu';
import { $createFileReferenceNode } from '../nodes/FileReferenceNode';

interface FileAutocompletePluginProps {
  onFileSelect: (fileName: string, filePath: string) => void;
}

// 🎯 @ 自动完成插件 - 使用抽离的 atSymbolHandler
export function FileAutocompletePlugin({ onFileSelect }: FileAutocompletePluginProps) {
  const [editor] = useLexicalComposerContext();
  const [fileOptions, setFileOptions] = React.useState<FileOption[]>([]);
  const [queryString, setQueryString] = React.useState('');

  // 🎯 检查触发条件 - 复用 atSymbolHandler 的逻辑
  const checkForTriggerMatch = React.useCallback((text: string): MenuTextMatch | null => {
    return atSymbolHandler.checkForTriggerMatch(text);
  }, []);

  // 🎯 根据输入获取文件选项
  const getFileOptions = React.useCallback((queryString: string): FileOption[] => {
    // 使用防抖搜索
    atSymbolHandler.searchFilesWithDebounce(queryString, (results: FileOption[]) => {
      setFileOptions(results);
    });

    return fileOptions;
  }, [fileOptions]);

  // 🎯 选择文件后的处理
  const onSelectOption = React.useCallback((
    selectedOption: FileOption,
    nodeToReplace: TextNode | null,
    closeMenu: () => void,
    matchingString: string
  ) => {
    if (!nodeToReplace) return;

    editor.update(() => {
      // 创建文件引用节点
      const fileReferenceNode = $createFileReferenceNode(selectedOption.fileName, selectedOption.filePath);

      // 替换当前的 @ 文本
      nodeToReplace.replace(fileReferenceNode);

      // 在文件引用后添加一个空格，并将光标移动到空格后面
      const spaceNode = $createTextNode(' ');
      fileReferenceNode.insertAfter(spaceNode);
      spaceNode.selectNext();
    });

    closeMenu();
  }, [editor]);

  // 🎯 处理查询变化
  const handleQueryChange = React.useCallback((matchingString: string | null) => {
    const newQueryString = matchingString || '';
    setQueryString(newQueryString);

    // 立即触发搜索（防抖在 atSymbolHandler 内部处理）
    getFileOptions(newQueryString);
  }, [getFileOptions]);

  return (
    <LexicalTypeaheadMenuPlugin
      onQueryChange={handleQueryChange}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={getFileOptions(queryString)}
      menuRenderFn={(
        anchorElementRef,
        { options, selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) => (
        <FileSelectionMenu
          anchorElementRef={anchorElementRef}
          options={options as FileOption[]}
          selectedIndex={selectedIndex}
          onSelectOption={(option) => selectOptionAndCleanUp(option)}
          onClose={() => setHighlightedIndex(0)}
        />
      )}
    />
  );
}