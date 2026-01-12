import type { ModifiedFile, FilesChangedState } from './fileChanges';

describe('fileChanges types', () => {
  it('accepts modified file shapes', () => {
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

    const state: FilesChangedState = { modifiedFiles: new Map([['a.ts', file]]) };
    expect(state.modifiedFiles.get('a.ts')?.fileName).toBe('a.ts');
  });
});
