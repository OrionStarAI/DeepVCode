import { describe, it, expect } from 'vitest';
import { detectFileType, isSupportedFile } from './fileTypeDetector';
import { FileType } from './fileTypes';

describe('fileTypeDetector', () => {
  describe('detectFileType', () => {
    it('should detect image files', () => {
      expect(detectFileType('photo.jpg')).toBe(FileType.IMAGE);
      expect(detectFileType('icon.png')).toBe(FileType.IMAGE);
      expect(detectFileType('animation.gif')).toBe(FileType.IMAGE);
      expect(detectFileType('picture.webp')).toBe(FileType.IMAGE);
      expect(detectFileType('logo.svg')).toBe(FileType.IMAGE);
      expect(detectFileType('image.bmp')).toBe(FileType.IMAGE);
    });

    it('should detect text files', () => {
      expect(detectFileType('code.ts')).toBe(FileType.TEXT);
      expect(detectFileType('script.js')).toBe(FileType.TEXT);
      expect(detectFileType('app.py')).toBe(FileType.TEXT);
      expect(detectFileType('Main.java')).toBe(FileType.TEXT);
      expect(detectFileType('config.json')).toBe(FileType.TEXT);
      expect(detectFileType('README.md')).toBe(FileType.TEXT);
    });

    it('should handle uppercase extensions', () => {
      expect(detectFileType('Photo.JPG')).toBe(FileType.IMAGE);
      expect(detectFileType('Code.TS')).toBe(FileType.TEXT);
      expect(detectFileType('File.JSON')).toBe(FileType.TEXT);
    });

    it('should handle mixed case extensions', () => {
      expect(detectFileType('image.PnG')).toBe(FileType.IMAGE);
      expect(detectFileType('script.Js')).toBe(FileType.TEXT);
    });

    it('should handle files with multiple dots', () => {
      expect(detectFileType('my.component.tsx')).toBe(FileType.TEXT);
      expect(detectFileType('test.spec.ts')).toBe(FileType.TEXT);
      expect(detectFileType('icon.min.svg')).toBe(FileType.IMAGE);
    });

    it('should return IMAGE for unsupported file types', () => {
      // Note: This is the default fallback behavior
      expect(detectFileType('unknown.xyz')).toBe(FileType.IMAGE);
      expect(detectFileType('file.exe')).toBe(FileType.IMAGE);
      expect(detectFileType('archive.zip')).toBe(FileType.IMAGE);
    });

    it('should handle files without extension', () => {
      expect(detectFileType('Makefile')).toBe(FileType.IMAGE);
      expect(detectFileType('README')).toBe(FileType.IMAGE);
    });

    it('should handle empty filename', () => {
      expect(detectFileType('')).toBe(FileType.IMAGE);
    });

    it('should handle filename with only extension', () => {
      expect(detectFileType('.ts')).toBe(FileType.TEXT);
      expect(detectFileType('.png')).toBe(FileType.IMAGE);
    });
  });

  describe('isSupportedFile', () => {
    it('should return true for supported image files', () => {
      expect(isSupportedFile('photo.jpg')).toBe(true);
      expect(isSupportedFile('icon.png')).toBe(true);
      expect(isSupportedFile('logo.svg')).toBe(true);
    });

    it('should return true for supported text files', () => {
      expect(isSupportedFile('code.ts')).toBe(true);
      expect(isSupportedFile('script.js')).toBe(true);
      expect(isSupportedFile('config.json')).toBe(true);
      expect(isSupportedFile('README.md')).toBe(true);
    });

    it('should return false for unsupported files', () => {
      expect(isSupportedFile('archive.zip')).toBe(false);
      expect(isSupportedFile('binary.exe')).toBe(false);
      expect(isSupportedFile('font.ttf')).toBe(false);
      expect(isSupportedFile('unknown.xyz')).toBe(false);
    });

    it('should handle uppercase extensions', () => {
      expect(isSupportedFile('Image.PNG')).toBe(true);
      expect(isSupportedFile('Code.TS')).toBe(true);
    });

    it('should handle files without extension', () => {
      expect(isSupportedFile('Makefile')).toBe(false);
      expect(isSupportedFile('README')).toBe(false);
    });

    it('should handle empty filename', () => {
      expect(isSupportedFile('')).toBe(false);
    });

    it('should handle files with multiple dots', () => {
      expect(isSupportedFile('test.spec.ts')).toBe(true);
      expect(isSupportedFile('bundle.min.js')).toBe(true);
    });
  });
});