import { readSseStream, parseSseData } from './sse';
import { PROVIDERS, type Provider } from '../store/settings';
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

/** 按 provider 解析 API 端点（DeepSeek 官方 / OpenCode Go / 自建代理），未知值回退官方 */
export function apiBaseUrl(provider: Provider, customBaseUrl?: string): string {
  if (provider === 'custom') return customBaseUrl?.trim() || '';
  return PROVIDERS.find((p) => p.value === provider)?.baseUrl ?? 'https://api.deepseek.com';
}

/**
 * 给请求信号叠加超时（上游挂起时避免 UI 永远停在连接中）。
 * AbortSignal.any 不可用的环境直接返回原信号（无超时降级）。
 */
function withTimeout(signal: AbortSignal, ms: number): AbortSignal {
  if (typeof AbortSignal.any !== 'function' || typeof AbortSignal.timeout !== 'function') {
    return signal;
  }
  return AbortSignal.any([signal, AbortSignal.timeout(ms)]);
}

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
  baseUrl: string;
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

  const res = await fetch(`${params.baseUrl}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: withTimeout(signal, 120_000),
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

export interface GenerateTitleParams {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** 最近几轮对话拼接（首轮传首条用户消息） */
  context: string;
  /** 会话当前标题：作为主依据，保证标题渐进演化不跑偏 */
  previousTitle?: string;
  signal?: AbortSignal;
}

/**
 * 异步生成会话标题：非流式 + 关闭思考（none）+ 极小输出上限，成本近零。
 * 失败返回 null，调用方保持截断标题兜底。
 */
export async function generateTitle(params: GenerateTitleParams): Promise<string | null> {
  try {
    const content = [
      params.previousTitle ? `会话原有标题：${params.previousTitle}` : '',
      `最近对话：\n${params.context}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    const res = await fetch(`${params.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        instructions:
          '根据会话原有标题和最近对话内容，生成一个简洁的中文会话标题，不超过 15 个字。' +
          '以原有标题为主题主依据，结合最近对话微调，让标题渐进演化而不偏离主题。' +
          '直接输出标题本身，不要引号、书名号和任何标点：',
        input: [{ type: 'message', role: 'user', content }],
        stream: false,
        reasoning: { effort: 'none' },
        max_output_tokens: 24,
      }),
      signal: withTimeout(params.signal ?? new AbortController().signal, 30_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ResponseObject;
    const msg = data.output?.[0] as MessageItem | undefined;
    const text = (msg ? extractText(msg) : '').trim().replace(/[「」"'“”‘’。.!！?？,，]/g, '');
    return text.slice(0, 20) || null;
  } catch {
    return null;
  }
}
