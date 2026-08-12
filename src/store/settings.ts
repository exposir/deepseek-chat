import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ReasoningEffort } from '../api/types';

export interface ModelOption {
  id: string;
  label: string;
  enabled: boolean;
  disabledReason?: string;
  /** 模型上下文窗口（tokens），用于进度显示 */
  contextWindow?: number;
  /** 计价（元/百万 tokens），用于费用估算；订阅制服务（OpenCode Go）不填则不显示费用 */
  pricing?: { input: number; cachedInput: number; output: number };
}

/** API 服务商：决定端点、可用模型与费用展示 */
export type Provider = 'deepseek' | 'opencode' | 'custom';

export interface ProviderOption {
  value: Provider;
  label: string;
  hint: string;
  /** 浏览器直连端点；custom 为空，由用户在设置页填写代理地址 */
  baseUrl: string;
}

export const PROVIDERS: ProviderOption[] = [
  {
    value: 'deepseek',
    label: 'DeepSeek 官方',
    hint: 'api.deepseek.com',
    baseUrl: 'https://api.deepseek.com',
  },
  {
    value: 'opencode',
    label: 'OpenCode',
    hint: 'opencode-go-proxy.8972052852972.workers.dev（自建代理转发）',
    baseUrl: 'https://opencode-go-proxy.8972052852972.workers.dev',
  },
  {
    value: 'custom',
    label: '自建代理',
    hint: 'Cloudflare Worker / 任意反向代理地址',
    baseUrl: '',
  },
];

/** DeepSeek 官方：pro 待官方 Responses API 支持后改 enabled 即可 */
const DEEPSEEK_MODELS: ModelOption[] = [
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    enabled: true,
    contextWindow: 1_000_000,
    pricing: { input: 1, cachedInput: 0.02, output: 2 },
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    enabled: false,
    disabledReason: 'Responses API 支持后开放（官方预计 2026 年 8 月初）',
    contextWindow: 1_000_000,
    pricing: { input: 3, cachedInput: 0.025, output: 6 },
  },
];

/** OpenCode Go（订阅制）：pro 已可用；pricing 留空则设置页不显示费用估算 */
const OPENCODE_GO_MODELS: ModelOption[] = [
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    enabled: true,
    contextWindow: 1_000_000,
  },
  {
    id: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    enabled: true,
    contextWindow: 1_000_000,
  },
];

export const MODELS_BY_PROVIDER: Record<Provider, ModelOption[]> = {
  deepseek: DEEPSEEK_MODELS,
  // OpenCode（走自建代理）与自建代理：均按 OpenCode Go 模型表
  opencode: OPENCODE_GO_MODELS,
  custom: OPENCODE_GO_MODELS,
};

export const DEFAULT_MODEL = 'deepseek-v4-flash';

/** 主题：auto 跟随系统，light/dark 手动指定 */
export type Theme = 'auto' | 'light' | 'dark';

/** 指令模板：点击填入输入框；可设为默认，每次发送自动并入系统提示 */
export interface PromptTemplate {
  id: string;
  label: string;
  text: string;
}

/** 内置默认指令模板 */
export const DEFAULT_TEMPLATES: PromptTemplate[] = [
  { id: 'tpl-translate', label: '翻译', text: '把下面的内容翻译成中文（保留格式）：\n\n' },
  { id: 'tpl-summary', label: '总结', text: '用三句话总结下面这段文字的核心要点：\n\n' },
  { id: 'tpl-rewrite', label: '改写', text: '改写下面这段文字，让它更简洁、更专业：\n\n' },
  { id: 'tpl-code', label: '写代码', text: '用 Python 写一个：\n\n' },
  { id: 'tpl-explain', label: '解释代码', text: '解释下面这段代码的作用和每部分原理：\n\n' },
  { id: 'tpl-brainstorm', label: '头脑风暴', text: '关于下面这个主题，给我 10 个有创意的想法：\n\n' },
];

