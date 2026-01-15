/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SimpleTextInput - A simple single-line text input component
 *
 * This component replicates the core input handling logic from InputPrompt,
 * ensuring compatibility with:
 * - Node.js 24 on Windows (bracketed paste sequences)
 * - Cross-platform newline key combinations
 * - Unicode/multi-byte characters (emoji, CJK, etc.)
 * - Various terminal emulators and their quirks
 *
 * Key features borrowed from InputPrompt:
 * - Uses KeypressProvider via useKeypress hook
 * - Handles paste events with sanitization
 * - Cross-platform modifier key handling
 * - Unicode-aware cursor positioning
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useKeypress, Key } from '../../hooks/useKeypress.js';
import { Colors } from '../../colors.js';
import { sanitizePasteContent } from '../../utils/displayUtils.js';
import { cpSlice, cpLen } from '../../utils/textUtils.js';

export interface SimpleTextInputProps {
  /** Current input value */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Callback when Enter is pressed */
  onSubmit: (value: string) => void;
  /** Callback when Escape is pressed */
  onCancel?: () => void;
  /** Placeholder text */
  placeholder?: string;
  /** Whether the input is focused and should receive keypresses */
  isActive?: boolean;
  /** Mask character for password input (e.g., '*') */
  mask?: string;
  /** Prompt prefix (default: '> ') */
  prompt?: string;
  /** Prompt color */
  promptColor?: string;
}

