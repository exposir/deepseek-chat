import { memo, useState } from 'react';
import type { ItemRecord } from '../db';
import type { MessageItem as ApiMessageItem, ReasoningItem } from '../api/types';
import { extractText } from '../api/responses';
import { MarkdownContent } from './MarkdownContent';
import { ReasoningBlock } from './ReasoningBlock';
import { SearchCallBadge } from './SearchCallBadge';
import { formatTokens } from '../utils/format';

function reasoningText(item: ReasoningItem): string {
  return (item.content ?? []).map((c) => c.text).join('');
}

/** 复制 Markdown 原文（带格式），成功后短暂反馈 */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板不可用时静默失败
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-text-dim active:bg-panel-2"
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
        <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M11 3V2.5A1.5 1.5 0 0 0 9.5 1h-6A1.5 1.5 0 0 0 2 2.5v6A1.5 1.5 0 0 0 3.5 10H4" stroke="currentColor" strokeWidth="1.3" />
      </svg>
      {copied ? '已复制' : '复制'}
    </button>
  );
}

/** 已落库 item 的渲染：按类型分发 */
export const MessageItemView = memo(function MessageItemView({ record }: { record: ItemRecord }) {
  const { item, meta } = record;

  if (item.type === 'message') {
    const msg = item as ApiMessageItem;
    const text = extractText(msg);
    if (msg.role === 'user') {
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft/70 px-4 py-2.5 text-[16px] whitespace-pre-wrap break-words">
            {text}
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-1.5">
        <MarkdownContent content={text} />
        {meta?.interrupted && <div className="text-[12px] text-text-dim/70">已手动停止</div>}
        {meta?.error && <div className="text-[12px] text-red-400">{meta.error}</div>}
        <div className="flex items-center justify-between gap-2">
          {meta?.usage ? (
            <div className="text-[12px] text-text-dim/70">
              {formatTokens(meta.usage.input_tokens)} 输入
              {meta.usage.input_tokens_details?.cached_tokens
                ? `（缓存 ${formatTokens(meta.usage.input_tokens_details.cached_tokens)}）`
                : ''}
              {' · '}
              {formatTokens(meta.usage.output_tokens)} 输出
            </div>
          ) : (
            <span />
          )}
          <CopyButton text={text} />
        </div>
      </div>
    );
  }

  if (item.type === 'reasoning') {
    const text = reasoningText(item as ReasoningItem);
    if (!text) return null;
    return <ReasoningBlock text={text} streaming={false} />;
  }

  if (item.type === 'web_search_call') {
    return (
      <div>
        <SearchCallBadge status={item.status} action={item.action} />
      </div>
    );
  }

  return null;
});
