import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateImageFileName,
  resetImageCounter,
  validateImageData
} from './imageProcessor';

describe('imageProcessor', () => {
  describe('generateImageFileName', () => {
    beforeEach(() => {
      resetImageCounter();
    });

    it('should generate first image name without number', () => {
      expect(generateImageFileName()).toBe('image.jpg');
    });

    it('should generate sequential image names', () => {
      generateImageFileName(); // image.jpg
      expect(generateImageFileName()).toBe('image1.jpg');
      expect(generateImageFileName()).toBe('image2.jpg');
      expect(generateImageFileName()).toBe('image3.jpg');
    });

    it('should reset counter', () => {
      generateImageFileName();
      generateImageFileName();
      resetImageCounter();
      expect(generateImageFileName()).toBe('image.jpg');
    });
  });

  describe('validateImageData', () => {
    it('should reject buffer that is too small', () => {
      const buffer = new Uint8Array([1, 2, 3]);
      const result = validateImageData(buffer, 'image/png');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('too small');
    });

    it('should validate PNG signature', () => {
      const pngBuffer = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const result = validateImageData(pngBuffer, 'image/png');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid PNG signature', () => {
      const invalidBuffer = new Uint8Array([0x00, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const result = validateImageData(invalidBuffer, 'image/png');
      expect(result.valid).toBe(false);
    });

    it('should validate JPEG signature', () => {
      const jpegBuffer = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);
      const result = validateImageData(jpegBuffer, 'image/jpeg');
      expect(result.valid).toBe(true);
    });

    it('should validate JPEG with jpg mime type', () => {
      const jpegBuffer = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);
      const result = validateImageData(jpegBuffer, 'image/jpg');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid JPEG signature', () => {
      const invalidBuffer = new Uint8Array([0xFF, 0xD8, 0x00, 0xE0, 0x00, 0x10, 0x4A, 0x46]);
      const result = validateImageData(invalidBuffer, 'image/jpeg');
      expect(result.valid).toBe(false);
    });

    it('should validate GIF signature', () => {
      const gifBuffer = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00]);
      const result = validateImageData(gifBuffer, 'image/gif');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid GIF signature', () => {
      const invalidBuffer = new Uint8Array([0x47, 0x49, 0x46, 0x00, 0x39, 0x61, 0x00, 0x00]);
      const result = validateImageData(invalidBuffer, 'image/gif');
      expect(result.valid).toBe(false);
    });

    it('should validate WebP signature', () => {
      const webpBuffer = new Uint8Array([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x00, 0x00, 0x00, 0x00, // file size
        0x57, 0x45, 0x42, 0x50, // WEBP
      ]);
      const result = validateImageData(webpBuffer, 'image/webp');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid WebP signature', () => {
      const invalidBuffer = new Uint8Array([
        0x52, 0x49, 0x46, 0x46,
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x45, 0x42, 0x50,
      ]);
      const result = validateImageData(invalidBuffer, 'image/webp');
      expect(result.valid).toBe(false);
    });

    it('should validate BMP signature', () => {
      const bmpBuffer = new Uint8Array([0x42, 0x4D, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      const result = validateImageData(bmpBuffer, 'image/bmp');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid BMP signature', () => {
      const invalidBuffer = new Uint8Array([0x42, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      const result = validateImageData(invalidBuffer, 'image/bmp');
      expect(result.valid).toBe(false);
    });

    it('should accept unknown image types without validation', () => {
      const buffer = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
      const result = validateImageData(buffer, 'image/tiff');
      expect(result.valid).toBe(true);
      expect(result.details).toContain('Unknown type');
    });

    it('should reject WebP buffer that is too small', () => {
      const buffer = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
      const result = validateImageData(buffer, 'image/webp');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('too small');
    });
  });
});