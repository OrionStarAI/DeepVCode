/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  clipboardHasImage,
  saveClipboardImage,
  cleanupOldClipboardImages,
} from './clipboardUtils.js';

describe('clipboardUtils', () => {
  describe('clipboardHasImage', () => {
    it('should return boolean on supported platforms', async () => {
      if (process.platform === 'darwin' || process.platform === 'win32') {
        const result = await clipboardHasImage();
        expect(typeof result).toBe('boolean');
      } else if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP || process.env.WSLENV) {
        // On WSL, should attempt to access Windows clipboard
        const result = await clipboardHasImage();
        expect(typeof result).toBe('boolean');
      } else {
        // On unsupported platforms, should return false
        const result = await clipboardHasImage();
        expect(result).toBe(false);
      }
    });

    it('should handle WSL environment', async () => {
      // Mock WSL environment variables
      const originalWSLDistro = process.env.WSL_DISTRO_NAME;
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      
      try {
        process.env.WSL_DISTRO_NAME = 'Ubuntu';
        Object.defineProperty(process, 'platform', { value: 'linux' });
        
        const result = await clipboardHasImage();
        expect(typeof result).toBe('boolean');
      } finally {
        // Restore original values
        if (originalWSLDistro) {
          process.env.WSL_DISTRO_NAME = originalWSLDistro;
        } else {
          delete process.env.WSL_DISTRO_NAME;
        }
        
        if (originalPlatform) {
          Object.defineProperty(process, 'platform', originalPlatform);
        }
      }
    });

    it('should return boolean on macOS', async () => {
      if (process.platform === 'darwin') {
        const result = await clipboardHasImage();
        expect(typeof result).toBe('boolean');
      } else {
        // Skip on non-macOS
        expect(true).toBe(true);
      }
    });
  });

  describe('saveClipboardImage', () => {
    it('should return null or string on supported platforms', async () => {
      if (process.platform === 'darwin' || process.platform === 'win32') {
        const result = await saveClipboardImage();
        // Should return null if no image, or string path if image saved
        expect(result === null || typeof result === 'string').toBe(true);
      } else {
        // On unsupported platforms, should return null
        const result = await saveClipboardImage();
        expect(result).toBe(null);
      }
    });

    it('should handle errors gracefully', async () => {
      // Test with invalid directory (should not throw)
      const result = await saveClipboardImage(
        '/invalid/path/that/does/not/exist',
      );

      if (process.platform === 'darwin' || process.platform === 'win32') {
        // On supported platforms, might return null due to various errors or a path if it somehow works
        expect(result === null || typeof result === 'string').toBe(true);
      } else {
        // On unsupported platforms, should always return null
        expect(result).toBe(null);
      }
    });
  });

  describe('cleanupOldClipboardImages', () => {
    it('should not throw errors', async () => {
      // Should handle missing directories gracefully
      await expect(
        cleanupOldClipboardImages('/path/that/does/not/exist'),
      ).resolves.not.toThrow();
    });

    it('should complete without errors on valid directory', async () => {
      await expect(cleanupOldClipboardImages('.')).resolves.not.toThrow();
    });
  });
});
