import { useEffect, useRef } from 'react';
import { useStore, type ChatItem, type SessionView } from '../../store';
import { Markdown } from '../Markdown';
import { ToolCall } from '../ToolCall';
import { Icon } from '../Icon';
import { AgentIcon } from '../AgentIcon';
import { useT, type TFunc } from '../../i18n/useT';

export function ChatPane({ view }: { view: SessionView }) {
  const density = view.density;
  const openFile = useStore((s) => s.openFile);
  const rewindTo = useStore((s) => s.rewindTo);
  const t = useT();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Whether the user is near the bottom of the transcript. When false (user
  // scrolled up to read history) we suppress auto-scroll so new content doesn't
  // yank them back down. Updated on scroll, checked before auto-scrolling.
  const atBottomRef = useRef(true);

  // The backend reports 'thinking' from prompt submit through turn_end (covering
  // model streaming and tool runs) and 'starting' while the bridge spins up. In
  // either state the agent is working, so show the typing indicator.
  const busy = view.meta.status === 'thinking' || view.meta.status === 'starting';
  // Once the assistant has started streaming visible text this turn, the bubble
  // itself shows progress — only show the standalone dots before that.
  const last = view.transcript[view.transcript.length - 1];
  const showDots = busy && (!last || last.kind !== 'assistant');

  // Auto-scroll to bottom only when the user is already near the bottom. If
  // they scrolled up to read history, new streaming content should not pull
  // them back down. A user-sent message always resets this (their own action
  // implies "I want to see the response").
  useEffect(() => {
    if (atBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [view.transcript, showDots]);

  // Track scroll position: "at bottom" = within 80px of the bottom edge. This
  // threshold tolerates small scroll offsets from rendering quirks while still
  // detecting a deliberate upward scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      atBottomRef.current = distFromBottom < 80;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // When the user sends a new message, reset to bottom (their own action implies
  // they want to see the result). The transcript gains a new 'user' item, so we
  // detect that and force-scroll.
  const lastItem = view.transcript[view.transcript.length - 1];
  useEffect(() => {
    if (lastItem?.kind === 'user') {
      atBottomRef.current = true;
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [lastItem?.kind === 'user' ? lastItem.id : null]);

  let userIndex = -1;

  return (
    <div className="pane-body" ref={scrollRef}>
      <div className="transcript">
        {view.transcript.length === 0 && (
          <div className="empty" style={{ height: 280 }}>
            <div className="empty-inner">
              <span className="empty-mark">
                <Icon name="sparkle" size={24} />
              </span>
              <div className="empty-title">{t('chat.emptyTitle')}</div>
              <div className="hint">{t('chat.worksIn', { cwd: view.meta.cwd })}</div>
            </div>
          </div>
        )}
        {view.transcript.map((item) => {
          if (item.kind === 'user') userIndex++;
          return (
            <ChatItemView
              key={item.id}
              item={item}
              density={density}
              t={t}
              userIndex={item.kind === 'user' ? userIndex : undefined}
              onOpenFile={(p) => void openFile(view.meta.id, p)}
              onRewind={(idx) => void rewindTo(view.meta.id, idx)}
            />
          );
        })}
        {showDots && (
          <div className="msg msg-assistant typing-row">
            {(view.meta.agentType === 'claude-code' || view.meta.agentType === 'codex') && (
              <AgentIcon agent={view.meta.agentType} size={18} className="typing-agent-ic" animated />
            )}
            <div className="typing-dots" aria-label={t('chat.aiResponding')}>
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function ChatItemView({
  item,
  density,
  t,
  userIndex,
  onOpenFile,
  onRewind,
}: {
  item: ChatItem;
  density: SessionView['density'];
  t: TFunc;
  userIndex?: number;
  onOpenFile: (path: string) => void;
  onRewind: (beforeUserMessageIndex: number) => void;
}) {
  switch (item.kind) {
    case 'user':
      return (
        <div className="msg">
          <div className="msg-user">
            {item.images && item.images.length > 0 && (
              <div className="msg-images">
                {item.images.map((src, i) => (
                  <img key={i} className="msg-image" src={src} alt={t('chat.attachedImage')} />
                ))}
              </div>
            )}
            {item.text && <span className="msg-user-text">{item.text}</span>}
            {userIndex !== undefined && (
              <button
                className="icon-btn rewind-btn"
                title={t('chat.rewindTitle')}
                onClick={() => onRewind(userIndex)}
              >
                <Icon name="rewind" size={14} />
              </button>
            )}
          </div>
        </div>
      );

    case 'assistant':
      return (
        <div className="msg msg-assistant">
          <Markdown text={item.text} />
        </div>
      );

    case 'thought':
      if (density === 'summary') return null;
      return (
        <div className="msg msg-thought">
          <div className="thought-label">
            <Icon name="think" size={13} />
            {t('chat.thought')}
          </div>
          {item.text}
        </div>
      );

    case 'system':
      if (density === 'summary') return null;
      return <div className="msg-system">{item.text}</div>;

    case 'error':
      return (
        <div className="msg msg-error">
          <Icon name="alert" size={16} />
          <span>{item.text}</span>
        </div>
      );

    case 'tool':
      if (density === 'summary') return null;
      return (
        <ToolCall
          title={item.title}
          toolKind={item.toolKind}
          status={item.status}
          locations={item.locations}
          content={item.content}
          terminalOutput={item.terminalOutput}
          rawInput={item.rawInput}
          defaultOpen={density === 'verbose'}
          onOpenFile={onOpenFile}
        />
      );

    default:
      return null;
  }
}
