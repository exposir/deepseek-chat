import type { ResponseItem, Usage } from '../api/types';
import type { ItemRecord } from '../db';
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
}

/**
 * 把流式块转为持久化 item（纯函数，可单测）：
 * - 有 finalItem 的块原样落库（服务端完整 item）
 * - reasoning / message 只保留非空文本（构造明文 item）
 * - 未完成的 web_search_call 保留展示（回传时由 buildInputItems 过滤）
 * - usage / interrupted / error 只标记在最后一个实际落库的记录上
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

  const last = records[records.length - 1];
  if (last && (p.usage || p.interrupted || p.failed)) {
    last.meta = {
      usage: p.usage,
      interrupted: p.interrupted || undefined,
      error: p.failed ?? undefined,
    };
  }
  return records;
}
