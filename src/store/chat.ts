import { create } from 'zustand';
import {
  ApiError,
  buildInputItems,
  createResponseStream,
  extractText,
} from '../api/responses';
import type { MessageItem, ResponseItem, Usage } from '../api/types';
import {
  appendItem,
  createConversation,
  deleteConversation,
  listConversations,
  listItems,
  nextSeq,
  touchConversation,
  type ConversationRecord,
  type ItemRecord,
} from '../db';
import { useSettings } from './settings';
import { truncateTitle } from '../utils/format';

/** 流式过程中的临时输出块（完成后转为 ItemRecord 落库） */
export interface StreamBlock {
  key: string;
  itemId?: string;
  type: 'reasoning' | 'message' | 'web_search_call';
  text: string;
  searchStatus?: 'in_progress' | 'searching' | 'completed';
  query?: string;
  searchResult?: Record<string, unknown>;
  finalItem?: ResponseItem;
}

interface ChatState {
  conversations: ConversationRecord[];
  activeConvId: string | null;
  items: ItemRecord[];
  streamBlocks: StreamBlock[];
  isStreaming: boolean;
  error: string | null;
  drawerOpen: boolean;
  init: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  newConversation: () => Promise<void>;
  removeConversation: (id: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  stop: () => void;
  clearError: () => void;
  setDrawerOpen: (open: boolean) => void;
}

let abortController: AbortController | null = null;
// StrictMode 下 effect 双调用守卫：init 全局只执行一次
let initPromise: Promise<void> | null = null;

// —— rAF 节流缓冲：delta 先积累在模块级 Map，帧回调统一 flush，避免逐 token 重渲染 ——
const pendingDeltas = new Map<string, string>();
let flushScheduled = false;

function scheduleFlush(set: (fn: (s: ChatState) => Partial<ChatState>) => void) {
  if (flushScheduled) return;
  flushScheduled = true;
  const raf =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 32);
  raf(() => {
    flushScheduled = false;
    if (pendingDeltas.size === 0) return;
    const deltas = new Map(pendingDeltas);
    pendingDeltas.clear();
    set((s) => ({
      streamBlocks: s.streamBlocks.map((b) =>
        deltas.has(b.key) ? { ...b, text: b.text + deltas.get(b.key)! } : b,
      ),
    }));
  });
}

/** 找到接收 delta 的目标块：优先 itemId 匹配，否则取该类型最后一个块 */
function targetKey(
  blocks: StreamBlock[],
  type: StreamBlock['type'],
  itemId?: string,
): string | null {
  if (itemId) {
    const byId = blocks.find((b) => b.itemId === itemId);
    if (byId) return byId.key;
  }
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].type === type) return blocks[i].key;
  }
  return null;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 401:
        return 'API Key 无效，请到设置页检查';
      case 402:
        return '账户余额不足，请前往 DeepSeek 开放平台充值';
      case 429:
        return '触发限速，请稍后重试';
      case 400:
        return /context|length|token/i.test(err.message)
          ? '上下文超出限制，请新开会话'
          : `请求错误：${err.message}`;
      default:
        return `请求失败（${err.status}）：${err.message}`;
    }
  }
  if (err instanceof TypeError) return '网络连接失败，请检查网络后重试';
  return err instanceof Error ? err.message : '未知错误';
}

let blockSeq = 0;
const nextBlockKey = () => `blk-${Date.now()}-${blockSeq++}`;

