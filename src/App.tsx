import { useEffect, useState } from 'react';
import { useChat } from './store/chat';
import { useSettings } from './store/settings';
import { ConversationDrawer } from './components/ConversationDrawer';
import { MessageList } from './components/MessageList';
import { Composer } from './components/Composer';
import { SettingsPage } from './components/SettingsPage';

export default function App() {
  const init = useChat((s) => s.init);
  const setDrawerOpen = useChat((s) => s.setDrawerOpen);
  const drawerOpen = useChat((s) => s.drawerOpen);
  const conversations = useChat((s) => s.conversations);
  const activeConvId = useChat((s) => s.activeConvId);
  const newConversation = useChat((s) => s.newConversation);
  const error = useChat((s) => s.error);
  const clearError = useChat((s) => s.clearError);
  const apiKey = useSettings((s) => s.apiKey);
  const setApiKey = useSettings((s) => s.setApiKey);
  const theme = useSettings((s) => s.theme);
  const model = useSettings((s) => s.model);
  const [showSettings, setShowSettings] = useState(false);
  const [keyNotice, setKeyNotice] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  // 首次进入无 Key 时引导至设置页
  useEffect(() => {
    if (!apiKey) setShowSettings(true);
    // 仅初始化时判断一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // URL ?apiKey=xxx：幂等应用 + 轻提示（main.tsx 已同步写入，此处保证提示展示）
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get('apiKey')?.trim();
    if (!key) return;
    setApiKey(key);
    setKeyNotice(true);
    const t = setTimeout(() => setKeyNotice(false), 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 视口在桌面/移动间切换时同步 sidebar 状态（桌面常驻、移动收起）
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setDrawerOpen(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [setDrawerOpen]);

  // 主题同步到 html[data-theme]（CSS 据此切浅/深色），并同步状态栏主题色
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    const isDark =
      theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (meta) meta.setAttribute('content', isDark ? '#000000' : '#f4f5f8');
  }, [theme]);

  const activeTitle = conversations.find((c) => c.id === activeConvId)?.title ?? 'DeepSeek Chat';
  const needKey = error === 'NO_KEY';

  return (
    <div className="app-shell relative flex flex-col md:flex-row">
      <ConversationDrawer onOpenSettings={() => setShowSettings(true)} />
      <div className="relative flex-1 min-w-0 flex flex-col">
      <header className="absolute top-0 inset-x-0 z-20 flex items-center gap-2 px-3 h-14 border-b border-border bg-panel/80 backdrop-blur-2xl">
        <button
          type="button"
          onClick={() => setDrawerOpen(!drawerOpen)}
          className="p-2 -ml-1 rounded-lg text-text-dim active:bg-panel-2"
          aria-label="会话列表"
        >
          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none">
            <path
              d="M3 5.5h14M3 10h14M3 14.5h9"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <div className="flex-1 min-w-0 text-center md:text-left md:pl-4">
          <div className="text-sm md:text-base font-medium truncate">{activeTitle}</div>
          <div className="text-[11px] text-text-dim">{model}</div>
        </div>
        <button
          type="button"
          onClick={() => void newConversation()}
          className="p-2 -mr-1 rounded-lg text-text-dim active:bg-panel-2 hover:bg-panel-2"
          aria-label="新建会话"
        >
          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none">
            <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {error && (
        <div className="absolute inset-x-0 z-10 flex items-center gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/30 text-sm text-red-400 backdrop-blur-xl" style={{ top: 'var(--header-h)' }}>
          <span className="flex-1">
            {needKey ? '请先在设置页填写 DeepSeek API Key' : error}
          </span>
          {needKey && (
            <button
              type="button"
              className="text-xs px-2 py-1 rounded-lg border border-red-400/40"
              onClick={() => {
                clearError();
                setShowSettings(true);
              }}
            >
              去设置
            </button>
          )}
          <button
            type="button"
            onClick={clearError}
            className="p-1 text-red-300/70"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
      )}

      {keyNotice && (
        <div
          className="key-notice absolute inset-x-0 z-10 flex items-center justify-center px-4 py-2 bg-accent/10 border-b border-accent/30 text-sm text-accent backdrop-blur-xl"
          style={{ top: 'var(--header-h)' }}
        >
          已通过链接设置 API Key
        </div>
      )}

      <MessageList />
      <Composer onNeedKey={() => setShowSettings(true)} />
      </div>

      {showSettings && <SettingsPage onClose={() => setShowSettings(false)} />}
    </div>
  );
}
