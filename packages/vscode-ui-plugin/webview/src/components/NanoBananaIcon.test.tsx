import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NanoBananaIcon } from './NanoBananaIcon';

describe('NanoBananaIcon.tsx', () => {
  it('renders correctly with default size', () => {
    render(<NanoBananaIcon />);
    const svg = screen.getByRole('img', { hidden: true });
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('width', '18');
    expect(svg).toHaveAttribute('height', '18');
  });

  it('renders correctly with custom size', () => {
    render(<NanoBananaIcon size={32} />);
    const svg = screen.getByRole('img', { hidden: true });
    expect(svg).toHaveAttribute('width', '32');
    expect(svg).toHaveAttribute('height', '32');
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<NanoBananaIcon onClick={handleClick} />);
    const svg = screen.getByRole('img', { hidden: true });
    fireEvent.click(svg);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('sets custom className', () => {
    render(<NanoBananaIcon className="custom-class" />);
    const svg = screen.getByRole('img', { hidden: true });
    expect(svg).toHaveClass('custom-class');
  });
});
