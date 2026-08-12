import { useEffect, useRef, useState } from 'react';
import { useChat } from '../store/chat';
import { MODELS_BY_PROVIDER, useSettings, type PromptTemplate } from '../store/settings';
import { EffortPicker } from './EffortPicker';
import { ModelPicker } from './ModelPicker';
import { Popover, menuPosition, type MenuPos } from './Popover';

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
  const provider = useSettings((s) => s.provider);
  const model = useSettings((s) => s.model);
  // 当前模型不支持 web_search（如 OpenCode Go 的 V4 Pro）：搜索开关禁用并提示
  const searchSupported =
    MODELS_BY_PROVIDER[provider].find((m) => m.id === model)?.searchSupported !== false;
  const apiKey = useSettings((s) => s.apiKeys[s.provider]);
  const promptTemplates = useSettings((s) => s.promptTemplates);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplPos, setTplPos] = useState<MenuPos | null>(null);
  const tplBtnRef = useRef<HTMLDivElement>(null);

  const openTpl = () => {
    const rect = tplBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTplPos(menuPosition(rect, 192, window.innerWidth, window.innerHeight));
    setTplOpen(true);
  };

  // 模板填入：输入框有内容则追加，否则直接填入
  const applyTemplate = (tpl: PromptTemplate) => {
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
        <div className="flex items-center gap-2 pb-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            disabled={!searchSupported}
            title={searchSupported ? undefined : '当前模型不支持联网搜索'}
            onClick={() => setSearchEnabled(!searchEnabled)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 md:px-3 md:py-1.5 text-xs md:text-[13px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              !searchSupported
                ? 'border-border text-text-dim'
                : searchEnabled
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
            联网搜索{!searchSupported ? '不可用' : searchEnabled ? '已开' : '已关'}
          </button>
          <EffortPicker />
          <ModelPicker />
          <div className="relative" ref={tplBtnRef}>
            <button
              type="button"
              onClick={() => (tplOpen ? setTplOpen(false) : openTpl())}
              aria-label="快捷指令"
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 md:px-3 md:py-1.5 text-xs md:text-[13px] text-text-dim hover:bg-panel-2"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                <path d="M8 2l1.6 4.4L14 8l-4.4 1.6L8 14l-1.6-4.4L2 8l4.4-1.6L8 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M12.5 11.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6.6-1.6z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
              </svg>
              指令
            </button>
            {tplOpen && (
              <Popover pos={tplPos} widthClass="w-48" onClose={() => setTplOpen(false)}>
                {promptTemplates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="menuitem"
                    onClick={() => applyTemplate(t)}
                    className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-text hover:bg-panel-2/70"
                  >
                    <span className="text-text-dim">{t.label}</span>
                  </button>
                ))}
                {promptTemplates.length === 0 && (
                  <div className="px-2.5 py-2 text-xs text-text-dim/60">暂无指令，可在设置中添加</div>
                )}
              </Popover>
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
