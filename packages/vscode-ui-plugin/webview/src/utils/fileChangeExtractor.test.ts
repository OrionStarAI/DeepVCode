import { extractModifiedFiles } from './fileChangeExtractor';
import { TOOL_NAMES } from '../constants/toolConstants';
import type { ChatMessage } from '../types';

describe('fileChangeExtractor', () => {
  it('collects modified files from tool call diffs', () => {
    const diff = '--- a/src/a.ts\n+++ b/src/a.ts\n@@\n-old\n+new\n';
    const messages: ChatMessage[] = [
      {
        id: 'm1',
        type: 'assistant',
        content: [{ type: 'text', value: 'update' }],
        timestamp: 1,
        associatedToolCalls: [
          {
            id: 'tool-1',
            toolName: 'write_file',
            parameters: {},
            status: 'success' as any,
            result: {
              success: true,
              executionTime: 1,
              toolName: 'write_file',
              data: {
                fileName: 'a.ts',
                filePath: '/root/src/a.ts',
                originalContent: 'old',
                newContent: 'new',
                fileDiff: diff,
              },
            },
          },
        ],
      },
    ];

    const map = extractModifiedFiles(messages, '/root');
    const entry = map.get('/root/src/a.ts');

    expect(entry).toBeTruthy();
    expect(entry?.filePath).toBe('src/a.ts');
    expect(entry?.linesAdded).toBe(1);
    expect(entry?.linesRemoved).toBe(1);
  });

  it('marks deleted files and respects undo', () => {
    const deleteDiff = '--- a/src/b.ts\n+++ /dev/null\n@@\n-old\n';
    const messages: ChatMessage[] = [
      {
        id: 'm1',
        type: 'assistant',
        content: [{ type: 'text', value: 'delete' }],
        timestamp: 1,
        associatedToolCalls: [
          {
            id: 'tool-2',
            toolName: TOOL_NAMES.DELETE_FILE,
            parameters: {},
            status: 'success' as any,
            result: {
              success: true,
              executionTime: 1,
              toolName: TOOL_NAMES.DELETE_FILE,
              data: {
                fileName: 'b.ts',
                filePath: '/root/src/b.ts',
                originalContent: 'old',
                newContent: '',
                fileDiff: deleteDiff,
              },
            },
          },
        ],
      },
      {
        id: 'm2',
        type: 'system',
        content: [{ type: 'text', value: 'undo' }],
        timestamp: 2,
        notificationType: 'undo_file' as any,
        notificationTitle: '/root/src/b.ts',
      },
    ];

    const map = extractModifiedFiles(messages, '/root');
    expect(map.get('/root/src/b.ts')).toBeUndefined();
  });
});
