import { create } from 'zustand';
import {
  ApiError,
  apiBaseUrl,
  buildInputItems,
  createResponseStream,
  extractText,
  generateTitle,
} from '../api/responses';
import type { MessageItem, ResponseItem, Usage } from '../api/types';
import {
  appendItem,
  bulkAddItems,
  createConversation,
  deleteConversation,
  listConversations,
  listItems,
  nextSeq,
  touchConversation,
  truncateItems,
  updateConversation,
  type ConversationRecord,
  type ItemRecord,
} from '../db';
import { useSettings, MODELS_BY_PROVIDER } from './settings';
import { truncateTitle } from '../utils/format';
import { finalizeStreamBlocks } from './finalize';

/** 流式过程中的临时输出块（完成后转为 ItemRecord 落库） */
export interface StreamBlock {
  key: string;
  itemId?: string;
  type: 'reasoning' | 'message' | 'web_search_call';
  text: string;
  searchStatus?: 'in_progress' | 'searching' | 'completed';
  /** web_search_call 的 action 载荷（queries / url 等） */
  action?: Record<string, unknown>;
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
  /** 编辑消息回退后待载入输入框的文本（Composer 消费后清空） */
  draft: string | null;
  init: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  newConversation: () => Promise<void>;
  removeConversation: (id: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  stop: () => void;
  clearError: () => void;
  setDrawerOpen: (open: boolean) => void;
  /** 编辑某条用户消息：截断其后所有内容，文本载入输入框 */
  editMessage: (convId: string, seq: number, text: string) => Promise<void>;
  /** 重试失败/中断的回合：截断到该轮用户消息，直接重新发送 */
  retry: (convId: string, userSeq: number, text: string) => Promise<void>;
  /** 手动重命名会话：标记 titleCustom，自动标题生成不再覆盖 */
  renameConversation: (convId: string, title: string) => Promise<void>;
  clearDraft: () => void;
}

let abortController: AbortController | null = null;
// 标题生成请求控制器：切换会话时取消（避免给旧会话花冤枉钱）
let titleAbort: AbortController | null = null;
// StrictMode 下 effect 双调用守卫：init 全局只执行一次
let initPromise: Promise<void> | null = null;

/** 桌面视口（md breakpoint）：sidebar 常驻布局 */
const isDesktopViewport = () =>
  typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;

// —— rAF 节流缓冲：delta 先积累在模块级 Map，帧回调统一 flush，避免逐 token 重渲染 ——
const pendingDeltas = new Map<string, string>();
let flushScheduled = false;
let flushRafId = 0;

/** 取消已排队的 rAF flush（收尾时改用同步合并，避免竞态） */
function cancelScheduledFlush() {
  if (flushRafId) {
    cancelAnimationFrame(flushRafId);
    flushRafId = 0;
  }
  flushScheduled = false;
}

function scheduleFlush(set: (fn: (s: ChatState) => Partial<ChatState>) => void) {
  if (flushScheduled) return;
  flushScheduled = true;
  const raf =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 32);
  flushRafId = raf(() => {
    flushScheduled = false;
    flushRafId = 0;
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
  if (err instanceof DOMException && err.name === 'TimeoutError') return '请求超时，请稍后重试';
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
  draft: null,

  init: async () => {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      if (isDesktopViewport()) set({ drawerOpen: true });
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
    // 流式中切会话：终止旧流（收尾逻辑会落库到旧会话，UI 侧校验 activeConvId 不污染新会话）；
    // 同时取消挂起的标题生成
    if (get().isStreaming) abortController?.abort();
    titleAbort?.abort();
    const items = await listItems(id);
    // 桌面 sidebar 常驻，切会话不关闭；移动端关闭抽屉
    const apply = () =>
      set({
        activeConvId: id,
        items,
        streamBlocks: [],
        error: null,
        drawerOpen: isDesktopViewport() ? get().drawerOpen : false,
      });
    // View Transitions：消息区交叉过渡（不支持时直接切换）
    if (typeof document !== 'undefined' && document.startViewTransition) {
      document.startViewTransition(apply);
    } else {
      apply();
    }
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
    if (!settings.apiKeys[settings.provider]) {
      set({ error: 'NO_KEY' });
      return;
    }
    const convId = get().activeConvId;
    if (!convId) return;

    const history = get().items.map((r) => r.item);
    const input = buildInputItems(history, trimmed);

    // 当前模型不支持 web_search 时（如 OpenCode Go 的 V4 Pro）强制忽略搜索开关，避免上游报错
    const modelOpt = MODELS_BY_PROVIDER[settings.provider].find((m) => m.id === settings.model);
    const searchOn = settings.searchEnabled && modelOpt?.searchSupported !== false;

    // 默认指令：与系统提示词合并，每次发送自动带上
    const defaultTpl = settings.promptTemplates.find((t) => t.id === settings.defaultTemplateId);
    const systemPrompt = [settings.systemPrompt, defaultTpl?.text]
      .filter((s) => s?.trim())
      .join('\n\n');

    // 用户消息立即落库并上屏
    const userItem: MessageItem = { type: 'message', role: 'user', content: trimmed };
    const userRecord: ItemRecord = {
      convId,
      seq: await nextSeq(convId),
      item: userItem,
      createdAt: Date.now(),
    };
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
          apiKey: settings.apiKeys[settings.provider],
          baseUrl: apiBaseUrl(settings.provider, settings.customBaseUrl),
          model: settings.model,
          input,
          systemPrompt,
          searchEnabled: searchOn,
          reasoningEffort: settings.reasoningEffort,
        },
        {
          onItemAdded: (item) => {
            if (item.type !== 'reasoning' && item.type !== 'message' && item.type !== 'web_search_call')
              return;
            if (get().activeConvId !== convId) return;
            const block: StreamBlock = {
              key: nextBlockKey(),
              itemId: item.id,
              type: item.type,
              text: '',
              searchStatus: item.type === 'web_search_call' ? 'in_progress' : undefined,
              action:
                item.type === 'web_search_call'
                  ? (item.action as Record<string, unknown> | undefined)
                  : undefined,
            };
            set((s) => ({ streamBlocks: [...s.streamBlocks, block] }));
          },
          onItemDone: (item) => {
            if (get().activeConvId !== convId) return;
            const itemId = item.type === 'function_call_output' ? undefined : item.id;
            set((s) => ({
              streamBlocks: s.streamBlocks.map((b) => {
                if (itemId && b.itemId === itemId) {
                  return {
                    ...b,
                    finalItem: item,
                    action:
                      item.type === 'web_search_call'
                        ? ((item.action as Record<string, unknown> | undefined) ?? b.action)
                        : b.action,
                  };
                }
                return b;
              }),
            }));
          },
          onReasoningDelta: (delta, itemId) => {
            if (get().activeConvId !== convId) return;
            const key = targetKey(get().streamBlocks, 'reasoning', itemId);
            if (!key) return;
            pendingDeltas.set(key, (pendingDeltas.get(key) ?? '') + delta);
            scheduleFlush(set);
          },
          onTextDelta: (delta, itemId) => {
            if (get().activeConvId !== convId) return;
            const key = targetKey(get().streamBlocks, 'message', itemId);
            if (!key) return;
            pendingDeltas.set(key, (pendingDeltas.get(key) ?? '') + delta);
            scheduleFlush(set);
          },
          onWebSearchStatus: (status, itemId, item) => {
            if (get().activeConvId !== convId) return;
            set((s) => ({
              streamBlocks: s.streamBlocks.map((b) =>
                (itemId && b.itemId === itemId) ||
                (!itemId && b.type === 'web_search_call' && b.searchStatus !== 'completed')
                  ? {
                      ...b,
                      searchStatus: status,
                      action: (item?.action as Record<string, unknown> | undefined) ?? b.action,
                    }
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
    cancelScheduledFlush();
    const remaining = new Map(pendingDeltas);
    pendingDeltas.clear();
    const blocks = get().streamBlocks.map((b) =>
      remaining.has(b.key) ? { ...b, text: b.text + remaining.get(b.key)! } : b,
    );
    const interrupted = signal.aborted;
    const startSeq = await nextSeq(convId);
    const newRecords = finalizeStreamBlocks({
      convId,
      startSeq,
      blocks,
      createdAt: Date.now(),
      usage,
      interrupted,
      failed,
    });
    // 落库始终写旧会话（convId 闭包）；UI 仅在仍停留该会话时更新，避免污染新会话
    await bulkAddItems(newRecords);
    await touchConversation(convId);
    abortController = null;
    const stillActive = get().activeConvId === convId;
    if (stillActive) {
      set((s) => ({
        items: [...s.items, ...newRecords],
        streamBlocks: [],
        isStreaming: false,
        error: failed,
      }));
    } else {
      // 已切走：释放全局流式锁即可（新会话的 items/streamBlocks 保持其自身状态）
      set({ isStreaming: false });
    }

    // 标题自动演进：首轮 + 每 5 轮，未手动改名时，用旧标题 + 最近 2 轮对话生成
    const userCount = get().items.filter(
      (r) => r.item.type === 'message' && (r.item as MessageItem).role === 'user',
    ).length;
    const conv = get().conversations.find((c) => c.id === convId);
    if (settings.apiKeys[settings.provider] && conv && !conv.titleCustom && (userCount === 1 || userCount % 5 === 0)) {
      titleAbort = new AbortController();
      const context =
        userCount === 1
          ? trimmed
          : get()
              .items.filter((r) => r.item.type === 'message')
              .slice(-4)
              .map((r) => {
                const msg = r.item as MessageItem;
                return msg.role === 'user' ? `用户：${extractText(msg)}` : `助手：${extractText(msg)}`;
              })
              .join('\n')
              .slice(0, 1500);
      const title = await generateTitle({
        apiKey: settings.apiKeys[settings.provider],
        baseUrl: apiBaseUrl(settings.provider, settings.customBaseUrl),
        model: settings.model,
        context,
        previousTitle: conv.title,
        signal: titleAbort?.signal,
      });
      if (title && get().conversations.some((c) => c.id === convId)) {
        await touchConversation(convId, title);
        set((s) => ({
          conversations: s.conversations.map((c) => (c.id === convId ? { ...c, title } : c)),
        }));
      }
      titleAbort = null;
    }
  },

  stop: () => {
    abortController?.abort();
  },

  editMessage: async (convId, seq, text) => {
    if (get().isStreaming) return;
    await truncateItems(convId, seq);
    set((s) => ({
      items: s.items.filter((r) => r.convId !== convId || r.seq < seq),
      streamBlocks: [],
      draft: text,
    }));
  },

  clearDraft: () => set({ draft: null }),

  retry: async (convId, userSeq, text) => {
    if (get().isStreaming) return;
    await truncateItems(convId, userSeq);
    set((s) => ({
      items: s.items.filter((r) => r.convId !== convId || r.seq < userSeq),
      streamBlocks: [],
    }));
    await get().send(text);
  },

  renameConversation: async (convId, title) => {
    const t = title.trim();
    if (!t) return;
    await updateConversation(convId, { title: t, titleCustom: true, updatedAt: Date.now() });
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === convId ? { ...c, title: t, titleCustom: true } : c,
      ),
    }));
  },

  clearError: () => set({ error: null }),
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
}));
