// DeepSeek Responses API 类型定义（按官方兼容性明细裁剪）
// 文档：https://api-docs.deepseek.com/zh-cn/guides/responses_api

export type Role = 'user' | 'assistant' | 'system' | 'developer';

export interface ContentPart {
  type: 'input_text' | 'output_text' | string;
  text?: string;
}

/** message 输出/输入 item */
export interface MessageItem {
  type: 'message';
  id?: string;
  role: Role;
  status?: string;
  content: string | ContentPart[];
}

/** 思维链 item（仅本地展示，不回传） */
export interface ReasoningItem {
  type: 'reasoning';
  id?: string;
  status?: string;
  content?: { type: string; text: string }[];
  summary?: unknown[];
}

/** 服务端联网搜索 item（原样回传，服务端自动恢复搜索结果） */
export interface WebSearchCallItem {
  type: 'web_search_call';
  id?: string;
  status?: 'in_progress' | 'searching' | 'completed' | string;
  action?: { type?: string; query?: string; [k: string]: unknown };
  [k: string]: unknown;
}

export interface FunctionCallItem {
  type: 'function_call';
  id?: string;
  call_id: string;
  name: string;
  arguments: string;
  status?: string;
}

export interface FunctionCallOutputItem {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

export type ResponseItem =
  | MessageItem
  | ReasoningItem
  | WebSearchCallItem
  | FunctionCallItem
  | FunctionCallOutputItem;

/** 官方档位：none 关闭思考模式，默认 high（见思考模式文档） */
export type ReasoningEffort = 'none' | 'low' | 'high' | 'max';

export interface WebSearchTool {
  type: 'web_search';
}

export interface CreateResponseRequest {
  model: string;
  input: ResponseItem[];
  instructions?: string;
  tools?: WebSearchTool[];
  reasoning?: { effort: ReasoningEffort };
  stream: true;
  max_output_tokens?: number;
  temperature?: number;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  total_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
}

export interface ResponseObject {
  id?: string;
  status?: 'completed' | 'incomplete' | 'failed' | 'in_progress' | string;
  output?: ResponseItem[];
  usage?: Usage;
  incomplete_details?: { reason?: string };
  error?: { code?: string; message?: string } | null;
}

/** SSE 流事件（仅列出客户端关心的） */
export interface StreamEvent {
  type: string;
  sequence_number?: number;
  // response.output_item.added / done
  output_index?: number;
  item?: ResponseItem;
  // *.delta / *.done
  delta?: string;
  text?: string;
  item_id?: string;
  content_index?: number;
  // response.completed / incomplete / failed
  response?: ResponseObject;
}

export interface ApiErrorBody {
  error?: { message?: string; type?: string; code?: string };
}
