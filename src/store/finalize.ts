import type { ResponseItem, Usage } from '../api/types';
import type { ItemRecord, UsageModelSnapshot } from '../db';
import type { StreamBlock } from './chat';

export interface FinalizeParams {
  convId: string;
  /** 起始序号（nextSeq 结果），后续连续分配 */
  startSeq: number;
  blocks: StreamBlock[];
  /** 记录写入时间（所有块同一时间戳） */
  createdAt: number;
  usage?: Usage;
  interrupted?: boolean;
  failed?: string | null;
  /** 本轮请求的模型/计价快照（费用估算用，避免换模型后历史重算） */
  usageModel?: UsageModelSnapshot;
}

/**
 * 把流式块转为持久化 item（纯函数，可单测）：
 * - 有 finalItem 的块原样落库（服务端完整 item）
 * - reasoning / message 只保留非空文本（构造明文 item）
 * - 未完成的 web_search_call 保留展示（回传时由 buildInputItems 过滤）
 * - usage / interrupted / error 标记在最后一个 message 上（UI 只在 message 分支渲染，
 *   避免标在 web_search_call 等块上丢失）；无 message 时回退最后一个实际落库记录
 */
export function finalizeStreamBlocks(p: FinalizeParams): ItemRecord[] {
  const records: ItemRecord[] = [];
  let seq = p.startSeq;

  const push = (item: ResponseItem) => {
    records.push({ convId: p.convId, seq: seq++, item, createdAt: p.createdAt });
  };

  for (const b of p.blocks) {
    if (b.finalItem) {
      push(b.finalItem);
    } else if (b.type === 'reasoning') {
      if (!b.text) continue;
      push({ type: 'reasoning', id: b.itemId, content: [{ type: 'reasoning_text', text: b.text }] });
    } else if (b.type === 'message') {
      if (!b.text) continue;
      push({ type: 'message', role: 'assistant', id: b.itemId, content: b.text });
    } else {
      push({
        type: 'web_search_call',
        id: b.itemId,
        status: b.searchStatus ?? 'in_progress',
        action: b.action,
      });
    }
  }

  const metaTarget =
    [...records].reverse().find((r) => r.item.type === 'message') ?? records[records.length - 1];
  if (metaTarget && (p.usage || p.interrupted || p.failed || p.usageModel)) {
    metaTarget.meta = {
      usage: p.usage,
      interrupted: p.interrupted || undefined,
      error: p.failed ?? undefined,
      usageModel: p.usageModel,
    };
  }
  return records;
}
