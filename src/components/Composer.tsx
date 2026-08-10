import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChat } from '../store/chat';
import { useSettings } from '../store/settings';
import { EffortPicker } from './EffortPicker';

/** 快捷指令模板：点击填入输入框 */
const PROMPT_TEMPLATES: { label: string; text: string }[] = [
  { label: '翻译', text: '把下面的内容翻译成中文（保留格式）：\n\n' },
  { label: '总结', text: '用三句话总结下面这段文字的核心要点：\n\n' },
  { label: '改写', text: '改写下面这段文字，让它更简洁、更专业：\n\n' },
  { label: '写代码', text: '用 Python 写一个：\n\n' },
  { label: '解释代码', text: '解释下面这段代码的作用和每部分原理：\n\n' },
  { label: '头脑风暴', text: '关于下面这个主题，给我 10 个有创意的想法：\n\n' },
];

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
  const [tplOpen, setTplOpen] = useState(false);

  // 模板填入：输入框有内容则追加，否则直接填入
  const applyTemplate = (tpl: { label: string; text: string }) => {
    setText((prev) => (prev.trim() ? `${prev}\n\n${tpl.text}` : tpl.text));
    setTplOpen(false);
    const el = textareaRef.current;
    if (el) {
      el.focus();
      requestAnimationFrame(() => {
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
      });
    }
  };

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
    <div className="safe-bottom absolute bottom-0 inset-x-0 z-20 border-t border-border bg-panel/80 backdrop-blur-2xl px-3 pt-2">
      <div className="mx-auto max-w-2xl md:max-w-5xl">
        <div className="flex items-center gap-2 pb-1.5">
          <button
            type="button"
            onClick={() => setSearchEnabled(!searchEnabled)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 md:px-3 md:py-1.5 text-xs md:text-[13px] transition-colors ${
              searchEnabled
                ? 'border-accent/60 text-accent bg-accent/10 hover:bg-accent/15'
                : 'border-border text-text-dim hover:bg-panel-2'
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
          <div className="relative">
            <button
              type="button"
              onClick={() => setTplOpen((v) => !v)}
              aria-label="快捷指令"
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 md:px-3 md:py-1.5 text-xs md:text-[13px] text-text-dim hover:bg-panel-2"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                <path d="M8 2l1.6 4.4L14 8l-4.4 1.6L8 14l-1.6-4.4L2 8l4.4-1.6L8 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M12.5 11.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6.6-1.6z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
              </svg>
              指令
            </button>
            {tplOpen &&
              // 遮罩必须 portal 到 body：Composer 的 backdrop-blur 会截断 fixed 定位，
              // 否则遮罩只覆盖输入区、点消息区关不掉
              createPortal(
                <div className="fixed inset-0 z-40" onClick={() => setTplOpen(false)} />,
                document.body,
              )}
            {tplOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setTplOpen(false)} />
                <div className="absolute left-0 bottom-full mb-1.5 z-50 w-48 rounded-xl border border-border bg-panel-2 p-1 shadow-xl">
                  {PROMPT_TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-text hover:bg-panel-2/70"
                    >
                      <span className="text-text-dim">{t.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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
            className="flex-1 resize-none rounded-2xl border border-border bg-panel-2 px-4 py-2.5 md:py-3 text-[16px] outline-none placeholder:text-text-dim/60 focus:border-accent/60"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={stop}
              className="w-10 h-10 md:w-11 md:h-11 shrink-0 rounded-full bg-panel-2 border border-border flex items-center justify-center text-text hover:bg-panel-2/80"
              aria-label="停止"
            >
              <span className="block w-3 h-3 rounded-[2px] bg-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!text.trim()}
              className="w-10 h-10 md:w-11 md:h-11 shrink-0 rounded-full bg-accent disabled:opacity-40 flex items-center justify-center text-[var(--color-accent-foreground)] hover:opacity-90"
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
