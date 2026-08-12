import { describe, expect, it } from 'vitest';
import { finalizeStreamBlocks } from './finalize';
import type { StreamBlock } from './chat';

describe('finalizeStreamBlocks 流式收尾', () => {
  const reasoning = (text: string): StreamBlock => ({
    key: 'r1',
    itemId: 'ritem',
    type: 'reasoning',
    text,
  });
  const message = (text: string): StreamBlock => ({
    key: 'm1',
    itemId: 'mitem',
    type: 'message',
    text,
  });

  it('有 finalItem 的块原样落库，seq 连续', () => {
    const records = finalizeStreamBlocks({
      convId: 'c1',
      startSeq: 3,
      createdAt: 1000,
      blocks: [
        {
          key: 'w1',
          itemId: 'witem',
          type: 'web_search_call',
          text: '',
          searchStatus: 'completed',
          action: { queries: ['x'] },
          finalItem: {
            type: 'web_search_call',
            id: 'witem',
            status: 'completed',
            action: { queries: ['x'] },
          },
        },
        { key: 'a1', itemId: 'aitem', type: 'message', text: 'x', finalItem: { type: 'message', role: 'assistant', id: 'aitem', content: '答复' } },
      ],
    });
    expect(records).toHaveLength(2);
    expect(records[0].seq).toBe(3);
    expect(records[1].seq).toBe(4);
    expect(records[0].item).toEqual(expect.objectContaining({ type: 'web_search_call', status: 'completed' }));
    expect(records[1].item).toEqual(expect.objectContaining({ role: 'assistant', content: '答复' }));
  });

  it('空文本 reasoning / message 块跳过且不消耗 seq', () => {
    const records = finalizeStreamBlocks({
      convId: 'c1',
      startSeq: 0,
      createdAt: 1000,
      blocks: [reasoning(''), message(''), reasoning('想了'), message('说了')],
    });
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.seq)).toEqual([0, 1]);
    expect(records[0].item).toMatchObject({ type: 'reasoning', content: [{ text: '想了' }] });
    expect(records[1].item).toMatchObject({ type: 'message', role: 'assistant', content: '说了' });
  });

  it('未完成的 web_search_call 落库保留 status 与 action（回传时过滤）', () => {
    const records = finalizeStreamBlocks({
      convId: 'c1',
      startSeq: 0,
      createdAt: 1000,
      blocks: [
        {
          key: 'w1',
          itemId: 'witem',
          type: 'web_search_call',
          text: '',
          searchStatus: 'searching',
          action: { queries: ['新闻'] },
        },
      ],
    });
    expect(records).toHaveLength(1);
    expect(records[0].item).toMatchObject({
      type: 'web_search_call',
      status: 'searching',
      action: { queries: ['新闻'] },
    });
  });

  it('usage/interrupted/error 只标记在最后一个实际落库的记录', () => {
    const records = finalizeStreamBlocks({
      convId: 'c1',
      startSeq: 0,
      createdAt: 1000,
      blocks: [reasoning('r'), message('m'), reasoning('')],
      usage: { input_tokens: 10, output_tokens: 5 },
      interrupted: true,
      failed: '用户停止',
    });
    expect(records).toHaveLength(2);
    expect(records[0].meta).toBeUndefined();
    expect(records[1].meta).toEqual({
      usage: { input_tokens: 10, output_tokens: 5 },
      interrupted: true,
      error: '用户停止',
    });
  });

  it('空块列表返回空数组（未生成任何内容）', () => {
    expect(finalizeStreamBlocks({ convId: 'c1', startSeq: 5, createdAt: 1000, blocks: [] })).toEqual([]);
  });
});
