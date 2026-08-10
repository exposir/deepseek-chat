import { useEffect, useRef, useState } from 'react';
import { useChat } from '../store/chat';
import { useSettings } from '../store/settings';
import { EffortPicker } from './EffortPicker';

export function Composer({ onNeedKey }: { onNeedKey: () => void }) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = useChat((s) => s.isStreaming);
  const send = useChat((s) => s.send);
  const stop = useChat((s) => s.stop);
  const draft = useChat((s) => s.draft);
  const clearDraft = useChat((s) => s.clearDraft);
  const searchEnabled = useSettings((s) => s.searchEnabled);
  const setSearchEnabled = useSettings((s) => s.setSearchEnabled);
  const apiKey = useSettings((s) => s.apiKey);

  // 编辑消息回退：draft 载入输入框
  useEffect(() => {
    if (draft === null) return;
    setText(draft);
    clearDraft();
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
    }
  }, [draft, clearDraft]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    if (!apiKey) {
      onNeedKey();
      return;
    }
    setText('');
    // 重置高度
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    void send(trimmed);
  };

  const autoGrow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  };

  return (
    <div className="safe-bottom border-t border-border bg-panel px-3 pt-2">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center gap-2 pb-1.5">
          <button
            type="button"
            onClick={() => setSearchEnabled(!searchEnabled)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
              searchEnabled
                ? 'border-accent/60 text-accent bg-accent/10'
                : 'border-border text-text-dim'
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
              <path
                d="M2 8h12M8 2c1.8 1.6 2.7 3.7 2.7 6S9.8 12.4 8 14c-1.8-1.6-2.7-3.7-2.7-6S6.2 3.6 8 2z"
                stroke="currentColor"
                strokeWidth="1.3"
              />
            </svg>
            联网搜索{searchEnabled ? '已开' : '已关'}
          </button>
          <EffortPicker />
        </div>
        <div className="flex items-end gap-2 pb-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              autoGrow();
            }}
            onKeyDown={(e) => {
              // 桌面端 Enter 发送；移动端软键盘 Enter 默认换行
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                const coarse = window.matchMedia('(pointer: coarse)').matches;
                if (!coarse) {
                  e.preventDefault();
                  handleSend();
                }
              }
            }}
            rows={1}
            placeholder="输入消息…"
            className="flex-1 resize-none rounded-2xl border border-border bg-panel-2 px-4 py-2.5 text-[16px] outline-none placeholder:text-text-dim/60 focus:border-accent/60"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={stop}
              className="w-10 h-10 shrink-0 rounded-full bg-panel-2 border border-border flex items-center justify-center text-text"
              aria-label="停止"
            >
              <span className="block w-3 h-3 rounded-[2px] bg-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!text.trim()}
              className="w-10 h-10 shrink-0 rounded-full bg-accent disabled:opacity-40 flex items-center justify-center text-white"
              aria-label="发送"
            >
              <svg className="w-4.5 h-4.5" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 13V3M3.5 7.5L8 3l4.5 4.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
