import { useState } from 'react';
import { MODELS_BY_PROVIDER, PROVIDERS, useSettings, type PromptTemplate, type Theme } from '../store/settings';
import { EFFORTS } from './EffortPicker';

const THEMES: { value: Theme; label: string; hint: string }[] = [
  { value: 'auto', label: '自动', hint: '跟随系统' },
  { value: 'light', label: '浅色', hint: '明亮' },
  { value: 'dark', label: '深色', hint: '护眼' },
];

function newTemplateId(): string {
  return `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function SettingsPage({
  onClose,
  leaving = false,
}: {
  onClose: () => void;
  leaving?: boolean;
}) {
  const settings = useSettings();
  const [keyDraft, setKeyDraft] = useState(settings.apiKeys[settings.provider]);
  const [showKey, setShowKey] = useState(false);
  const provider = PROVIDERS.find((p) => p.value === settings.provider) ?? PROVIDERS[0];
  const models = MODELS_BY_PROVIDER[settings.provider];

  const selectProvider = (value: (typeof PROVIDERS)[number]['value']) => {
    if (value === settings.provider) return;
    settings.setProvider(value);
    // 输入框跟随切换到对应服务的 Key（未保存的 draft 丢弃）
    setKeyDraft(settings.apiKeys[value]);
    // 当前模型在新 provider 不可用 → 回退默认模型
    const available = MODELS_BY_PROVIDER[value].filter((m) => m.enabled).map((m) => m.id);
    if (!available.includes(settings.model)) settings.setModel('deepseek-v4-flash');
  };

  const saveKey = () => {
    settings.setApiKey(keyDraft);
    onClose();
  };

  const updateTemplate = (id: string, patch: Partial<PromptTemplate>) => {
    settings.setPromptTemplates(
      settings.promptTemplates.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
  };

  const removeTemplate = (id: string) => {
    settings.setPromptTemplates(settings.promptTemplates.filter((t) => t.id !== id));
    if (settings.defaultTemplateId === id) settings.setDefaultTemplateId(null);
  };

  const addTemplate = () => {
    settings.setPromptTemplates([
      ...settings.promptTemplates,
      { id: newTemplateId(), label: '新指令', text: '' },
    ]);
  };

  const inputCls =
    'w-full rounded-xl border border-border bg-panel-2 px-3.5 py-2.5 text-sm outline-none focus:border-accent/60';

  return (
    <div
      className={`fixed inset-0 z-50 bg-bg flex flex-col md:flex md:items-center md:justify-center md:bg-black/60 md:backdrop-blur-sm ${
        leaving ? 'settings-exit' : 'settings-enter'
      }`}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col h-full md:h-auto md:max-h-[85vh] w-full md:max-w-lg md:rounded-2xl md:border md:border-border md:bg-panel md:shadow-2xl md:overflow-hidden"
        onClick={(e) => e.stopPropagation()}
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
          <div className="space-y-6">
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
                  className={`${inputCls} flex-1`}
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
                没有 Key？前往{' '}
                <a
                  href="https://platform.deepseek.com/api_keys"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-accent underline underline-offset-2"
                >
                  DeepSeek 开放平台
                </a>{' '}
                创建（需充值余额），或使用 OpenCode Go 订阅的 Key。
              </p>
            </section>

            {/* API 服务 */}
            <section className="space-y-2">
              <h2 className="text-sm font-medium">API 服务</h2>
              <div className="grid grid-cols-2 gap-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => selectProvider(p.value)}
                    className={`rounded-xl border px-3 py-2.5 text-left ${
                      settings.provider === p.value
                        ? 'border-accent/60 bg-accent/10'
                        : 'border-border bg-panel-2 hover:bg-panel-2/80'
                    }`}
                  >
                    <div className="text-sm">{p.label}</div>
                    <div className="text-[12px] text-text-dim mt-0.5 break-all">{p.hint}</div>
                  </button>
                ))}
              </div>
              {settings.provider === 'opencode-go' && (
                <p className="text-xs text-amber-400 leading-relaxed">
                  OpenCode Go 端点未配置浏览器 CORS，无法直连。请选择「自建代理」并部署转发
                  Worker（模板见项目 examples/opencode-go-proxy.js）。
                </p>
              )}
              {settings.provider === 'custom' && (
                <input
                  value={settings.customBaseUrl}
                  onChange={(e) => settings.setCustomBaseUrl(e.target.value)}
                  placeholder="https://你的代理地址/zen/go/v1"
                  autoCapitalize="off"
                  autoCorrect="off"
                  className={`${inputCls}`}
                />
              )}
              <p className="text-xs text-text-dim leading-relaxed">
                每个服务保存各自的 Key，切换后自动跟随。Key 仅保存在你的设备本地，只随请求发送至{' '}
                {provider.baseUrl || settings.customBaseUrl || '你填写的代理端点'}
                ，不经过任何第三方服务器。
              </p>
            </section>

            {/* 模型 */}
            <section className="space-y-2">
              <h2 className="text-sm font-medium">模型</h2>
              <div className="space-y-2">
                {models.map((m) => (
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
                className={`${inputCls} resize-none`}
              />
            </section>

            {/* 指令模板 */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">指令模板</h2>
                <button
                  type="button"
                  onClick={addTemplate}
                  className="text-sm text-accent px-2 py-1 rounded-lg active:bg-accent/10"
                >
                  + 添加
                </button>
              </div>
              <p className="text-xs text-text-dim">
                点击"指令"按钮填入输入框；设为默认的指令会在每次发送时自动作为系统指令带上。
              </p>
              <div className="space-y-2">
                {settings.promptTemplates.map((t) => (
                  <div key={t.id} className="rounded-xl border border-border bg-panel-2 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={t.label}
                        onChange={(e) => updateTemplate(t.id, { label: e.target.value })}
                        className={`${inputCls} flex-1`}
                        placeholder="指令名称"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          settings.setDefaultTemplateId(
                            settings.defaultTemplateId === t.id ? null : t.id,
                          )
                        }
                        className={`shrink-0 px-2.5 py-1.5 rounded-lg text-xs border ${
                          settings.defaultTemplateId === t.id
                            ? 'border-accent/60 text-accent bg-accent/10'
                            : 'border-border text-text-dim'
                        }`}
                      >
                        {settings.defaultTemplateId === t.id ? '默认中' : '设为默认'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTemplate(t.id)}
                        aria-label="删除指令"
                        className="shrink-0 p-1.5 rounded-lg text-text-dim/60 active:text-red-400 hover:text-red-400"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                          <path
                            d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M6.8 7v3.5M9.2 7v3.5"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </div>
                    <textarea
                      value={t.text}
                      onChange={(e) => updateTemplate(t.id, { text: e.target.value })}
                      rows={2}
                      placeholder="指令内容（作为前缀或系统指令）"
                      className={`${inputCls} resize-none text-xs`}
                    />
                  </div>
                ))}
                {settings.promptTemplates.length === 0 && (
                  <div className="text-xs text-text-dim/60 px-1">暂无指令模板</div>
                )}
              </div>
            </section>

            <button
              type="button"
              onClick={saveKey}
              className="w-full rounded-xl bg-accent py-3 text-sm font-medium text-[var(--color-accent-foreground)] active:opacity-90"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
