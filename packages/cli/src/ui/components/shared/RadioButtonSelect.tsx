/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { Text, Box, useInput } from 'ink';
import { Colors } from '../../colors.js';

/**
 * Represents a single option for the RadioButtonSelect.
 * Requires a label for display and a value to be returned on selection.
 */
export interface RadioSelectItem<T> {
  label: string;
  value: T;
  disabled?: boolean;
  themeNameDisplay?: string;
  themeTypeDisplay?: string;
  rightText?: string;
}

/**
 * Props for the RadioButtonSelect component.
 * @template T The type of the value associated with each radio item.
 */
export interface RadioButtonSelectProps<T> {
  /** An array of items to display as radio options. */
  items: Array<RadioSelectItem<T>>;
  /** The initial index selected */
  initialIndex?: number;
  /** Function called when an item is selected. Receives the `value` of the selected item. */
  onSelect: (value: T) => void;
  /** Function called when an item is highlighted. Receives the `value` of the selected item. */
  onHighlight?: (value: T) => void;
  /** Whether this select input is currently focused and should respond to input. */
  isFocused?: boolean;
  /** Whether to show the scroll arrows. */
  showScrollArrows?: boolean;
  /** The maximum number of items to show at once. */
  maxItemsToShow?: number;
  /** Whether to show numbers next to items. */
  showNumbers?: boolean;
  /** Layout direction: 'vertical' (default) or 'horizontal' */
  layout?: 'vertical' | 'horizontal';
  /** In horizontal layout, spacing between items */
  horizontalSpacing?: number;
}

/**
 * A custom component that displays a list of items with radio buttons,
 * supporting scrolling and keyboard navigation.
 *
 * @template T The type of the value associated with each radio item.
 */