interface SettingsState {
  /** 各 API 服务的 Key 分开保存（切换服务自动跟随） */
  apiKeys: Record<Provider, string>;
  provider: Provider;
  /** 自建代理的端点（仅 provider=custom 时使用） */
  customBaseUrl: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  searchEnabled: boolean;
  systemPrompt: string;
  theme: Theme;
  promptTemplates: PromptTemplate[];
  defaultTemplateId: string | null;
  /** 写入当前 provider 对应的 Key */
  setApiKey: (key: string) => void;
  setProvider: (provider: Provider) => void;
  setCustomBaseUrl: (url: string) => void;
  setModel: (model: string) => void;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  setSearchEnabled: (enabled: boolean) => void;
  setSystemPrompt: (prompt: string) => void;
  setTheme: (theme: Theme) => void;
  setPromptTemplates: (templates: PromptTemplate[]) => void;
  setDefaultTemplateId: (id: string | null) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      apiKeys: { deepseek: '', opencode: '', custom: '' },
      provider: 'deepseek',
      customBaseUrl: '',
      model: DEFAULT_MODEL,
      reasoningEffort: 'max',
      searchEnabled: true,
      systemPrompt: '',
      theme: 'auto',
      promptTemplates: DEFAULT_TEMPLATES,
      defaultTemplateId: null,
      setApiKey: (key) =>
        set((s) => ({ apiKeys: { ...s.apiKeys, [s.provider]: key.trim() } })),
      setProvider: (provider) => set({ provider }),
      setCustomBaseUrl: (customBaseUrl) => set({ customBaseUrl: customBaseUrl.trim().replace(/\/$/, '') }),
      setModel: (model) => set({ model }),
      setReasoningEffort: (reasoningEffort) => set({ reasoningEffort }),
      setSearchEnabled: (searchEnabled) => set({ searchEnabled }),
      setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
      setTheme: (theme) => set({ theme }),
      setPromptTemplates: (promptTemplates) => set({ promptTemplates }),
      setDefaultTemplateId: (defaultTemplateId) => set({ defaultTemplateId }),
    }),
    {
      name: 'ds-chat-settings',
      version: 3,
      // v3：'opencode-go' provider 更名为 'opencode'（直连 opencode.ai 无 CORS，改为指向自建代理端点）；
      // v2：单一 apiKey 迁移为按 provider 分仓；v0 的 medium 档位迁移为 high
      migrate: (state, version) => {
        const s = state as Partial<SettingsState> & { apiKey?: string };
        if (version < 2) {
          // 旧单一 apiKey → deepseek 槽位；'opencode-go' 旧 provider/key 迁移到 'opencode'
          const oldKeys = s.apiKeys as Partial<Record<string, string>> | undefined;
          s.apiKeys = {
            deepseek: s.apiKey ?? oldKeys?.deepseek ?? '',
            opencode: oldKeys?.['opencode-go'] ?? '',
            custom: oldKeys?.custom ?? '',
          };
          delete s.apiKey;
        }
        // 旧存档（v1/v2）的 provider 可能是 'opencode-go'，迁移到 'opencode'
        if ((s as { provider?: string }).provider === 'opencode-go') s.provider = 'opencode';
        if (!s.apiKeys || typeof s.apiKeys !== 'object') {
          s.apiKeys = { deepseek: '', opencode: '', custom: '' };
        }
        if (!s.apiKeys.opencode) {
          // v2 存档可能仍带 'opencode-go' 槽位
          s.apiKeys.opencode = (s.apiKeys as Record<string, string>)['opencode-go'] ?? '';
        }
        if (!s.apiKeys.custom) s.apiKeys.custom = '';
        if (!s.customBaseUrl) s.customBaseUrl = '';
        if (s.reasoningEffort && !['none', 'low', 'high', 'max'].includes(s.reasoningEffort)) {
          s.reasoningEffort = 'high';
        }
        if (!s.provider || !['deepseek', 'opencode', 'custom'].includes(s.provider)) {
          s.provider = 'deepseek';
        }
        return s as SettingsState;
      },
    },
  ),
);
