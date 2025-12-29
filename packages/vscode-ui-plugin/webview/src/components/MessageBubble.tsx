/**
 * Message Bubble Component - Displays individual chat messages
 */

import React from 'react';
import ReactDOM from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { Copy, Check, RefreshCw, ChevronDown, ChevronUp, Undo2, AlertTriangle, Pencil, Undo, Info } from 'lucide-react';

import { ChatMessage } from '../types';
import { useTranslation } from '../hooks/useTranslation';

import { ToolCallList } from './ToolCallList';
import { ReasoningDisplay } from './ReasoningDisplay';
import { SystemNotificationMessage } from './SystemNotificationMessage';
import { SubAgentDisplayRenderer } from './renderers/SubAgentDisplayRenderer';
import { messageContentToString } from '../utils/messageContentUtils';
import { linkifyTextNode } from '../utils/filePathLinkifier';
import './ToolCalls.css';
import './MessageMarkdown.css';
import './ChatInterface.css'; // 🎯 导入确认对话框样式
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

// 🎯 Token Usage Popup Component (Portal)
const TokenUsagePopup: React.FC<{
  tokenUsage: NonNullable<ChatMessage['tokenUsage']>;
  anchorRect: DOMRect;
  onClose: () => void;
  ignoreRef?: React.RefObject<HTMLElement>;
  t: (key: string) => string;
}> = ({ tokenUsage, anchorRect, onClose, ignoreRef, t }) => {
  const popupRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Calculate position
  React.useLayoutEffect(() => {
    if (!popupRef.current) return;

    const popupRect = popupRef.current.getBoundingClientRect();
    const padding = 10; // Padding from screen edges

    // Initial position: above the button, right-aligned
    let top = anchorRect.top - popupRect.height - 8;
    let left = anchorRect.right - popupRect.width;

    // Adjust horizontal position if it goes off-screen
    if (left < padding) {
      left = padding; // Stick to left edge
    } else if (left + popupRect.width > window.innerWidth - padding) {
      left = window.innerWidth - popupRect.width - padding; // Stick to right edge
    }

    // Adjust vertical position if it goes off-screen (top)
    if (top < padding) {
      // Flip to below the button
      top = anchorRect.bottom + 8;
    }

    setPosition({ top, left });
  }, [anchorRect]);

  // Click outside to close
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        // If ignoreRef is provided and click is inside it, do nothing (let the button handle it)
        if (ignoreRef?.current && ignoreRef.current.contains(event.target as Node)) {
          return;
        }
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, ignoreRef]);

  return ReactDOM.createPortal(
    <div
      ref={popupRef}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        backgroundColor: 'var(--vscode-editorHoverWidget-background)',
        border: '1px solid var(--vscode-editorHoverWidget-border)',
        borderRadius: '6px',
        padding: '12px',
        zIndex: 9999, // High z-index to be on top of everything
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
        minWidth: '220px',
        maxWidth: '300px',
        fontSize: '12px',
        color: 'var(--vscode-editorHoverWidget-foreground)',
        lineHeight: '1.5',
        fontFamily: 'var(--vscode-font-family)',
        pointerEvents: 'auto', // Ensure clicks are captured
      }}
      onClick={(e) => e.stopPropagation()} // Prevent clicks inside from closing
    >
      <div style={{
        fontWeight: '600',
        marginBottom: '8px',
        borderBottom: '1px solid var(--vscode-editorHoverWidget-border)',
        paddingBottom: '6px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        opacity: 0.9
      }}>
        <span>{t('tokenUsage.title')}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
        {/* Total & Credits - Highlighted */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ opacity: 0.7, fontSize: '11px' }}>{t('tokenUsage.totalTokens')}</span>
          <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{tokenUsage.totalTokens.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ opacity: 0.7, fontSize: '11px' }}>{t('tokenUsage.credits')}</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--vscode-textLink-foreground)' }}>
              {tokenUsage.creditsUsage?.toFixed(3) || '0.000'}
            </span>
            <span style={{ fontSize: '10px', opacity: 0.6, color: 'var(--vscode-textLink-foreground)' }}>
              {t('tokenUsage.creditsSuffix')}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ gridColumn: '1 / -1', height: '1px', backgroundColor: 'var(--vscode-editorHoverWidget-border)', margin: '4px 0' }}></div>

        {/* Details */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ opacity: 0.7 }}>{t('tokenUsage.input')}:</span>
          <span style={{ fontFamily: 'var(--vscode-editor-font-family)' }}>{tokenUsage.inputTokens.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ opacity: 0.7 }}>{t('tokenUsage.output')}:</span>
          <span style={{ fontFamily: 'var(--vscode-editor-font-family)' }}>{tokenUsage.outputTokens.toLocaleString()}</span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ opacity: 0.7 }}>{t('tokenUsage.cacheRead')}:</span>
          <span style={{ fontFamily: 'var(--vscode-editor-font-family)' }}>{tokenUsage.cacheReadInputTokens?.toLocaleString() || '0'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ opacity: 0.7 }}>{t('tokenUsage.cacheHit')}:</span>
          <span style={{ fontFamily: 'var(--vscode-editor-font-family)' }}>{((tokenUsage.cacheHitRate || 0) * 100).toFixed(1)}%</span>
        </div>
      </div>
    </div>,
    document.body
  );
};

