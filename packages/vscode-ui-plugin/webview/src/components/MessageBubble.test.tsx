import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MessageBubble } from './MessageBubble';
import { ChatMessage } from '../types';

// Mock dependencies
vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('./ToolCallList', () => ({
  ToolCallList: () => <div data-testid="tool-call-list" />,
}));

vi.mock('./ReasoningDisplay', () => ({
  ReasoningDisplay: () => <div data-testid="reasoning-display" />,
}));

vi.mock('./SystemNotificationMessage', () => ({
  SystemNotificationMessage: () => <div data-testid="system-notification" />,
}));

vi.mock('./renderers/SubAgentDisplayRenderer', () => ({
  SubAgentDisplayRenderer: () => <div data-testid="sub-agent-display" />,
}));

describe('MessageBubble', () => {
  it('renders user message correctly', () => {
    const message: ChatMessage = {
      id: '1',
      type: 'user',
      content: [{ type: 'text', value: 'Hello AI' }],
      timestamp: Date.now(),
    };
    render(<MessageBubble message={message} />);
    expect(screen.getByText('Hello AI')).toBeInTheDocument();
  });

  it('renders assistant message with markdown', () => {
    const message: ChatMessage = {
      id: '2',
      type: 'assistant',
      content: [{ type: 'text', value: '# Hello\nThis is **bold**' }],
      timestamp: Date.now(),
    };
    render(<MessageBubble message={message} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hello');
    expect(screen.getByText('This is')).toBeInTheDocument();
    expect(screen.getByText('bold')).toBeInTheDocument();
  });

  it('renders tool message', () => {
    const message: ChatMessage = {
      id: '3',
      type: 'tool',
      content: [{ type: 'text', value: 'tool result' }],
      timestamp: Date.now(),
      associatedToolCalls: [{ id: 'tc1', toolName: 'test_tool', displayName: 'Test Tool', parameters: {}, status: 'success' as any }],
    };
    render(<MessageBubble message={message} />);
    expect(screen.getByTestId('tool-call-list')).toBeInTheDocument();
  });

  it('renders reasoning display when isReasoning is true', () => {
    const message: ChatMessage = {
      id: '4',
      type: 'assistant',
      content: [{ type: 'text', value: 'Result' }],
      timestamp: Date.now(),
      reasoning: 'Thinking...',
      isReasoning: true,
    };
    render(<MessageBubble message={message} />);
    expect(screen.getByTestId('reasoning-display')).toBeInTheDocument();
  });
});
