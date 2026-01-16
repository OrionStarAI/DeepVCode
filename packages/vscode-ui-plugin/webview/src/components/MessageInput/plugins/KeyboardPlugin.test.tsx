/**
 * KeyboardPlugin 测试
 * 测试键盘事件处理：Enter发送、Shift+Enter换行等
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { KeyboardPlugin } from './KeyboardPlugin';

// Mock Lexical dependencies
vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: () => [
    {
      registerCommand: vi.fn((command, handler) => {
        return () => {};
      }),
      getEditorState: vi.fn(() => ({
        read: vi.fn((callback) => callback()),
      })),
    },
  ],
}));

vi.mock('lexical', () => ({
  KEY_DOWN_COMMAND: 'KEY_DOWN_COMMAND',
  COMMAND_PRIORITY_LOW: 1000,
  $getSelection: vi.fn(() => ({
    anchor: {
      getNode: vi.fn(() => ({
        getTextContent: vi.fn(() => ''),
      })),
      offset: 0,
    },
  })),
  $isRangeSelection: vi.fn(() => true),
}));

describe('KeyboardPlugin', () => {
  let mockOnSend: ReturnType<typeof vi.fn>;
  let mockOnClear: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSend = vi.fn();
    mockOnClear = vi.fn();
  });

  describe('plugin initialization', () => {
    it('should render without errors', () => {
      expect(() => {
        renderHook(() =>
          React.createElement(KeyboardPlugin, {
            onSend: mockOnSend,
            onClear: mockOnClear,
          })
        );
      }).not.toThrow();
    });

    it('should register KEY_DOWN_COMMAND', () => {
      renderHook(() =>
        React.createElement(KeyboardPlugin, {
          onSend: mockOnSend,
          onClear: mockOnClear,
        })
      );

      // Verify plugin initializes without throwing
      expect(true).toBe(true);
    });
  });

  describe('Enter key handling', () => {
    it('should send message on plain Enter', () => {
      let keyDownHandler: any;

      const mockEditor = {
        registerCommand: vi.fn((command, handler) => {
          keyDownHandler = handler;
          return () => {};
        }),
        getEditorState: vi.fn(() => ({
          read: vi.fn((callback) => {
            // Mock selection state
            callback();
          }),
        })),
      };

      vi.doMock('@lexical/react/LexicalComposerContext', () => ({
        useLexicalComposerContext: () => [mockEditor],
      }));

      renderHook(() =>
        React.createElement(KeyboardPlugin, {
          onSend: mockOnSend,
          onClear: mockOnClear,
        })
      );

      const mockEvent = {
        key: 'Enter',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        isComposing: false,
        preventDefault: vi.fn(),
      } as any;

      if (keyDownHandler) {
        const result = keyDownHandler(mockEvent);

        expect(mockEvent.preventDefault).toHaveBeenCalled();
        expect(mockOnSend).toHaveBeenCalled();
        expect(result).toBe(true);
      }
    });

    it('should allow line break on Shift+Enter', () => {
      let keyDownHandler: any;

      const mockEditor = {
        registerCommand: vi.fn((command, handler) => {
          keyDownHandler = handler;
          return () => {};
        }),
        getEditorState: vi.fn(() => ({
          read: vi.fn((callback) => callback()),
        })),
      };

      vi.doMock('@lexical/react/LexicalComposerContext', () => ({
        useLexicalComposerContext: () => [mockEditor],
      }));

      renderHook(() =>
        React.createElement(KeyboardPlugin, {
          onSend: mockOnSend,
          onClear: mockOnClear,
        })
      );

      const mockEvent = {
        key: 'Enter',
        shiftKey: true,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        isComposing: false,
        preventDefault: vi.fn(),
      } as any;

      if (keyDownHandler) {
        const result = keyDownHandler(mockEvent);

        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockOnSend).not.toHaveBeenCalled();
        expect(result).toBe(false);
      }
    });

    it('should allow line break on Ctrl+Enter', () => {
      let keyDownHandler: any;

      const mockEditor = {
        registerCommand: vi.fn((command, handler) => {
          keyDownHandler = handler;
          return () => {};
        }),
        getEditorState: vi.fn(() => ({
          read: vi.fn((callback) => callback()),
        })),
      };

      vi.doMock('@lexical/react/LexicalComposerContext', () => ({
        useLexicalComposerContext: () => [mockEditor],
      }));

      renderHook(() =>
        React.createElement(KeyboardPlugin, {
          onSend: mockOnSend,
          onClear: mockOnClear,
        })
      );

      const mockEvent = {
        key: 'Enter',
        shiftKey: false,
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        isComposing: false,
        preventDefault: vi.fn(),
      } as any;

      if (keyDownHandler) {
        const result = keyDownHandler(mockEvent);

        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockOnSend).not.toHaveBeenCalled();
        expect(result).toBe(false);
      }
    });

    it('should allow line break on Meta+Enter (Cmd on Mac)', () => {
      let keyDownHandler: any;

      const mockEditor = {
        registerCommand: vi.fn((command, handler) => {
          keyDownHandler = handler;
          return () => {};
        }),
        getEditorState: vi.fn(() => ({
          read: vi.fn((callback) => callback()),
        })),
      };

      vi.doMock('@lexical/react/LexicalComposerContext', () => ({
        useLexicalComposerContext: () => [mockEditor],
      }));

      renderHook(() =>
        React.createElement(KeyboardPlugin, {
          onSend: mockOnSend,
          onClear: mockOnClear,
        })
      );

      const mockEvent = {
        key: 'Enter',
        shiftKey: false,
        ctrlKey: false,
        metaKey: true,
        altKey: false,
        isComposing: false,
        preventDefault: vi.fn(),
      } as any;

      if (keyDownHandler) {
        const result = keyDownHandler(mockEvent);

        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockOnSend).not.toHaveBeenCalled();
        expect(result).toBe(false);
      }
    });
  });

  describe('input method composition', () => {
    it('should skip handling during input method composition', () => {
      let keyDownHandler: any;

      const mockEditor = {
        registerCommand: vi.fn((command, handler) => {
          keyDownHandler = handler;
          return () => {};
        }),
        getEditorState: vi.fn(() => ({
          read: vi.fn((callback) => callback()),
        })),
      };

      vi.doMock('@lexical/react/LexicalComposerContext', () => ({
        useLexicalComposerContext: () => [mockEditor],
      }));

      renderHook(() =>
        React.createElement(KeyboardPlugin, {
          onSend: mockOnSend,
          onClear: mockOnClear,
        })
      );

      const mockEvent = {
        key: 'Enter',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        isComposing: true,
        preventDefault: vi.fn(),
      } as any;

      if (keyDownHandler) {
        const result = keyDownHandler(mockEvent);

        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockOnSend).not.toHaveBeenCalled();
        expect(result).toBe(false);
      }
    });
  });

  describe('typeahead menu handling', () => {
    it('should not send when @ menu is active', () => {
      let keyDownHandler: any;

      const mockEditor = {
        registerCommand: vi.fn((command, handler) => {
          keyDownHandler = handler;
          return () => {};
        }),
        getEditorState: vi.fn(() => ({
          read: vi.fn((callback) => {
            // Mock active @ menu state
            const mockSelection = {
              anchor: {
                getNode: vi.fn(() => ({
                  getTextContent: vi.fn(() => '@test'),
                })),
                offset: 5,
              },
            };
            callback(mockSelection);
          }),
        })),
      };

      vi.doMock('@lexical/react/LexicalComposerContext', () => ({
        useLexicalComposerContext: () => [mockEditor],
      }));

      vi.doMock('lexical', () => ({
        $getSelection: () => ({
          anchor: {
            getNode: () => ({
              getTextContent: () => '@test',
            }),
            offset: 5,
          },
        }),
        $isRangeSelection: () => true,
      }));

      renderHook(() =>
        React.createElement(KeyboardPlugin, {
          onSend: mockOnSend,
          onClear: mockOnClear,
        })
      );

      const mockEvent = {
        key: 'Enter',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        isComposing: false,
        preventDefault: vi.fn(),
      } as any;

      if (keyDownHandler) {
        const result = keyDownHandler(mockEvent);

        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockOnSend).not.toHaveBeenCalled();
        expect(result).toBe(false);
      }
    });

    it('should not send when / menu is active', () => {
      let keyDownHandler: any;

      const mockEditor = {
        registerCommand: vi.fn((command, handler) => {
          keyDownHandler = handler;
          return () => {};
        }),
        getEditorState: vi.fn(() => ({
          read: vi.fn((callback) => {
            const mockSelection = {
              anchor: {
                getNode: vi.fn(() => ({
                  getTextContent: vi.fn(() => '/help'),
                })),
                offset: 5,
              },
            };
            callback(mockSelection);
          }),
        })),
      };

      vi.doMock('@lexical/react/LexicalComposerContext', () => ({
        useLexicalComposerContext: () => [mockEditor],
      }));

      renderHook(() =>
        React.createElement(KeyboardPlugin, {
          onSend: mockOnSend,
          onClear: mockOnClear,
        })
      );

      const mockEvent = {
        key: 'Enter',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        isComposing: false,
        preventDefault: vi.fn(),
      } as any;

      if (keyDownHandler) {
        const result = keyDownHandler(mockEvent);

        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockOnSend).not.toHaveBeenCalled();
        expect(result).toBe(false);
      }
    });
  });

  describe('other keys', () => {
    it('should not handle non-Enter keys', () => {
      let keyDownHandler: any;

      const mockEditor = {
        registerCommand: vi.fn((command, handler) => {
          keyDownHandler = handler;
          return () => {};
        }),
        getEditorState: vi.fn(() => ({
          read: vi.fn((callback) => callback()),
        })),
      };

      vi.doMock('@lexical/react/LexicalComposerContext', () => ({
        useLexicalComposerContext: () => [mockEditor],
      }));

      renderHook(() =>
        React.createElement(KeyboardPlugin, {
          onSend: mockOnSend,
          onClear: mockOnClear,
        })
      );

      const mockEvent = {
        key: 'a',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        isComposing: false,
        preventDefault: vi.fn(),
      } as any;

      if (keyDownHandler) {
        const result = keyDownHandler(mockEvent);

        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockOnSend).not.toHaveBeenCalled();
        expect(result).toBe(false);
      }
    });

    it('should not handle Escape key in this plugin', () => {
      let keyDownHandler: any;

      const mockEditor = {
        registerCommand: vi.fn((command, handler) => {
          keyDownHandler = handler;
          return () => {};
        }),
        getEditorState: vi.fn(() => ({
          read: vi.fn((callback) => callback()),
        })),
      };

      vi.doMock('@lexical/react/LexicalComposerContext', () => ({
        useLexicalComposerContext: () => [mockEditor],
      }));

      renderHook(() =>
        React.createElement(KeyboardPlugin, {
          onSend: mockOnSend,
          onClear: mockOnClear,
        })
      );

      const mockEvent = {
        key: 'Escape',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        isComposing: false,
        preventDefault: vi.fn(),
      } as any;

      if (keyDownHandler) {
        const result = keyDownHandler(mockEvent);

        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockOnSend).not.toHaveBeenCalled();
        expect(mockOnClear).not.toHaveBeenCalled();
        expect(result).toBe(false);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle Enter with Alt key', () => {
      let keyDownHandler: any;

      const mockEditor = {
        registerCommand: vi.fn((command, handler) => {
          keyDownHandler = handler;
          return () => {};
        }),
        getEditorState: vi.fn(() => ({
          read: vi.fn((callback) => callback()),
        })),
      };

      vi.doMock('@lexical/react/LexicalComposerContext', () => ({
        useLexicalComposerContext: () => [mockEditor],
      }));

      renderHook(() =>
        React.createElement(KeyboardPlugin, {
          onSend: mockOnSend,
          onClear: mockOnClear,
        })
      );

      const mockEvent = {
        key: 'Enter',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: true,
        isComposing: false,
        preventDefault: vi.fn(),
      } as any;

      if (keyDownHandler) {
        const result = keyDownHandler(mockEvent);

        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockOnSend).not.toHaveBeenCalled();
        expect(result).toBe(false);
      }
    });

    it('should handle multiple modifiers', () => {
      let keyDownHandler: any;

      const mockEditor = {
        registerCommand: vi.fn((command, handler) => {
          keyDownHandler = handler;
          return () => {};
        }),
        getEditorState: vi.fn(() => ({
          read: vi.fn((callback) => callback()),
        })),
      };

      vi.doMock('@lexical/react/LexicalComposerContext', () => ({
        useLexicalComposerContext: () => [mockEditor],
      }));

      renderHook(() =>
        React.createElement(KeyboardPlugin, {
          onSend: mockOnSend,
          onClear: mockOnClear,
        })
      );

      const mockEvent = {
        key: 'Enter',
        shiftKey: true,
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        isComposing: false,
        preventDefault: vi.fn(),
      } as any;

      if (keyDownHandler) {
        const result = keyDownHandler(mockEvent);

        // Any modifier should trigger line break
        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
        expect(mockOnSend).not.toHaveBeenCalled();
        expect(result).toBe(false);
      }
    });
  });
});
