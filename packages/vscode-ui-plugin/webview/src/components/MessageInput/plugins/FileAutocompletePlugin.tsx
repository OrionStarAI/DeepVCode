/**
 * 文件自动完成插件
 * 处理 @ 符号触发的文件自动完成功能
 *
 * 🎯 增强版：支持最近文件、文件夹、终端选择
 */

import React, { useEffect, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalTypeaheadMenuPlugin, MenuTextMatch } from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { TextNode } from 'lexical';
import { $createTextNode } from 'lexical';
import { atSymbolHandler, FileOption } from '../../../services/atSymbolHandler';
import { FileSelectionMenu } from '../components/FileSelectionMenu';
import { $createCodeReferenceNode } from '../nodes/CodeReferenceNode';
import { $createFileReferenceNode } from '../nodes/FileReferenceNode';
import { $createFolderReferenceNode } from '../nodes/FolderReferenceNode';
import { $createTerminalReferenceNode } from '../nodes/TerminalReferenceNode';
import { FilesIcon, TerminalIcon, SymbolIcon } from '../../MenuIcons';

interface FileAutocompletePluginProps {
  onFileSelect: (fileName: string, filePath: string) => void;
  onTerminalSelect?: (terminalId: number, terminalName: string, terminalOutput: string) => void;
}

// 🎯 默认主菜单选项（立即显示，不等待数据）
const DEFAULT_MENU_OPTIONS: FileOption[] = [
  new FileOption('Files & Folders', '__category_files__', 'category', { icon: <FilesIcon />, hasSubmenu: true }),
  new FileOption('Code Symbols', '__category_symbols__', 'category', { icon: <SymbolIcon />, hasSubmenu: true }),
  new FileOption('Terminals', '__category_terminals__', 'category', { icon: <TerminalIcon />, hasSubmenu: true }),
];

