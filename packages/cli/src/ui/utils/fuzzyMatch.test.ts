
import { describe, it, expect } from 'vitest';
import { fuzzyMatch, getHighlightSegments } from './fuzzyMatch.js';

describe('fuzzyMatch', () => {
  it('should match with special characters ignored', () => {
    // text doesn't have special chars, but query does
    const result1 = fuzzyMatch('my-file-name.txt', 'myfilename');
    expect(result1.matched).toBe(true);

    // query has special chars, but text doesn't
    const result2 = fuzzyMatch('myfilename.txt', 'my-file');
    expect(result2.matched).toBe(true);
  });

  it('should match symmetrically regardless of special char location', () => {
    // Both directions should match after the fix
    const result1 = fuzzyMatch('my-file.txt', 'myfile');
    const result2 = fuzzyMatch('myfile.txt', 'my-file');
    expect(result1.matched).toBe(true);
    expect(result2.matched).toBe(true);
  });

  it('should prioritize filename matches', () => {
    const res1 = fuzzyMatch('src/utils/file.ts', 'file');
    const res2 = fuzzyMatch('file/is/a/directory/readme.md', 'file');
    expect(res1.score).toBeGreaterThan(res2.score);
  });

  it('should handle empty strings correctly', () => {
    // Empty query should match everything
    expect(fuzzyMatch('text', '').matched).toBe(true);
    expect(fuzzyMatch('', '').matched).toBe(true);

    // Empty text should not match non-empty query
    expect(fuzzyMatch('', 'query').matched).toBe(false);
  });

  it('should handle special-only queries', () => {
    // Special characters in query should be ignored
    const result = fuzzyMatch('my-file.txt', '---');
    expect(result.matched).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it('should handle single character matches', () => {
    const result = fuzzyMatch('a', 'a');
    expect(result.matched).toBe(true);
    expect(result.indices).toEqual([0]);
  });

  it('should handle case-insensitive matching', () => {
    const result = fuzzyMatch('MyFileName.txt', 'myfn');
    expect(result.matched).toBe(true);
  });
});

describe('getHighlightSegments', () => {
  it('should highlight multiple non-contiguous segments correctly', () => {
    const segments = getHighlightSegments('my-file-name.txt', 'mf');
    expect(segments).toEqual([
      { text: 'm', highlighted: true },
      { text: 'y-', highlighted: false },
      { text: 'f', highlighted: true },
      { text: 'ile-name.txt', highlighted: false },
    ]);
  });

  it('should handle empty query', () => {
    const segments = getHighlightSegments('test.txt', '');
    expect(segments).toEqual([{ text: 'test.txt', highlighted: false }]);
  });

  it('should handle no match', () => {
    const segments = getHighlightSegments('test.txt', 'xyz');
    expect(segments).toEqual([{ text: 'test.txt', highlighted: false }]);
  });

  it('should handle single character highlight', () => {
    const segments = getHighlightSegments('a', 'a');
    expect(segments).toEqual([{ text: 'a', highlighted: true }]);
  });

  it('should handle full text match', () => {
    const segments = getHighlightSegments('test', 'test');
    expect(segments).toEqual([{ text: 'test', highlighted: true }]);
  });

  it('should handle alternating highlights', () => {
    const segments = getHighlightSegments('abcdef', 'ace');
    expect(segments).toEqual([
      { text: 'a', highlighted: true },
      { text: 'b', highlighted: false },
      { text: 'c', highlighted: true },
      { text: 'd', highlighted: false },
      { text: 'e', highlighted: true },
      { text: 'f', highlighted: false },
    ]);
  });
});
