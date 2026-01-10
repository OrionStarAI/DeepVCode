import { describe, it, expect } from 'vitest';
import { truncatePath, getDisplayPath } from './pathUtils';

describe('pathUtils.ts', () => {
  describe('truncatePath', () => {
    it('should return original path if length is less than maxLength', () => {
      const path = 'short/path.md';
      expect(truncatePath(path, 20)).toBe(path);
    });

    it('should truncate path in the middle', () => {
      const path = 'a'.repeat(20) + 'b'.repeat(20);
      const result = truncatePath(path, 10);
      expect(result.length).toBe(10);
      expect(result).toContain('...');
      expect(result.startsWith('aaaa')).toBe(true);
      expect(result.endsWith('bbb')).toBe(true);
    });
  });

  describe('getDisplayPath', () => {
    it('should handle Windows paths correctly', () => {
      const path = 'C:\\projects\\my-app\\src\\components\\Button.tsx';
      const result = getDisplayPath(path, 30);
      expect(result).toContain('...');
      expect(result).toContain('Button.tsx');
    });

    it('should handle Linux paths correctly', () => {
      const path = '/home/user/projects/my-app/src/components/Button.tsx';
      const result = getDisplayPath(path, 30);
      expect(result).toContain('...');
      expect(result).toContain('Button.tsx');
    });
  });
});
