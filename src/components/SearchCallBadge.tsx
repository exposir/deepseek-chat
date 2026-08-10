import { memo, useState } from 'react';

/**
 * 联网搜索折叠块：默认折叠，点击头部展开/收起；搜索中仅展示标题状态
 * 风格与 ReasoningBlock 一致（同款折叠容器）
 */
export const SearchCallBadge = memo(function SearchCallBadge({
  status,
  query,
  streaming,
}: {
  status?: string;
  query?: string;
  streaming?: boolean;
}) {
    void streaming; // 保留接口一致性，暂未使用
  const [open, setOpen] = useState(false);
  const active = status === 'in_progress' || status === 'searching';

  if (!status && !query) return null;

  const statusLabel = active
    ? '联网搜索中…'
    : status === 'completed'
      ? '已联网搜索'
      : '联网搜索';

  return (
    <div className="rounded-xl border border-border bg-panel/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-text-dim"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className={active ? 'search-pulse' : ''}>{statusLabel}</span>
        <svg
          className={`w-3 h-3 ml-auto transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 12 12"
          fill="none"
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-border/60 pt-2 space-y-1">
          {query && (
            <div className="text-xs text-text-dim">
              <span className="text-text-dim/60">搜索词：</span>{query}
            </div>
          )}
          <div className="text-xs text-text-dim/70">
            状态：{status === 'completed' ? '已完成' : status === 'searching' ? '搜索中' : status === 'in_progress' ? '准备…' : (status ?? '未知')}
          </div>
        </div>
      )}
    </div>
  );
});
