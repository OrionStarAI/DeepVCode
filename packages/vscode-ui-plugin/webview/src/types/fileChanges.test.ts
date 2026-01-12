import { describe, it, expect } from 'vitest';
import type { ModifiedFile, FilesChangedState, FilesChangedBarProps } from './fileChanges';

describe('fileChanges types', () => {
  describe('ModifiedFile', () => {
    it('should accept valid modified file', () => {
      const file: ModifiedFile = {
        fileName: 'test.ts',
        isNewFile: false,
        isDeletedFile: false,
        modificationCount: 1,
        firstOriginalContent: 'old content',
        latestNewContent: 'new content',
        latestFileDiff: '- old\n+ new',
        linesAdded: 1,
        linesRemoved: 1,
      };

      expect(file.fileName).toBe('test.ts');
      expect(file.modificationCount).toBe(1);
    });

    it('should accept new file', () => {
      const file: ModifiedFile = {
        fileName: 'new.ts',
        isNewFile: true,
        isDeletedFile: false,
        modificationCount: 1,
        firstOriginalContent: '',
        latestNewContent: 'content',
        latestFileDiff: '+ content',
        linesAdded: 1,
        linesRemoved: 0,
      };

      expect(file.isNewFile).toBe(true);
      expect(file.firstOriginalContent).toBe('');
    });

    it('should accept deleted file', () => {
      const file: ModifiedFile = {
        fileName: 'deleted.ts',
        isNewFile: false,
        isDeletedFile: true,
        modificationCount: 1,
        firstOriginalContent: 'old content',
        latestNewContent: '',
        latestFileDiff: '- old content',
        linesAdded: 0,
        linesRemoved: 1,
        deletedContent: 'old content',
      };

      expect(file.isDeletedFile).toBe(true);
      expect(file.deletedContent).toBe('old content');
    });

    it('should accept optional fields', () => {
      const file: ModifiedFile = {
        fileName: 'test.ts',
        filePath: 'src/test.ts',
        absolutePath: '/project/src/test.ts',
        isNewFile: false,
        isDeletedFile: false,
        modificationCount: 1,
        firstOriginalContent: 'old',
        latestNewContent: 'new',
        latestFileDiff: 'diff',
        linesAdded: 1,
        linesRemoved: 0,
      };

      expect(file.filePath).toBe('src/test.ts');
      expect(file.absolutePath).toBe('/project/src/test.ts');
    });
  });

  describe('FilesChangedState', () => {
    it('should accept empty state', () => {
      const state: FilesChangedState = {
        modifiedFiles: new Map(),
      };

      expect(state.modifiedFiles.size).toBe(0);
    });

    it('should accept state with files', () => {
      const file: ModifiedFile = {
        fileName: 'a.ts',
        isNewFile: false,
        isDeletedFile: false,
        modificationCount: 1,
        firstOriginalContent: 'old',
        latestNewContent: 'new',
        latestFileDiff: 'diff',
        linesAdded: 1,
        linesRemoved: 0,
      };

      const state: FilesChangedState = {
        modifiedFiles: new Map([['a.ts', file]]),
      };

      expect(state.modifiedFiles.get('a.ts')?.fileName).toBe('a.ts');
    });

    it('should allow multiple files', () => {
      const file1: ModifiedFile = {
        fileName: 'a.ts',
        isNewFile: false,
        isDeletedFile: false,
        modificationCount: 1,
        firstOriginalContent: 'old',
        latestNewContent: 'new',
        latestFileDiff: 'diff',
        linesAdded: 1,
        linesRemoved: 0,
      };

      const file2: ModifiedFile = {
        fileName: 'b.ts',
        isNewFile: true,
        isDeletedFile: false,
        modificationCount: 1,
        firstOriginalContent: '',
        latestNewContent: 'content',
        latestFileDiff: '+ content',
        linesAdded: 1,
        linesRemoved: 0,
      };

      const state: FilesChangedState = {
        modifiedFiles: new Map([
          ['a.ts', file1],
          ['b.ts', file2],
        ]),
      };

      expect(state.modifiedFiles.size).toBe(2);
      expect(state.modifiedFiles.get('b.ts')?.isNewFile).toBe(true);
    });
  });

  describe('FilesChangedBarProps', () => {
    it('should accept required props', () => {
      const mockFn = () => {};
      const props: FilesChangedBarProps = {
        modifiedFiles: new Map(),
        onFileClick: mockFn,
      };

      expect(props.modifiedFiles).toBeDefined();
      expect(props.onFileClick).toBe(mockFn);
    });

    it('should accept optional props', () => {
      const mockFn = () => {};
      const props: FilesChangedBarProps = {
        modifiedFiles: new Map(),
        onFileClick: mockFn,
        onUndoFile: mockFn,
        onAcceptChanges: mockFn,
      };

      expect(props.onUndoFile).toBe(mockFn);
      expect(props.onAcceptChanges).toBe(mockFn);
    });
  });
});