export function SimpleTextInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder = '',
  isActive = true,
  mask,
  prompt = '> ',
  promptColor = Colors.AccentCyan,
}: SimpleTextInputProps): React.JSX.Element {
  // Use Unicode code point length for cursor position
  const [cursorPosition, setCursorPosition] = useState(cpLen(value));

  // Keep cursor position in sync with value length (Unicode-aware)
  useEffect(() => {
    const len = cpLen(value);
    if (cursorPosition > len) {
      setCursorPosition(len);
    }
  }, [value, cursorPosition]);

  const handleKeypress = useCallback((key: Key) => {
    const valueLen = cpLen(value);

    // ============================================
    // Paste handling (from InputPrompt)
    // ============================================

    // Handle paste event with content
    if (key.paste && key.sequence) {
      // Windows special case: Ctrl+Enter/Shift+Enter may be misidentified as paste
      // (from InputPrompt lines 848-862)
      if (key.sequence === '\n' || key.sequence === '\r') {
        // This is likely Ctrl+Enter or Shift+Enter, not a real paste
        // For single-line input, just ignore it (don't insert newline)
        return;
      }

      const sanitized = sanitizePasteContent(key.sequence);
      // For single-line input, replace newlines with spaces
      const singleLine = sanitized.replace(/[\r\n]+/g, ' ').trim();
      if (singleLine) {
        const newValue = cpSlice(value, 0, cursorPosition) + singleLine + cpSlice(value, cursorPosition);
        onChange(newValue);
        setCursorPosition(cursorPosition + cpLen(singleLine));
      }
      return;
    }

    // Handle empty paste event (might be image paste, just ignore for simple text input)
    // (from InputPrompt lines 840-846)
    if (key.paste && !key.sequence) {
      return;
    }

    // Compatibility: some terminals don't set paste flag but send multi-line content
    // (from InputPrompt lines 879-890)
    if (key.sequence && key.sequence.includes('\n') && key.sequence.length > 50) {
      const sanitized = sanitizePasteContent(key.sequence);
      const singleLine = sanitized.replace(/[\r\n]+/g, ' ').trim();
      if (singleLine) {
        const newValue = cpSlice(value, 0, cursorPosition) + singleLine + cpSlice(value, cursorPosition);
        onChange(newValue);
        setCursorPosition(cursorPosition + cpLen(singleLine));
      }
      return;
    }

    // ============================================
    // Enter key handling (from InputPrompt)
    // ============================================

    // Handle Enter for submit (only when not using modifiers)
    // (from InputPrompt lines 766-785)
    if (key.name === 'return' && !key.shift && !key.ctrl && !key.meta && !key.paste) {
      onSubmit(value);
      return;
    }

    // Ignore Shift+Enter, Ctrl+Enter, Alt+Enter for single-line input
    // (In InputPrompt these create newlines, but we're single-line)
    if (key.name === 'return') {
      return;
    }

    // ============================================
    // Escape key
    // ============================================
    if (key.name === 'escape') {
      onCancel?.();
      return;
    }

    // ============================================
    // Editing keys (Unicode-aware)
    // ============================================

    if (key.name === 'backspace') {
      if (cursorPosition > 0) {
        const newValue = cpSlice(value, 0, cursorPosition - 1) + cpSlice(value, cursorPosition);
        onChange(newValue);
        setCursorPosition(cursorPosition - 1);
      }
      return;
    }

    if (key.name === 'delete') {
      if (cursorPosition < valueLen) {
        const newValue = cpSlice(value, 0, cursorPosition) + cpSlice(value, cursorPosition + 1);
        onChange(newValue);
      }
      return;
    }

    // ============================================
    // Navigation keys
    // ============================================

    if (key.name === 'left') {
      if (cursorPosition > 0) {
        setCursorPosition(cursorPosition - 1);
      }
      return;
    }

    if (key.name === 'right') {
      if (cursorPosition < valueLen) {
        setCursorPosition(cursorPosition + 1);
      }
      return;
    }

    // Ctrl+A / Home: move to start (from InputPrompt lines 788-791)
    if (key.name === 'home' || (key.ctrl && key.name === 'a')) {
      setCursorPosition(0);
      return;
    }

    // Ctrl+E / End: move to end (from InputPrompt lines 792-796)
    if (key.name === 'end' || (key.ctrl && key.name === 'e')) {
      setCursorPosition(valueLen);
      return;
    }

    // ============================================
    // Kill commands (from InputPrompt)
    // ============================================

    // Ctrl+U: kill line left (from InputPrompt lines 805-808)
    if (key.ctrl && key.name === 'u') {
      const newValue = cpSlice(value, cursorPosition);
      onChange(newValue);
      setCursorPosition(0);
      return;
    }

    // Ctrl+K: kill line right (from InputPrompt lines 801-804)
    if (key.ctrl && key.name === 'k') {
      const newValue = cpSlice(value, 0, cursorPosition);
      onChange(newValue);
      return;
    }

    // Ctrl+W: delete word before cursor
    if (key.ctrl && key.name === 'w') {
      const beforeCursor = cpSlice(value, 0, cursorPosition);
      const match = beforeCursor.match(/\S*\s*$/);
      if (match) {
        const deleteLength = cpLen(match[0]);
        const newValue = cpSlice(value, 0, cursorPosition - deleteLength) + cpSlice(value, cursorPosition);
        onChange(newValue);
        setCursorPosition(cursorPosition - deleteLength);
      }
      return;
    }

    // Ctrl+C: clear input (from InputPrompt lines 797-803)
    if (key.ctrl && key.name === 'c') {
      if (value.length > 0) {
        onChange('');
        setCursorPosition(0);
      }
      return;
    }

    // ============================================
    // Ignore other control key combinations
    // ============================================
    if (key.ctrl || key.meta) {
      return;
    }

    // ============================================
    // Regular character input
    // ============================================
    if (key.sequence && !key.ctrl && !key.meta) {
      // Check if it's a printable character
      // Handle both single-byte and multi-byte characters (emoji, CJK, etc.)
      const charCode = key.sequence.codePointAt(0);
      if (charCode !== undefined && charCode >= 32) {
        const newValue = cpSlice(value, 0, cursorPosition) + key.sequence + cpSlice(value, cursorPosition);
        onChange(newValue);
        setCursorPosition(cursorPosition + cpLen(key.sequence));
      }
    }
  }, [value, cursorPosition, onChange, onSubmit, onCancel]);

  useKeypress(handleKeypress, { isActive });

  // ============================================
  // Render (Unicode-aware)
  // ============================================
  const valueLen = cpLen(value);
  const displayValue = mask ? mask.repeat(valueLen) : value;
  const showPlaceholder = valueLen === 0 && placeholder;

  // Build display with cursor (Unicode-aware slicing)
  const beforeCursor = cpSlice(displayValue, 0, cursorPosition);
  const atCursor = cpSlice(displayValue, cursorPosition, cursorPosition + 1) || ' ';
  const afterCursor = cpSlice(displayValue, cursorPosition + 1);

  return (
    <Box>
      <Text color={promptColor}>{prompt}</Text>
      {showPlaceholder ? (
        <Text color={Colors.Gray}>{placeholder}</Text>
      ) : (
        <>
          <Text>{beforeCursor}</Text>
          <Text inverse>{atCursor}</Text>
          <Text>{afterCursor}</Text>
        </>
      )}
    </Box>
  );
}