export function RadioButtonSelect<T>({
  items,
  initialIndex = 0,
  onSelect,
  onHighlight,
  isFocused = true,
  showScrollArrows = false,
  maxItemsToShow = 10,
  showNumbers = true,
  layout = 'vertical',
  horizontalSpacing = 2,
}: RadioButtonSelectProps<T>): React.JSX.Element {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [numberInput, setNumberInput] = useState('');
  const numberInputTimer = useRef<NodeJS.Timeout | null>(null);
  const isFocusedRef = useRef(isFocused);

  // Keep ref in sync with prop
  useEffect(() => {
    isFocusedRef.current = isFocused;
  }, [isFocused]);

  useEffect(() => {
    const newScrollOffset = Math.max(
      0,
      Math.min(activeIndex - maxItemsToShow + 1, items.length - maxItemsToShow),
    );
    if (activeIndex < scrollOffset) {
      setScrollOffset(activeIndex);
    } else if (activeIndex >= scrollOffset + maxItemsToShow) {
      setScrollOffset(newScrollOffset);
    }
  }, [activeIndex, items.length, scrollOffset, maxItemsToShow]);

  useEffect(
    () => () => {
      if (numberInputTimer.current) {
        clearTimeout(numberInputTimer.current);
      }
    },
    [],
  );

  useInput(
    (input, key) => {
      // Debug log for key presses (useful for troubleshooting on Windows)
      if (process.env.DEBUG_THEME_SELECTION === 'true') {
        console.log('[RadioButtonSelect] Input:', input, 'key:', JSON.stringify(key), 'isFocused:', isFocusedRef.current);
      }

      // 🔧 菜单焦点管理修复: 当未获焦时，完全忽略所有输入
      // 这防止了当多个 useInput hooks 同时激活时的竞争条件
      if (!isFocusedRef.current) {
        return;
      }

      const isNumeric = showNumbers && /^[0-9]$/.test(input);

      // Any key press that is not a digit should clear the number input buffer.
      if (!isNumeric && numberInputTimer.current) {
        clearTimeout(numberInputTimer.current);
        setNumberInput('');
      }

      // 垂直布局：上下箭头或k/j键
      if (layout === 'vertical') {
        if (input === 'k' || key.upArrow) {
          const newIndex = activeIndex > 0 ? activeIndex - 1 : items.length - 1;
          setActiveIndex(newIndex);
          onHighlight?.(items[newIndex]!.value);
          return;
        }

        if (input === 'j' || key.downArrow) {
          const newIndex = activeIndex < items.length - 1 ? activeIndex + 1 : 0;
          setActiveIndex(newIndex);
          onHighlight?.(items[newIndex]!.value);
          return;
        }
      }
      // 横向布局：左右箭头或h/l键
      else if (layout === 'horizontal') {
        if (input === 'h' || key.leftArrow) {
          const newIndex = activeIndex > 0 ? activeIndex - 1 : items.length - 1;
          setActiveIndex(newIndex);
          onHighlight?.(items[newIndex]!.value);
          return;
        }

        if (input === 'l' || key.rightArrow) {
          const newIndex = activeIndex < items.length - 1 ? activeIndex + 1 : 0;
          setActiveIndex(newIndex);
          onHighlight?.(items[newIndex]!.value);
          return;
        }
      }

      if (key.return) {
        console.log('[RadioButtonSelect] Enter pressed, isFocused:', isFocusedRef.current, 'items.length:', items.length, 'activeIndex:', activeIndex);
        onSelect(items[activeIndex]!.value);
        return;
      }

      // Handle numeric input for selection.
      if (isNumeric) {
        if (numberInputTimer.current) {
          clearTimeout(numberInputTimer.current);
        }

        const newNumberInput = numberInput + input;
        setNumberInput(newNumberInput);

        const targetIndex = Number.parseInt(newNumberInput, 10) - 1;

        // A single '0' is not a valid selection since items are 1-indexed.
        if (newNumberInput === '0') {
          numberInputTimer.current = setTimeout(() => setNumberInput(''), 350);
          return;
        }

        if (targetIndex >= 0 && targetIndex < items.length) {
          const targetItem = items[targetIndex]!;
          setActiveIndex(targetIndex);
          onHighlight?.(targetItem.value);

          // If the typed number can't be a prefix for another valid number,
          // select it immediately. Otherwise, wait for more input.
          const potentialNextNumber = Number.parseInt(newNumberInput + '0', 10);
          if (potentialNextNumber > items.length) {
            onSelect(targetItem.value);
            setNumberInput('');
          } else {
            numberInputTimer.current = setTimeout(() => {
              onSelect(targetItem.value);
              setNumberInput('');
            }, 350); // Debounce time for multi-digit input.
          }
        } else {
          // The typed number is out of bounds, clear the buffer
          setNumberInput('');
        }
      }
    },
    { isActive: isFocused },
  );

  const visibleItems = items.slice(scrollOffset, scrollOffset + maxItemsToShow);

  // 横向布局渲染
  if (layout === 'horizontal') {
    return (
      <Box flexDirection="row" alignItems="center" flexWrap="wrap">
        {visibleItems.map((item, index) => {
          const itemIndex = scrollOffset + index;
          const isSelected = activeIndex === itemIndex;

          let textColor = Colors.Foreground;
          let numberColor = Colors.Foreground;
          if (isSelected) {
            textColor = Colors.AccentGreen;
            numberColor = Colors.AccentGreen;
          } else if (item.disabled) {
            textColor = Colors.Gray;
            numberColor = Colors.Gray;
          }

          if (!showNumbers) {
            numberColor = Colors.Gray;
          }

          const itemNumber = itemIndex + 1;

          return (
            <Box
              key={item.label}
              flexDirection="row"
              alignItems="center"
              marginRight={index < visibleItems.length - 1 ? horizontalSpacing : 0}
            >
              {/* 紧凑模式：不显示数字时，选中状态用简化标记 */}
              {!showNumbers ? (
                <Text color={isSelected ? Colors.AccentGreen : Colors.Foreground}>
                  {isSelected ? '•' : '◦'}
                </Text>
              ) : (
                <>
                  <Box minWidth={1} flexShrink={0}>
                    <Text color={isSelected ? Colors.AccentGreen : Colors.Foreground}>
                      {isSelected ? '•' : '◦'}
                    </Text>
                  </Box>
                  <Box marginLeft={1} marginRight={1} flexShrink={0}>
                    <Text color={numberColor}>{itemNumber}.</Text>
                  </Box>
                </>
              )}
              <Box marginLeft={showNumbers ? 0 : 1}>
                <Text color={textColor} wrap="truncate">
                  {item.themeNameDisplay && item.themeTypeDisplay ? (
                    <>
                      {item.themeNameDisplay}{' '}
                      <Text color={Colors.Gray}>{item.themeTypeDisplay}</Text>
                    </>
                  ) : (
                    item.label
                  )}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>
    );
  }

  // 垂直布局渲染（原逻辑）
  return (
    <Box flexDirection="column">
      {showScrollArrows && (
        <Text color={scrollOffset > 0 ? Colors.Foreground : Colors.Gray}>
          ▲
        </Text>
      )}
      {visibleItems.map((item, index) => {
        const itemIndex = scrollOffset + index;
        const isSelected = activeIndex === itemIndex;

        let textColor = Colors.Foreground;
        let numberColor = Colors.Foreground;
        if (isSelected) {
          textColor = Colors.AccentGreen;
          numberColor = Colors.AccentGreen;
        } else if (item.disabled) {
          textColor = Colors.Gray;
          numberColor = Colors.Gray;
        }

        if (!showNumbers) {
          numberColor = Colors.Gray;
        }

        const numberColumnWidth = String(items.length).length;
        const itemNumberText = `${String(itemIndex + 1).padStart(
          numberColumnWidth,
        )}.`;

        return (
          <Box key={item.label} alignItems="center" justifyContent="space-between" width="100%">
            <Box flexDirection="row" alignItems="center" flexGrow={1} minWidth={0}>
              <Box minWidth={2} flexShrink={0}>
                <Text color={isSelected ? Colors.AccentGreen : Colors.Foreground}>
                  {isSelected ? '•' : ' '}
                </Text>
              </Box>
              <Box
                marginRight={1}
                flexShrink={0}
                minWidth={itemNumberText.length}
              >
                <Text color={numberColor}>{itemNumberText}</Text>
              </Box>
              {item.themeNameDisplay && item.themeTypeDisplay ? (
                <Text color={textColor} wrap="truncate">
                  {item.themeNameDisplay}{' '}
                  <Text color={Colors.Gray}>{item.themeTypeDisplay}</Text>
                </Text>
              ) : (
                <Text color={textColor} wrap="truncate">
                  {item.label}
                </Text>
              )}
            </Box>
            {item.rightText && (
              <Box marginLeft={2} flexShrink={0}>
                <Text color={isSelected ? Colors.AccentGreen : Colors.Gray}>
                  {item.rightText}
                </Text>
              </Box>
            )}
          </Box>
        );
      })}
      {showScrollArrows && (
        <Text
          color={
            scrollOffset + maxItemsToShow < items.length
              ? Colors.Foreground
              : Colors.Gray
          }
        >
          ▼
        </Text>
      )}
    </Box>
  );
}
