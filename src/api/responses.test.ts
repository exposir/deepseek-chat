import { describe, expect, it } from 'vitest';
import { readSseStream, parseSseData } from './sse';
import { buildInputItems, dispatchStreamEvent, extractText, type StreamCallbacks } from './responses';
import type { MessageItem, ResponseItem, StreamEvent } from './types';

/** 把事件序列编码为 SSE 字节流 */
function sseStream(events: { event: string; data: unknown }[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const payload = events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join('');
  return new ReadableStream({
    start(controller) {
      // 故意按 7 字节小块推送，验证跨 chunk 解析
      const bytes = encoder.encode(payload);
      for (let i = 0; i < bytes.length; i += 7) {
        controller.enqueue(bytes.slice(i, i + 7));
      }
      controller.close();
    },
  });
}

/** 收集器：把回调调用记录为时间线 */
function makeCollector() {
  const timeline: string[] = [];
  let reasoning = '';
  let text = '';
  let usageTokens = -1;
  let failMsg = '';
  let incompleteReason = '';
  const cb: StreamCallbacks = {
    onItemAdded: (item) => timeline.push(`added:${item.type}`),
    onItemDone: (item) => timeline.push(`done:${item.type}`),
    onReasoningDelta: (d) => {
      reasoning += d;
    },
    onTextDelta: (d) => {
      text += d;
    },
    onWebSearchStatus: (s) => timeline.push(`search:${s}`),
    onCompleted: (_r, u) => {
      timeline.push('completed');
      usageTokens = u?.output_tokens ?? -1;
    },
    onIncomplete: (r) => {
      timeline.push('incomplete');
      incompleteReason = r.incomplete_details?.reason ?? '';
    },
    onFailed: (r) => {
      timeline.push('failed');
      failMsg = r.error?.message ?? '';
    },
  };
  return {
    cb,
    timeline,
    get reasoning() {
      return reasoning;
    },
    get text() {
      return text;
    },
    get usageTokens() {
      return usageTokens;
    },
    get failMsg() {
      return failMsg;
    },
    get incompleteReason() {
      return incompleteReason;
    },
  };
}

async function run(events: { event: string; data: unknown }[], cb: StreamCallbacks) {
  await readSseStream(sseStream(events), (msg) => {
    const ev = parseSseData<StreamEvent>(msg.data);
    if (ev) dispatchStreamEvent(ev, cb);
  });
}

describe('SSE 流解析', () => {
  it('正常流：reasoning + message + usage', async () => {
    const c = makeCollector();
    await run(
      [
        { event: 'response.created', data: { type: 'response.created', sequence_number: 0 } },
        {
          event: 'response.output_item.added',
          data: { type: 'response.output_item.added', output_index: 0, item: { type: 'reasoning', id: 'r1' } },
        },
        { event: 'response.reasoning_text.delta', data: { type: 'response.reasoning_text.delta', item_id: 'r1', delta: '思考' } },
        { event: 'response.reasoning_text.delta', data: { type: 'response.reasoning_text.delta', item_id: 'r1', delta: '中' } },
        {
          event: 'response.output_item.done',
          data: { type: 'response.output_item.done', output_index: 0, item: { type: 'reasoning', id: 'r1', content: [{ type: 'reasoning_text', text: '思考中' }] } },
        },
        {
          event: 'response.output_item.added',
          data: { type: 'response.output_item.added', output_index: 1, item: { type: 'message', id: 'm1', role: 'assistant', content: [] } },
        },
        { event: 'response.output_text.delta', data: { type: 'response.output_text.delta', item_id: 'm1', delta: '你好' } },
        { event: 'response.output_text.delta', data: { type: 'response.output_text.delta', item_id: 'm1', delta: '！' } },
        {
          event: 'response.output_item.done',
          data: { type: 'response.output_item.done', output_index: 1, item: { type: 'message', id: 'm1', role: 'assistant', content: [{ type: 'output_text', text: '你好！' }] } },
        },
        {
          event: 'response.completed',
          data: { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 10, output_tokens: 5 } } },
        },
      ],
      c.cb,
    );
    expect(c.timeline).toEqual([
      'added:reasoning',
      'done:reasoning',
      'added:message',
      'done:message',
      'completed',
    ]);
    expect(c.reasoning).toBe('思考中');
    expect(c.text).toBe('你好！');
    expect(c.usageTokens).toBe(5);
  });

  it('搜索流：web_search_call 状态推进', async () => {
    const c = makeCollector();
    await run(
      [
        {
          event: 'response.output_item.added',
          data: { type: 'response.output_item.added', output_index: 0, item: { type: 'web_search_call', id: 'ws1', status: 'in_progress' } },
        },
        { event: 'response.web_search_call.in_progress', data: { type: 'response.web_search_call.in_progress', item_id: 'ws1' } },
        { event: 'response.web_search_call.searching', data: { type: 'response.web_search_call.searching', item_id: 'ws1' } },
        { event: 'response.web_search_call.completed', data: { type: 'response.web_search_call.completed', item_id: 'ws1' } },
        {
          event: 'response.output_item.done',
          data: { type: 'response.output_item.done', output_index: 0, item: { type: 'web_search_call', id: 'ws1', status: 'completed', action: { type: 'search', query: '今日新闻' } } },
        },
      ],
      c.cb,
    );
    expect(c.timeline).toEqual([
      'added:web_search_call',
      'search:in_progress',
      'search:searching',
      'search:completed',
      'done:web_search_call',
    ]);
  });

  it('失败流：response.failed 携带错误详情', async () => {
    const c = makeCollector();
    await run(
      [
        {
          event: 'response.failed',
          data: { type: 'response.failed', response: { status: 'failed', error: { code: 'server_error', message: '内部错误' } } },
        },
      ],
      c.cb,
    );
    expect(c.timeline).toEqual(['failed']);
    expect(c.failMsg).toBe('内部错误');
  });

  it('截断流：response.incomplete 带原因', async () => {
    const c = makeCollector();
    await run(
      [
        { event: 'response.output_text.delta', data: { type: 'response.output_text.delta', delta: '部分内容' } },
        {
          event: 'response.incomplete',
          data: { type: 'response.incomplete', response: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } } },
        },
      ],
      c.cb,
    );
    expect(c.text).toBe('部分内容');
    expect(c.incompleteReason).toBe('max_output_tokens');
  });

  it('容错：非 JSON data 与未知事件被跳过', async () => {
    const c = makeCollector();
    const encoder = new TextEncoder();
    const raw = 'event: weird\ndata: not-json\n\nevent: response.unknown\ndata: {"type":"response.unknown"}\n\n';
    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(encoder.encode(raw));
        ctrl.close();
      },
    });
    await readSseStream(stream, (msg) => {
      const ev = parseSseData<StreamEvent>(msg.data);
      if (ev) dispatchStreamEvent(ev, c.cb);
    });
    expect(c.timeline).toEqual([]);
  });
});

