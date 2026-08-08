import { createParser, type EventSourceMessage } from 'eventsource-parser';

/**
 * 通用 SSE 读取器：POST + 自定义头场景下原生 EventSource 不可用，
 * 用 fetch ReadableStream + eventsource-parser 逐事件解析。
 */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: EventSourceMessage) => void,
  signal?: AbortSignal,
): Promise<void> {
  const parser = createParser({ onEvent });
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      parser.feed(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
}

/** 将 SSE data 载荷解析为 JSON，解析失败返回 null（容错跳过） */
export function parseSseData<T>(data: string): T | null {
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}
