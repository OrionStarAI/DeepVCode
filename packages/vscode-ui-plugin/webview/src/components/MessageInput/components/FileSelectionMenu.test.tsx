import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileSelectionMenu } from './FileSelectionMenu';
import { FileOption, atSymbolHandler } from '../../../services/atSymbolHandler';

vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../../services/atSymbolHandler', async () => {
  const actual = await vi.importActual<any>('../../../services/atSymbolHandler');
  return {
    ...actual,
    atSymbolHandler: {
      browseFolder: vi.fn(),
      getSymbolOptions: vi.fn(),
      getTerminalOptions: vi.fn(),
      setCurrentView: vi.fn(),
      resetView: vi.fn(),
      searchFilesWithDebounce: vi.fn(),
    },
  };
});

describe('FileSelectionMenu', () => {
  const baseProps = {
    anchorElementRef: { current: document.createElement('div') },
    selectedIndex: 0,
    setHighlightedIndex: vi.fn(),
    onSelectOption: vi.fn(),
    onClose: vi.fn(),
  };

  const filesCategory = new FileOption('Files & Folders', '__category_files__', 'category', {
    hasSubmenu: true,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders filter input in files view when enabled', async () => {
    (atSymbolHandler.browseFolder as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    render(
      <FileSelectionMenu
        {...baseProps}
        options={[filesCategory]}
        enableFilterInput={true}
      />
    );

    fireEvent.click(screen.getByText('Files & Folders'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('atMention.filterPlaceholder')).toBeTruthy();
    });
  });

  it('searches recursively via handler and shows empty state when no matches', async () => {
    (atSymbolHandler.browseFolder as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    (atSymbolHandler.searchFilesWithDebounce as unknown as ReturnType<typeof vi.fn>)
      .mockImplementation((_query: string, callback: (results: FileOption[]) => void) => callback([]));

    render(
      <FileSelectionMenu
        {...baseProps}
        options={[filesCategory]}
        enableFilterInput={true}
      />
    );

    fireEvent.click(screen.getByText('Files & Folders'));

    const input = await screen.findByPlaceholderText('atMention.filterPlaceholder');

    fireEvent.change(input, { target: { value: 'zzz' } });

    await waitFor(() => {
      expect(atSymbolHandler.searchFilesWithDebounce).toHaveBeenCalledWith('zzz', expect.any(Function));
      expect(screen.getByText('atMention.noMatches')).toBeTruthy();
    });
  });

  it('renders recursive search results in files view', async () => {
    const alpha = new FileOption('alpha.ts', 'src/alpha.ts', 'file');
    const beta = new FileOption('beta.ts', 'src/beta.ts', 'file');

    (atSymbolHandler.browseFolder as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    (atSymbolHandler.searchFilesWithDebounce as unknown as ReturnType<typeof vi.fn>)
      .mockImplementation((_query: string, callback: (results: FileOption[]) => void) => callback([alpha, beta]));

    render(
      <FileSelectionMenu
        {...baseProps}
        options={[filesCategory]}
        enableFilterInput={true}
      />
    );

    fireEvent.click(screen.getByText('Files & Folders'));

    const input = await screen.findByPlaceholderText('atMention.filterPlaceholder');

    fireEvent.change(input, { target: { value: 'a' } });

    await waitFor(() => {
      expect(screen.getByText('alpha.ts')).toBeTruthy();
      expect(screen.getByText('beta.ts')).toBeTruthy();
    });
  });
});
