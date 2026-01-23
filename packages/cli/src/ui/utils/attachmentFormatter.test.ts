/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { formatAttachmentReferencesForDisplay, ensureQuotesAroundAttachments } from './attachmentFormatter.js';

describe('attachmentFormatter', () => {
  describe('formatAttachmentReferencesForDisplay', () => {
    it('should convert @"file.ts" to @[File #...]', () => {
      const input = '@"src/app.ts"';
      const output = formatAttachmentReferencesForDisplay(input);
      expect(output).toContain('@[File #');
      expect(output).toContain('src/app.ts');
    });

    it('should convert @"image.png" to @[Image #...]', () => {
      const input = '@"screenshot.png"';
      const output = formatAttachmentReferencesForDisplay(input);
      expect(output).toContain('@[Image #');
      expect(output).toContain('screenshot.png');
    });

    it('should handle multiple attachments', () => {
      const input = '@"file.ts" and @"image.jpg"';
      const output = formatAttachmentReferencesForDisplay(input);
      expect(output).toContain('@[File #');
      expect(output).toContain('@[Image #');
    });

    it('should handle Windows drive letters without quotes', () => {
      const input = '@D:\\projects\\file.ts';
      const output = formatAttachmentReferencesForDisplay(input);
      expect(output).toContain('@[File #');
      expect(output).toContain('D:\\projects\\file.ts');
    });

    it('should NOT convert email addresses with @ symbol', () => {
      const input = 'Contact me at user@example.com for help';
      const output = formatAttachmentReferencesForDisplay(input);
      // Email should not be converted to [File #...]
      expect(output).not.toContain('@[File #');
      expect(output).toBe(input); // Should remain unchanged
    });

    it('should NOT convert multiple email addresses', () => {
      const input = 'Contact: alice@company.com or bob@example.org';
      const output = formatAttachmentReferencesForDisplay(input);
      expect(output).not.toContain('@[File #');
      expect(output).not.toContain('@[Image #');
      expect(output).toBe(input);
    });

    it('should handle valid @ command with email in text', () => {
      const input = 'Send to user@example.com or use @src/config.ts';
      const output = formatAttachmentReferencesForDisplay(input);
      // Email should not be converted, but file path should be
      expect(output).not.toContain('user@[File #');
      expect(output).toContain('@[File #');
      expect(output).toContain('src/config.ts');
    });
  });

  describe('ensureQuotesAroundAttachments', () => {
    it('should leave @"path" unchanged', () => {
      const input = '@"src/file.ts"';
      const output = ensureQuotesAroundAttachments(input);
      expect(output).toBe('@"src/file.ts"');
    });

    it('should convert @path to @"path"', () => {
      const input = '@src/file.ts';
      const output = ensureQuotesAroundAttachments(input);
      expect(output).toBe('@"src/file.ts"');
    });

    it('should handle @[File #"path"] from pasted display format', () => {
      const input = '@[File #"src/app.ts"]';
      const output = ensureQuotesAroundAttachments(input);
      expect(output).toBe('@"src/app.ts"');
    });

    it('should handle @[Image #"path"] from pasted display format', () => {
      const input = '@[Image #"screenshot.png"]';
      const output = ensureQuotesAroundAttachments(input);
      expect(output).toBe('@"screenshot.png"');
    });

    it('should preserve @clipboard special reference', () => {
      const input = '@clipboard';
      const output = ensureQuotesAroundAttachments(input);
      expect(output).toBe('@clipboard');
    });

    it('should not double-quote @clipboard', () => {
      const input = '@clipboard';
      const output = ensureQuotesAroundAttachments(input);
      expect(output).not.toBe('@"clipboard"');
    });

    it('should handle mixed attachments', () => {
      const input = '@[File #"src/file.ts"] and @clipboard and @image.jpg';
      const output = ensureQuotesAroundAttachments(input);
      expect(output).toBe('@"src/file.ts" and @clipboard and @"image.jpg"');
    });

    it('should handle pasted format with spaces', () => {
      const input = '@[File #"path/to/file.ts"]';
      const output = ensureQuotesAroundAttachments(input);
      expect(output).toBe('@"path/to/file.ts"');
    });

    it('should handle multiple file references in display format', () => {
      const input = '@[File #"file1.ts"] @[Image #"img.png"]';
      const output = ensureQuotesAroundAttachments(input);
      expect(output).toBe('@"file1.ts" @"img.png"');
    });

    it('should not convert @[ without File/Image type', () => {
      const input = '@[something else]';
      const output = ensureQuotesAroundAttachments(input);
      // This should remain unchanged since it's not a valid File/Image reference
      expect(output).toBe('@[something else]');
    });

    it('should handle path with special characters', () => {
      const input = '@[File #"path/to/my-file_v2.ts"]';
      const output = ensureQuotesAroundAttachments(input);
      expect(output).toBe('@"path/to/my-file_v2.ts"');
    });

    it('should handle Windows paths', () => {
      const input = '@[File #"C:\\Users\\name\\file.ts"]';
      const output = ensureQuotesAroundAttachments(input);
      expect(output).toBe('@"C:\\Users\\name\\file.ts"');
    });
  });
});
