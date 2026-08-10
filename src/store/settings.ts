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
  /** 计价（元/百万 tokens），用于费用估算 */
  pricing?: { input: number; cachedInput: number; output: number };
}

/** 模型常量表：pro 待官方 Responses API 支持后改 enabled 即可 */
export const MODELS: ModelOption[] = [
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
  apiKey: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  searchEnabled: boolean;
  systemPrompt: string;
  theme: Theme;
  promptTemplates: PromptTemplate[];
  defaultTemplateId: string | null;
  setApiKey: (key: string) => void;
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
      apiKey: '',
      model: DEFAULT_MODEL,
      reasoningEffort: 'max',
      searchEnabled: true,
      systemPrompt: '',
      theme: 'auto',
      promptTemplates: DEFAULT_TEMPLATES,
      defaultTemplateId: null,
      setApiKey: (apiKey) => set({ apiKey: apiKey.trim() }),
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
      version: 1,
      // v0 曾使用 medium 档位（非官方档位），迁移为默认 high
      migrate: (state) => {
        const s = state as Partial<SettingsState>;
        if (s.reasoningEffort && !['none', 'low', 'high', 'max'].includes(s.reasoningEffort)) {
          s.reasoningEffort = 'high';
        }
        return s as SettingsState;
      },
    },
  ),
);
