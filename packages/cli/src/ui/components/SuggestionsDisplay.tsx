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
  if (userInput.includes('@')) {
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
      {scrollOffset > 0 && <Text color={Colors.Foreground}>▲</Text>}

      {visibleSuggestions.map((suggestion, index) => {
        const originalIndex = startIndex + index;
        const isActive = originalIndex === activeIndex;
        const baseColor = isActive ? Colors.AccentOrange : Colors.Gray;
        const highlightColor = isActive ? Colors.AccentYellow : Colors.Foreground;

        // 🎯 渲染带高亮的标签
        const renderLabel = () => {
          if (!searchQuery || userInput.startsWith('/')) {
            // 命令模式或无搜索词时不高亮
            return <Text color={baseColor}>{suggestion.label}</Text>;
          }

          // 获取高亮片段
          const segments = getHighlightSegments(suggestion.label, searchQuery);

          return (
            <Text>
              {segments.map((seg, i) => (
                <Text
                  key={i}
                  color={seg.highlighted ? highlightColor : baseColor}
                  bold={seg.highlighted}
                >
                  {seg.text}
                </Text>
              ))}
            </Text>
          );
        };

        return (
          <Box key={`${suggestion}-${originalIndex}`} width={width}>
            <Box flexDirection="row">
              {userInput.startsWith('/') ? (
                // only use box model for (/) command mode with dynamic width
                <Box width={dynamicWidth} flexShrink={0}>
                  {renderLabel()}
                </Box>
              ) : (
                // use regular text for other modes (@ context)
                renderLabel()
              )}
              {suggestion.description ? (
                <Box flexGrow={1}>
                  <Text color={baseColor} wrap="wrap">
                    {suggestion.description}
                  </Text>
                </Box>
              ) : null}
            </Box>
          </Box>
        );
      })}
      {endIndex < suggestions.length && <Text color="gray">▼</Text>}
      {suggestions.length > MAX_SUGGESTIONS_TO_SHOW && (
        <Text color="gray">
          ({activeIndex + 1}/{suggestions.length})
        </Text>
      )}
    </Box>
  );
}
