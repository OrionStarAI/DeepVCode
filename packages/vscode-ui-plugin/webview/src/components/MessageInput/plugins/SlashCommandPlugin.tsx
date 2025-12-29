/**
 * 斜杠命令自动完成插件
 * 处理 / 符号触发的命令自动完成功能
 */

import React from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalTypeaheadMenuPlugin, MenuTextMatch } from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { TextNode, $getSelection, $isRangeSelection } from 'lexical';
import { $createTextNode } from 'lexical';
import { slashCommandHandler, SlashCommandOption } from '../../../services/slashCommandHandler';
import { SlashCommandMenu } from '../components/SlashCommandMenu';

interface SlashCommandPluginProps {
  /**
   * 当用户选择一个命令后的回调
   * @param commandName 命令名称
   * @param prompt 处理后的 prompt（如果需要立即发送）
   */
  onCommandSelect?: (commandName: string, prompt?: string) => void;
}

/**
 * 🎯 斜杠命令自动完成插件
 */
export function SlashCommandPlugin({ onCommandSelect }: SlashCommandPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [commandOptions, setCommandOptions] = React.useState<SlashCommandOption[]>([]);
  const [queryString, setQueryString] = React.useState('');

  // 检查触发条件
  const checkForTriggerMatch = React.useCallback((text: string): MenuTextMatch | null => {
    return slashCommandHandler.checkForTriggerMatch(text);
  }, []);

  // 根据输入获取命令选项
  const getCommandOptions = React.useCallback((queryString: string): SlashCommandOption[] => {
    slashCommandHandler.searchCommandsWithDebounce(queryString, (results) => {
      setCommandOptions(results);
    });
    return commandOptions;
  }, [commandOptions]);

  // 选择命令后的处理
  const onSelectOption = React.useCallback((
    selectedOption: SlashCommandOption,
    nodeToReplace: TextNode | null,
    closeMenu: () => void,
    _matchingString: string
  ) => {
    if (!nodeToReplace) return;

    editor.update(() => {
      // 用完整命令名替换 /xxx 文本
      const commandText = `/${selectedOption.name} `;
      const textNode = $createTextNode(commandText);
      nodeToReplace.replace(textNode);

      // 将光标移动到命令后
      textNode.selectEnd();
    });

    closeMenu();

    // 通知父组件命令已选择
    if (onCommandSelect) {
      onCommandSelect(selectedOption.name);
    }
  }, [editor, onCommandSelect]);

  // 处理查询变化
  const handleQueryChange = React.useCallback((matchingString: string | null) => {
    const newQueryString = matchingString || '';
    setQueryString(newQueryString);
    getCommandOptions(newQueryString);
  }, [getCommandOptions]);

  return (
    <LexicalTypeaheadMenuPlugin
      onQueryChange={handleQueryChange}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={getCommandOptions(queryString)}
      menuRenderFn={(
        anchorElementRef,
        { options, selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) => (
        <SlashCommandMenu
          anchorElementRef={anchorElementRef}
          options={options as SlashCommandOption[]}
          selectedIndex={selectedIndex}
          onSelectOption={(option) => selectOptionAndCleanUp(option)}
          onClose={() => setHighlightedIndex(0)}
        />
      )}
    />
  );
}
