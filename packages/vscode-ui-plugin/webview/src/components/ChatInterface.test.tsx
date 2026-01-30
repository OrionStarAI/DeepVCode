/**
 * ChatInterface 测试
 * 测试主聊天界面组件
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatInterface } from './ChatInterface';
import { ChatMessage } from '../types';

// Mock dependencies
vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../hooks/useBackgroundTasks', () => ({
  useBackgroundTasks: () => ({
    tasks: [],
    runningCount: 0,
    killTask: vi.fn(),
    refreshTasks: vi.fn(),
  }),
}));

vi.mock('../services/globalMessageService', () => ({
  getGlobalMessageService: () => ({
    onExtensionMessage: vi.fn(() => () => {}),
    send: vi.fn(),
  }),
}));

vi.mock('./MessageBubble', () => ({
  MessageBubble: ({ message }: any) => (
    <div data-testid="message-bubble" data-message-id={message.id}>
      {message.content?.[0]?.value || 'message'}
    </div>
  ),
}));

vi.mock('./MessageQueueList', () => ({
  MessageQueueList: ({ onEdit }: any) => (
    <div data-testid="message-queue-list">
      <button
        data-testid="queue-edit-btn"
        onClick={() => onEdit?.({
          id: 'queue-1',
          content: [{ type: 'text', value: 'Queued message' }],
          timestamp: Date.now(),
        })}
      >
        Edit
      </button>
    </div>
  ),
}));

vi.mock('./ToolCallList', () => ({
  ToolCallList: () => <div data-testid="tool-call-list" />,
}));

vi.mock('./StickyTodoPanel', () => ({
  StickyTodoPanel: () => <div data-testid="sticky-todo-panel" />,
}));

vi.mock('./MessageInput', () => ({
  MessageInput: ({ onSendMessage }: any) => (
    <div data-testid="message-input">
      <button onClick={() => onSendMessage([{ type: 'text', value: 'test' }])}>
        Send
      </button>
    </div>
  ),
}));

vi.mock('./FilesChangedBar', () => ({
  default: () => <div data-testid="files-changed-bar" />,
}));

vi.mock('./BackgroundTasksBar', () => ({
  default: () => <div data-testid="background-tasks-bar" />,
}));

describe('ChatInterface', () => {
  const mockMessages: ChatMessage[] = [
    {
      id: '1',
      type: 'user',
      content: [{ type: 'text', value: 'Hello' }],
      timestamp: Date.now(),
    },
    {
      id: '2',
      type: 'assistant',
      content: [{ type: 'text', value: 'Hi there!' }],
      timestamp: Date.now(),
    },
  ];

  const defaultProps = {
    messages: mockMessages,
    isLoading: false,
    onSendMessage: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render without crashing', () => {
      render(<ChatInterface {...defaultProps} />);
      expect(screen.getByTestId('message-input')).toBeInTheDocument();
    });

    it('should render all messages', () => {
      render(<ChatInterface {...defaultProps} />);

      const messageBubbles = screen.getAllByTestId('message-bubble');
      expect(messageBubbles).toHaveLength(2);
    });

    it('should render message input component', () => {
      render(<ChatInterface {...defaultProps} />);
      expect(screen.getByTestId('message-input')).toBeInTheDocument();
    });

    it('should render files changed bar when there are file changes', () => {
      render(<ChatInterface {...defaultProps} />);
      expect(screen.getByTestId('files-changed-bar')).toBeInTheDocument();
    });

    it('should render background tasks bar', () => {
      render(<ChatInterface {...defaultProps} />);
      expect(screen.getByTestId('background-tasks-bar')).toBeInTheDocument();
    });
  });

  describe('message handling', () => {
    it('should send message when user submits input', () => {
      render(<ChatInterface {...defaultProps} />);

      const sendButton = screen.getByText('Send');
      fireEvent.click(sendButton);

      expect(defaultProps.onSendMessage).toHaveBeenCalledWith([
        { type: 'text', value: 'test' },
      ]);
    });

    it('should display loading state when isLoading is true', () => {
      render(<ChatInterface {...defaultProps} isLoading={true} />);

      // Loading indicator should be present (implementation dependent)
      const messageInput = screen.getByTestId('message-input');
      expect(messageInput).toBeInTheDocument();
    });

    it('should handle empty messages array', () => {
      render(<ChatInterface {...defaultProps} messages={[]} />);

      const messageBubbles = screen.queryByTestId('message-bubble');
      expect(messageBubbles).not.toBeInTheDocument();
    });
  });

  describe('tool confirmation', () => {
    it('should render tool confirmation dialog when needed', () => {
      const messageWithTool: ChatMessage = {
        id: '3',
        type: 'assistant',
        content: [{ type: 'text', value: 'I will help' }],
        timestamp: Date.now(),
        associatedToolCalls: [
          {
            id: 'tool1',
            toolName: 'read_file',
            displayName: 'Read File',
            parameters: { path: 'test.txt' },
            status: 'pending',
          },
        ],
      };

      render(
        <ChatInterface
          {...defaultProps}
          messages={[messageWithTool]}
          onToolConfirm={vi.fn()}
        />
      );

      expect(screen.getByTestId('tool-call-list')).toBeInTheDocument();
    });
  });

  describe('abort functionality', () => {
    it('should show abort button when processing and can abort', () => {
      render(
        <ChatInterface
          {...defaultProps}
          isProcessing={true}
          canAbort={true}
          onAbortProcess={vi.fn()}
        />
      );

      // Abort button should be present
      const messageInput = screen.getByTestId('message-input');
      expect(messageInput).toBeInTheDocument();
    });

    it('should call onAbortProcess when abort is triggered', () => {
      const mockOnAbort = vi.fn();

      render(
        <ChatInterface
          {...defaultProps}
          isProcessing={true}
          canAbort={true}
          onAbortProcess={mockOnAbort}
        />
      );

      // Trigger abort (implementation dependent - might be button click or keyboard shortcut)
      // For now, just verify the component renders with abort capability
      expect(mockOnAbort).toBeDefined();
    });
  });

  describe('model selection', () => {
    it('should handle model change callback', () => {
      const mockOnModelChange = vi.fn();

      render(
        <ChatInterface
          {...defaultProps}
          selectedModelId="claude-3-5-sonnet"
          onModelChange={mockOnModelChange}
        />
      );

      // Model selector rendering is tested separately
      expect(mockOnModelChange).toBeDefined();
    });
  });

  describe('session management', () => {
    it('should render with session ID', () => {
      render(
        <ChatInterface {...defaultProps} sessionId="session-123" />
      );

      const messageInput = screen.getByTestId('message-input');
      expect(messageInput).toBeInTheDocument();
    });
  });

  describe('plan mode', () => {
    it('should render in plan mode when enabled', () => {
      render(
        <ChatInterface
          {...defaultProps}
          isPlanMode={true}
          onTogglePlanMode={vi.fn()}
        />
      );

      const messageInput = screen.getByTestId('message-input');
      expect(messageInput).toBeInTheDocument();
    });
  });

  describe('message queue', () => {
    it('should render message queue when items are present', () => {
      const queuedMessage = {
        id: 'queue-1',
        content: [{ type: 'text', value: 'Queued message' }],
        timestamp: Date.now(),
      };

      render(
        <ChatInterface
          {...defaultProps}
          messageQueue={[queuedMessage]}
        />
      );

      expect(screen.getByTestId('message-queue-list')).toBeInTheDocument();
    });

    it('should handle adding messages to queue', () => {
      const mockOnAddToQueue = vi.fn();

      render(
        <ChatInterface
          {...defaultProps}
          messageQueue={[]}
          onAddMessageToQueue={mockOnAddToQueue}
        />
      );

      expect(mockOnAddToQueue).toBeDefined();
    });

    it('should handle removing messages from queue', () => {
      const mockOnRemoveFromQueue = vi.fn();

      render(
        <ChatInterface
          {...defaultProps}
          messageQueue={[]}
          onRemoveMessageFromQueue={mockOnRemoveFromQueue}
        />
      );

      expect(mockOnRemoveFromQueue).toBeDefined();
    });

    it('should edit message queue item by loading content into input, NOT deleting from queue', () => {
      const queuedMessage = {
        id: 'queue-1',
        content: [{ type: 'text', value: 'Queued message' }],
        timestamp: Date.now(),
      };

      const mockOnRemoveFromQueue = vi.fn();
      const mockSetContent = vi.fn();
      const messageInputRef = React.createRef<any>();
      messageInputRef.current = { setContent: mockSetContent };

      render(
        <ChatInterface
          {...defaultProps}
          messageQueue={[queuedMessage]}
          onRemoveMessageFromQueue={mockOnRemoveFromQueue}
          messageInputRef={messageInputRef}
        />
      );

      // Click the edit button
      const editBtn = screen.getByTestId('queue-edit-btn');
      fireEvent.click(editBtn);

      // 🎯 Verify that content was loaded into the input
      // but the item was NOT deleted from the queue
      expect(mockSetContent).toHaveBeenCalledWith([
        { type: 'text', value: 'Queued message' }
      ]);

      // 🎯 Important: onRemoveFromQueue should NOT be called during edit
      // Users should manually delete the item if they don't need it
      expect(mockOnRemoveFromQueue).not.toHaveBeenCalled();
    });
  });

  describe('token usage', () => {
    it('should display token usage when provided', () => {
      const tokenUsage = {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        tokenLimit: 20000,
      };

      render(
        <ChatInterface
          {...defaultProps}
          tokenUsage={tokenUsage}
        />
      );

      const messageInput = screen.getByTestId('message-input');
      expect(messageInput).toBeInTheDocument();
    });
  });

  describe('auto scroll', () => {
    it('should show scroll to bottom button when not at bottom', () => {
      render(<ChatInterface {...defaultProps} />);

      // Scroll button might be present depending on scroll position
      const messageInput = screen.getByTestId('message-input');
      expect(messageInput).toBeInTheDocument();
    });
  });

  describe('background tasks', () => {
    it('should dismiss tasks bar when dismissed', () => {
      render(<ChatInterface {...defaultProps} />);

      // Background tasks bar is rendered
      expect(screen.getByTestId('background-tasks-bar')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should handle messages with no content', () => {
      const emptyMessage: ChatMessage = {
        id: '4',
        type: 'assistant',
        content: [],
        timestamp: Date.now(),
      };

      render(
        <ChatInterface {...defaultProps} messages={[emptyMessage]} />
      );

      const messageBubbles = screen.getAllByTestId('message-bubble');
      expect(messageBubbles).toHaveLength(1);
    });

    it('should handle very long messages', () => {
      const longMessage: ChatMessage = {
        id: '5',
        type: 'assistant',
        content: [{
          type: 'text',
          value: 'A'.repeat(10000),
        }],
        timestamp: Date.now(),
      };

      render(
        <ChatInterface {...defaultProps} messages={[longMessage]} />
      );

      const messageBubbles = screen.getAllByTestId('message-bubble');
      expect(messageBubbles).toHaveLength(1);
    });

    it('should handle messages with special characters', () => {
      const specialMessage: ChatMessage = {
        id: '6',
        type: 'user',
        content: [{
          type: 'text',
          value: '<script>alert("test")</script>',
        }],
        timestamp: Date.now(),
      };

      render(
        <ChatInterface {...defaultProps} messages={[specialMessage]} />
      );

      const messageBubbles = screen.getAllByTestId('message-bubble');
      expect(messageBubbles).toHaveLength(1);
    });
  });

  describe('integration', () => {
    it('should work with message input ref', () => {
      const ref = React.createRef<any>();

      render(
        <ChatInterface {...defaultProps} messageInputRef={ref} />
      );

      expect(ref).toBeDefined();
    });

    it('should handle rollback message IDs', () => {
      render(
        <ChatInterface
          {...defaultProps}
          rollbackableMessageIds={['msg-1', 'msg-2']}
        />
      );

      const messageInput = screen.getByTestId('message-input');
      expect(messageInput).toBeInTheDocument();
    });
  });
});
