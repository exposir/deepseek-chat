import { useEffect, useRef, useState } from 'react';
import { useChat, type StreamBlock } from '../store/chat';
import { MessageItemView } from './MessageItem';
import { MarkdownContent } from './MarkdownContent';
import { ReasoningBlock } from './ReasoningBlock';
import { SearchCallBadge } from './SearchCallBadge';

function StreamBlockView({ block, isLast }: { block: StreamBlock; isLast: boolean }) {
  if (block.type === 'reasoning') {
    return <ReasoningBlock text={block.text} streaming={!block.finalItem} />;
  }
  if (block.type === 'web_search_call') {
    return (
      <div>
        <SearchCallBadge status={block.searchStatus} query={block.query} streaming={!block.finalItem} searchResult={block.searchResult} />
      </div>
    );
  }
  return (
    <div className={isLast && !block.finalItem ? 'stream-cursor' : ''}>
      <MarkdownContent content={block.text} streaming={!block.finalItem} />
    </div>
  );
}

export function MessageList() {
  const items = useChat((s) => s.items);
  const streamBlocks = useChat((s) => s.streamBlocks);
  const isStreaming = useChat((s) => s.isStreaming);
  const containerRef = useRef<HTMLDivElement>(null);
  // 流式期间用户上滑则暂停吸底
  const stickToBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      stickToBottomRef.current = nearBottom;
      setShowJump(!nearBottom);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // 内容变化时吸底
  useEffect(() => {
    const el = containerRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [items, streamBlocks]);

  // 切换会话/发送新消息时强制吸底
  useEffect(() => {
    if (isStreaming) {
      stickToBottomRef.current = true;
      const el = containerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [isStreaming]);

  const jumpToBottom = () => {
    const el = containerRef.current;
    if (!el) return;
    stickToBottomRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const empty = items.length === 0 && streamBlocks.length === 0;

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={containerRef} className="h-full overflow-y-auto px-4 py-4">
        {empty ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-text-dim">
            <div className="text-2xl">👋</div>
            <div className="text-sm">开始提问吧，支持思维链与联网搜索</div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4 pb-2">
            {items.map((r) => (
              <MessageItemView key={`${r.convId}-${r.seq}`} record={r} />
            ))}
            {streamBlocks.map((b, i) => (
              <StreamBlockView key={b.key} block={b} isLast={i === streamBlocks.length - 1} />
            ))}
            {isStreaming && streamBlocks.length === 0 && (
              <div className="text-sm text-text-dim search-pulse">正在连接…</div>
            )}
          </div>
        )}
      </div>
      {showJump && (
        <button
          type="button"
          onClick={jumpToBottom}
          className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-panel-2 border border-border flex items-center justify-center text-text-dim shadow-lg"
          aria-label="回到底部"
        >
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
            <path
              d="M8 3v10M4 9l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
