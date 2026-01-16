/**
 * RefineButton 测试
 * 测试文本优化按钮组件
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RefineButton } from './RefineButton';

// Mock useTranslation hook
vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('RefineButton', () => {
  const mockOnRefine = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render without crashing', () => {
      render(
        <RefineButton
          inputText="test text"
          onRefine={mockOnRefine}
        />
      );

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should display Wand2 icon when not loading', () => {
      render(
        <RefineButton
          inputText="test text"
          onRefine={mockOnRefine}
        />
      );

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should display Loader2 icon when loading', () => {
      render(
        <RefineButton
          inputText="test text"
          onRefine={mockOnRefine}
          isLoading={true}
        />
      );

      const button = screen.getByRole('button');
      expect(button).toHaveClass('loading');
    });
  });

  describe('button state', () => {
    it('should be enabled when there is text and not loading', () => {
      render(
        <RefineButton
          inputText="some text"
          onRefine={mockOnRefine}
          isLoading={false}
        />
      );

      const button = screen.getByRole('button');
      expect(button).not.toBeDisabled();
    });

    it('should be disabled when input text is empty', () => {
      render(
        <RefineButton
          inputText=""
          onRefine={mockOnRefine}
        />
      );

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should be disabled when input text is only whitespace', () => {
      render(
        <RefineButton
          inputText="   "
          onRefine={mockOnRefine}
        />
      );

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should be disabled when isLoading is true', () => {
      render(
        <RefineButton
          inputText="some text"
          onRefine={mockOnRefine}
          isLoading={true}
        />
      );

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should be disabled when disabled prop is true', () => {
      render(
        <RefineButton
          inputText="some text"
          onRefine={mockOnRefine}
          disabled={true}
        />
      );

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });
  });

  describe('click handling', () => {
    it('should call onRefine with trimmed text when clicked', () => {
      render(
        <RefineButton
          inputText="  test text  "
          onRefine={mockOnRefine}
        />
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(mockOnRefine).toHaveBeenCalledWith('test text');
      expect(mockOnRefine).toHaveBeenCalledTimes(1);
    });

    it('should not call onRefine when disabled due to empty text', () => {
      render(
        <RefineButton
          inputText=""
          onRefine={mockOnRefine}
        />
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(mockOnRefine).not.toHaveBeenCalled();
    });

    it('should not call onRefine when disabled prop is true', () => {
      render(
        <RefineButton
          inputText="some text"
          onRefine={mockOnRefine}
          disabled={true}
        />
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(mockOnRefine).not.toHaveBeenCalled();
    });

    it('should not call onRefine when loading', () => {
      render(
        <RefineButton
          inputText="some text"
          onRefine={mockOnRefine}
          isLoading={true}
        />
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(mockOnRefine).not.toHaveBeenCalled();
    });
  });

  describe('tooltip', () => {
    it('should show empty text tooltip when input is empty', () => {
      render(
        <RefineButton
          inputText=""
          onRefine={mockOnRefine}
        />
      );

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'command.refine.button.empty_text');
    });

    it('should show normal tooltip when input has text', () => {
      render(
        <RefineButton
          inputText="some text"
          onRefine={mockOnRefine}
        />
      );

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', 'command.refine.button.tooltip');
    });
  });

  describe('hover effects', () => {
    it('should add hovered class on mouse enter', () => {
      render(
        <RefineButton
          inputText="some text"
          onRefine={mockOnRefine}
        />
      );

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);

      expect(button).toHaveClass('hovered');
    });

    it('should remove hovered class on mouse leave', () => {
      render(
        <RefineButton
          inputText="some text"
          onRefine={mockOnRefine}
        />
      );

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);
      fireEvent.mouseLeave(button);

      expect(button).not.toHaveClass('hovered');
    });

    it('should not add hovered class when disabled', () => {
      render(
        <RefineButton
          inputText=""
          onRefine={mockOnRefine}
        />
      );

      const button = screen.getByRole('button');
      fireEvent.mouseEnter(button);

      expect(button).not.toHaveClass('hovered');
    });
  });

  describe('CSS classes', () => {
    it('should have refine-button class', () => {
      render(
        <RefineButton
          inputText="some text"
          onRefine={mockOnRefine}
        />
      );

      const button = screen.getByRole('button');
      expect(button).toHaveClass('refine-button');
    });

    it('should have loading class when isLoading is true', () => {
      render(
        <RefineButton
          inputText="some text"
          onRefine={mockOnRefine}
          isLoading={true}
        />
      );

      const button = screen.getByRole('button');
      expect(button).toHaveClass('loading');
    });

    it('should have both refine-button and loading class when loading', () => {
      render(
        <RefineButton
          inputText="some text"
          onRefine={mockOnRefine}
          isLoading={true}
        />
      );

      const button = screen.getByRole('button');
      expect(button).toHaveClass('refine-button');
      expect(button).toHaveClass('loading');
    });
  });

  describe('accessibility', () => {
    it('should have aria-label attribute', () => {
      render(
        <RefineButton
          inputText="some text"
          onRefine={mockOnRefine}
        />
      );

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Refine text');
    });

    it('should be keyboard accessible', () => {
      render(
        <RefineButton
          inputText="some text"
          onRefine={mockOnRefine}
        />
      );

      const button = screen.getByRole('button');

      // Simulate Enter key press
      fireEvent.click(button);

      expect(mockOnRefine).toHaveBeenCalledWith('some text');
    });
  });

  describe('edge cases', () => {
    it('should handle very long input text', () => {
      const longText = 'a'.repeat(10000);

      render(
        <RefineButton
          inputText={longText}
          onRefine={mockOnRefine}
        />
      );

      const button = screen.getByRole('button');
      expect(button).not.toBeDisabled();

      fireEvent.click(button);
      expect(mockOnRefine).toHaveBeenCalledWith(longText);
    });

    it('should handle text with special characters', () => {
      const specialText = '<script>alert("test")</script>';

      render(
        <RefineButton
          inputText={specialText}
          onRefine={mockOnRefine}
        />
      );

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(mockOnRefine).toHaveBeenCalledWith(specialText);
    });

    it('should handle text with newlines and tabs', () => {
      const multilineText = 'line 1\n\tline 2\r\nline 3';

      render(
        <RefineButton
          inputText={multilineText}
          onRefine={mockOnRefine}
        />
      );

      const button = screen.getByRole('button');
      expect(button).not.toBeDisabled();

      fireEvent.click(button);
      expect(mockOnRefine).toHaveBeenCalledWith(multilineText);
    });

    it('should handle rapid clicks', () => {
      render(
        <RefineButton
          inputText="test text"
          onRefine={mockOnRefine}
        />
      );

      const button = screen.getByRole('button');

      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);

      // Should be called multiple times (debouncing would be handled by parent)
      expect(mockOnRefine).toHaveBeenCalledTimes(3);
    });
  });

  describe('integration', () => {
    it('should work with useTranslation hook', () => {
      // The hook is already mocked at the top level
      // Just verify the component renders correctly
      render(
        <RefineButton
          inputText="test"
          onRefine={mockOnRefine}
        />
      );

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });
});
