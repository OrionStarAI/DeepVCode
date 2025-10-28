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
import { Copy, Check, ThumbsUp, ThumbsDown } from 'lucide-react';
import { ChatMessage } from '../types';

import { ToolCallList } from './ToolCallList';
import { messageContentToString } from '../utils/messageContentUtils';
import './ToolCalls.css';
import './MessageMarkdown.css';
import 'highlight.js/styles/vs2015.css'; // 代码高亮主题
import 'katex/dist/katex.min.css'; // 数学公式样式

interface MessageBubbleProps {
  message: ChatMessage;
  onToolConfirm?: (toolCallId: string, confirmed: boolean, userInput?: string) => void;
  onStartEdit?: (messageId: string) => void; // 🎯 新增：开始编辑回调
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onToolConfirm, onStartEdit }) => {
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

  return (
    <div className={getMessageClass(message.type)}>
      <div className="message-content">
        {message.type === 'user' ? (
          <div
            className="user-content"
            onClick={() => onStartEdit?.(message.id)}
            style={{
              cursor: onStartEdit ? 'pointer' : 'default',
              transition: 'background-color 0.2s ease'
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
                // 为每个代码块生成唯一ID
                const blockId = React.useMemo(() => Math.random(), []);
                const [isCopied, setIsCopied] = React.useState(false);

                console.log('🚀 [PRE Element Debug]');
                console.log('   node:', node);
                console.log('   children:', children);
                console.log('   children type:', typeof children);
                console.log('   children array:', React.Children.toArray(children));

                // 提取代码内容用于复制
                const codeElement = React.Children.toArray(children).find(
                  (child: any) => child?.type === 'code'
                ) as any;

                console.log('   codeElement found:', !!codeElement);
                if (codeElement) {
                  console.log('   codeElement.type:', codeElement.type);
                  console.log('   codeElement.props:', codeElement.props);
                }

                // 深度递归提取所有文本内容的函数
                const extractTextFromNode = (nodeOrContent: any): string => {
                  if (!nodeOrContent) return '';
                  
                  // 如果是字符串，直接返回
                  if (typeof nodeOrContent === 'string') {
                    return nodeOrContent;
                  }
                  
                  // 如果是数字，转换为字符串
                  if (typeof nodeOrContent === 'number') {
                    return String(nodeOrContent);
                  }
                  
                  // 如果是数组，递归处理每个元素
                  if (Array.isArray(nodeOrContent)) {
                    return nodeOrContent.map(extractTextFromNode).join('');
                  }
                  
                  // 如果是 React 元素或有 props.children
                  if (nodeOrContent?.props?.children) {
                    return extractTextFromNode(nodeOrContent.props.children);
                  }
                  
                  return '';
                };

                // 多种方式尝试提取代码内容
                let codeString = '';
                
                // 方式1: 从 codeElement.props.children 提取
                if (codeElement?.props?.children) {
                  codeString = extractTextFromNode(codeElement.props.children);
                  console.log('✅ Method 1 (codeElement.props.children):', codeString.length, 'chars');
                }
                
                // 方式2: 如果方式1失败，直接从 children 提取
                if (!codeString && children) {
                  codeString = extractTextFromNode(children);
                  console.log('✅ Method 2 (direct children):', codeString.length, 'chars');
                }
                
                // 方式3: 如果还是失败，尝试从 node 提取
                if (!codeString && node) {
                  codeString = extractTextFromNode(node);
                  console.log('✅ Method 3 (node):', codeString.length, 'chars');
                }
                
                console.log('🔍 [Final Extract Result]');
                console.log('   Total length:', codeString.length);
                console.log('   Preview:', codeString.substring(0, 150));
                
                const className = codeElement?.props?.className || '';
                const match = /language-(\w+)/.exec(className);
                const language = match ? match[1] : 'text';
                
                console.log('🎯 [Code Block Info] Language:', language, '| Content length:', codeString.length);

                const copyToClipboard = async (text: string) => {
                  console.log('📋 [Copy Attempt] Text length:', text?.length || 0);
                  try {
                    if (!text || text.trim() === '') {
                      console.error('⚠️ No code content to copy - text is empty!');
                      console.error('   Text value:', text);
                      console.error('   Text type:', typeof text);
                      return;
                    }
                    await navigator.clipboard.writeText(String(text));
                    console.log('✅ Code copied to clipboard successfully:');
                    console.log('   Length:', text.length, 'characters');
                    console.log('   Preview:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
                    setIsCopied(true);
                    setTimeout(() => setIsCopied(false), 2000);
                  } catch (error) {
                    console.error('❌ Failed to copy code:', error);
                    if (error instanceof Error) {
                      console.error('   Error name:', error.name);
                      console.error('   Error message:', error.message);
                    }
                  }
                };

                return (
                  <div className="code-block-wrapper">
                    <div className="code-header">
                      <span className="code-language">{language}</span>
                      <button
                        className={`code-copy-btn ${isCopied ? 'copy-success' : ''}`}
                        onClick={() => copyToClipboard(codeString)}
                        title={isCopied ? "已复制!" : "复制代码"}
                      >
                        {isCopied ? <Check size={14} /> : <Copy size={14} />}
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