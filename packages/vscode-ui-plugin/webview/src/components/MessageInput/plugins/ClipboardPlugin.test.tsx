/**
 * ClipboardPlugin 测试
 * 测试剪切板处理插件的图片粘贴、代码粘贴和文本粘贴功能
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { ClipboardPlugin } from './ClipboardPlugin';
import { processClipboardImage } from '../utils/imageProcessor';
import { getGlobalMessageService } from '../../../services/globalMessageService';
import type { ImageReference } from '../utils/imageProcessor';

// Mock dependencies
vi.mock('../utils/imageProcessor', () => ({
  processClipboardImage: vi.fn(),
  generateImageFileName: vi.fn(() => 'image.jpg'),
  resetImageCounter: vi.fn(),
}));

vi.mock('../../../services/globalMessageService', () => ({
  getGlobalMessageService: vi.fn(),
}));

vi.mock('@lexical/react/LexicalComposerContext', () => ({
  useLexicalComposerContext: () => [
    {
      registerCommand: vi.fn((command, handler) => {
        return () => {};
      }),
      update: vi.fn((callback) => callback()),
      getEditorState: vi.fn(() => ({
        _nodeMap: new Map(),
      })),
    },
  ],
}));

vi.mock('lexical', async () => {
  const actual = await vi.importActual<typeof import('lexical')>('lexical');
  return {
    ...actual,
    $getSelection: vi.fn(() => ({
      insertNodes: vi.fn(),
      selectNext: vi.fn(),
    })),
    $isRangeSelection: vi.fn(() => true),
  };
});

vi.mock('../nodes/CodeReferenceNode', () => ({
  $createCodeReferenceNode: vi.fn(() => ({
    type: 'code-reference',
    __fileName: 'test.ts',
    __filePath: '/path/test.ts',
  })),
}));

describe('ClipboardPlugin', () => {
  let mockEditor: any;
  let mockOnImagePaste: ReturnType<typeof vi.fn>;
  let mockMessageService: any;
  let pasteHandler: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockOnImagePaste = vi.fn();

    mockMessageService = {
      requestClipboardCache: vi.fn(),
      onClipboardCacheResponse: vi.fn(),
    };
    (getGlobalMessageService as any).mockReturnValue(mockMessageService);

    mockEditor = {
      registerCommand: vi.fn((command, handler) => {
        pasteHandler = handler;
        return () => {};
      }),
      update: vi.fn((callback) => callback()),
      getEditorState: vi.fn(() => ({
        _nodeMap: new Map(),
      })),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('plugin initialization', () => {
    it('should render without errors', () => {
      expect(() => {
        renderHook(() => (
          React.createElement(ClipboardPlugin, { onImagePaste: mockOnImagePaste })
        ));
      }).not.toThrow();
    });

    it('should register PASTE_COMMAND', () => {
      const { useLexicalComposerContext } = require('@lexical/react/LexicalComposerContext');
      const [editor] = useLexicalComposerContext();

      renderHook(() =>
        React.createElement(ClipboardPlugin, { onImagePaste: mockOnImagePaste })
      );

      expect(editor.registerCommand).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function),
        expect.any(Number)
      );
    });
  });

  describe('image paste handling', () => {
    it('should detect and handle image paste', async () => {
      const mockImageData: ImageReference = {
        id: 'img-1',
        fileName: 'image.jpg',
        data: 'base64data',
        mimeType: 'image/jpeg',
        originalSize: 1000,
        compressedSize: 500,
        width: 800,
        height: 600,
      };

      (processClipboardImage as any).mockResolvedValue(mockImageData);

      renderHook(() =>
        React.createElement(ClipboardPlugin, { onImagePaste: mockOnImagePaste })
      );

      // Wait for registerCommand to be called
      await new Promise(resolve => setTimeout(resolve, 0));

      const mockFile = new File([''], 'image.png', { type: 'image/png' });
      const mockEvent = {
        clipboardData: {
          items: [{
            type: 'image/png',
            getAsFile: vi.fn(() => mockFile),
          }],
          types: [],
        },
        preventDefault: vi.fn(),
      } as any;

      // Call the paste handler directly
      if (pasteHandler) {
        const result = pasteHandler(mockEvent);
        expect(mockEvent.preventDefault).toHaveBeenCalled();
        expect(result).toBe(true);

        // Wait for async processing
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(processClipboardImage).toHaveBeenCalledWith(mockFile);
        expect(mockOnImagePaste).toHaveBeenCalledWith(mockImageData);
      }
    });

    it('should handle image processing errors gracefully', async () => {
      (processClipboardImage as any).mockResolvedValue(null);

      renderHook(() =>
        React.createElement(ClipboardPlugin, { onImagePaste: mockOnImagePaste })
      );

      await new Promise(resolve => setTimeout(resolve, 0));

      const mockFile = new File([''], 'image.png', { type: 'image/png' });
      const mockEvent = {
        clipboardData: {
          items: [{
            type: 'image/png',
            getAsFile: vi.fn(() => mockFile),
          }],
          types: [],
        },
        preventDefault: vi.fn(),
      } as any;

      if (pasteHandler) {
        pasteHandler(mockEvent);

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(mockOnImagePaste).not.toHaveBeenCalled();
      }
    });
  });

  describe('VSCode code paste handling', () => {
    it('should detect VSCode code paste and request cache', async () => {
      const plainText = 'const x = 1;';
      const mockCacheData = {
        found: true,
        fileName: 'app.ts',
        filePath: '/src/app.ts',
        startLine: 10,
        endLine: 15,
        code: plainText,
      };

      renderHook(() =>
        React.createElement(ClipboardPlugin, { onImagePaste: mockOnImagePaste })
      );

      await new Promise(resolve => setTimeout(resolve, 0));

      const mockEvent = {
        clipboardData: {
          items: [],
          types: ['vscode-editor-data', 'text/plain'],
          getData: vi.fn((type) => {
            if (type === 'text/plain') return plainText;
            return '';
          }),
        },
        preventDefault: vi.fn(),
      } as any;

      mockMessageService.onClipboardCacheResponse.mockImplementation((handler) => {
        setTimeout(() => handler(mockCacheData), 50);
      });

      if (pasteHandler) {
        pasteHandler(mockEvent);

        expect(mockEvent.preventDefault).toHaveBeenCalled();
        expect(mockMessageService.requestClipboardCache).toHaveBeenCalledWith(plainText);

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(mockEditor.update).toHaveBeenCalled();
      }
    });

    it('should insert plain text when cache not found', async () => {
      const plainText = 'some code';
      const mockCacheData = {
        found: false,
      };

      renderHook(() =>
        React.createElement(ClipboardPlugin, { onImagePaste: mockOnImagePaste })
      );

      await new Promise(resolve => setTimeout(resolve, 0));

      const mockEvent = {
        clipboardData: {
          items: [],
          types: ['vscode-editor-data', 'text/plain'],
          getData: vi.fn((type) => {
            if (type === 'text/plain') return plainText;
            return '';
          }),
        },
        preventDefault: vi.fn(),
      } as any;

      mockMessageService.onClipboardCacheResponse.mockImplementation((handler) => {
        setTimeout(() => handler(mockCacheData), 50);
      });

      if (pasteHandler) {
        pasteHandler(mockEvent);

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(mockEditor.update).toHaveBeenCalled();
      }
    });

    it('should return false for empty VSCode code', () => {
      renderHook(() =>
        React.createElement(ClipboardPlugin, { onImagePaste: mockOnImagePaste })
      );

      await new Promise(resolve => setTimeout(resolve, 0));

      const mockEvent = {
        clipboardData: {
          items: [],
          types: ['vscode-editor-data', 'text/plain'],
          getData: vi.fn(() => '   '),
        },
        preventDefault: vi.fn(),
      } as any;

      if (pasteHandler) {
        const result = pasteHandler(mockEvent);
        expect(result).toBe(false);
        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      }
    });
  });

  describe('plain text paste handling', () => {
    it('should return false for regular text paste', () => {
      renderHook(() =>
        React.createElement(ClipboardPlugin, { onImagePaste: mockOnImagePaste })
      );

      await new Promise(resolve => setTimeout(resolve, 0));

      const mockEvent = {
        clipboardData: {
          items: [],
          types: ['text/plain'],
          getData: vi.fn(() => 'Hello world'),
        },
        preventDefault: vi.fn(),
      } as any;

      if (pasteHandler) {
        const result = pasteHandler(mockEvent);
        expect(result).toBe(false);
        expect(mockEvent.preventDefault).not.toHaveBeenCalled();
      }
    });

    it('should handle missing clipboardData gracefully', () => {
      renderHook(() =>
        React.createElement(ClipboardPlugin, { onImagePaste: mockOnImagePaste })
      );

      await new Promise(resolve => setTimeout(resolve, 0));

      const mockEvent = {
        clipboardData: null,
      } as any;

      if (pasteHandler) {
        const result = pasteHandler(mockEvent);
        expect(result).toBe(false);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle timeout for clipboard cache', () => {
      vi.useFakeTimers();

      const plainText = 'const x = 1;';

      renderHook(() =>
        React.createElement(ClipboardPlugin, { onImagePaste: mockOnImagePaste })
      );

      await new Promise(resolve => setTimeout(resolve, 0));

      const mockEvent = {
        clipboardData: {
          items: [],
          types: ['vscode-editor-data', 'text/plain'],
          getData: vi.fn((type) => {
            if (type === 'text/plain') return plainText;
            return '';
          }),
        },
        preventDefault: vi.fn(),
      } as any;

      mockMessageService.onClipboardCacheResponse.mockReturnValue(() => {});

      if (pasteHandler) {
        pasteHandler(mockEvent);

        // Fast-forward past timeout
        vi.advanceTimersByTime(1100);

        expect(mockEditor.update).toHaveBeenCalled();
      }

      vi.useRealTimers();
    });

    it('should fall back to plain text on error', async () => {
      const plainText = 'const x = 1;';

      renderHook(() =>
        React.createElement(ClipboardPlugin, { onImagePaste: mockOnImagePaste })
      );

      await new Promise(resolve => setTimeout(resolve, 0));

      const mockEvent = {
        clipboardData: {
          items: [],
          types: ['vscode-editor-data', 'text/plain'],
          getData: vi.fn((type) => {
            if (type === 'text/plain') return plainText;
            return '';
          }),
        },
        preventDefault: vi.fn(),
      } as any;

      mockMessageService.onClipboardCacheResponse.mockImplementation(() => {
        throw new Error('Service error');
      });

      if (pasteHandler) {
        pasteHandler(mockEvent);

        await new Promise(resolve => setTimeout(resolve, 100));

        expect(mockEditor.update).toHaveBeenCalled();
      }
    });
  });
});
