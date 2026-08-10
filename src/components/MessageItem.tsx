import { memo, useState } from 'react';
import type { ItemRecord } from '../db';
import type { MessageItem as ApiMessageItem, ReasoningItem, Usage } from '../api/types';
import { extractText } from '../api/responses';
import { MarkdownContent } from './MarkdownContent';
import { ReasoningBlock } from './ReasoningBlock';
import { SearchCallBadge } from './SearchCallBadge';
import { formatTokens, formatCost } from '../utils/format';
import { MODELS, useSettings } from '../store/settings';
import { useChat } from '../store/chat';

function reasoningText(item: ReasoningItem): string {
  return (item.content ?? []).map((c) => c.text).join('');
}

/** 上下文占用行：input_tokens 即当前上下文长度（无状态全量回传），换算成进度与费用 */
function ContextUsageLine({ usage }: { usage: Usage }) {
  const model = useSettings((s) => s.model);
  const modelOpt = MODELS.find((m) => m.id === model);
  const window = modelOpt?.contextWindow ?? 1_000_000;
  const used = usage.input_tokens ?? 0;
  const pct = Math.min(100, Math.round((used / window) * 100));
  const danger = pct >= 80;
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  const cost =
    modelOpt?.pricing &&
    ((used - cached) / 1_000_000) * modelOpt.pricing.input +
      (cached / 1_000_000) * modelOpt.pricing.cachedInput +
      (usage.output_tokens / 1_000_000) * modelOpt.pricing.output;
  return (
    <div className={`text-[12px] ${danger ? 'text-red-400' : 'text-text-dim/70'}`}>
      上下文 {formatTokens(used)} / {formatTokens(window)}（{pct}%）
      {cached ? `（缓存 ${formatTokens(cached)}）` : ''}
      {' · '}
      输出 {formatTokens(usage.output_tokens)}
      {cost !== undefined && <span className="text-text-dim/50"> ≈ ¥{formatCost(cost)}</span>}
    </div>
  );
}

/** 复制按钮（纯 icon，assistant 与用户消息共用），点击弹出气泡提示 */
function CopyButton({ text }: { text: string }) {
  const [showTip, setShowTip] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setShowTip(true);
      setTimeout(() => setShowTip(false), 2000);
    } catch {
      // 剪贴板不可用时静默失败
    }
  };
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={handleCopy}
        aria-label="复制"
        className="p-1.5 rounded-lg text-text-dim/70 active:bg-panel-2"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
          <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M11 3V2.5A1.5 1.5 0 0 0 9.5 1h-6A1.5 1.5 0 0 0 2 2.5v6A1.5 1.5 0 0 0 3.5 10H4" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      </button>
      {showTip && (
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-panel-2 px-2 py-1 text-[11px] text-text shadow-xl">
          已复制
        </span>
      )}
    </div>
  );
}

/** 用户消息下方的操作：复制 + 编辑（编辑=截断后续并载回输入框） */
function UserMessageActions({ record, text }: { record: ItemRecord; text: string }) {
  const editMessage = useChat((s) => s.editMessage);
  const isStreaming = useChat((s) => s.isStreaming);

  return (
    <div className="flex justify-end gap-1">
      <CopyButton text={text} />
      <button
        type="button"
        onClick={() => void editMessage(record.convId, record.seq, text)}
        disabled={isStreaming}
        aria-label="编辑"
        className="p-1.5 rounded-lg text-text-dim/70 active:bg-panel-2 disabled:opacity-40"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
          <path d="M11.3 2.3a1.4 1.4 0 0 1 2 2L5.5 12l-3 .8.8-3 8-7.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
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
        <div className="space-y-0.5 msg-in">
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent-soft/70 px-4 py-2.5 text-[16px] whitespace-pre-wrap break-words">
              {text}
            </div>
          </div>
          <UserMessageActions record={record} text={text} />
        </div>
      );
    }
    return (
      <div className="space-y-1.5 msg-in">
        <MarkdownContent content={text} />
        {meta?.interrupted && <div className="text-[12px] text-text-dim/70">已手动停止</div>}
        {meta?.error && <div className="text-[12px] text-red-400">{meta.error}</div>}
        <div className="flex items-center justify-between gap-2">
          {meta?.usage ? (
            <ContextUsageLine usage={meta.usage} />
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
