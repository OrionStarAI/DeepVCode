import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { linkifyText, linkifyTextNode } from './filePathLinkifier';

vi.mock('../components/FileIcons', () => ({
  getFileIcon: () => null,
}));

describe('filePathLinkifier', () => {
  it('turns a file path into a clickable link with line number', () => {
    const postMessage = vi.fn();
    (window as any).vscode = { postMessage };

    render(<div>{linkifyText('See src/main.py:12 for details')}</div>);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(postMessage).toHaveBeenCalledWith({
      type: 'open_file',
      payload: { filePath: 'src/main.py', line: 12 },
    });
  });

  it('linkifies plain text nodes', () => {
    render(<div>{linkifyTextNode(['open ', 'src/app.ts L5'])}</div>);

    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
