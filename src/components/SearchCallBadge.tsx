import { memo, useState } from 'react';
import type { WebSearchAction } from '../api/types';

/**
 * 联网搜索折叠块：默认折叠，点击头部展开/收起；搜索中仅展示标题状态
 * 风格与 ReasoningBlock 一致（同款折叠容器）
 * 展开内容按 DeepSeek 实际返回渲染：queries 搜索词列表、open_page 打开的 URL；
 * sources 需 include 才返回（DeepSeek 不支持），仅防御式保留
 */
export const SearchCallBadge = memo(function SearchCallBadge({
  status,
  action,
}: {
  status?: string;
  action?: WebSearchAction;
}) {
  const [open, setOpen] = useState(false);
  const active = status === 'in_progress' || status === 'searching';

  if (!status && !action) return null;

  const statusLabel = active
    ? '联网搜索中…'
    : status === 'completed'
      ? '已联网搜索'
      : '联网搜索';

  // 服务端会在 queries 末尾附带内部调用 ID（ws_call_id=...），对用户是噪音，过滤
  const rawQueries = action?.queries?.length
    ? action.queries
    : action?.query
      ? [action.query]
      : [];
  const queries = rawQueries.filter((q) => !q.startsWith('ws_call_id='));
  const sources = action?.sources?.length ? action.sources : [];
  const openUrl = action?.type === 'open_page' ? action.url : undefined;

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
        <div className="px-3 pb-3 border-t border-border/60 pt-2 space-y-2">
          {queries.length > 0 && (
            <div className="space-y-0.5">
              <div className="text-[11px] text-text-dim/60">搜索词</div>
              {queries.map((q, i) => (
                <div key={i} className="text-xs text-text-dim break-all">
                  {q}
                </div>
              ))}
            </div>
          )}
          {openUrl && (
            <a
              href={openUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="block text-xs text-accent break-all underline underline-offset-2"
            >
              打开页面：{openUrl}
            </a>
          )}
          {sources.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] text-text-dim/60">搜索来源</div>
              {sources.map((src, i) => (
                <a
                  key={i}
                  href={src.url ?? '#'}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block rounded-lg border border-border/60 bg-panel-2 p-2.5 text-xs"
                >
                  {src.title && <div className="font-medium text-accent mb-0.5">{src.title}</div>}
                  {src.url && (
                    <div className="text-[11px] text-text-dim/60 truncate mb-0.5">{src.url}</div>
                  )}
                  {src.snippet && <div className="text-text-dim line-clamp-2">{src.snippet}</div>}
                </a>
              ))}
            </div>
          )}
          <div className="text-xs text-text-dim/70">
            状态：
            {status === 'completed'
              ? '已完成'
              : status === 'searching'
                ? '搜索中'
                : status === 'in_progress'
                  ? '准备…'
                  : (status ?? '未知')}
          </div>
        </div>
      )}
    </div>
  );
});