describe('buildInputItems 历史重放', () => {
  const user = (t: string): ResponseItem => ({ type: 'message', role: 'user', content: t });
  const assistant = (t: string): ResponseItem => ({
    type: 'message',
    role: 'assistant',
    content: [{ type: 'output_text', text: t }],
  });

  it('保序回传 message，末尾追加新 user 消息', () => {
    const history: ResponseItem[] = [user('a'), assistant('b')];
    const input = buildInputItems(history, 'c');
    expect(input).toHaveLength(3);
    expect(input[0]).toEqual(user('a'));
    expect(input[1]).toEqual(assistant('b'));
    expect(input[2]).toEqual({ type: 'message', role: 'user', content: 'c' });
  });

  it('丢弃 reasoning，保留 completed 的 web_search_call', () => {
    const history: ResponseItem[] = [
      user('查天气'),
      { type: 'reasoning', id: 'r1', content: [{ type: 'reasoning_text', text: '想一想' }] },
      { type: 'web_search_call', id: 'ws1', status: 'completed', action: { query: '天气' } },
      assistant('晴'),
    ];
    const input = buildInputItems(history, '明天呢');
    expect(input.map((i) => i.type)).toEqual(['message', 'web_search_call', 'message', 'message']);
  });

  it('丢弃未完成的 web_search_call（中断残留）', () => {
    const history: ResponseItem[] = [
      user('查新闻'),
      { type: 'web_search_call', id: 'ws1', status: 'searching' },
    ];
    const input = buildInputItems(history, '继续');
    expect(input.map((i) => i.type)).toEqual(['message', 'message']);
  });

  it('extractText 兼容字符串与内容块两种 content', () => {
    expect(extractText({ type: 'message', role: 'user', content: 'abc' })).toBe('abc');
    const m: MessageItem = {
      type: 'message',
      role: 'assistant',
      content: [
        { type: 'output_text', text: 'x' },
        { type: 'output_text', text: 'y' },
      ],
    };
    expect(extractText(m)).toBe('xy');
  });
});
