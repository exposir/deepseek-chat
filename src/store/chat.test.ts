import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChat } from './chat';
import { useSettings } from './settings';
import { createResponseStream, generateTitle } from '../api/responses';
import type { StreamCallbacks } from '../api/responses';
import type { ResponseItem, Usage } from '../api/types';
import * as db from '../db';

// —— db 层用内存实现替换（node 环境无 IndexedDB），行为与 Dexie 封装一致 ——
vi.mock('../db', () => {
  const conversations: { id: string; title: string; createdAt: number; updatedAt: number; titleCustom?: boolean }[] = [];
  const items: { convId: string; seq: number; item: ResponseItem; createdAt: number; meta?: unknown }[] = [];
  return {
    listConversations: async () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    createConversation: async (r: { id: string; title: string; createdAt: number; updatedAt: number }) => {
      conversations.push(r);
    },
    touchConversation: async (id: string, title?: string) => {
      const c = conversations.find((x) => x.id === id);
      if (!c) return;
      c.updatedAt = Date.now();
      if (title !== undefined) c.title = title;
    },
    updateConversation: async (id: string, patch: { title?: string; titleCustom?: boolean; updatedAt?: number }) => {
      const c = conversations.find((x) => x.id === id);
      if (c) Object.assign(c, patch);
    },
    deleteConversation: async (id: string) => {
      const i = conversations.findIndex((x) => x.id === id);
      if (i >= 0) conversations.splice(i, 1);
      for (let j = items.length - 1; j >= 0; j--) {
        if (items[j].convId === id) items.splice(j, 1);
      }
    },
    listItems: async (convId: string) =>
      items.filter((x) => x.convId === convId).sort((a, b) => a.seq - b.seq),
    appendItem: async (r: { convId: string; seq: number; item: ResponseItem; createdAt: number }) => {
      items.push(r);
    },
    bulkAddItems: async (rs: { convId: string; seq: number; item: ResponseItem; createdAt: number }[]) => {
      items.push(...rs);
    },
    truncateItems: async (convId: string, fromSeq: number) => {
      for (let j = items.length - 1; j >= 0; j--) {
        if (items[j].convId === convId && items[j].seq >= fromSeq) items.splice(j, 1);
      }
    },
    nextSeq: async (convId: string) => {
      const last = items
        .filter((x) => x.convId === convId)
        .sort((a, b) => a.seq - b.seq)
        .at(-1);
      return (last?.seq ?? -1) + 1;
    },
    conversationExists: async (id: string) => conversations.some((x) => x.id === id),
    __reset: () => {
      conversations.length = 0;
      items.length = 0;
    },
  };
});

// —— API 层：保留纯函数（ApiError 等），只替换流与标题生成 ——
vi.mock('../api/responses', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/responses')>();
  return {
    ...actual,
    createResponseStream: vi.fn(),
    generateTitle: vi.fn(),
  };
});

const mockedStream = vi.mocked(createResponseStream);
const mockedTitle = vi.mocked(generateTitle);

/** 构造一个标准完整流：reasoning + message + completed */
function emitCompleteStream(cb: StreamCallbacks, usage: Usage = { input_tokens: 10, output_tokens: 5 }): void {
  cb.onItemAdded?.({ type: 'reasoning', id: 'r1', content: [] } as ResponseItem, 0);
  cb.onReasoningDelta?.('思考', 'r1');
  cb.onItemAdded?.({ type: 'message', id: 'm1', role: 'assistant', content: [] } as ResponseItem, 1);
  cb.onTextDelta?.('你好', 'm1');
  cb.onItemDone?.({ type: 'message', id: 'm1', role: 'assistant', content: '你好' } as ResponseItem, 1);
  cb.onCompleted?.({ status: 'completed' } as never, usage);
}

const convA = { id: 'a', title: '新对话', createdAt: 1, updatedAt: 1 };

function resetChatState(): void {
  useChat.setState({
    conversations: [],
    activeConvId: null,
    items: [],
    streamBlocks: [],
    isStreaming: false,
    error: null,
    drawerOpen: false,
    draft: null,
  });
}

beforeEach(async () => {
  (db as unknown as { __reset: () => void }).__reset();
  // 会话先写入 db（真实流程由 init 落库），再同步到 UI 状态
  await db.createConversation({ ...convA });
  resetChatState();
  useChat.setState({ conversations: [{ ...convA }], activeConvId: 'a' });
  useSettings.setState({
    provider: 'deepseek',
    apiKeys: { deepseek: 'sk-test', opencode: '', custom: '' },
  });
  mockedStream.mockReset();
  mockedTitle.mockReset();
  mockedTitle.mockResolvedValue(null);
});

