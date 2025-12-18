/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { normalizeGitHubUrl } from './gitUrlNormalizer.js';

describe('normalizeGitHubUrl', () => {
  describe('GitHub shorthand format (owner/repo)', () => {
    it('should convert simple GitHub shorthand to full URL', () => {
      const result = normalizeGitHubUrl('anthropics/claude-code');
      expect(result).toBe('https://github.com/anthropics/claude-code.git');
    });

    it('should handle repo names with hyphens', () => {
      const result = normalizeGitHubUrl('google/my-awesome-repo');
      expect(result).toBe('https://github.com/google/my-awesome-repo.git');
    });

    it('should handle repo names with underscores', () => {
      const result = normalizeGitHubUrl('owner/my_repo');
      expect(result).toBe('https://github.com/owner/my_repo.git');
    });

    it('should handle repo names with dots', () => {
      const result = normalizeGitHubUrl('owner/repo.js');
      expect(result).toBe('https://github.com/owner/repo.js.git');
    });

    it('should handle owner names with hyphens', () => {
      const result = normalizeGitHubUrl('my-org/my-repo');
      expect(result).toBe('https://github.com/my-org/my-repo.git');
    });

    it('should handle single character owner/repo', () => {
      const result = normalizeGitHubUrl('a/b');
      expect(result).toBe('https://github.com/a/b.git');
    });

    it('should handle numbers in owner/repo', () => {
      const result = normalizeGitHubUrl('user123/repo456');
      expect(result).toBe('https://github.com/user123/repo456.git');
    });
  });

  describe('Full HTTPS URLs', () => {
    it('should return HTTPS URL unchanged', () => {
      const input = 'https://github.com/anthropics/claude-code.git';
      expect(normalizeGitHubUrl(input)).toBe(input);
    });

    it('should return HTTP URL unchanged', () => {
      const input = 'http://github.com/anthropics/claude-code.git';
      expect(normalizeGitHubUrl(input)).toBe(input);
    });

    it('should handle URLs without .git suffix', () => {
      const input = 'https://github.com/anthropics/claude-code';
      expect(normalizeGitHubUrl(input)).toBe(input);
    });
  });

  describe('Local paths', () => {
    it('should not convert absolute Unix paths', () => {
      const input = '/path/to/repo';
      expect(normalizeGitHubUrl(input)).toBe(input);
    });

    it('should not convert relative paths with ./', () => {
      const input = './local/repo';
      expect(normalizeGitHubUrl(input)).toBe(input);
    });

    it('should not convert relative paths with ../', () => {
      const input = '../local/repo';
      expect(normalizeGitHubUrl(input)).toBe(input);
    });

    it('should not convert Windows absolute paths', () => {
      const input = 'C:\\Users\\user\\repo';
      expect(normalizeGitHubUrl(input)).toBe(input);
    });

    it('should not convert Windows relative paths with backslashes', () => {
      const input = '.\\local\\repo';
      expect(normalizeGitHubUrl(input)).toBe(input);
    });

    it('should not convert Windows UNC paths', () => {
      const input = '\\\\server\\share\\repo';
      expect(normalizeGitHubUrl(input)).toBe(input);
    });
  });

  describe('Invalid GitHub shorthand formats', () => {
    it('should not convert single segment paths', () => {
      const input = 'onlyowner';
      expect(normalizeGitHubUrl(input)).toBe(input);
    });

    it('should not convert paths with more than one slash', () => {
      const input = 'owner/sub/repo';
      expect(normalizeGitHubUrl(input)).toBe(input);
    });

    it('should not convert owner names starting with hyphen', () => {
      const input = '-owner/repo';
      expect(normalizeGitHubUrl(input)).toBe(input);
    });

    it('should not convert owner names ending with hyphen', () => {
      const input = 'owner-/repo';
      expect(normalizeGitHubUrl(input)).toBe(input);
    });

    it('should not convert empty repo name', () => {
      const input = 'owner/';
      expect(normalizeGitHubUrl(input)).toBe(input);
    });

    it('should not convert empty owner name', () => {
      const input = '/repo';
      expect(normalizeGitHubUrl(input)).toBe(input);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      expect(normalizeGitHubUrl('')).toBe('');
    });

    it('should handle whitespace only', () => {
      const input = '   ';
      expect(normalizeGitHubUrl(input)).toBe(input);
    });

    it('should not convert URLs with non-standard protocols', () => {
      const input = 'git@github.com:owner/repo.git';
      expect(normalizeGitHubUrl(input)).toBe(input);
    });

    it('should not convert SSH URLs', () => {
      const input = 'ssh://git@github.com/owner/repo.git';
      expect(normalizeGitHubUrl(input)).toBe(input);
    });
  });
});