// 🎯 Thinking Block Component
const ThinkingBlock: React.FC<{
  content: string;
  t: (key: string, params?: any, fallback?: string) => string;
  markdownComponents: any;
  defaultCollapsed?: boolean;
}> = ({ content, t, markdownComponents, defaultCollapsed = false }) => {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed);

  // 当 defaultCollapsed 变化时（例如从流式输出变成完成状态），同步状态
  React.useEffect(() => {
    setIsCollapsed(defaultCollapsed);
  }, [defaultCollapsed]);

  return (
    <div className={`thinking-wrapper ${isCollapsed ? 'collapsed' : 'expanded'}`}>
      <div
        className="thinking-header"
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <span className="thinking-title">
          {isCollapsed ? <ChevronDown size={12} style={{ marginRight: 4 }} /> : <ChevronUp size={12} style={{ marginRight: 4 }} />}
          {t('reasoning.title', {}, 'Thinking')}
        </span>
      </div>
      {!isCollapsed && (
        <div className="thinking-content">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight]}
            components={markdownComponents}
          >
            {content}
          </ReactMarkdown>
        </div>
      )}
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
  messages?: ChatMessage[]; // 🎯 新增：所有消息列表（用于回退时截断）
  onUpdateMessages?: (messages: ChatMessage[]) => void; // 🎯 新增：更新消息列表回调
  onRollback?: (messageId: string) => void; // 🎯 新增：回退到此消息回调（保留向后兼容）
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onToolConfirm, onStartEdit, onRegenerate, onRollback, canRevert = false, sessionId, messages, onUpdateMessages}) => {
  const { t } = useTranslation();
  const [copySuccess, setCopySuccess] = React.useState(false);
  // 🎯 代码块复制状态管理（使用Map来追踪每个代码块的复制状态）
  const [codeCopyStates, setCodeCopyStates] = React.useState<Map<number, boolean>>(new Map());
  // 🎯 回退确认对话框状态
  const [showRevertConfirm, setShowRevertConfirm] = React.useState(false);
  // 🎯 Token Info 状态
  const [showTokenInfo, setShowTokenInfo] = React.useState(false);
  const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null);
  const tokenInfoBtnRef = React.useRef<HTMLButtonElement>(null);

  // 🎯 检测消息内容是否是特殊类型（subagent_update等）
  const getSpecialContent = (): { type: string; data: any } | null => {
    const contentStr = messageContentToString(message.content);
    if (!contentStr.trim().startsWith('{')) {
      return null;
    }

    try {
      const parsed = JSON.parse(contentStr);

      // 🎯 支持两种格式：
      // 1. {"type":"subagent_update","data":{"type":"subagent_display",...}}
      // 2. {"type":"subagent_display",...} (直接的subagent_display)

      if (parsed.type === 'subagent_update' && parsed.data?.type === 'subagent_display') {
        // 格式1：subagent_update包装的数据
        return { type: 'subagent_display', data: parsed.data };
      } else if (parsed.type === 'subagent_display') {
        // 格式2：直接的subagent_display
        return { type: 'subagent_display', data: parsed };
      }
    } catch (e) {
      // Not JSON, render as normal
    }

    return null;
  };

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

  // 🎯 处理回退到此消息 - 显示确认对话框
  const handleRevertToMessage = () => {
    setShowRevertConfirm(true);
  };

  // 🎯 确认回退操作
  const confirmRevertToMessage = () => {
    // 关闭确认对话框
    setShowRevertConfirm(false);

    // 🎯 调用父组件传入的 onRollback 回调（ChatInterface 的 handleRollback）
    // ChatInterface 的 handleRollback 会处理完整的回退逻辑：
    // 1. 中止 AI 进程
    // 2. 截断消息列表
    // 3. 更新 UI
    // 4. 发送后端回退请求
    if (onRollback) {
      onRollback(message.id);
    }
  };

  // 🎯 取消回退操作
  const cancelRevertToMessage = () => {
    setShowRevertConfirm(false);
  };

  return (
    <div className={getMessageClass(message.type)}>
      <div className="message-content">
        {message.type === 'notification' ? (
          <SystemNotificationMessage message={message} />
        ) : message.type === 'user' ? (
          <div className="user-content">
            <span
              onClick={() => onStartEdit?.(message.id)}
              style={{
                cursor: onStartEdit ? 'pointer' : 'default'
              }}
            >
              {messageContentToString(message.content)}
            </span>
            {onStartEdit && (
              <button
                className="edit-button-inline"
                onClick={() => onStartEdit(message.id)}
                title="编辑消息"
                aria-label="编辑消息"
              >
                <Pencil size={14} />
              </button>
            )}
            {onRollback && (
              <button
                className="rollback-button-inline"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRevertToMessage();
                }}
                title="回退到此消息"
                aria-label="回退到此消息"
              >
                <Undo size={14} />
              </button>
            )}
          </div>
        ) : message.type === 'tool' ? (
          // 🎯 工具消息直接显示，不使用Markdown渲染
          <div className="tool-content">{messageContentToString(message.content)}</div>
        ) : message.type === 'system' ? (
          // 🎯 系统消息显示为带分隔线的 Info 样式
          <div className="system-message-inner">
            <div className="system-divider">
              <span className="system-divider-text">{t('common.info', {}, 'Info')}</span>
            </div>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight]}
            >
              {messageContentToString(message.content)}
            </ReactMarkdown>
          </div>
        ) : (
          <>
            {/* 🎯 检查是否是特殊内容（subagent_update等） */}
            {(() => {
              const specialContent = getSpecialContent();
              if (specialContent?.type === 'subagent_display') {
                return <SubAgentDisplayRenderer data={specialContent.data} />;
              }

              // 🎯 手动解析 <think> 标签，避免 ReactMarkdown 渲染器嵌套错误
              const rawContent = messageContentToString(message.content);
              const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/g;
              const renderParts: { type: 'text' | 'think'; content: string }[] = [];
              let lastIndex = 0;
              let match;

              // 重置正则状态，确保从头开始匹配
              thinkRegex.lastIndex = 0;

              while ((match = thinkRegex.exec(rawContent)) !== null) {
                // 添加标签前的文本
                if (match.index > lastIndex) {
                  const beforeText = rawContent.substring(lastIndex, match.index);
                  if (beforeText) {
                    renderParts.push({ type: 'text', content: beforeText });
                  }
                }
                // 添加思考块内容（保留内部换行）
                renderParts.push({ type: 'think', content: match[1] });
                lastIndex = thinkRegex.lastIndex;
              }

              // 添加剩余文本
              if (lastIndex < rawContent.length) {
                const afterText = rawContent.substring(lastIndex);
                if (afterText) {
                  renderParts.push({ type: 'text', content: afterText });
                }
              }

              // 如果没有匹配到任何 <think> 标签，直接按原样渲染
              if (renderParts.length === 0) {
                renderParts.push({ type: 'text', content: rawContent });
              }

              // 🎯 判断是否应该自动折叠思考过程
              // 如果思考块不是最后一部分（即已经开始输出正文），或者消息不再处于流式输出状态且已完成
              const hasNormalResponse = renderParts.some((p, i) => p.type === 'text' && p.content.trim().length > 0 && i > 0);
              const shouldAutoCollapse = hasNormalResponse || (!message.isStreaming && message.type === 'assistant');

              const markdownComponents = {
                // 代码块美化 - 使用独立的 CodeBlock 组件
                pre: CodeBlock,

                // 行内代码 - 添加文件路径和方法名链接支持
                code({node, className, children, ...props}: any) {
                  // 如果有 className，说明是代码块中的 code，直接渲染
                  if (className) {
                    return <code className={className} {...props}>{children}</code>;
                  }
                  // 否则是行内代码，支持文件路径点击
                  return (
                    <code className="inline-code" {...props}>
                      {linkifyTextNode(children)}
                    </code>
                  );
                },

                // 标题美化 - 添加文件路径和方法名链接支持
                h1: ({children}: any) => <h1 className="markdown-h1">{linkifyTextNode(children)}</h1>,
                h2: ({children}: any) => <h2 className="markdown-h2">{linkifyTextNode(children)}</h2>,
                h3: ({children}: any) => <h3 className="markdown-h3">{linkifyTextNode(children)}</h3>,

                // 段落美化 - 添加文件路径和方法名链接支持
                p: ({children}: any) => <p className="markdown-p">{linkifyTextNode(children)}</p>,

                // 文本样式美化
                strong: ({children}: any) => <strong className="markdown-strong">{linkifyTextNode(children)}</strong>,
                em: ({children}: any) => <em className="markdown-em">{linkifyTextNode(children)}</em>,

                // 列表美化 - 添加文件路径和方法名链接支持
                ul: ({children}: any) => <ul className="markdown-ul">{children}</ul>,
                ol: ({children}: any) => <ol className="markdown-ol">{children}</ol>,
                li: ({children, ...props}: any) => {
                  const checked = props.checked;
                  // 处理任务列表
                  if (typeof checked === 'boolean') {
                    return (
                      <li className="markdown-task-list-item">
                        <input type="checkbox" checked={checked} disabled readOnly />
                        <span>{linkifyTextNode(children)}</span>
                      </li>
                    );
                  }
                  return <li className="markdown-li">{linkifyTextNode(children)}</li>;
                },

                // 引用块美化
                blockquote: ({children}: any) => (
                  <blockquote className="markdown-blockquote">
                    {children}
                  </blockquote>
                ),

                // 链接美化
                a: ({href, children}: any) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="markdown-link">
                    {children}
                  </a>
                ),

                // 表格美化
                table: ({children}: any) => (
                  <div className="markdown-table-container">
                    <table className="markdown-table">{children}</table>
                  </div>
                ),
                tr: ({children}: any) => <tr className="markdown-tr">{children}</tr>,
                th: ({children}: any) => <th className="markdown-th">{linkifyTextNode(children)}</th>,
                td: ({children}: any) => <td className="markdown-td">{linkifyTextNode(children)}</td>,
              };

              return (
                <>
                  {/* 🎯 AI思考过程显示 - 只在正在思考时显示，思考完成后隐藏 */}
                  {message.reasoning && message.isReasoning && (
                    <ReasoningDisplay
                      reasoning={message.reasoning}
                      isActive={true}
                    />
                  )}

                  {renderParts.map((part, index) => {
                    if (part.type === 'think') {
                      return (
                        <ThinkingBlock
                          key={`think-${index}`}
                          content={part.content}
                          t={t}
                          markdownComponents={markdownComponents}
                          defaultCollapsed={shouldAutoCollapse}
                        />
                      );
                    } else {
                      return (
                        <ReactMarkdown
                          key={`text-${index}`}
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight]}
                          components={markdownComponents as any}
                        >
                          {part.content}
                        </ReactMarkdown>
                      );
                    }
                  })}
                </>
              );
            })()}
          </>
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
        const hasTools = message.associatedToolCalls && message.associatedToolCalls.length > 0;
        const shouldShow = message.type === 'assistant' &&
          !message.isStreaming &&
          !hasTools && // 🎯 如果有工具调用，不显示操作按钮（复制、点赞等），因为这通常是中间过程，空间宝贵
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

          {/* 🎯 Token Info 按钮 */}
          {message.tokenUsage && (
            <>
              <button
                ref={tokenInfoBtnRef}
                className={`message-action-btn token-info-btn ${showTokenInfo ? 'active' : ''}`}
                onClick={(e) => {
                  if (showTokenInfo) {
                    setShowTokenInfo(false);
                  } else {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setAnchorRect(rect);
                    setShowTokenInfo(true);
                  }
                }}
                title="Token 使用情况"
                aria-label="查看 Token 使用情况"
                aria-expanded={showTokenInfo}
              >
                <Info size={16} stroke="currentColor" />
              </button>
              {showTokenInfo && anchorRect && (
                <TokenUsagePopup
                  tokenUsage={message.tokenUsage}
                  anchorRect={anchorRect}
                  onClose={() => setShowTokenInfo(false)}
                  ignoreRef={tokenInfoBtnRef}
                  t={t}
                />
              )}
            </>
          )}
        </div>
        );
      })()}

      {/* 🎯 回退确认对话框 */}
      {showRevertConfirm && (
        <div className="confirm-dialog-overlay" onClick={cancelRevertToMessage}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-dialog-header">
              <AlertTriangle size={16} color="var(--vscode-editorWarning-foreground)" />
              <h3>确认回退操作</h3>
            </div>
            <div className="confirm-dialog-content">
              <p>回退到此消息将会删除此消息之后的所有对话内容。</p>
              <p>此操作不可撤销，确定要继续吗？</p>
            </div>
            <div className="confirm-dialog-actions">
              <button
                className="confirm-dialog-button secondary"
                onClick={cancelRevertToMessage}
              >
                取消
              </button>
              <button
                className="confirm-dialog-button primary"
                onClick={confirmRevertToMessage}
              >
                确定回退
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