// 🎯 @ 自动完成插件 - 使用抽离的 atSymbolHandler
export function FileAutocompletePlugin({ onFileSelect, onTerminalSelect }: FileAutocompletePluginProps) {
  const [editor] = useLexicalComposerContext();
  const [fileOptions, setFileOptions] = React.useState<FileOption[]>(DEFAULT_MENU_OPTIONS);
  const [queryString, setQueryString] = React.useState<string>('');
  const [isMenuActive, setIsMenuActive] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const fetchIdRef = useRef(0);

  // 🎯 检查触发条件 - 复用 atSymbolHandler 的逻辑
  const checkForTriggerMatch = React.useCallback((text: string): MenuTextMatch | null => {
    const match = atSymbolHandler.checkForTriggerMatch(text);
    return match;
  }, []);

  // 🎯 获取选项的函数
  const fetchOptions = React.useCallback(async (query: string, active: boolean) => {
    if (!active) {
      return;
    }

    const currentFetchId = ++fetchIdRef.current;

    try {
      // 🎯 关键逻辑：有查询字符串时直接搜索文件，空时显示主菜单
      if (!query || query === '') {
        // 空查询 - 先立即显示默认菜单，然后异步加载最近文件
        setFileOptions(DEFAULT_MENU_OPTIONS);

        // 异步获取带最近文件的完整主菜单
        setIsLoading(true);
        const mainOptions = await atSymbolHandler.getMainMenuOptions();
        if (currentFetchId === fetchIdRef.current) {
          setFileOptions(mainOptions.length > 0 ? mainOptions : DEFAULT_MENU_OPTIONS);
        }
        setIsLoading(false);
      } else {
        // 🎯 用户直接输入了内容，搜索文件（和原来逻辑一样）
        setIsLoading(true);
        const searchResults = await atSymbolHandler.searchFiles(query);
        if (currentFetchId === fetchIdRef.current) {
          // 🎯 搜索结果 + 分类选项，让用户可以切换
          const combinedOptions = [
            ...searchResults,
            // 添加分隔符风格的分类选项
            ...DEFAULT_MENU_OPTIONS
          ];
          setFileOptions(combinedOptions.length > 0 ? combinedOptions : DEFAULT_MENU_OPTIONS);
        }
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error fetching file options:', error);
      if (currentFetchId === fetchIdRef.current) {
        setFileOptions(DEFAULT_MENU_OPTIONS);
      }
      setIsLoading(false);
    }
  }, []);

  // 🎯 处理终端选择
  const handleTerminalSelect = React.useCallback((
    terminalId: number,
    terminalName: string,
    terminalOutput: string
  ) => {
    editor.update(() => {
      // 找到当前的 @ 文本节点并替换
      const selection = editor.getEditorState()._selection;
      if (selection) {
        // 创建终端引用节点
        const terminalReferenceNode = $createTerminalReferenceNode(
          terminalId,
          terminalName,
          terminalOutput
        );

        // 获取当前选中的文本节点
        const nodes = selection.getNodes();
        if (nodes.length > 0) {
          const firstNode = nodes[0];
          if (firstNode instanceof TextNode) {
            const textContent = firstNode.getTextContent();
            const match = textContent.match(/@[^@\s]*$/);
            if (match && match.index !== undefined) {
              // 分割节点并替换 @ 部分
              const beforeText = textContent.substring(0, match.index);

              if (beforeText) {
                const beforeNode = $createTextNode(beforeText);
                firstNode.insertBefore(beforeNode);
              }

              firstNode.replace(terminalReferenceNode);

              // 在终端引用后添加空格
              const spaceNode = $createTextNode(' ');
              terminalReferenceNode.insertAfter(spaceNode);
              spaceNode.selectNext();
            }
          }
        }
      }
    });

    // 回调通知父组件
    if (onTerminalSelect) {
      onTerminalSelect(terminalId, terminalName, terminalOutput);
    }

    // 重置菜单状态
    setIsMenuActive(false);
    setFileOptions(DEFAULT_MENU_OPTIONS);
  }, [editor, onTerminalSelect]);

  // 🎯 选择文件后的处理
  const onSelectOption = React.useCallback((
    selectedOption: FileOption,
    nodeToReplace: TextNode | null,
    closeMenu: () => void,
    matchingString: string
  ) => {
    // 如果是分类选项，不做替换处理（由菜单内部处理导航）
    if (selectedOption.itemType === 'category') {
      return;
    }

    // 如果是终端选项，也由 FileSelectionMenu 内部处理
    if (selectedOption.itemType === 'terminal') {
      return;
    }

    if (!nodeToReplace) return;

    editor.update(() => {
      // 🎯 根据选项类型创建不同的节点
      let referenceNode;

      if (selectedOption.itemType === 'symbol' && selectedOption.range) {
        // 如果是符号且有范围信息，创建代码引用节点
        referenceNode = $createCodeReferenceNode(
          selectedOption.fileName,
          selectedOption.filePath,
          selectedOption.range.startLine,
          selectedOption.range.endLine
        );
      } else if (selectedOption.itemType === 'folder') {
        // 🎯 文件夹引用节点 - 使用完整路径作为显示名，确保插入内容一致
        const folderPath = selectedOption.filePath.replace(/\/$/, ''); // 移除尾部斜杠
        referenceNode = $createFolderReferenceNode(folderPath, folderPath);
      } else {
        // 否则创建普通文件引用节点
        referenceNode = $createFileReferenceNode(selectedOption.fileName, selectedOption.filePath);
      }

      // 替换当前的 @ 文本
      nodeToReplace.replace(referenceNode);

      // 在引用后添加一个空格，并将光标移动到空格后面
      const spaceNode = $createTextNode(' ');
      referenceNode.insertAfter(spaceNode);
      spaceNode.selectNext();
    });

    closeMenu();

    // 重置视图和状态
    atSymbolHandler.resetView();
    setIsMenuActive(false);
    setFileOptions(DEFAULT_MENU_OPTIONS);
  }, [editor]);

  // 🎯 处理查询变化
  const handleQueryChange = React.useCallback((matchingString: string | null) => {
    if (matchingString === null) {
      // 菜单关闭
      setIsMenuActive(false);
      setFileOptions(DEFAULT_MENU_OPTIONS);
      setQueryString('');
      atSymbolHandler.resetView();
    } else {
      // 菜单打开或查询更新
      const newQuery = matchingString || '';
      setQueryString(newQuery);
      setIsMenuActive(true);
      // 🎯 立即触发获取选项
      fetchOptions(newQuery, true);
    }
  }, [fetchOptions]);

  return (
    <LexicalTypeaheadMenuPlugin
      onQueryChange={handleQueryChange}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={fileOptions}
      menuRenderFn={(
        anchorElementRef,
        { options, selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) => {
        // 🎯 菜单活跃时始终显示（即使正在加载）
        if (!isMenuActive) {
          return null;
        }

        return (
          <FileSelectionMenu
            anchorElementRef={anchorElementRef}
            options={options as FileOption[]}
            selectedIndex={selectedIndex}
            setHighlightedIndex={setHighlightedIndex}
            onSelectOption={(option) => {
              // 文件和文件夹类型的选项触发替换
              if (option.itemType === 'file' || option.itemType === 'recent_file' || option.itemType === 'symbol' || option.itemType === 'folder') {
                selectOptionAndCleanUp(option);
              }
            }}
            onClose={() => {
              setHighlightedIndex(0);
              atSymbolHandler.resetView();
              setIsMenuActive(false);
              setFileOptions(DEFAULT_MENU_OPTIONS);
            }}
            onTerminalSelect={handleTerminalSelect}
            isLoading={isLoading}
            queryString={queryString}
          />
        );
      }}
    />
  );
}
