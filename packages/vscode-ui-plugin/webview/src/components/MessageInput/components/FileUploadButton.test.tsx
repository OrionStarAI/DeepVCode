/**
 * FileUploadButton 测试
 * 测试图片上传按钮组件
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileUploadButton } from './FileUploadButton';
import type { ImageReference } from '../utils/imageProcessor';

// Mock image processor
vi.mock('../utils/imageProcessor', () => ({
  processClipboardImage: vi.fn(),
  ImageReference: {},
}));

describe('FileUploadButton', () => {
  const mockOnImageSelected = vi.fn();
  const mockOnBeforeUpload = vi.fn();
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

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock processClipboardImage to resolve successfully
    const { processClipboardImage } = require('../utils/imageProcessor');
    processClipboardImage.mockResolvedValue(mockImageData);
  });

  describe('rendering', () => {
    it('should render without crashing', () => {
      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
        />
      );

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should have hidden file input', () => {
      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
        />
      );

      const input = screen.getByRole('button').nextElementSibling as HTMLInputElement;
      expect(input).toBeInTheDocument();
      expect(input.type).toBe('file');
      expect(input.style.display).toBe('none');
    });

    it('should accept image files', () => {
      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
        />
      );

      const input = screen.getByRole('button').nextElementSibling as HTMLInputElement;
      expect(input.accept).toBe('image/*');
    });

    it('should allow multiple file selection', () => {
      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
        />
      );

      const input = screen.getByRole('button').nextElementSibling as HTMLInputElement;
      expect(input.multiple).toBe(true);
    });
  });

  describe('button interaction', () => {
    it('should trigger file input click when button is clicked', () => {
      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
        />
      );

      const button = screen.getByRole('button');
      const input = screen.getByRole('button').nextElementSibling as HTMLInputElement;

      const clickSpy = vi.spyOn(input, 'click');

      fireEvent.click(button);

      expect(clickSpy).toHaveBeenCalled();
    });

    it('should be disabled when disabled prop is true', () => {
      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
          disabled={true}
        />
      );

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should be disabled when processing', async () => {
      const { processClipboardImage } = require('../utils/imageProcessor');
      processClipboardImage.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(mockImageData), 1000))
      );

      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
        />
      );

      const button = screen.getByRole('button');
      const input = screen.getByRole('button').nextElementSibling as HTMLInputElement;

      // Create a mock file
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      const fileList = createFileList([file]);

      Object.defineProperty(input, 'files', {
        value: fileList,
        writable: false,
      });

      fireEvent.click(button);

      await waitFor(() => {
        expect(button).toBeDisabled();
      });
    });
  });

  describe('file processing', () => {
    it('should process selected image file', async () => {
      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
        />
      );

      const button = screen.getByRole('button');
      const input = screen.getByRole('button').nextElementSibling as HTMLInputElement;

      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      const fileList = createFileList([file]);

      Object.defineProperty(input, 'files', {
        value: fileList,
        writable: false,
      });

      fireEvent.click(button);

      await waitFor(() => {
        expect(mockOnImageSelected).toHaveBeenCalledWith(mockImageData);
      });
    });

    it('should call onBeforeUpload callback before processing', async () => {
      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
          onBeforeUpload={mockOnBeforeUpload}
        />
      );

      const button = screen.getByRole('button');
      const input = screen.getByRole('button').nextElementSibling as HTMLInputElement;

      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      const fileList = createFileList([file]);

      Object.defineProperty(input, 'files', {
        value: fileList,
        writable: false,
      });

      fireEvent.click(button);

      await waitFor(() => {
        expect(mockOnBeforeUpload).toHaveBeenCalled();
        expect(mockOnImageSelected).toHaveBeenCalledWith(mockImageData);
      });
    });

    it('should skip non-image files', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
        />
      );

      const input = screen.getByRole('button').nextElementSibling as HTMLInputElement;
      const file = new File([''], 'test.txt', { type: 'text/plain' });
      const fileList = createFileList([file]);

      Object.defineProperty(input, 'files', {
        value: fileList,
        writable: false,
      });

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockOnImageSelected).not.toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });

    it('should skip files exceeding max size', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
          maxSize={1024} // 1KB
        />
      );

      const input = screen.getByRole('button').nextElementSibling as HTMLInputElement;
      const file = new File(['x'.repeat(2000)], 'large.jpg', { type: 'image/jpeg' });
      const fileList = createFileList([file]);

      Object.defineProperty(input, 'files', {
        value: fileList,
        writable: false,
      });

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockOnImageSelected).not.toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });

    it('should process multiple files sequentially', async () => {
      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
        />
      );

      const input = screen.getByRole('button').nextElementSibling as HTMLInputElement;

      const file1 = new File([''], 'test1.jpg', { type: 'image/jpeg' });
      const file2 = new File([''], 'test2.jpg', { type: 'image/jpeg' });
      const fileList = createFileList([file1, file2]);

      Object.defineProperty(input, 'files', {
        value: fileList,
        writable: false,
      });

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockOnImageSelected).toHaveBeenCalledTimes(2);
      });
    });

    it('should clear input after processing', async () => {
      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
        />
      );

      const input = screen.getByRole('button').nextElementSibling as HTMLInputElement;
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      const fileList = createFileList([file]);

      Object.defineProperty(input, 'files', {
        value: fileList,
        writable: false,
      });

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(input.value).toBe('');
      });
    });
  });

  describe('error handling', () => {
    it('should handle image processing errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { processClipboardImage } = require('../utils/imageProcessor');
      processClipboardImage.mockRejectedValue(new Error('Processing failed'));

      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
        />
      );

      const input = screen.getByRole('button').nextElementSibling as HTMLInputElement;
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      const fileList = createFileList([file]);

      Object.defineProperty(input, 'files', {
        value: fileList,
        writable: false,
      });

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });

    it('should continue processing other files if one fails', async () => {
      const { processClipboardImage } = require('../utils/imageProcessor');
      processClipboardImage
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(mockImageData);

      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
        />
      );

      const input = screen.getByRole('button').nextElementSibling as HTMLInputElement;
      const file1 = new File([''], 'test1.jpg', { type: 'image/jpeg' });
      const file2 = new File([''], 'test2.jpg', { type: 'image/jpeg' });
      const fileList = createFileList([file1, file2]);

      Object.defineProperty(input, 'files', {
        value: fileList,
        writable: false,
      });

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockOnImageSelected).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('icon display', () => {
    it('should show Image icon when not processing', () => {
      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
        />
      );

      const button = screen.getByRole('button');
      // Check that Loader2 is not present
      expect(button.querySelector('.animate-spin')).not.toBeInTheDocument();
    });

    it('should show Loader2 icon when processing', async () => {
      const { processClipboardImage } = require('../utils/imageProcessor');
      processClipboardImage.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(mockImageData), 1000))
      );

      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
        />
      );

      const input = screen.getByRole('button').nextElementSibling as HTMLInputElement;
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      const fileList = createFileList([file]);

      Object.defineProperty(input, 'files', {
        value: fileList,
        writable: false,
      });

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(button.querySelector('.animate-spin')).toBeInTheDocument();
      });
    });
  });

  describe('tooltip', () => {
    it('should show correct tooltip when not processing', () => {
      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
        />
      );

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', '上传图片');
    });

    it('should show processing tooltip when processing', async () => {
      const { processClipboardImage } = require('../utils/imageProcessor');
      processClipboardImage.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(mockImageData), 1000))
      );

      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
        />
      );

      const input = screen.getByRole('button').nextElementSibling as HTMLInputElement;
      const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
      const fileList = createFileList([file]);

      Object.defineProperty(input, 'files', {
        value: fileList,
        writable: false,
      });

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(button).toHaveAttribute('title', '正在处理图片...');
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty file list', async () => {
      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
        />
      );

      const input = screen.getByRole('button').nextElementSibling as HTMLInputElement;
      const fileList = createFileList([]);

      Object.defineProperty(input, 'files', {
        value: fileList,
        writable: false,
      });

      const button = screen.getByRole('button');
      fireEvent.click(button);

      await waitFor(() => {
        expect(mockOnImageSelected).not.toHaveBeenCalled();
      });
    });

    it('should handle rapid clicks', async () => {
      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
        />
      );

      const button = screen.getByRole('button');

      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);

      // Should not throw
      expect(button).toBeInTheDocument();
    });

    it('should handle custom max size', () => {
      render(
        <FileUploadButton
          onImageSelected={mockOnImageSelected}
          maxSize={5 * 1024 * 1024} // 5MB
        />
      );

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });
});

// Helper function to create a FileList-like object
function createFileList(files: File[]): FileList {
  const fileList = {
    0: files[0],
    1: files[1],
    2: files[2],
    length: files.length,
    item: (index: number) => files[index] || null,
    [Symbol.iterator]: function* () {
      for (const file of files) {
        yield file;
      }
    },
  } as any;

  return fileList;
}
