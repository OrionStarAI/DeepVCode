import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageInput } from './MessageInput';

// Mock dependencies
vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../hooks/useRefineCommand', () => ({
  useRefineCommand: () => ({
    refineResult: null,
    isLoading: false,
    executeRefine: vi.fn(),
    clearRefineResult: vi.fn(),
  }),
}));

vi.mock('../hooks/useMessageHistory', () => ({
  useMessageHistory: () => ({
    navigateUp: vi.fn(),
    navigateDown: vi.fn(),
    resetHistory: vi.fn(),
  }),
}));

vi.mock('./ModelSelector', () => ({
  ModelSelector: () => <div data-testid="model-selector" />,
}));

vi.mock('./PlanModeToggle', () => ({
  PlanModeToggle: () => <div data-testid="plan-mode-toggle" />,
}));

vi.mock('./MessageInput/components/UnifiedFileUploadButton', () => ({
  UnifiedFileUploadButton: () => <div data-testid="upload-button" />,
}));

vi.mock('./MessageInput/components/RefineButton', () => ({
  RefineButton: () => <div data-testid="refine-button" />,
}));

vi.mock('./BinaryFileWarningNotification', () => ({
  BinaryFileWarningNotification: () => <div data-testid="binary-warning" />,
}));

describe('MessageInput', () => {
  const mockOnSendMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly', () => {
    render(<MessageInput isLoading={false} onSendMessage={mockOnSendMessage} />);

    expect(screen.getByTestId('model-selector')).toBeInTheDocument();
    expect(screen.getByTestId('plan-mode-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('upload-button')).toBeInTheDocument();
  });

  it('shows stop button when isProcessing is true and canAbort is true', () => {
    render(
      <MessageInput
        isLoading={true}
        isProcessing={true}
        canAbort={true}
        onSendMessage={mockOnSendMessage}
      />
    );

    // The stop button is shown when textContent is empty and isProcessing is true
    const stopButton = screen.queryByTitle('chat.stopProcessing');
    expect(stopButton).toBeInTheDocument();
  });

  it('disables send button when text is empty', () => {
    render(<MessageInput isLoading={false} onSendMessage={mockOnSendMessage} />);

    const sendButton = screen.getByTitle('chat.sendMessage');
    expect(sendButton).toBeDisabled();
  });
});
