import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

const inputCls =
  'w-full rounded-xl border border-border bg-panel-2 px-3.5 py-2.5 text-sm outline-none focus:border-accent/60';

interface BaseProps {
  title: string;
  onCancel: () => void;
}

function DialogShell({
  title,
  children,
  onCancel,
}: BaseProps & { children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-6">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xs rounded-2xl border border-border bg-panel p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-medium mb-3">{title}</div>
        {children}
      </div>
    </div>
  );
}

/** 确认对话框（替代 window.confirm）：danger 模式确认键为红色 */
export function ConfirmDialog({
  title,
  message,
  confirmText = '确认',
  danger = false,
  onConfirm,
  onCancel,
}: BaseProps & { message: string; confirmText?: string; danger?: boolean; onConfirm: () => void }) {
  return (
    <DialogShell title={title} onCancel={onCancel}>
      <p className="text-xs text-text-dim leading-relaxed">{message}</p>
      <div className="flex justify-end gap-2 mt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-border text-xs text-text-dim hover:bg-panel-2"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
            danger ? 'bg-red-500/90 text-white' : 'bg-accent text-[var(--color-accent-foreground)]'
          }`}
        >
          {confirmText}
        </button>
      </div>
    </DialogShell>
  );
}

/** 输入对话框（替代 window.prompt） */
export function PromptDialog({
  title,
  initialValue = '',
  placeholder,
  confirmText = '确定',
  onConfirm,
  onCancel,
}: BaseProps & {
  initialValue?: string;
  placeholder?: string;
  confirmText?: string;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <DialogShell title={title} onCancel={onCancel}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            if (value.trim()) onConfirm(value.trim());
            else onCancel();
          }
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={placeholder}
        className={inputCls}
      />
      <div className="flex justify-end gap-2 mt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-border text-xs text-text-dim hover:bg-panel-2"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => (value.trim() ? onConfirm(value.trim()) : onCancel())}
          className="px-3 py-1.5 rounded-lg bg-accent text-[var(--color-accent-foreground)] text-xs font-medium"
        >
          {confirmText}
        </button>
      </div>
    </DialogShell>
  );
}
