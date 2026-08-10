import { useState } from 'react';
import { MODELS, useSettings, type Theme } from '../store/settings';
import { EFFORTS } from './EffortPicker';

const THEMES: { value: Theme; label: string; hint: string }[] = [
  { value: 'auto', label: '自动', hint: '跟随系统' },
  { value: 'light', label: '浅色', hint: '明亮' },
  { value: 'dark', label: '深色', hint: '护眼' },
];

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const settings = useSettings();
  const [keyDraft, setKeyDraft] = useState(settings.apiKey);
  const [showKey, setShowKey] = useState(false);

  const saveKey = () => {
    settings.setApiKey(keyDraft);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-bg flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 -ml-1.5 rounded-lg text-text-dim"
          aria-label="返回"
        >
          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none">
            <path
              d="M12.5 4L6.5 10l6 6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <h1 className="font-semibold">设置</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 safe-bottom">
        <div className="mx-auto max-w-2xl md:max-w-5xl space-y-6">
          {/* API Key */}
          <section className="space-y-2">
            <h2 className="text-sm font-medium">DeepSeek API Key</h2>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
                className="flex-1 rounded-xl border border-border bg-panel-2 px-3.5 py-2.5 text-sm outline-none focus:border-accent/60"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="px-3 rounded-xl border border-border text-xs text-text-dim"
              >
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
            <p className="text-xs text-text-dim leading-relaxed">
              Key 仅保存在你的设备本地，只随请求发送至 api.deepseek.com，不经过任何第三方服务器。
              没有 Key？前往{' '}
              <a
                href="https://platform.deepseek.com/api_keys"
                target="_blank"
                rel="noreferrer noopener"
                className="text-accent underline underline-offset-2"
              >
                DeepSeek 开放平台
              </a>{' '}
              创建（需充值余额）。
            </p>
          </section>

          {/* 模型 */}
          <section className="space-y-2">
            <h2 className="text-sm font-medium">模型</h2>
            <div className="space-y-2">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={!m.enabled}
                  onClick={() => settings.setModel(m.id)}
                  className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-3 text-left ${
                    settings.model === m.id
                      ? 'border-accent/60 bg-accent/10'
                      : 'border-border bg-panel-2 hover:bg-panel-2/80'
                  } ${m.enabled ? '' : 'opacity-50'}`}
                >
                  <div>
                    <div className="text-sm">{m.label}</div>
                    {!m.enabled && m.disabledReason && (
                      <div className="text-[12px] text-text-dim mt-0.5">{m.disabledReason}</div>
                    )}
                  </div>
                  {settings.model === m.id && (
                    <svg className="w-4 h-4 text-accent" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M3 8.5L6.5 12L13 4.5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* 思考模式 / 推理强度 */}
          <section className="space-y-2">
            <h2 className="text-sm font-medium">思考模式（推理强度）</h2>
            <div className="grid grid-cols-4 gap-2">
              {EFFORTS.map((e) => (
                <button
                  key={e.value}
                  type="button"
                  onClick={() => settings.setReasoningEffort(e.value)}
                  className={`rounded-xl border px-3 py-2.5 ${
                    settings.reasoningEffort === e.value
                      ? 'border-accent/60 bg-accent/10'
                      : 'border-border bg-panel-2 hover:bg-panel-2/80'
                  }`}
                >
                  <div className="text-sm">{e.label}</div>
                  <div className="text-[12px] text-text-dim mt-0.5">{e.hint}</div>
                </button>
              ))}
            </div>
          </section>

          {/* 主题 */}
          <section className="space-y-2">
            <h2 className="text-sm font-medium">主题（背景色）</h2>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => settings.setTheme(t.value)}
                  className={`rounded-xl border px-3 py-2.5 ${
                    settings.theme === t.value
                      ? 'border-accent/60 bg-accent/10'
                      : 'border-border bg-panel-2 hover:bg-panel-2/80'
                  }`}
                >
                  <div className="text-sm">{t.label}</div>
                  <div className="text-[12px] text-text-dim mt-0.5">{t.hint}</div>
                </button>
              ))}
            </div>
          </section>

          {/* 联网搜索默认开关 */}
          <section className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium">联网搜索</h2>
              <p className="text-xs text-text-dim mt-0.5">由 DeepSeek 服务端执行搜索</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.searchEnabled}
              onClick={() => settings.setSearchEnabled(!settings.searchEnabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                settings.searchEnabled ? 'bg-accent' : 'bg-panel-2 border border-border'
              }`}
            >
              <span
                className={`absolute left-0 top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  settings.searchEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </section>

          {/* 系统提示词 */}
          <section className="space-y-2">
            <h2 className="text-sm font-medium">系统提示词（可选）</h2>
            <textarea
              value={settings.systemPrompt}
              onChange={(e) => settings.setSystemPrompt(e.target.value)}
              rows={3}
              placeholder="例如：你是一个简洁专业的中文助手"
              className="w-full resize-none rounded-xl border border-border bg-panel-2 px-3.5 py-2.5 text-sm outline-none focus:border-accent/60"
            />
          </section>

          <button
            type="button"
            onClick={saveKey}
            className="w-full rounded-xl bg-accent py-3 text-sm font-medium text-white active:opacity-90"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
