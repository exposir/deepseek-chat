import { memo, useEffect, useState } from 'react';

/**
 * 思维链折叠块：流式时默认展开，完成后自动收起（用户手动操作后不再自动干预）
 */
export const ReasoningBlock = memo(function ReasoningBlock({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  const [open, setOpen] = useState(streaming);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!touched) setOpen(streaming);
  }, [streaming, touched]);

  if (!text) return null;

  return (
    <div className="rounded-xl border border-border bg-panel/60 overflow-hidden">
      <button
        type="button"
        onClick={() => {
          setTouched(true);
          setOpen((v) => !v);
        }}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-text-dim"
      >
        <span className={streaming ? 'search-pulse' : ''}>
          {streaming ? '深度思考中…' : '已深度思考'}
        </span>
        <svg
          className={`w-3 h-3 ml-auto transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 12 12"
          fill="none"
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="px-3 pb-3 max-h-64 overflow-y-auto border-t border-border/60 pt-2">
          <div className="reasoning-text">{text}</div>
        </div>
      )}
    </div>
  );
});
