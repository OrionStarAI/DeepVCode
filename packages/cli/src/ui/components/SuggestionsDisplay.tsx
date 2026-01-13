/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { getHighlightSegments } from '../utils/fuzzyMatch.js';
import { t } from '../utils/i18n.js';

export interface Suggestion {
  label: string;
  value: string;
  description?: string;
  matchScore?: number; // 用于排序的匹配分数
  willAutoExecute?: boolean; // 是否在选择后自动执行命令（用于 /model 等参数补全命令）
}
interface SuggestionsDisplayProps {
  suggestions: Suggestion[];
  activeIndex: number;
  isLoading: boolean;
  width: number;
  scrollOffset: number;
  userInput: string;
}

export const MAX_SUGGESTIONS_TO_SHOW = 8;

export function SuggestionsDisplay({
  suggestions,
  activeIndex,
  isLoading,
  width,
  scrollOffset,
  userInput,
}: SuggestionsDisplayProps) {
  if (isLoading) {
    return (
      <Box paddingX={1} width={width}>
        <Text color="gray">{t('suggestions.loading')}</Text>
      </Box>
    );
  }

  if (suggestions.length === 0) {
    return null; // Don't render anything if there are no suggestions
  }

  // 🎯 提取搜索关键词用于高亮
  let searchQuery = '';
  let isCommandMode = false;

  if (userInput.startsWith('/')) {
    // 斜杠命令模式：提取斜杠后的内容
    isCommandMode = true;
    const slashIndex = userInput.lastIndexOf('/');
    const commandPart = userInput.substring(slashIndex + 1);
    const spaceIndex = commandPart.indexOf(' ');
    searchQuery = spaceIndex !== -1 ? commandPart.substring(0, spaceIndex) : commandPart;
  } else if (userInput.includes('@')) {
    // 文件路径模式
    const atIndex = userInput.lastIndexOf('@');
    const pathPart = userInput.substring(atIndex + 1);
    const lastSlash = pathPart.lastIndexOf('/');
    searchQuery = lastSlash !== -1 ? pathPart.substring(lastSlash + 1) : pathPart;
  }

  // Calculate the visible slice based on scrollOffset
  const startIndex = scrollOffset;
  const endIndex = Math.min(
    scrollOffset + MAX_SUGGESTIONS_TO_SHOW,
    suggestions.length,
  );
  const visibleSuggestions = suggestions.slice(startIndex, endIndex);

  // Calculate dynamic width for command labels to accommodate long model names
  const maxLabelLength = Math.max(
    ...suggestions.map(s => s.label.length),
    20 // minimum width
  );
  const dynamicWidth = Math.min(maxLabelLength + 2, width - 10); // leave space for description

  return (
    <Box flexDirection="column" paddingX={1} width={width}>
      {scrollOffset > 0 ? <Text color={Colors.Foreground}>▲</Text> : null}

      {visibleSuggestions.map((suggestion, index) => {
        const originalIndex = startIndex + index;
        const isActive = originalIndex === activeIndex;
        const baseColor = isActive ? Colors.AccentOrange : Colors.Foreground;
        const secondaryColor = isActive ? Colors.AccentOrange : Colors.Gray;
        const highlightColor = isActive ? Colors.Foreground : Colors.AccentOrange;

        // 🎯 渲染带高亮的标签
        const renderLabel = () => {
          const labelText = suggestion.label;

          // 为文件路径模式优化显示：突出文件名，弱化路径
          const lastSlashIndex = labelText.lastIndexOf('/');
          const hasDirectory = lastSlashIndex !== -1 && lastSlashIndex < labelText.length - 1;

          const displayLabel = (text: string, color: string, isDim: boolean = false) => {
            if (!searchQuery) {
              return <Text color={color} dimColor={isDim} inverse={isActive}>{text}</Text>;
            }

            const segments = getHighlightSegments(text, searchQuery);
            return (
              <Text>
                {segments.map((seg, i) => (
                  <Text
                    key={i}
                    color={seg.highlighted ? highlightColor : color}
                    bold={seg.highlighted}
                    dimColor={!seg.highlighted && isDim}
                    inverse={isActive}
                  >
                    {seg.text}
                  </Text>
                ))}
              </Text>
            );
          };

          if (hasDirectory && !userInput.startsWith('/')) {
            let dirPart = labelText.substring(0, lastSlashIndex + 1);
            const filePart = labelText.substring(lastSlashIndex + 1);

            // 🚀 优化：如果路径过长，进行中间截断，确保文件名可见
            // 优先保证文件名完整显示，路径部分可以截断
            const reservedSpaceForDescription = suggestion.description ? 25 : 0;
            const maxPathWidth = width - reservedSpaceForDescription - 5; // 留出边距
            const minDirWidth = 10; // 目录部分最小宽度
            const minTruncationWidth = 15; // 截断功能的最小窗口宽度

            // 计算可用于显示路径的空间
            let availableDirWidth = maxPathWidth - filePart.length;

            // 如果文件名太长，确保至少能看到部分目录信息
            if (availableDirWidth < minDirWidth) {
              availableDirWidth = Math.max(minDirWidth, maxPathWidth - Math.min(filePart.length, maxPathWidth * 0.6));
            }

            // 只有在窗口足够宽时才执行截断逻辑
            if (dirPart.length > availableDirWidth && availableDirWidth >= minTruncationWidth) {
              // 优化截断策略：保留开头和结尾部分
              // 减去 3 是为了给 "..." 留空间
              const actualAvailable = availableDirWidth - 3;
              const headLength = Math.floor(actualAvailable * 0.4);
              const tailLength = actualAvailable - headLength;
              const head = dirPart.substring(0, headLength);
              const tail = dirPart.substring(dirPart.length - tailLength);
              dirPart = `${head}...${tail}`;
            }

            return (
              <Box flexDirection="row">
                {displayLabel(dirPart, secondaryColor)}
                {displayLabel(filePart, baseColor)}
              </Box>
            );
          }

          return displayLabel(labelText, baseColor);
        };

        return (
          <Box key={`suggestion-${originalIndex}`} width={width}>
            <Box flexDirection="row">
              <Box width={userInput.startsWith('/') ? dynamicWidth : undefined} flexShrink={0}>
                {renderLabel()}
              </Box>
              {suggestion.description ? (
                <Box flexGrow={1} marginLeft={1}>
                  <Text color={secondaryColor} wrap="truncate-end" inverse={isActive}>
                    {suggestion.description}
                  </Text>
                </Box>
              ) : null}
            </Box>
          </Box>
        );
      })}
      {endIndex < suggestions.length ? <Text color="gray">▼</Text> : null}
      {suggestions.length > MAX_SUGGESTIONS_TO_SHOW ? (
        <Text color="gray">
          ({activeIndex + 1}/{suggestions.length})
        </Text>
      ) : null}
    </Box>
  );
}
