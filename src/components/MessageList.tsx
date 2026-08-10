import { useEffect, useRef, useState } from 'react';
import { useChat, type StreamBlock } from '../store/chat';
import { useSettings } from '../store/settings';
import { MessageItemView } from './MessageItem';
import { MarkdownContent } from './MarkdownContent';
import { ReasoningBlock } from './ReasoningBlock';
import { SearchCallBadge } from './SearchCallBadge';

/** 空会话建议问题：点击直接发送 */
const SUGGESTIONS = [
  { icon: '🌐', text: '今天有哪些值得关注的新闻？' },
  { icon: '🧠', text: '头脑风暴：给一个开源项目起 10 个名字' },
  { icon: '💻', text: '用 Python 写一个两行快速排序' },
  { icon: '📝', text: '翻译一段英文技术文档到中文' },
];

function StreamBlockView({ block, isLast }: { block: StreamBlock; isLast: boolean }) {
  if (block.type === 'reasoning') {
    return <ReasoningBlock text={block.text} streaming={!block.finalItem} />;
  }
  if (block.type === 'web_search_call') {
    return (
      <div>
        <SearchCallBadge status={block.searchStatus} action={block.action} />
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
  const apiKey = useSettings((s) => s.apiKey);
  const send = useChat((s) => s.send);

  return (
    <div className="relative flex-1 min-h-0 view-chat-content">
      <div ref={containerRef} className="h-full overflow-y-auto px-4 pt-[calc(var(--header-h)+20px)] pb-[150px]">
        {empty ? (
          <div className="h-full flex flex-col items-center gap-4 text-text-dim px-4 pt-[16vh] md:pt-[14vh]">
            <div className="text-2xl md:text-4xl">👋</div>
            <div className="text-sm md:text-base">开始提问吧，支持思维链与联网搜索</div>
            {apiKey && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 w-full max-w-2xl md:max-w-5xl mt-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.text}
                    type="button"
                    disabled={isStreaming}
                    onClick={() => void send(s.text)}
                    className="flex items-start gap-3 md:gap-4 rounded-2xl border border-border bg-panel p-4 md:p-5 text-left hover:bg-panel-2/70 disabled:opacity-50 transition-colors"
                  >
                    <span className="text-xl md:text-2xl leading-none mt-0.5">{s.icon}</span>
                    <span className="text-sm md:text-[15px] text-text leading-relaxed">{s.text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-2xl md:max-w-5xl space-y-4 md:space-y-6 pb-2">
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
          className="absolute right-3 bottom-[calc(130px+env(safe-area-inset-bottom))] w-9 h-9 md:w-10 md:h-10 rounded-full bg-panel-2 border border-border flex items-center justify-center text-text-dim shadow-lg hover:bg-panel-2/80"
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
