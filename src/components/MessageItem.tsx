import { memo } from 'react';
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
        {meta?.usage && (
          <div className="text-[12px] text-text-dim/70">
            {formatTokens(meta.usage.input_tokens)} 输入
            {meta.usage.input_tokens_details?.cached_tokens
              ? `（缓存 ${formatTokens(meta.usage.input_tokens_details.cached_tokens)}）`
              : ''}
            {' · '}
            {formatTokens(meta.usage.output_tokens)} 输出
          </div>
        )}
        {meta?.interrupted && <div className="text-[12px] text-text-dim/70">已手动停止</div>}
        {meta?.error && <div className="text-[12px] text-red-400">{meta.error}</div>}
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
        <SearchCallBadge
          status={item.status}
          query={(item.action as { query?: string } | undefined)?.query}
          streaming={false}
        />
      </div>
    );
  }

  return null;
});
