/**
 * Message Bubble Component - Displays individual chat messages
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { Copy, Check, ThumbsUp, ThumbsDown, Undo2 } from 'lucide-react';
import { ChatMessage } from '../types';

import { ToolCallList } from './ToolCallList';
import { messageContentToString } from '../utils/messageContentUtils';
import './ToolCalls.css';
import './MessageMarkdown.css';
import 'highlight.js/styles/vs2015.css'; // 代码高亮主题
import 'katex/dist/katex.min.css'; // 数学公式样式

// VSCode API
declare const window: Window & {
  vscode: {
    postMessage: (message: any) => void;
  };
};

interface MessageBubbleProps {
  message: ChatMessage;
  onToolConfirm?: (toolCallId: string, confirmed: boolean, userInput?: string) => void;
  onStartEdit?: (messageId: string) => void; // 🎯 新增：开始编辑回调
  canRevert?: boolean; // 🎯 新增：是否可以回退到此消息
  sessionId?: string;  // 🎯 新增：会话ID
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  onToolConfirm,
  onStartEdit,
  canRevert = false,
  sessionId
}) => {
  const [copySuccess, setCopySuccess] = React.useState(false);
  // 🎯 Like/Dislike 状态管理
  const [feedbackState, setFeedbackState] = React.useState<'none' | 'like' | 'dislike'>('none');

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const getMessageClass = (type: string) => {
    return `message-bubble ${type}-message`;
  };

  // 复制消息内容
  const handleCopy = async () => {
    try {
      const content = messageContentToString(message.content);
      await navigator.clipboard.writeText(content);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };

  // 🎯 处理 Like 点击
  const handleLike = () => {
    setFeedbackState(current => current === 'like' ? 'none' : 'like');
  };

  // 🎯 处理 Dislike 点击
  const handleDislike = () => {
    setFeedbackState(current => current === 'dislike' ? 'none' : 'dislike');
  };

  // 🎯 处理回退到此消息
  const handleRevertToMessage = () => {
    if (!sessionId) return;

    window.vscode.postMessage({
      type: 'revert_to_message',
      payload: {
        sessionId,
        messageId: message.id
      }
    });
  };

  return (
    <div className={getMessageClass(message.type)}>
      <div className="message-content">
        {message.type === 'user' ? (
          <div
            className="user-message-wrapper"
            style={{
              display: 'flex',
              flexDirection: 'column',
              position: 'relative'
            }}
          >
            <div
              className="user-content"
              onClick={() => onStartEdit?.(message.id)}
              style={{
                cursor: onStartEdit ? 'pointer' : 'default',
                transition: 'background-color 0.2s ease',
                position: 'relative'
              }}
              title={onStartEdit ? '点击编辑消息' : undefined}
              onMouseEnter={(e) => {
                if (onStartEdit) {
                  e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
                }
              }}
              onMouseLeave={(e) => {
                if (onStartEdit) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              {messageContentToString(message.content)}
            </div>
            {/* 🎯 回退按钮 - 显示在用户消息气泡右上角 */}
            {canRevert && (
              <button
                className="message-revert-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRevertToMessage();
                }}
                title="回退到此版本"
                style={{
                  position: 'absolute',
                  top: '0px',
                  right: '0px',
                  padding: '6px 8px',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '4px',
                  color: 'rgba(255,255,255,0.7)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  fontSize: '12px',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                  minWidth: '32px',
                  minHeight: '32px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.95)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.7)';
                }}
              >
                <Undo2 size={14} />
              </button>
            )}
          </div>
        ) : message.type === 'tool' ? (
          // 🎯 工具消息直接显示，不使用Markdown渲染
          <div className="tool-content">{messageContentToString(message.content)}</div>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight]}
            components={{
              // 代码块美化 - 配合 rehype-highlight 使用
              pre({node, children, ...props}: any) {
                // 提取代码内容用于复制
                const codeElement = React.Children.toArray(children).find(
                  (child: any) => child?.type === 'code'
                ) as any;

                const codeString = codeElement?.props?.children?.[0] || '';
                const className = codeElement?.props?.className || '';
                const match = /language-(\w+)/.exec(className);
                const language = match ? match[1] : 'text';

                const copyToClipboard = async (text: string) => {
                  try {
                    await navigator.clipboard.writeText(String(text));
                  } catch (error) {
                    console.error('Failed to copy code:', error);
                  }
                };

                return (
                  <div className="code-block-wrapper">
                    <div className="code-header">
                      <span className="code-language">{language}</span>
                      <button
                        className="code-copy-btn"
                        onClick={() => copyToClipboard(codeString)}
                        title="复制代码"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                    <pre className="code-block" {...props}>
                      {children}
                    </pre>
                  </div>
                );
              },

              // 行内代码
              code({node, className, children, ...props}: any) {
                // 如果有 className，说明是代码块中的 code，直接渲染
                if (className) {
                  return <code className={className} {...props}>{children}</code>;
                }
                // 否则是行内代码
                return (
                  <code className="inline-code" {...props}>
                    {children}
                  </code>
                );
              },

              // 标题美化
              h1: ({children}) => <h1 className="markdown-h1">{children}</h1>,
              h2: ({children}) => <h2 className="markdown-h2">{children}</h2>,
              h3: ({children}) => <h3 className="markdown-h3">{children}</h3>,

              // 列表美化
              ul: ({children}) => <ul className="markdown-ul">{children}</ul>,
              ol: ({children}) => <ol className="markdown-ol">{children}</ol>,
              li: ({children, ...props}: any) => {
                const checked = props.checked;
                // 处理任务列表
                if (typeof checked === 'boolean') {
                  return (
                    <li className="markdown-task-list-item">
                      <input type="checkbox" checked={checked} disabled readOnly />
                      <span>{children}</span>
                    </li>
                  );
                }
                return <li className="markdown-li">{children}</li>;
              },

              // 引用块美化
              blockquote: ({children}) => (
                <blockquote className="markdown-blockquote">
                  {children}
                </blockquote>
              ),

              // 表格美化
              table: ({children}) => (
                <div className="table-wrapper">
                  <table className="markdown-table">{children}</table>
                </div>
              ),

              // 链接美化
              a: ({href, children}) => (
                <a href={href} className="markdown-link" target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),

              // 段落间距
              p: ({children}) => <p className="markdown-p">{children}</p>,

              // 分隔线
              hr: () => <hr className="markdown-hr" />,

              // 强调文本
              strong: ({children}) => <strong className="markdown-strong">{children}</strong>,
              em: ({children}) => <em className="markdown-em">{children}</em>,
              del: ({children}) => <del className="markdown-del">{children}</del>,
            }}
          >
            {messageContentToString(message.content)}
          </ReactMarkdown>
        )}

        {/* 🎯 AI消息的工具调用状态显示 */}
        {message.type === 'assistant' && message.associatedToolCalls && message.associatedToolCalls.length > 0 && (
          <div className="message-tools-section">
            <ToolCallList
              toolCalls={message.associatedToolCalls}
              onConfirm={onToolConfirm}
              showCompact={!message.isProcessingTools}  // 完成后使用紧凑显示
            />
          </div>
        )}
      </div>

      {/* 🎯 时间显示移到气泡下方 - 只在用户消息显示 */}
      {message.type === 'user' && (
        <div className="message-footer">
          <span className="message-time">{formatTime(message.timestamp)}</span>
        </div>
      )}

      {/* AI消息操作按钮 - 只在最终AI回复显示，不在工具调用结果显示 */}
      {message.type === 'assistant' &&
       !message.isStreaming &&
       !message.isProcessingTools &&
       (!message.associatedToolCalls || message.associatedToolCalls.length === 0) && (
        <div className="message-actions">
          <button
            className={`message-action-btn ${copySuccess ? 'copy-success' : ''}`}
            onClick={handleCopy}
            title="复制消息"
          >
            {copySuccess ? <Check size={16} stroke="currentColor" /> : <Copy size={16} stroke="currentColor" />}
          </button>

          {/* 🎯 Like 按钮 */}
          <button
            className={`message-action-btn feedback-btn ${feedbackState === 'like' ? 'feedback-active feedback-like' : ''}`}
            onClick={handleLike}
            title="喜欢这个回答"
          >
            <ThumbsUp size={16} stroke="currentColor" />
          </button>

          {/* 🎯 Dislike 按钮 */}
          <button
            className={`message-action-btn feedback-btn ${feedbackState === 'dislike' ? 'feedback-active feedback-dislike' : ''}`}
            onClick={handleDislike}
            title="不喜欢这个回答"
          >
            <ThumbsDown size={16} stroke="currentColor" />
          </button>
        </div>
      )}
    </div>
  );
};