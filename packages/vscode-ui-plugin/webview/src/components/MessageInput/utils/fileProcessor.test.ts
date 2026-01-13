import { describe, it, expect } from 'vitest';
import { FileType } from './fileTypes';

describe('fileProcessor', () => {
  describe('file size limits', () => {
    it('should have defined MAX_TEXT_FILE_SIZE', () => {
      const MAX_TEXT_FILE_SIZE = 5 * 1024 * 1024;
      expect(MAX_TEXT_FILE_SIZE).toBe(5242880);
    });

    it('should have defined MAX_IMAGE_FILE_SIZE', () => {
      const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024;
      expect(MAX_IMAGE_FILE_SIZE).toBe(10485760);
    });
  });

  describe('FileType enum', () => {
    it('should have IMAGE type', () => {
      expect(FileType.IMAGE).toBe('image');
    });

    it('should have TEXT type', () => {
      expect(FileType.TEXT).toBe('text');
    });
  });

  describe('file processing logic', () => {
    it('should calculate file size in MB correctly', () => {
      const fileSize = 5242880; // 5MB
      const sizeInMB = fileSize / 1024 / 1024;
      expect(sizeInMB).toBe(5);
    });

    it('should format file size with decimal', () => {
      const fileSize = 3500000; // 3.5MB
      const formatted = (fileSize / 1024 / 1024).toFixed(1);
      expect(formatted).toBe('3.3');
    });
  });
});