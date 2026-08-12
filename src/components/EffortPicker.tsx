import { useRef, useState } from 'react';
import { useSettings } from '../store/settings';
import type { ReasoningEffort } from '../api/types';
import { Popover, menuPosition, type MenuPos } from './Popover';

export const EFFORTS: { value: ReasoningEffort; label: string; hint: string }[] = [
  { value: 'none', label: 'none', hint: '不思考，最快' },
  { value: 'low', label: 'low', hint: '响应快' },
  { value: 'high', label: 'high', hint: '默认，均衡' },
  { value: 'max', label: 'max', hint: '最深入，耗时长' },
];

/** 输入区思考强度快速选择：按钮显示当前档位，点击弹出四档菜单 */
export function EffortPicker() {
  const effort = useSettings((s) => s.reasoningEffort);
  const setEffort = useSettings((s) => s.setReasoningEffort);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const btnRef = useRef<HTMLDivElement>(null);
  const current = EFFORTS.find((e) => e.value === effort) ?? EFFORTS[2];

  const openMenu = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos(menuPosition(rect, 176, window.innerWidth, window.innerHeight));
    setOpen(true);
  };

  return (
    <div className="relative" ref={btnRef}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-label="思考强度"
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
          effort !== 'none' ? 'border-accent/60 text-accent bg-accent/10' : 'border-border text-text-dim'
        }`}
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 1.8c2.6 0 4.6 1.9 4.6 4.3 0 1.5-.8 2.5-1.5 3.4-.6.7-.8 1.3-.8 2.1H5.7c0-.8-.3-1.4-.8-2.1-.8-.9-1.5-1.9-1.5-3.4C3.4 3.7 5.4 1.8 8 1.8z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path d="M5.7 13.5h4.6M6.7 12.2h2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        思考 {current.label}
      </button>
      {open && (
        <Popover pos={pos} widthClass="w-44" onClose={() => setOpen(false)}>
          {EFFORTS.map((e) => (
            <button
              key={e.value}
              type="button"
              role="menuitem"
              onClick={() => {
                setEffort(e.value);
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-panel-2/60 ${
                effort === e.value ? 'text-accent' : 'text-text'
              }`}
            >
              <span>
                <span className="text-xs font-medium">{e.label}</span>
                <span className="block text-[11px] text-text-dim">{e.hint}</span>
              </span>
              {effort === e.value && (
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
        </Popover>
      )}
    </div>
  );
}
