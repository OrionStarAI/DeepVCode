import { ToolCallStatus } from './index';

describe('types index', () => {
  it('exposes tool call status values', () => {
    expect(ToolCallStatus.Success).toBe('success');
    expect(ToolCallStatus.Executing).toBe('executing');
  });
});
