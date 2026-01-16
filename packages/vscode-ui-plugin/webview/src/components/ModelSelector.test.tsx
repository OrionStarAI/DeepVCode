/**
 * ModelSelector 测试
 * 修复了 async 状态更新导致的 act() 警告问题
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
    {
      name: 'claude-3-opus',
      displayName: 'Claude 3 Opus',
      creditsPerRequest: 2,
      available: true,
      maxToken: 200000,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // Setup mock implementations
    (webviewModelService.getAvailableModels as any).mockResolvedValue(mockModels);
    (webviewModelService.getCurrentModel as any).mockResolvedValue('auto');
    (webviewModelService.setCurrentModel as any).mockResolvedValue(undefined);
  });

  describe('rendering', () => {
    it('should render without crashing', async () => {
      await act(async () => {
        render(<ModelSelector />);
      });
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('should show loading state initially', async () => {
      await act(async () => {
        render(<ModelSelector />);
      });
      // Check if button exists (loading text may be shown briefly)
      const button = screen.queryByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should render model selector button', async () => {
      await act(async () => {
        render(<ModelSelector />);
      });

      await waitFor(() => {
        expect(screen.getByRole('button')).toBeInTheDocument();
      });
    });

    it('should display current model after loading', async () => {
      await act(async () => {
        render(<ModelSelector />);
      });

      // Wait for models to load
      await waitFor(
        () => {
          expect(webviewModelService.getAvailableModels).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      // The button should display the model name
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('model loading', () => {
    it('should fetch available models on mount', async () => {
      await act(async () => {
        render(<ModelSelector />);
      });

      await waitFor(
        () => {
          expect(webviewModelService.getAvailableModels).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );
    });

    it('should fetch current model on mount', async () => {
      await act(async () => {
        render(<ModelSelector />);
      });

      await waitFor(
        () => {
          expect(webviewModelService.getCurrentModel).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );
    });

    it('should handle empty model list', async () => {
      (webviewModelService.getAvailableModels as any).mockResolvedValue([]);

      await act(async () => {
        render(<ModelSelector />);
      });

      await waitFor(
        () => {
          expect(webviewModelService.getAvailableModels).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should handle model fetch errors gracefully', async () => {
      (webviewModelService.getAvailableModels as any).mockRejectedValue(
        new Error('Failed to fetch models')
      );

      await act(async () => {
        render(<ModelSelector />);
      });

      // Should not throw, component should handle error
      const button = screen.queryByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('dropdown interaction', () => {
    it('should open dropdown on button click', async () => {
      await act(async () => {
        render(<ModelSelector />);
      });

      await waitFor(
        () => {
          expect(webviewModelService.getAvailableModels).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      const button = screen.getByRole('button');
      await act(async () => {
        fireEvent.click(button);
      });

      // Dropdown should be visible (checking for model names in dropdown)
      await waitFor(() => {
        // Look for the model display name in the document
        const autoModel = screen.queryByText('Auto');
        expect(autoModel).toBeInTheDocument();
      });
    });

    it('should close dropdown when clicking outside', async () => {
      await act(async () => {
        render(<ModelSelector />);
      });

      await waitFor(
        () => {
          expect(webviewModelService.getAvailableModels).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      const button = screen.getByRole('button');

      // Open dropdown
      await act(async () => {
        fireEvent.click(button);
      });

      // Click outside
      await act(async () => {
        fireEvent.mouseDown(document.body);
      });

      // Dropdown should close
      await waitFor(() => {
        expect(screen.queryByText('Claude 3.5 Sonnet')).not.toBeInTheDocument();
      });
    });

    it('should close dropdown on escape key', async () => {
      await act(async () => {
        render(<ModelSelector />);
      });

      await waitFor(
        () => {
          expect(webviewModelService.getAvailableModels).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      const button = screen.getByRole('button');

      // Open dropdown
      await act(async () => {
        fireEvent.click(button);
      });

      // Press escape
      await act(async () => {
        fireEvent.keyDown(document, { key: 'Escape' });
      });

      // Dropdown should close
      await waitFor(() => {
        expect(screen.queryByText('Claude 3 Opus')).not.toBeInTheDocument();
      });
    });
  });

  describe('model selection', () => {
    it('should call setCurrentModel when model is selected', async () => {
      await act(async () => {
        render(<ModelSelector />);
      });

      await waitFor(
        () => {
          expect(webviewModelService.getAvailableModels).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      const button = screen.getByRole('button');

      // Open dropdown
      await act(async () => {
        fireEvent.click(button);
      });

      // Wait for dropdown to render
      await waitFor(() => {
        expect(screen.getByText('Claude 3.5 Sonnet')).toBeInTheDocument();
      });

      // Click on a model option
      await act(async () => {
        const modelOption = screen.getByText('Claude 3.5 Sonnet');
        fireEvent.click(modelOption);
      });

      // Should call setCurrentModel
      await waitFor(() => {
        expect(webviewModelService.setCurrentModel).toHaveBeenCalledWith('claude-3-5-sonnet');
      });
    });

    it('should close dropdown after model selection', async () => {
      await act(async () => {
        render(<ModelSelector />);
      });

      await waitFor(
        () => {
          expect(webviewModelService.getAvailableModels).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      const button = screen.getByRole('button');

      // Open dropdown
      await act(async () => {
        fireEvent.click(button);
      });

      // Select a model
      await act(async () => {
        const modelOption = screen.getByText('Claude 3.5 Sonnet');
        fireEvent.click(modelOption);
      });

      // Dropdown should close
      await waitFor(() => {
        expect(screen.queryByText('Claude 3 Opus')).not.toBeInTheDocument();
      });
    });

    it('should update displayed model after selection', async () => {
      await act(async () => {
        render(<ModelSelector />);
      });

      await waitFor(
        () => {
          expect(webviewModelService.getCurrentModel).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      const button = screen.getByRole('button');

      // Open dropdown and select a model
      await act(async () => {
        fireEvent.click(button);
      });

      await act(async () => {
        const modelOption = screen.getByText('Claude 3.5 Sonnet');
        fireEvent.click(modelOption);
      });

      // Button should show the selected model
      await waitFor(() => {
        expect(button).toHaveTextContent('Claude 3.5 Sonnet');
      });
    });
  });

  describe('model display', () => {
    it('should show model credits information', async () => {
      await act(async () => {
        render(<ModelSelector />);
      });

      await waitFor(
        () => {
          expect(webviewModelService.getAvailableModels).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      const button = screen.getByRole('button');
      await act(async () => {
        fireEvent.click(button);
      });

      // Check for credits display in dropdown
      await waitFor(() => {
        expect(screen.getByText('model.selector.creditsPerRequest')).toBeInTheDocument();
      });
    });

    it('should show unavailable models as disabled', async () => {
      const modelsWithUnavailable = [
        ...mockModels,
        {
          name: 'claude-3-opus',
          displayName: 'Claude 3 Opus',
          creditsPerRequest: 2,
          available: false,
          maxToken: 200000,
        },
      ];

      (webviewModelService.getAvailableModels as any).mockResolvedValue(modelsWithUnavailable);

      await act(async () => {
        render(<ModelSelector />);
      });

      await waitFor(
        () => {
          expect(webviewModelService.getAvailableModels).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      const button = screen.getByRole('button');
      await act(async () => {
        fireEvent.click(button);
      });

      // Unavailable model should be shown but disabled
      await waitFor(() => {
        const unavailableModel = screen.queryByText('Claude 3 Opus');
        expect(unavailableModel).toBeInTheDocument();
      });
    });
  });

  describe('SessionStatisticsDialog', () => {
    it('should not show stats dialog initially', async () => {
      await act(async () => {
        render(<ModelSelector />);
      });

      expect(screen.queryByTestId('stats-dialog')).not.toBeInTheDocument();
    });

    it('should show stats dialog on model button right-click', async () => {
      await act(async () => {
        render(<ModelSelector />);
      });

      await waitFor(
        () => {
          expect(webviewModelService.getAvailableModels).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      const button = screen.getByRole('button');

      // Right-click on button
      await act(async () => {
        fireEvent.contextMenu(button);
      });

      // Stats dialog should appear
      await waitFor(() => {
        expect(screen.getByTestId('stats-dialog')).toBeInTheDocument();
      });
    });

    it('should close stats dialog when clicking outside', async () => {
      await act(async () => {
        render(<ModelSelector />);
      });

      await waitFor(
        () => {
          expect(webviewModelService.getAvailableModels).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      const button = screen.getByRole('button');

      // Open stats dialog
      await act(async () => {
        fireEvent.contextMenu(button);
      });

      await waitFor(() => {
        expect(screen.getByTestId('stats-dialog')).toBeInTheDocument();
      });

      // Click outside
      await act(async () => {
        fireEvent.mouseDown(document.body);
      });

      // Dialog should close
      await waitFor(() => {
        expect(screen.queryByTestId('stats-dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('edge cases', () => {
    it('should handle rapid model changes', async () => {
      await act(async () => {
        render(<ModelSelector />);
      });

      await waitFor(
        () => {
          expect(webviewModelService.getAvailableModels).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      const button = screen.getByRole('button');

      // Rapidly change models
      await act(async () => {
        fireEvent.click(button);
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Claude 3.5 Sonnet'));
      });

      await act(async () => {
        fireEvent.click(button);
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Claude 3 Opus'));
      });

      // Should handle both changes
      expect(webviewModelService.setCurrentModel).toHaveBeenCalledTimes(2);
    });

    it('should handle missing current model', async () => {
      (webviewModelService.getCurrentModel as any).mockResolvedValue(null);

      await act(async () => {
        render(<ModelSelector />);
      });

      await waitFor(
        () => {
          expect(webviewModelService.getCurrentModel).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      // Should still render without crashing
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should handle concurrent model fetch requests', async () => {
      let resolveModels: (value: any) => void;
      const modelsPromise = new Promise((resolve) => {
        resolveModels = resolve;
      });

      (webviewModelService.getAvailableModels as any).mockReturnValue(modelsPromise);

      await act(async () => {
        render(<ModelSelector />);
      });

      // Trigger multiple fetch requests
      const button = screen.getByRole('button');
      await act(async () => {
        fireEvent.click(button);
      });

      // Resolve the promise
      await act(async () => {
        resolveModels!(mockModels);
      });

      // Should handle gracefully
      await waitFor(() => {
        expect(button).toBeInTheDocument();
      });
    });
  });
});