describe('send 流式发送', () => {
  it('完整流：用户消息与输出块落库、usage 标在最后 message、释放流式锁', async () => {
    mockedStream.mockImplementation(async (_p, cb) => {
      emitCompleteStream(cb);
    });

    await useChat.getState().send('第一问');

    const items = useChat.getState().items;
    expect(items).toHaveLength(3);
    expect(items[0].item).toMatchObject({ type: 'message', role: 'user', content: '第一问' });
    expect(items[1].item).toMatchObject({ type: 'reasoning', content: [{ text: '思考' }] });
    expect(items[2].item).toMatchObject({ type: 'message', role: 'assistant', content: '你好' });
    expect(useChat.getState().isStreaming).toBe(false);
    // usage 标记在最后的 message 上
    expect(items[2].meta?.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
    // 首轮触发标题演进
    expect(mockedTitle).toHaveBeenCalledTimes(1);
  });

  it('流中切会话：落库写旧会话、标题上下文用闭包数据（不串号）', async () => {
    let release: (() => void) | undefined;
    mockedStream.mockImplementation(async (_p, cb) => {
      cb.onItemAdded?.({ type: 'message', id: 'm1', role: 'assistant', content: [] } as ResponseItem, 0);
      cb.onTextDelta?.('正在生成', 'm1');
      await new Promise<void>((r) => {
        release = r;
      });
      cb.onItemDone?.({ type: 'message', id: 'm1', role: 'assistant', content: '正在生成' } as ResponseItem, 0);
      cb.onCompleted?.({ status: 'completed' } as never, { input_tokens: 5, output_tokens: 3 });
    });
    const titleParams: { context: string }[] = [];
    mockedTitle.mockImplementation(async (p: { context: string }) => {
      titleParams.push(p);
      return '会话A标题';
    });

    const sendPromise = useChat.getState().send('问题A');
    await vi.waitFor(() => expect(release).toBeDefined());
    // 流挂起时切到新会话 B
    await useChat.getState().newConversation();
    release!();
    await sendPromise;

    // 落库写在旧会话 A（含用户消息 + 助手回复）
    const itemsA = await db.listItems('a');
    expect(itemsA.filter((r) => r.item.type === 'message')).toHaveLength(2);
    // 标题上下文是旧会话的闭包数据，不因切走而丢失或串号
    expect(titleParams).toHaveLength(1);
    expect(titleParams[0].context).toContain('问题A');
    // 标题写回旧会话
    const convs = await db.listConversations();
    expect(convs.find((c) => c.id === 'a')?.title).toBe('会话A标题');
    // UI 已切到 B，不被旧会话收尾污染
    expect(useChat.getState().activeConvId).not.toBe('a');
    expect(useChat.getState().isStreaming).toBe(false);
  });

  it('流中删除会话：收尾跳过落库，无孤儿数据', async () => {
    let release: (() => void) | undefined;
    mockedStream.mockImplementation(async (_p, cb) => {
      cb.onItemAdded?.({ type: 'message', id: 'm1', role: 'assistant', content: [] } as ResponseItem, 0);
      cb.onTextDelta?.('x', 'm1');
      await new Promise<void>((r) => {
        release = r;
      });
      cb.onItemDone?.({ type: 'message', id: 'm1', role: 'assistant', content: 'x' } as ResponseItem, 0);
      cb.onCompleted?.({ status: 'completed' } as never, { input_tokens: 1, output_tokens: 1 });
    });

    const sendPromise = useChat.getState().send('问题');
    await vi.waitFor(() => expect(release).toBeDefined());
    // 流挂起时删除会话 A（删除后自动新建 B 并激活）
    await useChat.getState().removeConversation('a');
    release!();
    await sendPromise;

    // 已删除会话不产生任何新记录（孤儿数据）
    expect(await db.listItems('a')).toEqual([]);
    // 新会话 B 正常存在
    const convs = await db.listConversations();
    expect(convs).toHaveLength(1);
    expect(convs[0].id).not.toBe('a');
  });

  it('手动重命名后，挂起的自动标题不覆盖手动标题', async () => {
    mockedStream.mockImplementation(async (_p, cb) => {
      emitCompleteStream(cb);
    });
    let releaseTitle: ((t: string | null) => void) | undefined;
    mockedTitle.mockImplementation(
      () =>
        new Promise<string | null>((r) => {
          releaseTitle = r;
        }),
    );

    const sendPromise = useChat.getState().send('问题');
    await vi.waitFor(() => expect(releaseTitle).toBeDefined());
    // 标题生成挂起中，用户手动改名
    await useChat.getState().renameConversation('a', '手动标题');
    releaseTitle!('AI 标题');
    await sendPromise;

    const convs = await db.listConversations();
    expect(convs.find((c) => c.id === 'a')?.title).toBe('手动标题');
  });

  it('无 API Key：error 为 no-key 判别，不发请求', async () => {
    useSettings.setState({ apiKeys: { deepseek: '', opencode: '', custom: '' } });

    await useChat.getState().send('问题');

    expect(useChat.getState().error).toEqual({ kind: 'no-key' });
    expect(mockedStream).not.toHaveBeenCalled();
  });

  it('custom provider 未填代理地址：明确报错，不发请求', async () => {
    useSettings.setState({
      provider: 'custom',
      customBaseUrl: '',
      apiKeys: { deepseek: 'sk-test', opencode: '', custom: 'sk-c' },
    });

    await useChat.getState().send('问题');

    expect(useChat.getState().error).toEqual({
      kind: 'message',
      text: '请先在设置页填写自建代理地址',
    });
    expect(mockedStream).not.toHaveBeenCalled();
  });
});
