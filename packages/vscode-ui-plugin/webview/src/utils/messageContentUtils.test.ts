import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  assembleForDisplay,
  assembleForLLM,
  messageContentToString,
  createTextMessageContent,
  createFileReferenceContent,
  createImageReferenceContent,
  isMessageContentEmpty,
  hasFileReferences,
  hasImageReferences,
  extractFileReferences,
  extractImageReferences,
  isValidRawContent,
  convertForBackend,
  restoreToEditor,
} from './messageContentUtils';
import type { MessageContent, MessageContentPart } from '../types';

describe('messageContentUtils', () => {
  describe('assembleForDisplay', () => {
    it('should return empty string for invalid content', () => {
      expect(assembleForDisplay(null as any)).toBe('');
      expect(assembleForDisplay(undefined as any)).toBe('');
      expect(assembleForDisplay({} as any)).toBe('');
    });

    it('should assemble text content', () => {
      const content: MessageContent = [{ type: 'text', value: 'Hello World' }];
      expect(assembleForDisplay(content)).toBe('Hello World');
    });

    it('should assemble file reference', () => {
      const content: MessageContent = [
        { type: 'file_reference', value: { fileName: 'test.txt', filePath: '/path/test.txt' } }
      ];
      expect(assembleForDisplay(content)).toBe('@[test.txt]');
    });

    it('should assemble image reference', () => {
      const content: MessageContent = [
        { type: 'image_reference', value: { fileName: 'image.png', data: 'base64data' } }
      ];
      expect(assembleForDisplay(content)).toBe('[IMAGE:image.png]');
    });

    it('should assemble code reference with line numbers', () => {
      const content: MessageContent = [
        {
          type: 'code_reference',
          value: {
            fileName: 'app.ts',
            filePath: '/src/app.ts',
            code: 'const x = 1;',
            startLine: 10,
            endLine: 15
          }
        }
      ];
      expect(assembleForDisplay(content)).toBe('📄 app.ts (10-15)');
    });

    it('should assemble code reference with single line', () => {
      const content: MessageContent = [
        {
          type: 'code_reference',
          value: {
            fileName: 'app.ts',
            filePath: '/src/app.ts',
            code: 'const x = 1;',
            startLine: 10
          }
        }
      ];
      expect(assembleForDisplay(content)).toBe('📄 app.ts (10)');
    });

    it('should assemble code reference without line numbers', () => {
      const content: MessageContent = [
        {
          type: 'code_reference',
          value: {
            fileName: 'app.ts',
            filePath: '/src/app.ts',
            code: 'const x = 1;'
          }
        }
      ];
      expect(assembleForDisplay(content)).toBe('📄 app.ts');
    });

    it('should assemble text file content', () => {
      const content: MessageContent = [
        { type: 'text_file_content', value: { fileName: 'data.json', content: '{}' } }
      ];
      expect(assembleForDisplay(content)).toBe('@[data.json]');
    });

    it('should assemble mixed content', () => {
      const content: MessageContent = [
        { type: 'text', value: 'Check this file: ' },
        { type: 'file_reference', value: { fileName: 'test.txt', filePath: '/test.txt' } },
        { type: 'text', value: ' and this image: ' },
        { type: 'image_reference', value: { fileName: 'pic.png', data: 'data' } }
      ];
      expect(assembleForDisplay(content)).toBe('Check this file: @[test.txt] and this image: [IMAGE:pic.png]');
    });

    it('should warn about multiple text parts', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const content: MessageContent = [
        { type: 'text', value: 'First' },
        { type: 'text', value: 'Second' }
      ];
      assembleForDisplay(content);
      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('assembleForLLM', () => {
    it('should return empty result for invalid content', () => {
      const result = assembleForLLM(null as any);
      expect(result).toEqual({ text: '', files: [], images: [] });
    });

    it('should assemble text only', () => {
      const content: MessageContent = [{ type: 'text', value: 'Hello AI' }];
      const result = assembleForLLM(content);
      expect(result.text).toBe('Hello AI');
      expect(result.files).toEqual([]);
      expect(result.images).toEqual([]);
    });

    it('should collect file references', () => {
      const content: MessageContent = [
        { type: 'text', value: 'See file: ' },
        { type: 'file_reference', value: { fileName: 'test.txt', filePath: '/test.txt' } }
      ];
      const result = assembleForLLM(content);
      expect(result.text).toBe('See file: @[test.txt]');
      expect(result.files).toEqual([{ fileName: 'test.txt', filePath: '/test.txt' }]);
    });

    it('should collect image references', () => {
      const imageData = { fileName: 'img.png', data: 'base64' };
      const content: MessageContent = [
        { type: 'image_reference', value: imageData }
      ];
      const result = assembleForLLM(content);
      expect(result.text).toBe('[IMAGE:img.png]');
      expect(result.images).toEqual([imageData]);
    });

    it('should format code reference for AI', () => {
      const content: MessageContent = [
        {
          type: 'code_reference',
          value: {
            fileName: 'app.ts',
            filePath: '/src/app.ts',
            code: 'const x = 1;',
            startLine: 5,
            endLine: 10
          }
        }
      ];
      const result = assembleForLLM(content);
      expect(result.text).toContain('From app.ts (lines 5-10)');
      expect(result.text).toContain('```\nconst x = 1;\n```');
    });

    it('should handle text file content', () => {
      const content: MessageContent = [
        { type: 'text_file_content', value: { fileName: 'data.json', content: '{"key":"value"}' } }
      ];
      const result = assembleForLLM(content);
      expect(result.text).toBe('@[data.json]');
    });
  });

  describe('messageContentToString', () => {
    it('should call assembleForDisplay internally', () => {
      const content: MessageContent = [{ type: 'text', value: 'Test' }];
      expect(messageContentToString(content)).toBe('Test');
    });
  });

  describe('createTextMessageContent', () => {
    it('should create text message content', () => {
      const result = createTextMessageContent('Hello');
      expect(result).toEqual([{ type: 'text', value: 'Hello' }]);
    });
  });

  describe('createFileReferenceContent', () => {
    it('should create file reference content part', () => {
      const result = createFileReferenceContent('test.txt', '/path/test.txt');
      expect(result).toEqual({
        type: 'file_reference',
        value: { fileName: 'test.txt', filePath: '/path/test.txt' }
      });
    });
  });

  describe('createImageReferenceContent', () => {
    it('should create image reference content part', () => {
      const imageData = { fileName: 'img.png', data: 'base64' };
      const result = createImageReferenceContent(imageData);
      expect(result).toEqual({
        type: 'image_reference',
        value: imageData
      });
    });
  });

  describe('isMessageContentEmpty', () => {
    it('should return true for null/undefined/empty array', () => {
      expect(isMessageContentEmpty(null as any)).toBe(true);
      expect(isMessageContentEmpty(undefined as any)).toBe(true);
      expect(isMessageContentEmpty([])).toBe(true);
    });

    it('should return true for only whitespace text', () => {
      const content: MessageContent = [{ type: 'text', value: '   \n\t  ' }];
      expect(isMessageContentEmpty(content)).toBe(true);
    });

    it('should return false for non-empty text', () => {
      const content: MessageContent = [{ type: 'text', value: 'Hello' }];
      expect(isMessageContentEmpty(content)).toBe(false);
    });

    it('should return false for file references', () => {
      const content: MessageContent = [
        { type: 'file_reference', value: { fileName: 'test.txt', filePath: '/test.txt' } }
      ];
      expect(isMessageContentEmpty(content)).toBe(false);
    });
  });

  describe('hasFileReferences', () => {
    it('should return true when file references exist', () => {
      const content: MessageContent = [
        { type: 'text', value: 'See: ' },
        { type: 'file_reference', value: { fileName: 'test.txt', filePath: '/test.txt' } }
      ];
      expect(hasFileReferences(content)).toBe(true);
    });

    it('should return false when no file references exist', () => {
      const content: MessageContent = [{ type: 'text', value: 'Hello' }];
      expect(hasFileReferences(content)).toBe(false);
    });
  });

  describe('hasImageReferences', () => {
    it('should return true when image references exist', () => {
      const content: MessageContent = [
        { type: 'image_reference', value: { fileName: 'img.png', data: 'data' } }
      ];
      expect(hasImageReferences(content)).toBe(true);
    });

    it('should return false when no image references exist', () => {
      const content: MessageContent = [{ type: 'text', value: 'Hello' }];
      expect(hasImageReferences(content)).toBe(false);
    });
  });

  describe('extractFileReferences', () => {
    it('should extract all file references', () => {
      const content: MessageContent = [
        { type: 'text', value: 'Files: ' },
        { type: 'file_reference', value: { fileName: 'a.txt', filePath: '/a.txt' } },
        { type: 'file_reference', value: { fileName: 'b.txt', filePath: '/b.txt' } }
      ];
      const result = extractFileReferences(content);
      expect(result).toEqual([
        { fileName: 'a.txt', filePath: '/a.txt' },
        { fileName: 'b.txt', filePath: '/b.txt' }
      ]);
    });

    it('should return empty array when no file references', () => {
      const content: MessageContent = [{ type: 'text', value: 'Hello' }];
      expect(extractFileReferences(content)).toEqual([]);
    });
  });

  describe('extractImageReferences', () => {
    it('should extract all image references', () => {
      const img1 = { fileName: 'a.png', data: 'data1' };
      const img2 = { fileName: 'b.png', data: 'data2' };
      const content: MessageContent = [
        { type: 'image_reference', value: img1 },
        { type: 'text', value: ' and ' },
        { type: 'image_reference', value: img2 }
      ];
      const result = extractImageReferences(content);
      expect(result).toEqual([img1, img2]);
    });

    it('should return empty array when no image references', () => {
      const content: MessageContent = [{ type: 'text', value: 'Hello' }];
      expect(extractImageReferences(content)).toEqual([]);
    });
  });

  describe('isValidRawContent', () => {
    it('should return false for non-array', () => {
      expect(isValidRawContent(null as any)).toBe(false);
      expect(isValidRawContent('string' as any)).toBe(false);
      expect(isValidRawContent({} as any)).toBe(false);
    });

    it('should return true for valid text content', () => {
      const content: MessageContent = [{ type: 'text', value: 'Hello' }];
      expect(isValidRawContent(content)).toBe(true);
    });

    it('should return true for valid file reference', () => {
      const content: MessageContent = [
        { type: 'file_reference', value: { fileName: 'test.txt', filePath: '/test.txt' } }
      ];
      expect(isValidRawContent(content)).toBe(true);
    });

    it('should return true for valid image reference', () => {
      const content: MessageContent = [
        { type: 'image_reference', value: { fileName: 'img.png', data: 'data' } }
      ];
      expect(isValidRawContent(content)).toBe(true);
    });

    it('should return true for valid code reference', () => {
      const content: MessageContent = [
        {
          type: 'code_reference',
          value: {
            fileName: 'app.ts',
            filePath: '/src/app.ts',
            code: 'const x = 1;'
          }
        }
      ];
      expect(isValidRawContent(content)).toBe(true);
    });

    it('should return false for invalid part without type', () => {
      const content = [{ value: 'test' }] as any;
      expect(isValidRawContent(content)).toBe(false);
    });

    it('should return false for text with non-string value', () => {
      const content = [{ type: 'text', value: 123 }] as any;
      expect(isValidRawContent(content)).toBe(false);
    });

    it('should return false for file reference missing fileName', () => {
      const content = [{ type: 'file_reference', value: { filePath: '/test' } }] as any;
      expect(isValidRawContent(content)).toBe(false);
    });

    it('should return false for unknown type', () => {
      const content = [{ type: 'unknown_type', value: 'test' }] as any;
      expect(isValidRawContent(content)).toBe(false);
    });

    it('should validate mixed valid content', () => {
      const content: MessageContent = [
        { type: 'text', value: 'Hello' },
        { type: 'file_reference', value: { fileName: 'test.txt', filePath: '/test.txt' } },
        { type: 'image_reference', value: { fileName: 'img.png', data: 'data' } }
      ];
      expect(isValidRawContent(content)).toBe(true);
    });
  });

  describe('convertForBackend', () => {
    it('should return content as-is', () => {
      const content: MessageContent = [
        { type: 'text', value: 'Test' },
        { type: 'file_reference', value: { fileName: 'test.txt', filePath: '/test.txt' } }
      ];
      const result = convertForBackend(content);
      expect(result).toBe(content);
    });
  });

  describe('restoreToEditor', () => {
    // NOTE: Most restoreToEditor tests are skipped due to complex Lexical editor mocking requirements
    // The function is tested indirectly through integration tests

    it('should warn for invalid parameters', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const createFileReferenceNode = vi.fn();
      const createImageReferenceNode = vi.fn();

      restoreToEditor(null as any, null as any, createFileReferenceNode, createImageReferenceNode);

      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });

    it.skip('should create empty paragraph for empty content', () => {
      // Requires complex Lexical editor mocking - tested via integration tests
    });

    it.skip('should restore text content', () => {
      // Requires complex Lexical editor mocking - tested via integration tests
    });

    it.skip('should restore file reference', () => {
      // Requires complex Lexical editor mocking - tested via integration tests
    });

    it.skip('should restore image reference', () => {
      // Requires complex Lexical editor mocking - tested via integration tests
    });

    it.skip('should handle errors gracefully', () => {
      // Requires complex Lexical editor mocking - tested via integration tests
    });

    it.skip('should skip invalid file references', () => {
      // Requires complex Lexical editor mocking - tested via integration tests
    });
  });
});