export const useChat = create<ChatState>()((set, get) => ({
  conversations: [],
  activeConvId: null,
  items: [],
  streamBlocks: [],
  isStreaming: false,
  error: null,
  drawerOpen: false,

  init: async () => {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const conversations = await listConversations();
      set({ conversations });
      if (conversations.length > 0) {
        await get().selectConversation(conversations[0].id);
      } else {
        await get().newConversation();
      }
    })();
    return initPromise;
  },

  selectConversation: async (id) => {
    const items = await listItems(id);
    set({ activeConvId: id, items, streamBlocks: [], error: null, drawerOpen: false });
  },

  newConversation: async () => {
    const now = Date.now();
    const record: ConversationRecord = {
      id: `conv-${now}-${Math.random().toString(36).slice(2, 8)}`,
      title: '新对话',
      createdAt: now,
      updatedAt: now,
    };
    await createConversation(record);
    set((s) => ({ conversations: [record, ...s.conversations] }));
    await get().selectConversation(record.id);
  },

  removeConversation: async (id) => {
    await deleteConversation(id);
    const conversations = get().conversations.filter((c) => c.id !== id);
    set({ conversations });
    if (get().activeConvId === id) {
      if (conversations.length > 0) await get().selectConversation(conversations[0].id);
      else await get().newConversation();
    }
  },

  send: async (text) => {
    const trimmed = text.trim();
    if (!trimmed || get().isStreaming) return;
    const settings = useSettings.getState();
    if (!settings.apiKey) {
      set({ error: 'NO_KEY' });
      return;
    }
    const convId = get().activeConvId;
    if (!convId) return;

    const history = get().items.map((r) => r.item);
    const input = buildInputItems(history, trimmed);

    // 用户消息立即落库并上屏
    const userItem: MessageItem = { type: 'message', role: 'user', content: trimmed };
    const userRecord: ItemRecord = { convId, seq: await nextSeq(convId), item: userItem };
    await appendItem(userRecord);
    const isFirstMessage = get().items.length === 0;
    if (isFirstMessage) {
      await touchConversation(convId, truncateTitle(trimmed));
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === convId ? { ...c, title: truncateTitle(trimmed), updatedAt: Date.now() } : c,
        ),
      }));
    } else {
      await touchConversation(convId);
    }
    set((s) => ({ items: [...s.items, userRecord], error: null, streamBlocks: [], isStreaming: true }));

    abortController = new AbortController();
    const { signal } = abortController;
    let usage: Usage | undefined;
    let failed: string | null = null;

    try {
      await createResponseStream(
        {
          apiKey: settings.apiKey,
          model: settings.model,
          input,
          systemPrompt: settings.systemPrompt,
          searchEnabled: settings.searchEnabled,
          reasoningEffort: settings.reasoningEffort,
        },
        {
          onItemAdded: (item) => {
            if (item.type !== 'reasoning' && item.type !== 'message' && item.type !== 'web_search_call')
              return;
            const block: StreamBlock = {
              key: nextBlockKey(),
              itemId: item.id,
              type: item.type,
              text: '',
              searchStatus: item.type === 'web_search_call' ? 'in_progress' : undefined,
              query:
                item.type === 'web_search_call'
                  ? (item.action as { query?: string } | undefined)?.query
                  : undefined,
            };
            set((s) => ({ streamBlocks: [...s.streamBlocks, block] }));
          },
          onItemDone: (item) => {
            const itemId = item.type === 'function_call_output' ? undefined : item.id;
            set((s) => ({
              streamBlocks: s.streamBlocks.map((b) => {
                if (itemId && b.itemId === itemId) {
                  return {
                    ...b,
                    finalItem: item,
                    query:
                      item.type === 'web_search_call'
                        ? ((item.action as { query?: string } | undefined)?.query ?? b.query)
                        : b.query,
                    searchResult:
                      item.type === 'web_search_call'
                        ? ((item.action as Record<string, unknown> | undefined) ?? b.searchResult)
                        : b.searchResult,
                  };
                }
                return b;
              }),
            }));
          },
          onReasoningDelta: (delta, itemId) => {
            const key = targetKey(get().streamBlocks, 'reasoning', itemId);
            if (!key) return;
            pendingDeltas.set(key, (pendingDeltas.get(key) ?? '') + delta);
            scheduleFlush(set);
          },
          onTextDelta: (delta, itemId) => {
            const key = targetKey(get().streamBlocks, 'message', itemId);
            if (!key) return;
            pendingDeltas.set(key, (pendingDeltas.get(key) ?? '') + delta);
            scheduleFlush(set);
          },
          onWebSearchStatus: (status, itemId, item) => {
            set((s) => ({
              streamBlocks: s.streamBlocks.map((b) =>
                (itemId && b.itemId === itemId) ||
                (!itemId && b.type === 'web_search_call' && b.searchStatus !== 'completed')
                  ? { ...b, searchStatus: status, searchResult: (item?.action as Record<string, unknown> | undefined) ?? b.searchResult }
                  : b,
              ),
            }));
          },
          onCompleted: (_resp, u) => {
            usage = u;
          },
          onIncomplete: (resp) => {
            failed = `输出被截断（${resp.incomplete_details?.reason ?? 'max_output_tokens'}）`;
          },
          onFailed: (resp) => {
            failed = resp.error?.message ?? '响应失败';
          },
        },
        signal,
      );
    } catch (err) {
      if ((err as Error).name !== 'AbortError' && !signal.aborted) {
        failed = errorMessage(err);
      }
    }

    // 收尾：把流式块转为持久化 item（无论正常/停止/失败，保留已生成内容）
    flushScheduled = false;
    const remaining = new Map(pendingDeltas);
    pendingDeltas.clear();
    const blocks = get().streamBlocks.map((b) =>
      remaining.has(b.key) ? { ...b, text: b.text + remaining.get(b.key)! } : b,
    );
    const interrupted = signal.aborted;
    const newRecords: ItemRecord[] = [];
    let seq = await nextSeq(convId);
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      let item: ResponseItem;
      if (b.finalItem) {
        item = b.finalItem;
      } else if (b.type === 'reasoning') {
        if (!b.text) continue;
        item = { type: 'reasoning', id: b.itemId, content: [{ type: 'reasoning_text', text: b.text }] };
      } else if (b.type === 'message') {
        if (!b.text) continue;
        item = { type: 'message', role: 'assistant', id: b.itemId, content: b.text };
      } else {
        // 未完成的 web_search_call：落库保留展示，回传时由 buildInputItems 过滤
        item = { type: 'web_search_call', id: b.itemId, status: b.searchStatus ?? 'in_progress', action: b.searchResult };
      }
      const isLast = i === blocks.length - 1;
      const record: ItemRecord = {
        convId,
        seq: seq++,
        item,
        meta:
          isLast && (usage || interrupted || failed)
            ? { usage, interrupted: interrupted || undefined, error: failed ?? undefined }
            : undefined,
      };
      await appendItem(record);
      newRecords.push(record);
    }
    await touchConversation(convId);
    abortController = null;
    set((s) => ({
      items: [...s.items, ...newRecords],
      streamBlocks: [],
      isStreaming: false,
      error: failed,
    }));
  },

  stop: () => {
    abortController?.abort();
  },

  clearError: () => set({ error: null }),
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
}));

/** 供重发场景使用：取会话中最后一条用户消息文本 */
export function lastUserText(items: ItemRecord[]): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i].item;
    if (it.type === 'message' && it.role === 'user') return extractText(it);
  }
  return null;
}
