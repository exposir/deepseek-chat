import { useRef, useState } from 'react';
import { MODELS_BY_PROVIDER, PROVIDERS, useSettings, DEFAULT_MODEL, type Provider } from '../store/settings';
import { Popover, menuPosition, type MenuPos } from './Popover';

/**
 * 输入区模型/服务快速选择：按钮显示当前模型简称，
 * 点击弹出二级菜单：切换 API 服务（provider）与当前服务下的模型。
 */
export function ModelPicker() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const btnRef = useRef<HTMLDivElement>(null);
  const provider = useSettings((s) => s.provider);
  const model = useSettings((s) => s.model);
  const setProvider = useSettings((s) => s.setProvider);
  const setModel = useSettings((s) => s.setModel);

  const models = MODELS_BY_PROVIDER[provider];
  const providerLabel = PROVIDERS.find((p) => p.value === provider)?.label ?? provider;

  const openMenu = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos(menuPosition(rect, 256, window.innerWidth, window.innerHeight));
    setOpen(true);
  };

  const switchProvider = (p: Provider) => {
    if (p === provider) return;
    setProvider(p);
    // 当前模型在新服务不可用 → 回退默认；菜单保持打开，展示新服务的模型列表
    const available = MODELS_BY_PROVIDER[p].filter((m) => m.enabled).map((m) => m.id);
    if (!available.includes(model)) setModel(DEFAULT_MODEL);
  };

  return (
    <div className="relative" ref={btnRef}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-label="模型与服务"
        className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 md:px-3 md:py-1.5 text-xs md:text-[13px] text-text-dim hover:bg-panel-2 transition-colors"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5.5 7l1.5 1.5L10 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 13h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        {providerLabel}
      </button>
      {open && (
        <Popover pos={pos} widthClass="w-64" onClose={() => setOpen(false)}>
          <div className="px-2.5 pt-1.5 pb-1 text-[11px] text-text-dim/60">API 服务</div>
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="menuitem"
              onClick={() => switchProvider(p.value)}
              className={`w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-panel-2/60 ${
                provider === p.value ? 'text-accent' : 'text-text'
              }`}
            >
              <span>
                <span className="text-xs font-medium">{p.label}</span>
                {p.hint && <span className="block text-[11px] text-text-dim break-all">{p.hint}</span>}
              </span>
              {provider === p.value && (
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8.5l3.5 3.5L13 5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          ))}
          <div className="px-2.5 pt-1.5 pb-1 text-[11px] text-text-dim/60">模型</div>
          {models.map((m) => (
            <button
              key={m.id}
              type="button"
              role="menuitem"
              disabled={!m.enabled}
              onClick={() => {
                setModel(m.id);
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-panel-2/60 disabled:opacity-50 ${
                model === m.id ? 'text-accent' : 'text-text'
              }`}
            >
              <span>
                <span className="text-xs font-medium">{m.label}</span>
                {m.disabledReason && (
                  <span className="block text-[11px] text-text-dim">{m.disabledReason}</span>
                )}
                {m.searchSupported === false && (
                  <span className="block text-[11px] text-text-dim/60">不支持联网搜索</span>
                )}
              </span>
              {model === m.id && (
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8.5l3.5 3.5L13 5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          ))}
          {provider === 'custom' && (
            <div className="px-2.5 py-1.5 text-[11px] text-text-dim/60 leading-relaxed">
              代理端点在设置页「自建代理」中填写
            </div>
          )}
        </Popover>
      )}
    </div>
  );
}
