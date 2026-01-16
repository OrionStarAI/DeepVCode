/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { RadioButtonSelect, RadioSelectItem } from './RadioButtonSelect.js';

describe('RadioButtonSelect Horizontal Layout', () => {
  const mockItems: Array<RadioSelectItem<string>> = [
    { label: '✓ Apply', value: 'apply' },
    { label: '✗ Cancel', value: 'cancel' },
  ];

  it('should render in horizontal layout when specified', () => {
    const mockOnSelect = vi.fn();

    const { lastFrame } = render(
      <RadioButtonSelect
        items={mockItems}
        onSelect={mockOnSelect}
        layout="horizontal"
        showNumbers={false}
        isFocused={true}
      />
    );

    const output = lastFrame();

    // 验证横向布局：选项应该在同一行
    expect(output).toContain('•');  // 选中标记
    expect(output).toContain('✓ Apply');
    expect(output).toContain('◦');  // 未选中标记
    expect(output).toContain('✗ Cancel');

    // 在横向布局中，所有内容应该在较少的行中
    const lines = output.split('\n').filter(line => line.trim());
    expect(lines.length).toBeLessThanOrEqual(2); // 横向布局应该更紧凑
  });

  it('should render in vertical layout by default', () => {
    const mockOnSelect = vi.fn();

    const { lastFrame } = render(
      <RadioButtonSelect
        items={mockItems}
        onSelect={mockOnSelect}
        isFocused={true}
      />
    );

    const output = lastFrame();

    // 验证垂直布局：每个选项占用一行
    const lines = output.split('\n').filter(line => line.trim());
    expect(lines.length).toBeGreaterThanOrEqual(mockItems.length);
  });

  it('should handle horizontal layout with spacing', () => {
    const mockOnSelect = vi.fn();

    const { lastFrame } = render(
      <RadioButtonSelect
        items={mockItems}
        onSelect={mockOnSelect}
        layout="horizontal"
        horizontalSpacing={3}
        showNumbers={true}
        isFocused={true}
      />
    );

    const output = lastFrame();

    // 验证包含数字和适当间距
    expect(output).toContain('1.');
    expect(output).toContain('2.');
    expect(output).toContain('✓ Apply');
    expect(output).toContain('✗ Cancel');
  });
});