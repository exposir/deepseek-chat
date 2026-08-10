import { readSseStream, parseSseData } from './sse';
import type {
  ApiErrorBody,
  CreateResponseRequest,
  MessageItem,
  ReasoningEffort,
  ResponseItem,
  ResponseObject,
  StreamEvent,
  Usage,
  WebSearchCallItem,
} from './types';

export const API_BASE_URL = 'https://api.deepseek.com';

/** 流式回调：store 层按需订阅 */
export interface StreamCallbacks {
  /** 新输出 item 建立（reasoning / message / web_search_call） */
  onItemAdded?: (item: ResponseItem, outputIndex: number) => void;
  /** 输出 item 完成（携带完整 item，用于落盘） */
  onItemDone?: (item: ResponseItem, outputIndex: number) => void;
  onReasoningDelta?: (delta: string, itemId?: string) => void;
  onTextDelta?: (delta: string, itemId?: string) => void;
  onWebSearchStatus?: (
    status: 'in_progress' | 'searching' | 'completed',
    itemId?: string,
    item?: WebSearchCallItem,
  ) => void;
  onCompleted?: (response: ResponseObject, usage?: Usage) => void;
  onIncomplete?: (response: ResponseObject) => void;
  onFailed?: (response: ResponseObject) => void;
}

/** 请求失败时抛出，携带 HTTP 状态码用于错误 UI 映射 */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface SendParams {
  apiKey: string;
  model: string;
  input: ResponseItem[];
  systemPrompt?: string;
  searchEnabled: boolean;
  reasoningEffort: ReasoningEffort;
}

/** 单个 SSE 事件到回调的映射（导出以便单测） */
export function dispatchStreamEvent(ev: StreamEvent, cb: StreamCallbacks): void {
  switch (ev.type) {
    case 'response.output_item.added':
      if (ev.item) cb.onItemAdded?.(ev.item, ev.output_index ?? 0);
      break;
    case 'response.output_item.done':
      if (ev.item) cb.onItemDone?.(ev.item, ev.output_index ?? 0);
      break;
    case 'response.reasoning_text.delta':
      if (ev.delta) cb.onReasoningDelta?.(ev.delta, ev.item_id);
      break;
    case 'response.output_text.delta':
      if (ev.delta) cb.onTextDelta?.(ev.delta, ev.item_id);
      break;
    case 'response.web_search_call.in_progress':
      cb.onWebSearchStatus?.('in_progress', ev.item_id);
      break;
    case 'response.web_search_call.searching':
      cb.onWebSearchStatus?.('searching', ev.item_id);
      break;
    case 'response.web_search_call.completed':
      cb.onWebSearchStatus?.('completed', ev.item_id, ev.item as WebSearchCallItem | undefined);
      break;
    case 'response.completed':
      if (ev.response) cb.onCompleted?.(ev.response, ev.response.usage);
      break;
    case 'response.incomplete':
      if (ev.response) cb.onIncomplete?.(ev.response);
      break;
    case 'response.failed':
      if (ev.response) cb.onFailed?.(ev.response);
      break;
    default:
      // 其余事件（content_part.*、*.done 文本等）按计划忽略
      break;
  }
}

/**
 * 发起 POST /responses 流式请求。
 * 抛错场景：HTTP 非 2xx（ApiError）、网络错误、AbortError（由调用方识别）。
 */
export async function createResponseStream(
  params: SendParams,
  callbacks: StreamCallbacks,
  signal: AbortSignal,
): Promise<void> {
  const body: CreateResponseRequest = {
    model: params.model,
    input: params.input,
    stream: true,
  };
  if (params.systemPrompt?.trim()) body.instructions = params.systemPrompt.trim();
  if (params.searchEnabled) body.tools = [{ type: 'web_search' }];
  body.reasoning = { effort: params.reasoningEffort };

  const res = await fetch(`${API_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const errBody = (await res.json()) as ApiErrorBody;
      if (errBody.error?.message) message = errBody.error.message;
    } catch {
      // 保留默认 message
    }
    throw new ApiError(res.status, message);
  }
  if (!res.body) throw new ApiError(0, '响应无内容');

  await readSseStream(
    res.body,
    (msg) => {
      const ev = parseSseData<StreamEvent>(msg.data);
      if (ev) dispatchStreamEvent(ev, callbacks);
    },
    signal,
  );
}

/**
 * 历史回传策略（无状态 API）：
 * - 回传 message / web_search_call / function_call / function_call_output，顺序保持不变
 *   （前缀稳定以最大化命中上下文硬盘缓存）
 * - 丢弃 reasoning（仅本地展示，节省输入 token）
 * - 丢弃未完成的 web_search_call（中途停止产生的残留无法被服务端恢复）
 */
export function buildInputItems(history: ResponseItem[], newUserText: string): ResponseItem[] {
  const replayed = history.filter((item) => {
    if (item.type === 'reasoning') return false;
    if (item.type === 'web_search_call') {
      return (item as WebSearchCallItem).status === 'completed';
    }
    return (
      item.type === 'message' ||
      item.type === 'function_call' ||
      item.type === 'function_call_output'
    );
  });
  const userMessage: MessageItem = { type: 'message', role: 'user', content: newUserText };
  return [...replayed, userMessage];
}

/** 从 message item 提取纯文本（content 为字符串或内容块数组） */
export function extractText(item: MessageItem): string {
  if (typeof item.content === 'string') return item.content;
  return item.content
    .filter((p) => p.type === 'output_text' || p.type === 'input_text')
    .map((p) => p.text ?? '')
    .join('');
}
