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

interface SettingsState {
  apiKey: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  searchEnabled: boolean;
  systemPrompt: string;
  theme: Theme;
  setApiKey: (key: string) => void;
  setModel: (model: string) => void;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  setSearchEnabled: (enabled: boolean) => void;
  setSystemPrompt: (prompt: string) => void;
  setTheme: (theme: Theme) => void;
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
      setApiKey: (apiKey) => set({ apiKey: apiKey.trim() }),
      setModel: (model) => set({ model }),
      setReasoningEffort: (reasoningEffort) => set({ reasoningEffort }),
      setSearchEnabled: (searchEnabled) => set({ searchEnabled }),
      setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
      setTheme: (theme) => set({ theme }),
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
