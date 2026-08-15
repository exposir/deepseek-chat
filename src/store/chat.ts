import { create } from 'zustand';
import { flushSync } from 'react-dom';
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
  conversationExists,
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

/** 会话级错误：判别联合，不再用魔法字符串哨兵 */
export type ChatError =
  | { kind: 'no-key' }
  | { kind: 'message'; text: string };

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
  error: ChatError | null;
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

/** 取消已排队的 rAF flush（收尾时改用同步合并，避免竞态）；与 scheduleFlush 的降级对应 */
function cancelScheduledFlush() {
  if (flushRafId) {
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(flushRafId);
    } else {
      clearTimeout(flushRafId);
    }
    flushRafId = 0;
  }
  flushScheduled = false;
}

/**
 * rAF 节流：同一帧内的多次调度只排一次，帧回调执行传入的 flush。
 * flush 由 send() 闭包提供——把 pendingDeltas 合并进闭包 blocks，
 * 而不是 store 的 streamBlocks（切走会话后 store 的 streamBlocks 会被清空，合并目标消失）。
 */
function scheduleFlush(flush: () => void) {
  if (flushScheduled) return;
  flushScheduled = true;
  const raf =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 32);
  flushRafId = raf(() => {
    flushScheduled = false;
    flushRafId = 0;
    flush();
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

interface TitleEvolveParams {
  convId: string;
  /** 流开始前的全部 item（不含本轮用户消息） */
  history: ResponseItem[];
  /** 本轮用户消息文本 */
  userText: string;
  /** 本轮流收尾后的新记录（assistant 回复等） */
  replyRecords: ItemRecord[];
  apiKey: string;
  baseUrl: string;
  model: string;
  /** 写回前动态获取会话（存在性 + titleCustom 复验） */
  findConv: () => ConversationRecord | undefined;
  onTitle: (title: string) => Promise<void>;
}

/**
 * 标题自动演进：首轮 + 每 5 轮，未手动改名时生成。
 * 数据全部来自调用方闭包快照（history + userText + replyRecords），不读全局 store——
 * 流结束后用户可能已切走/改名/删除会话，读 store 会拿到新会话的数据（串号）或覆盖手动改名。
 * 写回前复验 titleCustom：生成期间用户手动改名则放弃。
 */
async function maybeEvolveTitle(p: TitleEvolveParams): Promise<void> {
  const userCount =
    p.history.filter(
      (r) => r.type === 'message' && (r as MessageItem).role === 'user',
    ).length + 1;
  if (userCount !== 1 && userCount % 5 !== 0) return;
  const conv = p.findConv();
  if (!conv || conv.titleCustom) return;

  const context =
    userCount === 1
      ? p.userText
      : [...p.history, ...p.replyRecords.map((r) => r.item)]
          .filter((r) => r.type === 'message')
          .slice(-4)
          .map((r) => {
            const msg = r as MessageItem;
            return msg.role === 'user' ? `用户：${extractText(msg)}` : `助手：${extractText(msg)}`;
          })
          .join('\n')
          .slice(0, 1500);

  titleAbort = new AbortController();
  const title = await generateTitle({
    apiKey: p.apiKey,
    baseUrl: p.baseUrl,
    model: p.model,
    context,
    previousTitle: conv.title,
    signal: titleAbort?.signal,
  });
  titleAbort = null;
  // 写回前复验：生成期间可能已手动改名（titleCustom）或会话被删除
  const current = p.findConv();
  if (title && current && !current.titleCustom) {
    await p.onTitle(title);
  }
}

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
    // View Transitions：消息区交叉过渡（不支持时直接切换）。
    // flushSync 强制同步刷新 React DOM，保证快照捕获的是新状态（zustand set 是异步渲染的）
    if (typeof document !== 'undefined' && document.startViewTransition) {
      document.startViewTransition(() => {
        flushSync(apply);
      });
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
    // 删除正在流式/生成标题的会话：终止后台请求。
    // 流收尾的存在性检查（conversationExists）兜底，不会把结果写回已删除会话产生孤儿数据。
    if (get().activeConvId === id && get().isStreaming) abortController?.abort();
    titleAbort?.abort();
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
      set({ error: { kind: 'no-key' } });
      return;
    }
    if (settings.provider === 'custom' && !settings.customBaseUrl) {
      set({ error: { kind: 'message', text: '请先在设置页填写自建代理地址' } });
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

    // 流式块由闭包数组累积，store 的 streamBlocks 仅作 UI 镜像——
    // 切走会话时 selectConversation 会清空 store 的 streamBlocks，若收尾/flush 从 store 读会丢内容。
    const blocks: StreamBlock[] = [];
    const syncBlocks = () => {
      if (get().activeConvId === convId) set({ streamBlocks: [...blocks] });
    };
    /** 把缓冲的 delta 合并进闭包 blocks（帧回调执行；不依赖 store 状态） */
    const flushPending = () => {
      if (pendingDeltas.size === 0) return;
      const deltas = new Map(pendingDeltas);
      pendingDeltas.clear();
      let changed = false;
      for (const b of blocks) {
        if (deltas.has(b.key)) {
          b.text += deltas.get(b.key)!;
          changed = true;
        }
      }
      if (changed) syncBlocks();
    };

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
            blocks.push(block);
            syncBlocks();
          },
          onItemDone: (item) => {
            if (get().activeConvId !== convId) return;
            const itemId = item.type === 'function_call_output' ? undefined : item.id;
            const idx = itemId ? blocks.findIndex((b) => b.itemId === itemId) : -1;
            if (idx >= 0) {
              blocks[idx] = {
                ...blocks[idx],
                finalItem: item,
                action:
                  item.type === 'web_search_call'
                    ? ((item.action as Record<string, unknown> | undefined) ?? blocks[idx].action)
                    : blocks[idx].action,
              };
              syncBlocks();
            }
          },
          onReasoningDelta: (delta, itemId) => {
            if (get().activeConvId !== convId) return;
            let key = targetKey(blocks, 'reasoning', itemId);
            if (!key) {
              // 上游跳过 output_item.added 直接发 delta（如 OpenCode Go pro）：动态建块
              const block: StreamBlock = { key: nextBlockKey(), itemId, type: 'reasoning', text: '' };
              blocks.push(block);
              syncBlocks();
              key = block.key;
            }
            pendingDeltas.set(key, (pendingDeltas.get(key) ?? '') + delta);
            scheduleFlush(flushPending);
          },
          onTextDelta: (delta, itemId) => {
            if (get().activeConvId !== convId) return;
            let key = targetKey(blocks, 'message', itemId);
            if (!key) {
              // 上游跳过 output_item.added 直接发 delta（如 OpenCode Go pro）：动态建块
              const block: StreamBlock = { key: nextBlockKey(), itemId, type: 'message', text: '' };
              blocks.push(block);
              syncBlocks();
              key = block.key;
            }
            pendingDeltas.set(key, (pendingDeltas.get(key) ?? '') + delta);
            scheduleFlush(flushPending);
          },
          onWebSearchStatus: (status, itemId, item) => {
            if (get().activeConvId !== convId) return;
            let changed = false;
            for (const b of blocks) {
              if (
                (itemId && b.itemId === itemId) ||
                (!itemId && b.type === 'web_search_call' && b.searchStatus !== 'completed')
              ) {
                b.searchStatus = status;
                if (item?.action) b.action = item.action as Record<string, unknown>;
                changed = true;
              }
            }
            if (changed) syncBlocks();
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

    // 收尾：把流式块转为持久化 item（无论正常/停止/失败，保留已生成内容）。
    // 用闭包 blocks（切走后 store 的 streamBlocks 已被清空，读 store 会丢内容）。
    cancelScheduledFlush();
    const remaining = new Map(pendingDeltas);
    pendingDeltas.clear();
    const finalBlocks = blocks.map((b) =>
      remaining.has(b.key) ? { ...b, text: b.text + remaining.get(b.key)! } : b,
    );
    const interrupted = signal.aborted;
    const startSeq = await nextSeq(convId);
    const newRecords = finalizeStreamBlocks({
      convId,
      startSeq,
      blocks: finalBlocks,
      createdAt: Date.now(),
      usage,
      interrupted,
      failed,
      usageModel: {
        model: settings.model,
        contextWindow: modelOpt?.contextWindow,
        pricing: modelOpt?.pricing,
      },
    });
    // 落库始终写旧会话（convId 闭包）；UI 仅在仍停留该会话时更新，避免污染新会话。
    // 会话可能已被删除（删除不等流结束）：存在性检查，避免孤儿数据。
    if (await conversationExists(convId)) {
      await bulkAddItems(newRecords);
      await touchConversation(convId);
    }
    abortController = null;
    const stillActive = get().activeConvId === convId;
    if (stillActive) {
      set((s) => ({
        items: [...s.items, ...newRecords],
        streamBlocks: [],
        isStreaming: false,
        error: failed ? { kind: 'message', text: failed } : null,
      }));
    } else {
      // 已切走：释放全局流式锁即可（新会话的 items/streamBlocks 保持其自身状态）
      set({ isStreaming: false });
    }

    // 标题自动演进：数据用闭包快照（history + userRecord + newRecords），
    // 流结束后用户可能已切走/改名/删除，读 store 会串号或覆盖。
    if (settings.apiKeys[settings.provider]) {
      await maybeEvolveTitle({
        convId,
        history,
        userText: trimmed,
        replyRecords: newRecords,
        apiKey: settings.apiKeys[settings.provider],
        baseUrl: apiBaseUrl(settings.provider, settings.customBaseUrl),
        model: settings.model,
        findConv: () => get().conversations.find((c) => c.id === convId),
        onTitle: async (title) => {
          await touchConversation(convId, title);
          set((s) => ({
            conversations: s.conversations.map((c) => (c.id === convId ? { ...c, title } : c)),
          }));
        },
      });
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
    // 手动改名：取消挂起的自动标题生成（写回前还有 titleCustom 复验兜底）
    titleAbort?.abort();
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
