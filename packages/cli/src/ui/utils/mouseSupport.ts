/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Terminal Mouse Support Module
 * 终端鼠标支持模块
 *
 * Enables mouse click-to-position functionality in terminal input.
 * Uses xterm mouse tracking protocols (SGR 1006 for extended coordinates).
 */

// Mouse tracking escape sequences
const ESC = '\u001B';

// Enable mouse tracking (SGR 1006 mode for extended coordinates)
export const ENABLE_MOUSE_TRACKING = `${ESC}[?1000h${ESC}[?1006h`;

// Disable mouse tracking
export const DISABLE_MOUSE_TRACKING = `${ESC}[?1006l${ESC}[?1000l`;

// Mouse event types
export enum MouseButton {
  LEFT = 0,
  MIDDLE = 1,
  RIGHT = 2,
  RELEASE = 3,
  SCROLL_UP = 64,
  SCROLL_DOWN = 65,
}

export enum MouseEventType {
  PRESS = 'press',
  RELEASE = 'release',
  MOVE = 'move',
  SCROLL_UP = 'scroll_up',
  SCROLL_DOWN = 'scroll_down',
}

export interface MouseEvent {
  type: MouseEventType;
  button: MouseButton;
  x: number; // 1-indexed column
  y: number; // 1-indexed row
  shift: boolean;
  meta: boolean;
  ctrl: boolean;
}

/**
 * Parse SGR 1006 mouse event sequence
 * Format: ESC [ < Cb ; Cx ; Cy (M|m)
 * - Cb: button code with modifiers
 * - Cx: column (1-indexed)
 * - Cy: row (1-indexed)
 * - M: press, m: release
 *
 * @param sequence Raw escape sequence
 * @returns Parsed mouse event or null if not a mouse event
 */
export function parseMouseEvent(sequence: string): MouseEvent | null {
  // SGR 1006 format: ESC [ < Cb ; Cx ; Cy (M|m)
  const sgrMatch = sequence.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/);
  if (sgrMatch) {
    const cb = parseInt(sgrMatch[1], 10);
    const cx = parseInt(sgrMatch[2], 10);
    const cy = parseInt(sgrMatch[3], 10);
    const isPress = sgrMatch[4] === 'M';

    // Decode button and modifiers from cb
    const button = cb & 0b11; // Lower 2 bits = button
    const shift = (cb & 0b100) !== 0;
    const meta = (cb & 0b1000) !== 0;
    const ctrl = (cb & 0b10000) !== 0;
    const motion = (cb & 0b100000) !== 0;
    const scroll = (cb & 0b1000000) !== 0;

    let eventType: MouseEventType;
    let buttonType: MouseButton;

    if (scroll) {
      // Scroll events
      eventType = button === 0 ? MouseEventType.SCROLL_UP : MouseEventType.SCROLL_DOWN;
      buttonType = button === 0 ? MouseButton.SCROLL_UP : MouseButton.SCROLL_DOWN;
    } else if (motion) {
      eventType = MouseEventType.MOVE;
      buttonType = button as MouseButton;
    } else {
      eventType = isPress ? MouseEventType.PRESS : MouseEventType.RELEASE;
      buttonType = button as MouseButton;
    }

    return {
      type: eventType,
      button: buttonType,
      x: cx,
      y: cy,
      shift,
      meta,
      ctrl,
    };
  }

  // X10 format (legacy): ESC [ M Cb Cx Cy
  const x10Match = sequence.match(/^\x1b\[M(.)(.)(.)$/);
  if (x10Match) {
    const cb = x10Match[1].charCodeAt(0) - 32;
    const cx = x10Match[2].charCodeAt(0) - 32;
    const cy = x10Match[3].charCodeAt(0) - 32;

    const button = cb & 0b11;
    const shift = (cb & 0b100) !== 0;
    const meta = (cb & 0b1000) !== 0;
    const ctrl = (cb & 0b10000) !== 0;

    return {
      type: button === 3 ? MouseEventType.RELEASE : MouseEventType.PRESS,
      button: button as MouseButton,
      x: cx,
      y: cy,
      shift,
      meta,
      ctrl,
    };
  }

  return null;
}

/**
 * Check if a sequence might be a mouse event (for buffering)
 * @param sequence Partial or complete escape sequence
 */
export function mightBeMouseEvent(sequence: string): boolean {
  // SGR 1006 prefix
  if (sequence.startsWith('\x1b[<')) {
    return true;
  }
  // X10 prefix
  if (sequence.startsWith('\x1b[M')) {
    return true;
  }
  return false;
}

/**
 * Check if a sequence is a complete mouse event
 * @param sequence Escape sequence
 */
export function isCompleteMouseEvent(sequence: string): boolean {
  // SGR 1006 complete
  if (/^\x1b\[<\d+;\d+;\d+[Mm]$/.test(sequence)) {
    return true;
  }
  // X10 complete (3 bytes after ESC [ M)
  if (/^\x1b\[M...$/.test(sequence)) {
    return true;
  }
  return false;
}

/**
 * Enable mouse tracking on stdout
 */
export function enableMouseTracking(): void {
  if (process.stdout.isTTY) {
    process.stdout.write(ENABLE_MOUSE_TRACKING);
  }
}

/**
 * Disable mouse tracking on stdout
 */
export function disableMouseTracking(): void {
  if (process.stdout.isTTY) {
    process.stdout.write(DISABLE_MOUSE_TRACKING);
  }
}
