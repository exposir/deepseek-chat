import { memo } from 'react';

const STATUS_TEXT: Record<string, string> = {
  in_progress: '准备联网搜索…',
  searching: '正在联网搜索…',
  completed: '已联网搜索',
};

/** 服务端联网搜索状态徽标 */
export const SearchCallBadge = memo(function SearchCallBadge({
  status,
  query,
}: {
  status?: string;
  query?: string;
}) {
  const active = status === 'in_progress' || status === 'searching';
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
        active
          ? 'border-accent/50 text-accent search-pulse'
          : 'border-border text-text-dim'
      }`}
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span>
        {STATUS_TEXT[status ?? 'in_progress'] ?? '联网搜索'}
        {query ? `：${query}` : ''}
      </span>
    </div>
  );
});
