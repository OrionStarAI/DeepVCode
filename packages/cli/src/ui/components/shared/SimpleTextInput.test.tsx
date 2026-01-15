/**
 * @license
 * Copyright 2025 DeepV Code team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { SimpleTextInput } from './SimpleTextInput.js';
import { sanitizeOutput } from '../../test-utils.js';

// Mock useKeypress to avoid stdin issues in tests
vi.mock('../../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

// Mock displayUtils
vi.mock('../../utils/displayUtils.js', () => ({
  sanitizePasteContent: (content: string) => content.trim(),
}));

// Mock textUtils for Unicode handling
vi.mock('../../utils/textUtils.js', () => ({
  cpSlice: (str: string, start: number, end?: number) => {
    const chars = [...str];
    return chars.slice(start, end).join('');
  },
  cpLen: (str: string) => [...str].length,
}));

describe('SimpleTextInput', () => {
  it('should render with placeholder when empty', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    const { lastFrame } = render(
      <SimpleTextInput
        value=""
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder="Enter text..."
        isActive={false}
      />
    );

    const output = sanitizeOutput(lastFrame());
    expect(output).toContain('Enter text...');
  });

  it('should render value with prompt', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    const { lastFrame } = render(
      <SimpleTextInput
        value="hello"
        onChange={onChange}
        onSubmit={onSubmit}
        isActive={false}
      />
    );

    const output = sanitizeOutput(lastFrame());
    expect(output).toContain('hello');
    expect(output).toContain('>');
  });

  it('should render with custom prompt', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    const { lastFrame } = render(
      <SimpleTextInput
        value="test"
        onChange={onChange}
        onSubmit={onSubmit}
        prompt="$ "
        isActive={false}
      />
    );

    const output = sanitizeOutput(lastFrame());
    expect(output).toContain('$ ');
    expect(output).toContain('test');
  });

  it('should mask value when mask prop is provided', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    const { lastFrame } = render(
      <SimpleTextInput
        value="secret"
        onChange={onChange}
        onSubmit={onSubmit}
        mask="*"
        isActive={false}
      />
    );

    const output = sanitizeOutput(lastFrame());
    expect(output).toContain('******');
    expect(output).not.toContain('secret');
  });

  it('should not show placeholder when value is present', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    const { lastFrame } = render(
      <SimpleTextInput
        value="some text"
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder="Enter text..."
        isActive={false}
      />
    );

    const output = sanitizeOutput(lastFrame());
    expect(output).not.toContain('Enter text...');
    expect(output).toContain('some text');
  });

  it('should render Unicode characters correctly (emoji)', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    const { lastFrame } = render(
      <SimpleTextInput
        value="hello 👋 world"
        onChange={onChange}
        onSubmit={onSubmit}
        isActive={false}
      />
    );

    const output = sanitizeOutput(lastFrame());
    expect(output).toContain('hello');
    expect(output).toContain('👋');
    expect(output).toContain('world');
  });

  it('should render CJK characters correctly', () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn();

    const { lastFrame } = render(
      <SimpleTextInput
        value="你好世界"
        onChange={onChange}
        onSubmit={onSubmit}
        isActive={false}
      />
    );

    const output = sanitizeOutput(lastFrame());
    expect(output).toContain('你好世界');
  });
});
