import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelSelector } from './ModelSelector';
import { webviewModelService } from '../services/webViewModelService';

// Mock dependencies
vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../services/webViewModelService', () => ({
  webviewModelService: {
    getAvailableModels: vi.fn(),
    getCurrentModel: vi.fn(),
    setCurrentModel: vi.fn(),
  },
}));

vi.mock('../services/globalMessageService', () => ({
  getGlobalMessageService: () => ({
    onExtensionMessage: vi.fn(() => () => {}),
    send: vi.fn(),
  }),
}));

// Mock SessionStatisticsDialog to avoid complexity
vi.mock('./SessionStatisticsDialog', () => ({
  SessionStatisticsDialog: () => <div data-testid="stats-dialog" />,
}));

describe('ModelSelector', () => {
  const mockModels = [
    {
      name: 'auto',
      displayName: 'Auto',
      creditsPerRequest: 0,
      available: true,
      maxToken: 100000,
    },
    {
      name: 'claude-3-5-sonnet',
      displayName: 'Claude 3.5 Sonnet',
      creditsPerRequest: 1,
      available: true,
      maxToken: 200000,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (webviewModelService.getAvailableModels as any).mockResolvedValue(mockModels);
    (webviewModelService.getCurrentModel as any).mockResolvedValue('auto');
  });

  it('renders loading state initially', async () => {
    render(<ModelSelector />);
    expect(screen.getByText('model.selector.loading')).toBeInTheDocument();
  });

  it('renders models after loading', async () => {
    render(<ModelSelector />);

    await waitFor(() => {
      expect(screen.queryByText('model.selector.loading')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Auto')).toBeInTheDocument();
  });

  it('opens dropdown on click', async () => {
    render(<ModelSelector />);

    await waitFor(() => {
      expect(screen.getByText('Auto')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /auto/i }));

    expect(screen.getByText('model.selector.selectModel')).toBeInTheDocument();
    expect(screen.getByText('Claude 3.5 Sonnet')).toBeInTheDocument();
  });
});
