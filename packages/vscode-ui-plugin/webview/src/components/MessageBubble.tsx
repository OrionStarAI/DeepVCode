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
import { Copy, Check, ThumbsUp, ThumbsDown, RefreshCw, ChevronDown, ChevronUp ,Undo2} from 'lucide-react';
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

// 代码块组件（提取为独立组件以正确管理状态）
const CodeBlock: React.FC<any> = ({ node, children, ...props }) => {
  const [isCopied, setIsCopied] = React.useState(false);
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  // 提取代码内容用于复制
  const codeElement = React.Children.toArray(children).find(
    (child: any) => child?.type === 'code'
  ) as any;

  // 深度递归提取所有文本内容的函数
  const extractTextFromNode = (nodeOrContent: any): string => {
    if (!nodeOrContent) return '';
    if (typeof nodeOrContent === 'string') return nodeOrContent;
    if (typeof nodeOrContent === 'number') return String(nodeOrContent);
    if (Array.isArray(nodeOrContent)) {
      return nodeOrContent.map(extractTextFromNode).join('');
    }
    if (nodeOrContent?.props?.children) {
      return extractTextFromNode(nodeOrContent.props.children);
    }
    return '';
  };

  // 多种方式尝试提取代码内容
  let codeString = '';
  if (codeElement?.props?.children) {
    codeString = extractTextFromNode(codeElement.props.children);
  }
  if (!codeString && children) {
    codeString = extractTextFromNode(children);
  }
  if (!codeString && node) {
    codeString = extractTextFromNode(node);
  }

  const className = codeElement?.props?.className || '';
  const match = /language-(\w+)/.exec(className);
  const language = match ? match[1] : 'text';

  // 计算代码行数
  const lines = codeString.split('\n');
  const lineCount = lines.length;
  const shouldShowCollapse = lineCount > 20;

  const copyToClipboard = async (text: string) => {
    try {
      if (!text || text.trim() === '') {
        console.error('No code content to copy');
        return;
      }
      await navigator.clipboard.writeText(String(text));
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
        document.body.appendChild(textArea);
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (successful) {
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        } else {
          console.error('Failed to copy code');
        }
      } catch (fallbackError) {
        console.error('All copy methods failed:', error);
      }
    }
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-header">
        <span className="code-language">{language}</span>
        <div className="code-header-actions">
          {shouldShowCollapse && !isCollapsed && (
            <button
              className="code-toggle-btn"
              onClick={() => setIsCollapsed(true)}
              title="折叠代码"
              aria-label="折叠代码"
              tabIndex={0}
            >
              <ChevronUp size={14} />
              <span>折叠</span>
            </button>
          )}
          <button
            className={`code-copy-btn ${isCopied ? 'copy-success' : ''}`}
            onClick={() => copyToClipboard(codeString)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                copyToClipboard(codeString);
              }
            }}
            title={isCopied ? "已复制!" : "复制代码"}
            aria-label={isCopied ? "代码已复制到剪贴板" : "复制代码到剪贴板"}
            aria-live="polite"
            tabIndex={0}
          >
            {isCopied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>
      <div className={`code-content ${isCollapsed ? 'collapsed' : 'expanded'}`}>
        <pre className="code-block" {...props}>
          {children}
        </pre>
        {/* 折叠状态：底部显示展开按钮 */}
        {isCollapsed && shouldShowCollapse && (
          <div className="code-expand-overlay" onClick={() => setIsCollapsed(false)}>
            <button className="code-expand-btn">
              <ChevronDown size={16} />
              <span>展开代码</span>
            </button>
          </div>
        )}
        {/* 展开状态：底部显示折叠按钮 */}
        {!isCollapsed && shouldShowCollapse && (
          <div className="code-footer">
            <button
              className="code-footer-collapse-btn"
              onClick={() => setIsCollapsed(true)}
              title="折叠代码"
              aria-label="折叠代码"
            >
              <ChevronUp size={16} />
              <span>折叠</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

interface MessageBubbleProps {
  message: ChatMessage;
  onToolConfirm?: (toolCallId: string, confirmed: boolean, userInput?: string) => void;
  onStartEdit?: (messageId: string) => void; // 🎯 新增：开始编辑回调
  onRegenerate?: (messageId: string) => void; // 🎯 新增：重新生成回调
  canRevert?: boolean; // 🎯 新增：是否可以回退到此消息
  sessionId?: string;  // 🎯 新增：会话ID
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onToolConfirm, onStartEdit, onRegenerate ,canRevert = false, sessionId}) => {
  const [copySuccess, setCopySuccess] = React.useState(false);
  // 🎯 Like/Dislike 状态管理
  const [feedbackState, setFeedbackState] = React.useState<'none' | 'like' | 'dislike'>('none');
  // 🎯 代码块复制状态管理（使用Map来追踪每个代码块的复制状态）
  const [codeCopyStates, setCodeCopyStates] = React.useState<Map<number, boolean>>(new Map());

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

      // 方法1: 使用现代 Clipboard API
      await navigator.clipboard.writeText(content);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      // 降级方案: 使用传统 execCommand
      try {
        const content = messageContentToString(message.content);
        const textArea = document.createElement('textarea');
        textArea.value = content;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
        document.body.appendChild(textArea);
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (successful) {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
        } else {
          console.error('Failed to copy message');
        }
      } catch (fallbackError) {
        console.error('All copy methods failed:', error);
      }
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
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              wordBreak: 'break-word',
              maxWidth: '100%'
            }}
          >
            <div
              className="user-content"
              onClick={() => onStartEdit?.(message.id)}
              style={{
                cursor: onStartEdit ? 'pointer' : 'default',
                transition: 'background-color 0.2s ease',
                flex: 1,
                minWidth: 0  // 🎯 允许 flex 容器内的文本换行
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

            {/* 🎯 回退按钮 */}
            {canRevert && (
              <button
                className="message-revert-btn-inline"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRevertToMessage();
                }}
                title="回退"
                style={{
                  flexShrink: 0,
                  width: '28px',
                  height: '28px',
                  padding: '4px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  color: 'var(--vscode-descriptionForeground)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0.6,
                  transition: 'all 0.2s ease',
                  marginTop: '2px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.background = 'var(--vscode-toolbar-hoverBackground)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0.6';
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <Undo2 size={16} />
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
              // 代码块美化 - 使用独立的 CodeBlock 组件
              pre: CodeBlock,

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

      {/* AI消息操作按钮 - 在所有完成的AI回复显示 */}
      {(() => {
        const shouldShow = message.type === 'assistant' &&
          !message.isStreaming &&
          !(message.isProcessingTools && !message.toolsCompleted);

        return shouldShow && (
          <div className="message-actions">
          <button
            className={`message-action-btn ${copySuccess ? 'copy-success' : ''}`}
            onClick={handleCopy}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCopy();
              }
            }}
            title="复制消息"
            aria-label={copySuccess ? "消息已复制到剪贴板" : "复制消息到剪贴板"}
            aria-live="polite"
            tabIndex={0}
          >
            {copySuccess ? <Check size={16} stroke="currentColor" /> : <Copy size={16} stroke="currentColor" />}
          </button>

          {/* 🎯 Like 按钮 */}
          <button
            className={`message-action-btn feedback-btn ${feedbackState === 'like' ? 'feedback-active feedback-like' : ''}`}
            onClick={handleLike}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleLike();
              }
            }}
            title="喜欢这个回答"
            aria-label={feedbackState === 'like' ? "已标记为喜欢" : "标记为喜欢"}
            aria-pressed={feedbackState === 'like'}
            tabIndex={0}
          >
            <ThumbsUp size={16} stroke="currentColor" />
          </button>

          {/* 🎯 Dislike 按钮 */}
          <button
            className={`message-action-btn feedback-btn ${feedbackState === 'dislike' ? 'feedback-active feedback-dislike' : ''}`}
            onClick={handleDislike}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleDislike();
              }
            }}
            title="不喜欢这个回答"
            aria-label={feedbackState === 'dislike' ? "已标记为不喜欢" : "标记为不喜欢"}
            aria-pressed={feedbackState === 'dislike'}
            tabIndex={0}
          >
            <ThumbsDown size={16} stroke="currentColor" />
          </button>

          {/* 🎯 重新生成按钮 */}
          {onRegenerate && (
            <button
              className="message-action-btn regenerate-btn"
              onClick={() => onRegenerate(message.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onRegenerate(message.id);
                }
              }}
              title="重新生成回答"
              aria-label="重新生成回答"
              tabIndex={0}
            >
              <RefreshCw size={16} stroke="currentColor" />
            </button>
          )}
        </div>
        );
      })()}
    </div>
  );
};
